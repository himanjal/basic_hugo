// static/js/peel-scroller.js
(function () {
    'use strict';

    const peeler = document.getElementById('peeler');
    if (!peeler) return;

    // Recommend setting touch-action on the element so the browser knows
    // we want to handle horizontal gestures ourselves. This reduces
    // chance of the OS/browser edge-swipe kicking in.
    try {
        peeler.style.touchAction = 'pan-y';
    } catch (err) {
        // ignore if not supported
    }

    /* ADDED: reduce browser overscroll/navigation when interacting with this element */
    try {
        // Prevent navigation via edge swipes / overscroll where supported
        peeler.style.overscrollBehavior = 'contain';
        // also apply on body as a fallback (optional, uncomment if desirable)
        // document.documentElement.style.overscrollBehaviorX = 'none';
        // document.body.style.overscrollBehaviorX = 'none';
        peeler.style.webkitOverflowScrolling = 'auto';
    } catch (err) {
        // ignore
    }

    const slides = Array.from(peeler.querySelectorAll('.peel-slide'));
    const count = slides.length;
    if (count === 0) return;

    // Config via data attributes (fallback defaults)
    const config = {
        autoplay: peeler.getAttribute('data-autoplay') === 'true',
        interval: parseInt(peeler.getAttribute('data-interval'), 10) || 4000, // ms
        pauseOnHover: peeler.getAttribute('data-pause-on-hover') !== 'false', // default true
        pauseOnInteraction: peeler.getAttribute('data-pause-on-interaction') !== 'false', // default true
        resumeAfter: parseInt(peeler.getAttribute('data-resume-after'), 10) || 3000 // ms idle before resuming
    };

    let index = 0;
    let isAnimating = false;
    let lastNavAt = 0;
    const NAV_COOLDOWN = 520; // ms - should be slightly less than CSS var --anim-ms

    // navLock prevents multiple navigations during a single long scroll/inertia
    let navLock = false;
    let navLockTimer = null;

    // wheel gesture protection (prevents multiple triggers for a single quick flick)
    let wheelAccumX = 0;
    let wheelAccumY = 0;
    let wheelTimer = null;
    let wheelGestureActive = false; // true while gesture is "ongoing"
    let wheelGestureTimer = null;
    const WHEEL_GESTURE_TIMEOUT_MS = 250; // ms of wheel idle considered end of gesture
    const WHEEL_THRESHOLD = 60; // same threshold used before

    // autoplay state
    let autoplayTimer = null;
    let autoplayPlaying = false;
    let resumeTimer = null;
    let userInteracting = false; // true while the user is interacting (hover, touch, key, wheel)

    // --- HISTORY GUARD (ADDED) ---
    /* Reason: on some macOS builds the two-finger swipe is handled before JS can
       reliably cancel it. We temporarily push a history entry while the user
       is interacting inside the peeler and intercept popstate to suppress native
       back/forward during that time.
       Caveat: this mutates browser history while active. Keep the guard short and
       only enable when the user is actually interacting inside the peeler.
    */
    let historyGuardActive = false;
    let historyGuardTimer = null;
    const HISTORY_GUARD_IDLE_MS = 1200; // how long of idle before removing the guard

    function enableHistoryGuard() {
        if (historyGuardActive) {
            // refresh idle timer
            if (historyGuardTimer) clearTimeout(historyGuardTimer);
            historyGuardTimer = setTimeout(disableHistoryGuard, HISTORY_GUARD_IDLE_MS);
            return;
        }
        try {
            history.pushState({ __peel_guard: true }, '');
            historyGuardActive = true;
            if (historyGuardTimer) clearTimeout(historyGuardTimer);
            historyGuardTimer = setTimeout(disableHistoryGuard, HISTORY_GUARD_IDLE_MS);
        } catch (err) {
            // pushState may fail in exotic contexts; ignore
            historyGuardActive = false;
        }
    }

    function disableHistoryGuard() {
        historyGuardActive = false;
        if (historyGuardTimer) {
            clearTimeout(historyGuardTimer);
            historyGuardTimer = null;
        }
        // We do not pop state here (to avoid extra navigation); instead when the guard
        // is disabled the next popstate will behave normally. The state we pushed is
        // intentionally inert and will be walked away from by the user's back if they try later.
    }

    // listen for popstate and neutralize it while guard active
    window.addEventListener('popstate', function (e) {
        if (!historyGuardActive) return;
        try {
            // If the state is the guard state we pushed, neutralize the back by pushing it again.
            // This keeps the user on the page. We can optionally trigger internal navigation or UI feedback.
            history.pushState({ __peel_guard: true }, '');
            // Optionally, if you want a back gesture to move peeler backward internally,
            // you can call triggerNav('prev') here instead of purely swallowing:
            // triggerNav('prev');
        } catch (err) {
            // ignore
        }
    }, { passive: false });

    // ------------------------------------------------

    // initial placement
    function placeSlides() {
        slides.forEach((s, i) => {
            s.classList.remove('peel-center','peel-off-left','peel-off-right','peel-far-left','peel-far-right');
            if (i === index) s.classList.add('peel-center');
            else if (i === index - 1 || (index === 0 && i === count - 1)) s.classList.add('peel-off-left');
            else if (i === index + 1 || (index === count - 1 && i === 0)) s.classList.add('peel-off-right');
            else {
                if (i < index) s.classList.add('peel-far-left');
                else s.classList.add('peel-far-right');
            }
            s.style.pointerEvents = (i === index) ? 'auto' : 'none';
        });
    }

    // lazy-swap hi-res for visible slide
    function swapHiRes(slideEl) {
        if (!slideEl) return;
        const img = slideEl.querySelector('img.peel-img.lazy');
        if (!img) return;
        const hi = img.getAttribute('data-src');
        if (!hi) return;
        if (img.src === hi) return;
        const tmp = new Image();
        tmp.onload = () => {
            img.src = hi;
            img.classList.remove('lazy');
        };
        tmp.src = hi;
    }

    // goto only performs visual transition; locking is handled by triggerNav
    function goto(newIndex, direction) {
        if (newIndex === index) return;
        isAnimating = true;
        const prevIndex = index;
        index = (newIndex + count) % count;

        slides.forEach((s, i) => {
            s.classList.remove('peel-center','peel-off-left','peel-off-right','peel-far-left','peel-far-right');
            s.style.transition = '';
        });

        if (direction === 'next') {
            slides[prevIndex].classList.add('peel-off-left');
            slides[index].classList.add('peel-off-right');
            void slides[index].offsetWidth;
            slides[index].classList.remove('peel-off-right');
            slides[index].classList.add('peel-center');
            const prevPrev = (prevIndex - 1 + count) % count;
            const nextNext = (index + 1) % count;
            slides[prevPrev].classList.add('peel-far-left');
            slides[nextNext].classList.add('peel-off-right');
        } else if (direction === 'prev') {
            slides[prevIndex].classList.add('peel-off-right');
            slides[index].classList.add('peel-off-left');
            void slides[index].offsetWidth;
            slides[index].classList.remove('peel-off-left');
            slides[index].classList.add('peel-center');
            const nextNext = (prevIndex + 1) % count;
            const prevPrev = (index - 1 + count) % count;
            slides[nextNext].classList.add('peel-far-right');
            slides[prevPrev].classList.add('peel-off-left');
        } else {
            placeSlides();
            slides[index].classList.add('peel-center');
        }

        slides.forEach((s, i) => s.style.pointerEvents = (i === index) ? 'auto' : 'none');

        setTimeout(() => {
            swapHiRes(slides[index]);
        }, 80);

        setTimeout(() => { isAnimating = false; }, NAV_COOLDOWN);
    }

    // centralized nav trigger — ensures only one navigation per NAV_COOLDOWN
    function triggerNav(direction) {
        const now = Date.now();
        if (now - lastNavAt < NAV_COOLDOWN || navLock || isAnimating) return;
        lastNavAt = now;

        // engage lock
        navLock = true;
        if (navLockTimer) clearTimeout(navLockTimer);
        navLockTimer = setTimeout(() => { navLock = false; navLockTimer = null; }, NAV_COOLDOWN + 20);

        // clear wheel accumulators/timers so inertia can't re-trigger
        wheelAccumX = 0;
        wheelAccumY = 0;
        if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer = null; }
        if (wheelGestureTimer) { clearTimeout(wheelGestureTimer); wheelGestureTimer = null; }
        wheelGestureActive = true;
        // ensure gesture ends after timeout
        wheelGestureTimer = setTimeout(() => { wheelGestureActive = false; wheelGestureTimer = null; }, WHEEL_GESTURE_TIMEOUT_MS);

        // perform the navigation
        if (direction === 'next') goto(index + 1, 'next');
        else if (direction === 'prev') goto(index - 1, 'prev');
    }

    // convenience wrappers (kept for API compatibility)
    function next() { triggerNav('next'); }
    function prev() { triggerNav('prev'); }

    // Wheel handler (supports vertical and horizontal wheel/trackpad)
    function onWheel(e) {
        // if navigation is locked or animating, ignore
        if (isAnimating || navLock) return;

        // if pause-on-interaction configured, treat wheel as user interaction
        if (config.pauseOnInteraction) notifyUserInteraction();

        const absX = Math.abs(e.deltaX);
        const absY = Math.abs(e.deltaY);
        const dominantIsX = absX > absY;

        // update accumulators
        if (dominantIsX) {
            wheelAccumX += e.deltaX;
        } else {
            wheelAccumY += e.deltaY;
        }

        // reset the wheel-gesture idle timer - gesture stays active while wheel events are frequent
        if (wheelGestureTimer) { clearTimeout(wheelGestureTimer); wheelGestureTimer = null; }
        wheelGestureTimer = setTimeout(() => {
            wheelGestureActive = false;
            wheelAccumX = 0;
            wheelAccumY = 0;
            wheelTimer = null;
            wheelGestureTimer = null;
        }, WHEEL_GESTURE_TIMEOUT_MS);

        // If a gesture is already active AND we've already triggered nav for this gesture, do nothing.
        // This ensures a single flick won't produce multiple navigations.
        if (wheelGestureActive) {
            e.preventDefault();
            return;
        }

        // If threshold exceeded, trigger navigation for this gesture (and set wheelGestureActive)
        if (Math.abs(wheelAccumX) >= WHEEL_THRESHOLD || Math.abs(wheelAccumY) >= WHEEL_THRESHOLD) {
            // Decide direction based on dominant accumulated axis
            if (Math.abs(wheelAccumX) > Math.abs(wheelAccumY)) {
                if (wheelAccumX > 0) triggerNav('next'); else triggerNav('prev');
            } else {
                if (wheelAccumY > 0) triggerNav('next'); else triggerNav('prev');
            }
            // ensure accumulators are reset immediately
            wheelAccumX = 0;
            wheelAccumY = 0;
            if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer = null; }
            // Prevent default to stop page scroll while interacting
            e.preventDefault();
            return;
        }

        // Minor safety: keep a short accumulator reset timer for small deltas
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => { wheelAccumX = 0; wheelAccumY = 0; wheelTimer = null; }, 180);

        e.preventDefault();
    }

    // keyboard
    function onKey(e) {
        if (config.pauseOnInteraction) notifyUserInteraction();
        if (e.key === 'ArrowRight') { triggerNav('next'); }
        else if (e.key === 'ArrowLeft') { triggerNav('prev'); }
    }

    // touch/swipe (improved to block browser back/forward when horizontal)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let touchConsumed = false;

    function onTouchStart(e) {
        if (e.touches && e.touches[0]) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchMoved = false;
            touchConsumed = false;
            if (config.pauseOnInteraction) notifyUserInteraction();
            // Enable stronger guard while the user is touching inside the peeler
            enableHistoryGuard();
        }
    }

    function onTouchMove(e) {
        if (!e.touches || !e.touches[0]) return;

        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        // start detecting only after a small threshold to avoid accidental tiny moves
        if (!touchMoved) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchMoved = true;
            else return;
        }

        // If gesture is predominantly horizontal, consume it so browser doesn't trigger history swipe.
        if (Math.abs(dx) > Math.abs(dy)) {
            touchConsumed = true;
            // stop the browser from using this gesture for back/forward (Safari/Chrome on macOS/iOS)
            e.preventDefault();
        }
        // If vertical gesture, we let it bubble so page can scroll naturally.
    }

    function onTouchEnd(e) {
        // If navigation locked, ignore
        if (navLock) {
            touchMoved = false;
            touchConsumed = false;
            return;
        }

        // If changedTouches available, use that final position; otherwise don't navigate.
        let dx = 0;
        if (e.changedTouches && e.changedTouches[0]) {
            dx = e.changedTouches[0].clientX - touchStartX;
        }

        // Only trigger navigation if the gesture was horizontal enough (same threshold as before).
        if (touchConsumed && Math.abs(dx) > 40) {
            if (dx < 0) triggerNav('next'); else triggerNav('prev');
        }

        // reset flags
        touchMoved = false;
        touchConsumed = false;

        // refresh/extend disable timer for history guard so it stays alive a short while after touch end
        enableHistoryGuard();
    }

    // click on slide to go next (optional)
    function onClickSlide(e) {
        const slide = e.currentTarget;
        if (slide.classList.contains('peel-center')) triggerNav('next');
    }

    // AUTOPLAY: start/stop and pause-on-interaction logic
    function startAutoplay() {
        if (autoplayPlaying || !config.autoplay) return;
        autoplayPlaying = true;
        autoplayTimer = setInterval(() => {
            if (isAnimating || navLock || userInteracting) return;
            triggerNav('next');
        }, config.interval);
    }

    function stopAutoplay() {
        autoplayPlaying = false;
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    function resetAutoplayResumeTimer() {
        if (resumeTimer) {
            clearTimeout(resumeTimer);
            resumeTimer = null;
        }
        // resume only if autoplay configured
        if (!config.autoplay) return;
        resumeTimer = setTimeout(() => {
            userInteracting = false;
            // only resume autoplay if it's configured and not already playing
            if (!autoplayPlaying) startAutoplay();
        }, config.resumeAfter);
    }

    function notifyUserInteraction() {
        // mark that user interacted and stop autoplay until idle
        userInteracting = true;
        // stop autoplay immediately
        if (autoplayPlaying) stopAutoplay();
        // clear any existing resume timer and set a new one
        resetAutoplayResumeTimer();
        // enable history guard while user is interacting
        enableHistoryGuard();
    }

    // Page visibility handling to pause autoplay when tab is hidden
    function onVisibilityChange() {
        if (document.hidden) {
            stopAutoplay();
        } else {
            // when tab becomes visible, if user isn't interacting, start autoplay
            if (!userInteracting && config.autoplay) {
                // small delay to avoid immediate jump
                setTimeout(startAutoplay, 250);
            }
        }
    }

    // initial wiring
    slides.forEach(s => s.addEventListener('click', onClickSlide));

    // WHEEL: ensure passive:false so we can preventDefault() trackpad gestures.
    peeler.addEventListener('wheel', onWheel, { passive: false });
    peeler.addEventListener('keydown', onKey);

    // NOTE: touchmove must be passive:false to allow preventDefault()
    // CHANGE: use passive:false on touchstart so we can optionally prevent edge swipes earlier.
    peeler.addEventListener('touchstart', onTouchStart, { passive: false });
    peeler.addEventListener('touchmove', onTouchMove, { passive: false });
    peeler.addEventListener('touchend', onTouchEnd, { passive: true });

    /* ADDED: Capture edge-originating touches that start inside the peeler.
       On iOS/Safari and some macOS setups, a horizontal swipe that begins very near
       the viewport edge can still trigger history navigation. This handler prevents
       that only when the touch starts inside the peeler within EDGE_BLOCK_PX of the
       viewport left/right edge.
       - capture:true so it runs before other handlers
       - passive:false so preventDefault() works
    */
    const EDGE_BLOCK_PX = 36; // adjust if you want more/less edge blocking

    function edgeTouchStartPrevent(e) {
        // only act for real touch starts
        if (!e.touches || !e.touches[0]) return;

        const t = e.target;
        // ensure the touch target is inside the peeler
        if (!(t && t.closest && t.closest('#peeler'))) return;

        const startX = e.touches[0].clientX;
        // If the touch started very close to the left or right viewport edge, block the default
        // to avoid history navigation. But only block if gesture started inside the peeler.
        if (startX <= EDGE_BLOCK_PX || startX >= (window.innerWidth - EDGE_BLOCK_PX)) {
            e.preventDefault();
            // Also initialize our onTouchStart state to avoid double-handling.
            onTouchStart(e);
        }
    }
    // attach capture document-level listener
    document.addEventListener('touchstart', edgeTouchStartPrevent, { passive: false, capture: true });

    /* ADDED: Document-level wheel capture to block two-finger side-swipe history/navigation
       on macOS browsers (Chrome/Safari) where the browser may act on the wheel before
       element handlers run. This listener runs in capture phase and prevents the browser
       default when the gesture is predominantly horizontal AND started inside #peeler.
       It is conservative and uses a small delta threshold to avoid blocking tiny nudges.
    */
    (function attachDocumentWheelCapture() {
        const CAPTURE_DELTA_THRESHOLD = 6;

        function docWheelCapture(e) {
            try {
                const tgt = e.target;
                const insidePeeler = tgt && typeof tgt.closest === 'function' && tgt.closest('#peeler');
                if (!insidePeeler) return;

                const absX = Math.abs(e.deltaX || 0);
                const absY = Math.abs(e.deltaY || 0);

                if (absX > absY && absX > CAPTURE_DELTA_THRESHOLD) {
                    // Prevent default (history navigation) but allow propagation so
                    // the peeler's non-passive wheel handler still receives the event.
                    e.preventDefault();
                    // also enable history guard while gesture is active
                    enableHistoryGuard();
                }
            } catch (err) {
                return;
            }
        }

        document.addEventListener('wheel', docWheelCapture, { passive: false, capture: true });
    })();

    // Hover/focus interactions to pause/resume autoplay (optional)
    if (config.pauseOnHover) {
        peeler.addEventListener('mouseenter', () => {
            notifyUserInteraction();
        });
        peeler.addEventListener('mouseleave', () => {
            // start resume timer
            resetAutoplayResumeTimer();
        });
    }

    // Pause on focus inside peeler (keyboard navigation)
    peeler.addEventListener('focusin', () => {
        notifyUserInteraction();
    });
    peeler.addEventListener('focusout', () => {
        resetAutoplayResumeTimer();
    });

    // Pause when user touches anywhere in peeler
    peeler.addEventListener('touchstart', () => {
        if (config.pauseOnInteraction) notifyUserInteraction();
    }, { passive: true });

    // Also treat any click as interaction
    peeler.addEventListener('click', () => {
        if (config.pauseOnInteraction) notifyUserInteraction();
    });

    // Visibility change
    document.addEventListener('visibilitychange', onVisibilityChange);

    // make peeler focusable and give keyboard hint
    peeler.tabIndex = 0;
    placeSlides();
    // preload center hi-res
    swapHiRes(slides[index]);

    // start autoplay if configured
    if (config.autoplay) {
        // small initial delay so page paint finishes
        setTimeout(startAutoplay, 500);
    }

    // Expose minimal API
    window.__peelScroller = {
        next: () => triggerNav('next'),
        prev: () => triggerNav('prev'),
        goto: (n) => { /* allow immediate visual goto without lock if needed */ goto(n % count, 'next'); },
        play: () => {
            userInteracting = false;
            startAutoplay();
        },
        pause: () => {
            notifyUserInteraction();
            stopAutoplay();
        },
        isPlaying: () => autoplayPlaying
    };

})();
