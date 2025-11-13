// static/js/peel-scroller.js — final implementation (forward + reverse per spec)
// Behavior summary:
// - forward: top slides left (0 -> -100%), then appended to the back.
// - reverse: previous (last) is moved to front, top slides right (0 -> +100%) revealing previous underneath,
//            after animation the DOM order is prev, top, ... (i.e., H A B C ...)
// - drag left -> forward; drag right -> reverse; snap-back if threshold not met
// - prevents concurrent animations; lazy-load neighbor images

(() => {
    const peeler = document.getElementById('peeler');
    if (!peeler) return;

    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const slidesSelector = '.peel-slide';

    const SWIPE_THRESHOLD = 40;    // px
    const VELOCITY_THRESHOLD = 0.35; // px/ms

    let animating = false;

    function getSlides() {
        return Array.from(peeler.querySelectorAll(slidesSelector));
    }

    function ensureLoaded(slide) {
        if (!slide) return;
        const img = slide.querySelector('img.lazy');
        if (img && img.dataset && img.dataset.src && img.src !== img.dataset.src) {
            img.src = img.dataset.src;
            img.classList.remove('lazy');
        }
    }

    /* FORWARD: top slides left, then append to back */
    function peelNext() {
        if (animating) return;
        const slides = getSlides();
        if (slides.length < 2) return;
        animating = true;

        const top = slides[0];
        const next = slides[1];
        ensureLoaded(next);

        // animate top left
        top.classList.add('is-peeling-left');

        function onEnd(e) {
            if (e.target !== top) return;
            top.removeEventListener('transitionend', onEnd);

            // cleanup and move to back
            top.classList.remove('is-peeling-left');
            top.style.transform = '';
            peeler.appendChild(top);

            animating = false;
        }
        top.addEventListener('transitionend', onEnd);
    }

    /* REVERSE: move previous (last) to front, then animate current top right (0->+100).
       After animation, DOM order is [prev, top, ...] (previous becomes new top).
    */
    function peelPrev() {
        if (animating) return;
        const slides = getSlides();
        if (slides.length < 2) return;
        animating = true;

        const top = slides[0];
        const prev = slides[slides.length - 1];

        ensureLoaded(prev);

        // move prev to front visually
        peeler.insertBefore(prev, top);

        // ensure top is above visually during animation
        const originalZ = top.style.zIndex;
        top.style.zIndex = 100;

        // animate the current top sliding right (0 -> +100%)
        top.classList.add('is-peeling-right');

        function onEnd(e) {
            if (e.target !== top) return;
            top.removeEventListener('transitionend', onEnd);

            // cleanup: top has peeled away; keep DOM order as [prev, top, ...]
            top.classList.remove('is-peeling-right');
            top.style.transform = '';
            top.style.zIndex = originalZ || '';

            animating = false;
        }
        top.addEventListener('transitionend', onEnd);
    }

    /* DRAG interactions */
    let startX = 0;
    let startTime = 0;
    let pointerActive = false;

    peeler.addEventListener('pointerdown', function onDown(e) {
        if (animating) return;
        const slides = getSlides();
        if (!slides.length) return;

        const top = slides[0];
        startX = e.clientX;
        startTime = performance.now();
        pointerActive = true;

        top.classList.add('is-dragging');

        function onMove(ev) {
            if (!pointerActive) return;
            const dx = ev.clientX - startX;
            top.style.transform = `translateX(${dx}px)`;
        }

        function onUp(ev) {
            pointerActive = false;
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);

            const dx = ev.clientX - startX;
            const dt = Math.max(1, performance.now() - startTime);
            const velocity = Math.abs(dx) / dt;

            top.classList.remove('is-dragging');

            // Forward (drag left)
            if (dx < -SWIPE_THRESHOLD || (dx < 0 && velocity > VELOCITY_THRESHOLD)) {
                top.style.transform = '';
                peelNext();
                return;
            }

            // Reverse (drag right)
            if (dx > SWIPE_THRESHOLD || (dx > 0 && velocity > VELOCITY_THRESHOLD)) {
                top.style.transform = '';
                peelPrev();
                return;
            }

            // Snap back
            top.classList.add('snap-back');
            top.addEventListener('transitionend', function snapEnd(ev2) {
                if (ev2.target !== top) return;
                top.removeEventListener('transitionend', snapEnd);
                top.classList.remove('snap-back');
            });
            top.style.transform = 'translateX(0)';
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp, { once: true });
    });

    /* Buttons */
    nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); peelNext(); });
    prevBtn?.addEventListener('click', (e) => { e.stopPropagation(); peelPrev(); });

    /* Keyboard */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); peelPrev(); }
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); peelNext(); }
    });

    /* Preload first two images for responsiveness */
    const init = getSlides();
    if (init[0]) ensureLoaded(init[0]);
    if (init[1]) ensureLoaded(init[1]);

})();
