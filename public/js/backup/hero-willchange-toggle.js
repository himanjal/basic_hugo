// static/js/hero-willchange-toggle.js
// Toggle will-change for the hero tile only while hovered to improve blur responsiveness.
//
// Lightweight, cross-browser safe. Uses requestAnimationFrame and throttles removal.
(function () {
    if (!document || !window) return;

    function safeEl(selector) {
        try { return document.querySelector(selector); } catch (e) { return null; }
    }

    const HERO_SELECTOR = '.grid-item.hero-intro';
    const HOVER_WILLCHANGE = 'transform, backdrop-filter';
    const REMOVE_DELAY = 220;   // ms after pointerleave to remove will-change (allows transitions to finish)
    const ENTER_DEBOUNCE = 30;  // ms debounce to avoid extra churn on micro-movements

    let removeTimer = null;
    let enterTimer = null;

    function addWillChange(el) {
        if (!el) return;
        // If already set, leave it
        if (el.style.willChange === HOVER_WILLCHANGE) return;
        el.style.willChange = HOVER_WILLCHANGE;
        // Force a frame so compositor picks it up
        requestAnimationFrame(function () {
            // tiny no-op transform to ensure layer creation on Safari
            el.style.transform = el.style.transform || '';
            el.getBoundingClientRect(); // read to flush style
        });
    }

    function removeWillChange(el) {
        if (!el) return;
        // clear any scheduled remove and schedule a new one to let transitions finish
        if (removeTimer) {
            clearTimeout(removeTimer);
        }
        removeTimer = setTimeout(function () {
            el.style.willChange = '';
            removeTimer = null;
        }, REMOVE_DELAY);
    }

    function onPointerEnter(e) {
        const el = e.currentTarget;
        // debounce rapid enters
        if (enterTimer) clearTimeout(enterTimer);
        enterTimer = setTimeout(function () {
            addWillChange(el);
            enterTimer = null;
        }, ENTER_DEBOUNCE);
        // ensure removal timer cancelled when re-entering
        if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
    }

    function onPointerLeave(e) {
        const el = e.currentTarget;
        // schedule removal
        removeWillChange(el);
    }

    function init() {
        const hero = safeEl(HERO_SELECTOR);
        if (!hero) return;

        // Use pointer events (covers mouse + touch)
        hero.addEventListener('pointerenter', onPointerEnter, { passive: true });
        hero.addEventListener('pointerleave', onPointerLeave, { passive: true });

        // Also support keyboard focus (accessibility)
        hero.addEventListener('focus', function (e) { addWillChange(e.currentTarget); }, true);
        hero.addEventListener('blur', function (e) { removeWillChange(e.currentTarget); }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
