import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';

if (document.body.dataset.page === 'gallery') {

    // --- 1. Carousel Lightbox Logic (Existing) ---
    function initGalleryLightbox() {
        const carousel = document.querySelector('.hover-carousel');
        if (!carousel) return;

        const containers = Array.from(document.querySelectorAll('.hc-container'));
        const dataSource = containers.map(el => {
            return {
                src: el.dataset.pswpSrc,
                w: parseInt(el.dataset.pswpWidth, 10),
                h: parseInt(el.dataset.pswpHeight, 10),
                element: el.querySelector('img'),
                msrc: el.querySelector('img').src
            };
        });

        const lightbox = new PhotoSwipeLightbox({
            dataSource: dataSource,
            pswpModule: PhotoSwipe,
            bgOpacity: 0.9,
            showHideAnimationType: 'zoom'
        });

        lightbox.on('uiRegister', () => {
            lightbox.pswp.ui.registerElement({
                name: 'download',
                order: 8,
                isButton: true,
                tagName: 'a',
                html: {
                    isCustomSVG: true,
                    inner: `<path d="M20.5 14.3 17.1 18V10h-2.2v7.9l-3.4-3.6L10 16l6 6.1 6-6.1ZM23 23H9v2h14Z"/>`,
                    outlineID: 'pswp__icn-download'
                },
                onInit: (el, pswp) => {
                    el.setAttribute('download', '');
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener');
                    pswp.on('change', () => {
                        el.href = pswp.currSlide.data.src;
                    });
                }
            });
        });

        lightbox.init();

        containers.forEach((el, index) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                lightbox.loadAndOpen(index);
            });
        });

        console.log('[gallery] Lightbox initialized.');
    }

// --- 2. Grid Interaction Logic ---
    function initGridInteractions() {

        // A. Click Handling (Desktop)
        document.addEventListener('click', function (e) {
            const card = e.target.closest('.thumb-card');
            if (card) {
                const link = card.querySelector('a.thumb-link');
                // Check if click was on padding/margin (not the link itself)
                if (link && e.target !== link && !link.contains(e.target)) {
                    window.location.href = link.href;
                }
            }
        }, true);

        // B. Keyboard Accessibility
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                const el = document.activeElement;
                if (el && el.classList.contains('thumb-card')) {
                    const album = el.getAttribute('data-album');
                    if (album) {
                        e.preventDefault();
                        window.location.href = `/album-viewer/${album}/`;
                    }
                }
            }
        });

        // C. Mobile Touch Interaction (Global Reset Strategy)

        // 1. Touch Start: Add class to the SPECIFIC card touched
        document.addEventListener('touchstart', function(e) {
            const card = e.target.closest('.thumb-card');
            if (card) {
                card.classList.add('touch-hover');
            }
        }, { passive: true });

        // 2. Global Reset: On ANY release, reset EVERY card in the DOM
        const resetAllCards = () => {
            const activeCards = document.querySelectorAll('.thumb-card.touch-hover');

            activeCards.forEach(card => {
                // We use a small timeout to ensure the visual "pop" is seen
                // even on very fast taps
                setTimeout(() => {
                    card.classList.remove('touch-hover');
                }, 150);
            });
        };

        // 3. Listen for ALL termination events
        // whether you lift your finger (touchend) or the system stops it (touchcancel)
        document.addEventListener('touchend', resetAllCards);
        document.addEventListener('touchcancel', resetAllCards);

        console.log('[gallery] Grid interactions active.');
    }

// --- Initialization ---
// Checks if DOM is ready to ensure we don't miss elements
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initGalleryLightbox();
            initGridInteractions();
        });
    } else {
        initGalleryLightbox();
        initGridInteractions();
    }
}