// static/js/site-header.js
(function () {
    const header = document.querySelector('.site-header');
    if (!header) return;

    let lastY = 0;
    let ticking = false;

    function onScroll() {
        lastY = window.scrollY || window.pageYOffset;
        if (!ticking) {
            window.requestAnimationFrame(() => {
                header.classList.toggle('scrolled', lastY > 24);
                ticking = false;
            });
            ticking = true;
        }
    }

    document.addEventListener('scroll', onScroll, { passive: true });

    // initialize immediately on load (in case the page was loaded scrolled)
    onScroll();
})();
