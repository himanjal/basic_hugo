// static/js/peel-scroller.js
(function () {
    'use strict';

    const peeler = document.getElementById('peeler');
    if (!peeler) return;

    try {
        peeler.style.touchAction = 'pan-y';
    } catch (err) { }

    try {
        peeler.style.overscrollBehavior = 'contain';
        peeler.style.webkitOverflowScrolling = 'auto';
    } catch (err) { }

    const slides = Array.from(peeler.querySelectorAll('.peel-slide'));
    const count = slides.length;
    if (count === 0) return;

    const config = {
        autoplay: peeler.getAttribute('data-autoplay') === 'true',
        interval: parseInt(peeler.getAttribute('data-interval'), 10) || 4000,
        pauseOnHover: peeler.getAttribute('data-pause-on-hover') !== 'false',
        pauseOnInteraction: peeler.getAttribute('data-pause-on-interaction') !== 'false',
        resumeAfter: parseInt(peeler.getAttribute('data-resume-after'), 10) || 3000
    };

    let index = 0;
    let isAnimating = false;
    let lastNavAt = 0;

    // slow-motion config (left as in your last file)
    const SLOW_MS = 1800;
    const NAV_COOLDOWN = SLOW_MS + 200;
    const TRANSITION_STR = `transform ${SLOW_MS}ms cubic-bezier(0.22, 0.1, 0.1, 1), opacity ${Math.round(SLOW_MS * 0.6)}ms ease`;

    let navLock = false;
    let navLockTimer = null;

    let wheelAccumX = 0;
    let wheelAccumY = 0;
    let wheelTimer = null;
    let wheelGestureActive = false;
    let wheelGestureTimer = null;
    const WHEEL_GESTURE_TIMEOUT_MS = 250;
    const WHEEL_THRESHOLD = 60;

    let autoplayTimer = null;
    let autoplayPlaying = false;
    let resumeTimer = null;
    let userInteracting = false;

    let historyGuardActive = false;
    let historyGuardTimer = null;
    const HISTORY_GUARD_IDLE_MS = 1200;

    function enableHistoryGuard() {
        if (historyGuardActive) {
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
            historyGuardActive = false;
        }
    }

    function disableHistoryGuard() {
        historyGuardActive = false;
        if (historyGuardTimer) {
            clearTimeout(historyGuardTimer);
            historyGuardTimer = null;
        }
    }

    window.addEventListener('popstate', function (e) {
        if (!historyGuardActive) return;
        try {
            history.pushState({ __peel_guard: true }, '');
        } catch (err) { }
    }, { passive: false });

    // helper to set z-index based on logical position
    // higher number -> visually on top
    function setZIndexForSlide(s, posType) {
        // posType: 'center' | 'off-left' | 'off-right' | 'far-left' | 'far-right' | default
        switch (posType) {
            case 'center':
                s.style.zIndex = 30;
                break;
            case 'off-left':
            case 'off-right':
                s.style.zIndex = 25;
                break;
            case 'far-left':
            case 'far-right':
                s.style.zIndex = 10;
                break;
            default:
                s.style.zIndex = 8;
        }
    }

    function placeSlides() {
        slides.forEach((s, i) => {
            s.classList.remove('peel-center','peel-off-left','peel-off-right','peel-far-left','peel-far-right');
            if (i === index) {
                s.classList.add('peel-center');
                setZIndexForSlide(s, 'center');
            } else if (i === index - 1 || (index === 0 && i === count - 1)) {
                s.classList.add('peel-off-left');
                setZIndexForSlide(s, 'off-left');
            } else if (i === index + 1 || (index === count - 1 && i === 0)) {
                s.classList.add('peel-off-right');
                setZIndexForSlide(s, 'off-right');
            } else {
                if (i < index) {
                    s.classList.add('peel-far-left');
                    setZIndexForSlide(s, 'far-left');
                } else {
                    s.classList.add('peel-far-right');
                    setZIndexForSlide(s, 'far-right');
                }
            }
            s.style.pointerEvents = (i === index) ? 'auto' : 'none';
            s.style.transition = '';
        });
    }

    // --- SAFE swapHiRes: only load if the slide is still the current index ---
    function swapHiRes(slideEl) {
        if (!slideEl) return;
        // Avoid loading hi-res for slides that are not the current centered slide.
        // This prevents the "extra back image" from being loaded during transitions.
        const slideIdx = slides.indexOf(slideEl);
        if (slideIdx === -1) return;
        if (slideIdx !== index) return; // <<--- guard: only load hi-res for the current index

        const img = slideEl.querySelector('img.peel-img.lazy');
        if (!img) return;
        const hi = img.getAttribute('data-src');
        if (!hi) return;
        if (img.src === hi) return;
        const tmp = new Image();
        tmp.onload = () => {
            // final check: ensure nothing changed while the hi-res was loading
            const recheckIdx = slides.indexOf(slideEl);
            if (recheckIdx === index) {
                img.src = hi;
                img.classList.remove('lazy');
            }
        };
        tmp.src = hi;
    }

    function goto(newIndex, direction) {
        if (newIndex === index) return;
        isAnimating = true;
        const prevIndex = index;
        index = (newIndex + count) % count;

        // Ensure stacking is correct before starting animation:
        // - current (prevIndex) should be above far slides
        // - entering (index) should be above far slides and at least equal to prev
        slides.forEach((s, i) => {
            s.classList.remove('peel-center','peel-off-left','peel-off-right','peel-far-left','peel-far-right');
            s.style.transition = TRANSITION_STR;
            // default baseline
            s.style.zIndex = 8;
        });

        // Set explicit z-index for involved slides to avoid being painted behind others
        const prevPrev = (prevIndex - 1 + count) % count;
        const nextNext = (index + 1) % count;
        const nextAfterPrev = (prevIndex + 1) % count;
        const prevBeforeIndex = (index - 1 + count) % count;

        // Keep the exiting and entering slides on top during transition
        setZIndexForSlide(slides[prevIndex], 'off-left'); // will be moved off-left or off-right below
        setZIndexForSlide(slides[index], 'center');

        if (direction === 'next') {
            slides[prevIndex].classList.add('peel-off-left');
            slides[index].classList.add('peel-off-right');
            // force reflow so the next steps animate
            void slides[index].offsetWidth;
            slides[index].classList.remove('peel-off-right');
            slides[index].classList.add('peel-center');
            slides[prevPrev].classList.add('peel-far-left');
            slides[nextNext].classList.add('peel-off-right');

            // stacking adjustments during 'next' animation:
            // - entering (index) highest (center)
            // - exiting (prevIndex) next
            setZIndexForSlide(slides[index], 'center');      // highest
            setZIndexForSlide(slides[prevIndex], 'off-left'); // just below
            setZIndexForSlide(slides[nextNext], 'off-right');
            setZIndexForSlide(slides[prevPrev], 'far-left');
        } else if (direction === 'prev') {
            slides[prevIndex].classList.add('peel-off-right');
            slides[index].classList.add('peel-off-left');
            void slides[index].offsetWidth;
            slides[index].classList.remove('peel-off-left');
            slides[index].classList.add('peel-center');
            slides[nextAfterPrev].classList.add('peel-far-right');
            slides[prevBeforeIndex].classList.add('peel-off-left');

            // stacking adjustments during 'prev' animation:
            setZIndexForSlide(slides[index], 'center');      // highest
            setZIndexForSlide(slides[prevIndex], 'off-right'); // just below
            setZIndexForSlide(slides[nextAfterPrev], 'far-right');
            setZIndexForSlide(slides[prevBeforeIndex], 'off-left');
        } else {
            placeSlides();
            slides[index].classList.add('peel-center');
        }

        slides.forEach((s, i) => s.style.pointerEvents = (i === index) ? 'auto' : 'none');

        // only swap hi-res for the entering center slide (guarded inside swapHiRes too)
        setTimeout(() => {
            swapHiRes(slides[index]);
        }, 80);

        setTimeout(() => {
            // after animation ends, clear transitions and normalize stacking to placeSlides rules
            slides.forEach(s => s.style.transition = '');
            isAnimating = false;
            // reset classes/z-index to canonical positions
            placeSlides();
        }, NAV_COOLDOWN);
    }

    function triggerNav(direction) {
        const now = Date.now();
        if (now - lastNavAt < NAV_COOLDOWN || navLock || isAnimating) return;
        lastNavAt = now;

        navLock = true;
        if (navLockTimer) clearTimeout(navLockTimer);
        navLockTimer = setTimeout(() => { navLock = false; navLockTimer = null; }, NAV_COOLDOWN + 20);

        wheelAccumX = 0;
        wheelAccumY = 0;
        if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer = null; }
        if (wheelGestureTimer) { clearTimeout(wheelGestureTimer); wheelGestureTimer = null; }
        wheelGestureActive = true;
        wheelGestureTimer = setTimeout(() => { wheelGestureActive = false; wheelGestureTimer = null; }, WHEEL_GESTURE_TIMEOUT_MS);

        if (direction === 'next') goto(index + 1, 'next');
        else if (direction === 'prev') goto(index - 1, 'prev');
    }

    function next() { triggerNav('next'); }
    function prev() { triggerNav('prev'); }

    function onWheel(e) {
        if (isAnimating || navLock) return;
        if (config.pauseOnInteraction) notifyUserInteraction();

        const absX = Math.abs(e.deltaX);
        const absY = Math.abs(e.deltaY);
        const dominantIsX = absX > absY;

        if (dominantIsX) {
            wheelAccumX += e.deltaX;
        } else {
            wheelAccumY += e.deltaY;
        }

        if (wheelGestureTimer) { clearTimeout(wheelGestureTimer); wheelGestureTimer = null; }
        wheelGestureTimer = setTimeout(() => {
            wheelGestureActive = false;
            wheelAccumX = 0;
            wheelAccumY = 0;
            wheelTimer = null;
            wheelGestureTimer = null;
        }, WHEEL_GESTURE_TIMEOUT_MS);

        if (wheelGestureActive) {
            e.preventDefault();
            return;
        }

        if (Math.abs(wheelAccumX) >= WHEEL_THRESHOLD || Math.abs(wheelAccumY) >= WHEEL_THRESHOLD) {
            if (Math.abs(wheelAccumX) > Math.abs(wheelAccumY)) {
                if (wheelAccumX > 0) triggerNav('next'); else triggerNav('prev');
            } else {
                if (wheelAccumY > 0) triggerNav('next'); else triggerNav('prev');
            }
            wheelAccumX = 0;
            wheelAccumY = 0;
            if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer = null; }
            e.preventDefault();
            return;
        }

        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => { wheelAccumX = 0; wheelAccumY = 0; wheelTimer = null; }, 180);

        e.preventDefault();
    }

    function onKey(e) {
        if (config.pauseOnInteraction) notifyUserInteraction();
        if (e.key === 'ArrowRight') { triggerNav('next'); }
        else if (e.key === 'ArrowLeft') { triggerNav('prev'); }
    }

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
            enableHistoryGuard();
        }
    }

    function onTouchMove(e) {
        if (!e.touches || !e.touches[0]) return;

        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        if (!touchMoved) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchMoved = true;
            else return;
        }

        if (Math.abs(dx) > Math.abs(dy)) {
            touchConsumed = true;
            e.preventDefault();
        }
    }

    function onTouchEnd(e) {
        if (navLock) {
            touchMoved = false;
            touchConsumed = false;
            return;
        }

        let dx = 0;
        if (e.changedTouches && e.changedTouches[0]) {
            dx = e.changedTouches[0].clientX - touchStartX;
        }

        if (touchConsumed && Math.abs(dx) > 40) {
            if (dx < 0) triggerNav('next'); else triggerNav('prev');
        }

        touchMoved = false;
        touchConsumed = false;

        enableHistoryGuard();
    }

    function onClickSlide(e) {
        const slide = e.currentTarget;
        if (slide.classList.contains('peel-center')) triggerNav('next');
    }

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
        if (!config.autoplay) return;
        resumeTimer = setTimeout(() => {
            userInteracting = false;
            if (!autoplayPlaying) startAutoplay();
        }, config.resumeAfter);
    }

    function notifyUserInteraction() {
        userInteracting = true;
        if (autoplayPlaying) stopAutoplay();
        resetAutoplayResumeTimer();
        enableHistoryGuard();
    }

    function onVisibilityChange() {
        if (document.hidden) {
            stopAutoplay();
        } else {
            if (!userInteracting && config.autoplay) {
                setTimeout(startAutoplay, 250);
            }
        }
    }

    slides.forEach(s => s.addEventListener('click', onClickSlide));

    peeler.addEventListener('wheel', onWheel, { passive: false });
    peeler.addEventListener('keydown', onKey);

    peeler.addEventListener('touchstart', onTouchStart, { passive: false });
    peeler.addEventListener('touchmove', onTouchMove, { passive: false });
    peeler.addEventListener('touchend', onTouchEnd, { passive: true });

    const EDGE_BLOCK_PX = 36;

    function edgeTouchStartPrevent(e) {
        if (!e.touches || !e.touches[0]) return;

        const t = e.target;
        if (!(t && t.closest && t.closest('#peeler'))) return;

        const startX = e.touches[0].clientX;
        if (startX <= EDGE_BLOCK_PX || startX >= (window.innerWidth - EDGE_BLOCK_PX)) {
            e.preventDefault();
            onTouchStart(e);
        }
    }
    document.addEventListener('touchstart', edgeTouchStartPrevent, { passive: false, capture: true });

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
                    e.preventDefault();
                    enableHistoryGuard();
                }
            } catch (err) {
                return;
            }
        }

        document.addEventListener('wheel', docWheelCapture, { passive: false, capture: true });
    })();

    if (config.pauseOnHover) {
        peeler.addEventListener('mouseenter', () => {
            notifyUserInteraction();
        });
        peeler.addEventListener('mouseleave', () => {
            resetAutoplayResumeTimer();
        });
    }

    peeler.addEventListener('focusin', () => {
        notifyUserInteraction();
    });
    peeler.addEventListener('focusout', () => {
        resetAutoplayResumeTimer();
    });

    peeler.addEventListener('touchstart', () => {
        if (config.pauseOnInteraction) notifyUserInteraction();
    }, { passive: true });

    peeler.addEventListener('click', () => {
        if (config.pauseOnInteraction) notifyUserInteraction();
    });

    document.addEventListener('visibilitychange', onVisibilityChange);

    peeler.tabIndex = 0;
    placeSlides();
    swapHiRes(slides[index]);

    if (config.autoplay) {
        setTimeout(startAutoplay, 500);
    }

    window.__peelScroller = {
        next: () => triggerNav('next'),
        prev: () => triggerNav('prev'),
        goto: (n) => { goto(n % count, 'next'); },
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
