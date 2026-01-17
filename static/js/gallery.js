import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';

if (document.body.dataset.page === 'gallery') {

    function initGalleryLightbox() {
        const carousel = document.querySelector('.hover-carousel');
        if (!carousel) return;

        // 1. Build the DataSource array from the DOM elements
        // This creates a list of all images in the carousel for PhotoSwipe
        const containers = Array.from(document.querySelectorAll('.hc-container'));
        const dataSource = containers.map(el => {
            return {
                src: el.dataset.pswpSrc,
                w: parseInt(el.dataset.pswpWidth, 10),
                h: parseInt(el.dataset.pswpHeight, 10),
                // This 'element' property allows PhotoSwipe to do the zoom transition
                element: el.querySelector('img'),
                msrc: el.querySelector('img').src
            };
        });

        // 2. Initialize Lightbox with the manual DataSource
        const lightbox = new PhotoSwipeLightbox({
            dataSource: dataSource,
            pswpModule: PhotoSwipe,
            bgOpacity: 0.9,
            showHideAnimationType: 'zoom'
        });

        // 3. Add Download Button
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

        // 4. Manually bind Click Events to the containers
        // This bypasses any complex layout/anchor issues
        containers.forEach((el, index) => {
            el.addEventListener('click', (e) => {
                e.preventDefault(); // Stop any other behavior
                lightbox.loadAndOpen(index);
            });
        });

        console.log('[gallery] Header Carousel Lightbox initialized with', dataSource.length, 'items');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGalleryLightbox);
    } else {
        initGalleryLightbox();
    }
}