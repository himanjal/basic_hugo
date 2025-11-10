// static/js/backdrop-repaint.js
(function () {
    if (!document) return;
    // only run on pages where hero-intro exists
    function forceRepaint(el) {
        // cheap repaint nudge: apply tiny 3D transform, then remove
        // use requestAnimationFrame to ensure it's applied
        el.style.willChange = 'transform';
        el.style.webkitTransform = 'translateZ(0.0001px)';
        el.style.transform = 'translateZ(0.0001px)';
        requestAnimationFrame(function () {
            el.style.webkitTransform = '';
            el.style.transform = '';
            // remove the hint after a short delay
            setTimeout(() => { el.style.willChange = ''; }, 200);
        });
    }

    function init() {
        var hero = document.querySelector('.grid-item.hero-intro');
        if (!hero) return;

        // on pointerenter, nudge a repaint
        hero.addEventListener('pointerenter', function () {
            forceRepaint(hero);
        });

        // also nudge when pointer leaves to ensure subsequent entries repaint
        hero.addEventListener('pointerleave', function () {
            // small timeout so the next enter gets a fresh repaint
            setTimeout(function () {
                forceRepaint(hero);
            }, 50);
        });
    }

    // Dom ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
