// static/js/backdrop-detect.js
(function () {
    function supportsBackdropFilter() {
        // Try modern CSS.supports checks
        try {
            if (CSS && CSS.supports) {
                // some browsers support 'backdrop-filter' but behind flags; test both forms
                return CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
            }
        } catch (e) {}
        return false;
    }

    if (!supportsBackdropFilter()) {
        document.documentElement.classList.add('no-backdrop');
    } else {
        document.documentElement.classList.remove('no-backdrop');
    }
})();
