// static/js/gallery-scroller.js
document.addEventListener('DOMContentLoaded', function () {
    const scroller = document.querySelector('.featured-scroller');
    if (!scroller) return;

    const slides = Array.from(scroller.querySelectorAll('.slide'));
    const dots = Array.from(document.querySelectorAll('.scroller-dot'));

    function centerToIndex(i, smooth = true) {
        const slide = slides[i];
        if (!slide) return;
        const left = slide.offsetLeft + (slide.offsetWidth / 2) - (scroller.clientWidth / 2);
        scroller.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'auto' });
        updateActiveDot(i);
    }

    function updateActiveDot(index) {
        if (!dots.length) return;
        dots.forEach(d => d.classList.remove('active'));
        if (dots[index]) dots[index].classList.add('active');
    }

    // find centered slide → used on scroll end
    function findCenteredIndex() {
        const center = scroller.scrollLeft + (scroller.clientWidth / 2);
        let bestIdx = 0, bestDist = Infinity;
        slides.forEach((s, i) => {
            const sCenter = s.offsetLeft + s.offsetWidth / 2;
            const dist = Math.abs(sCenter - center);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        });
        return bestIdx;
    }

    // When scrolling stops, snap to nearest slide (ensures exact centering)
    let scrollTimer;
    scroller.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const idx = findCenteredIndex();
            centerToIndex(idx, true);
        }, 100);
    });

    // center on a chosen initial slide (middle)
    function initialCenter() {
        if (!slides.length) return;
        const mid = Math.floor(slides.length / 2);
        centerToIndex(mid, false);
    }

    // prev/next buttons (if present)
    const prevBtn = document.querySelector('.scroller-prev');
    const nextBtn = document.querySelector('.scroller-next');
    if (prevBtn) prevBtn.addEventListener('click', () => {
        const idx = Math.max(0, findCenteredIndex() - 1);
        centerToIndex(idx);
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        const idx = Math.min(slides.length - 1, findCenteredIndex() + 1);
        centerToIndex(idx);
    });

    // dots
    if (dots.length === slides.length) {
        dots.forEach((dot, i) => dot.addEventListener('click', () => centerToIndex(i)));
    }

    // keyboard
    scroller.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            const idx = Math.max(0, findCenteredIndex() - 1);
            centerToIndex(idx);
        }
        if (e.key === 'ArrowRight') {
            const idx = Math.min(slides.length - 1, findCenteredIndex() + 1);
            centerToIndex(idx);
        }
    });

    // Recalc on resize -> keep the same logical center slide visible
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const idx = findCenteredIndex();
            centerToIndex(idx, false); // instantly re-center without animation
        }, 120);
    });

    // init
    initialCenter();
    // update dots initially
    updateActiveDot(findCenteredIndex());
});
