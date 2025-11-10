// static/js/hero-typewriter.js
(function () {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    // types text into element, returns an object with cancel()
    function typeInto(el, text, speed = 22, caretClass = 'typing') {
        let i = 0;
        let cancelled = false;
        el.textContent = '';
        el.classList.add(caretClass);
        const timer = setInterval(() => {
            if (cancelled) {
                clearInterval(timer);
                el.classList.remove(caretClass);
                return;
            }
            el.textContent += text.charAt(i);
            i++;
            if (i >= text.length) {
                clearInterval(timer);
                // leave caret for a moment then remove
                setTimeout(() => el.classList.remove(caretClass), 200);
            }
        }, speed);
        return {
            cancel() {
                cancelled = true;
                clearInterval(timer);
                el.classList.remove(caretClass);
            }
        };
    }

    // Intersection observer helper
    function createVisibilityObserver(target, threshold = 0.25) {
        let visible = false;
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => { visible = e.isIntersecting && e.intersectionRatio >= threshold; });
        }, { threshold: [threshold] });
        io.observe(target);
        return {
            isVisible() { return visible; },
            disconnect() { io.disconnect(); }
        };
    }

    document.addEventListener('DOMContentLoaded', function () {
        const container = document.querySelector('.hero-intro');
        if (!container) return;

        const subtitleEl = container.querySelector('.hero-intro-subtitle');
        if (!subtitleEl) return;

        const ORIGINAL_SUB = subtitleEl.textContent.trim();

        // respect reduced motion
        if (reduceMotion) {
            subtitleEl.textContent = ORIGINAL_SUB;
            return;
        }

        // configurable values
        const TYPING_DELAY = 500; // milliseconds before typing starts after hover/focus
        const TYPING_SPEED = 22;  // ms per character

        let typingTask = null;      // active typing cancellable task
        let pendingTimer = null;    // timer id for delayed start
        let pendingStart = false;   // whether we've scheduled a start
        const vis = createVisibilityObserver(container, 0.15);

        function clearPendingTimer() {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
                pendingTimer = null;
            }
        }

        function scheduleTypingWhenVisible() {
            // schedules typing to begin after TYPING_DELAY when visible
            clearPendingTimer();
            pendingStart = true;
            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                // only start if still pending and visible
                if (!pendingStart) return;
                if (vis.isVisible()) {
                    startTyping();
                    pendingStart = false;
                } else {
                    // poll via rAF until visible, then start
                    const poll = () => {
                        if (!pendingStart) return;
                        if (vis.isVisible()) {
                            startTyping();
                            pendingStart = false;
                        } else {
                            requestAnimationFrame(poll);
                        }
                    };
                    requestAnimationFrame(poll);
                }
            }, TYPING_DELAY);
        }

        function startTyping() {
            stopTyping(false); // stop previous typing but don't restore text (we want cleared state)
            // start typing into subtitle
            typingTask = typeInto(subtitleEl, ORIGINAL_SUB, TYPING_SPEED, 'typing');
        }

        function stopTyping(restoreFull = true) {
            // cancel active typing
            if (typingTask && typeof typingTask.cancel === 'function') {
                typingTask.cancel();
                typingTask = null;
            }
            // cancel any pending timer
            clearPendingTimer();
            pendingStart = false;
            if (restoreFull) {
                // restore the full subtitle immediately
                subtitleEl.textContent = ORIGINAL_SUB;
                subtitleEl.classList.remove('typing');
            }
        }

        // On enter: immediately clear subtitle text, then schedule typing after delay (start only when visible)
        function handleEnter() {
            // clear existing text immediately
            clearPendingTimer();
            if (typingTask && typeof typingTask.cancel === 'function') {
                typingTask.cancel();
                typingTask = null;
            }
            subtitleEl.textContent = '';       // <-- immediate removal of old subtitle
            subtitleEl.classList.remove('typing');

            // schedule typing after delay; if visible, it will start after the delay; otherwise waits until visible
            scheduleTypingWhenVisible();
        }

        // On leave: cancel any pending typing and restore full subtitle right away
        function handleLeave() {
            stopTyping(true);
        }

        // Listeners for hover/focus
        container.addEventListener('mouseenter', handleEnter);
        container.addEventListener('mouseleave', handleLeave);
        container.addEventListener('focusin', handleEnter);
        container.addEventListener('focusout', handleLeave);

        // Touch: on touchstart, clear text immediately and schedule/start typing (debounced)
        if (isTouchDevice()) {
            let touchDebounce = 0;
            container.addEventListener('touchstart', (ev) => {
                const now = Date.now();
                if (now - touchDebounce < 300) return;
                touchDebounce = now;
                // clear cancel and clear text immediately
                clearPendingTimer();
                if (typingTask && typeof typingTask.cancel === 'function') {
                    typingTask.cancel();
                    typingTask = null;
                }
                subtitleEl.textContent = '';
                subtitleEl.classList.remove('typing');

                // schedule/start typing (if visible start after delay, else wait until visible)
                scheduleTypingWhenVisible();
            }, { passive: true });
        }

        // cleanup on unload (hot reload/navigation)
        window.addEventListener('unload', () => {
            stopTyping(false);
            vis.disconnect();
        });
    });
})();
