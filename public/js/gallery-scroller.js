// static/js/gallery-scroller.js
(function () {
    function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
    function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

    document.addEventListener('DOMContentLoaded', function () {
        const scroller = qs('#featured-scroller');
        if (!scroller) return;

        const slides = qsa('.slide', scroller);
        const dotsWrap = qs('#featured-controls');
        const dots = dotsWrap ? qsa('.scroller-dot', dotsWrap) : [];
        const intervalMs = parseInt(scroller.dataset.interval || 4200, 10);
        let current = 0;
        let autoId = null;
        let isHovered = false;

        function goTo(idx, smooth = true) {
            if (!slides[idx]) return;
            current = idx;
            const left = slides[idx].offsetLeft;
            scroller.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'auto' });
            // update active class on dots
            if (dots.length) {
                dots.forEach((d, i) => d.classList.toggle('active', i === idx));
            }
        }

        function next() {
            const nxt = (current + 1) % slides.length;
            goTo(nxt);
        }

        function startAuto() {
            stopAuto();
            autoId = setInterval(() => {
                if (!isHovered) next();
            }, intervalMs);
        }
        function stopAuto() { if (autoId) { clearInterval(autoId); autoId = null; } }

        // attach dots click
        if (dots.length) {
            dots.forEach((d) => {
                d.addEventListener('click', (ev) => {
                    const i = parseInt(d.dataset.dotIndex, 10);
                    goTo(i);
                    startAuto();
                });
            });
        }

        // pause on hover/focus
        scroller.addEventListener('mouseenter', () => { isHovered = true; });
        scroller.addEventListener('mouseleave', () => { isHovered = false; });
        scroller.addEventListener('focusin', () => { isHovered = true; });
        scroller.addEventListener('focusout', () => { isHovered = false; });

        // thumbnail clicks: scroll scroller to that slide if shot-index provided
        document.addEventListener('click', (e) => {
            const t = e.target.closest('[data-slide-index]');
            if (!t) return;
            const idx = parseInt(t.dataset.slideIndex, 10);
            if (!isNaN(idx)) {
                goTo(idx);
                startAuto();
            }
        });

        // Update current on manual scroll (snap end). Uses debounced scroll end detection.
        let scrollTimer = null;
        scroller.addEventListener('scroll', () => {
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                // find slide nearest to scroller.scrollLeft
                const scLeft = scroller.scrollLeft;
                let best = 0; let bestDiff = Infinity;
                slides.forEach((s, i) => {
                    const diff = Math.abs(s.offsetLeft - scLeft);
                    if (diff < bestDiff) { bestDiff = diff; best = i; }
                });
                current = best;
                if (dots.length) dots.forEach((d, i) => d.classList.toggle('active', i === best));
            }, 90);
        });

        // make first dot active
        if (dots.length) {
            dots.forEach((d, i) => d.classList.toggle('active', i === 0));
        }

        // Start automatic cycling
        startAuto();

        // Ensure initial alignment (no smooth for initial jump)
        goTo(0, false);
    });
})();
