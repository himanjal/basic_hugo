// static/js/backdrop-detect.js
(function () {
    // feature detection for backdrop-filter
    var supportsBackdrop = false;
    try {
        supportsBackdrop = CSS && (CSS.supports && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')));
    } catch (e) {
        supportsBackdrop = false;
    }

    // Additional runtime test: attempt to apply and read computed style (some embedded contexts block it)
    if (supportsBackdrop) {
        try {
            var test = document.createElement('div');
            test.style.backdropFilter = 'blur(1px)';
            test.style.webkitBackdropFilter = 'blur(1px)';
            document.documentElement.appendChild(test);
            var computed = window.getComputedStyle(test).backdropFilter || window.getComputedStyle(test).getPropertyValue('backdrop-filter');
            document.documentElement.removeChild(test);
            // if computed is empty string in some browsers, we still rely on CSS.supports result; keep supportsBackdrop as true
        } catch (e) {
            supportsBackdrop = false;
        }
    }

    if (!supportsBackdrop) {
        document.body.classList.add('no-backdrop');
    } else {
        document.body.classList.remove('no-backdrop');
    }

    // Also observe DOM and re-run detection after load in case layout/stacking contexts change (hot reload)
    window.addEventListener('load', function () {
        if (!supportsBackdrop) document.body.classList.add('no-backdrop');
    });
})();
