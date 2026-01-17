import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';

if (document.body.dataset.page === 'album-viewer') {
    function initAlbumLightbox() {
        const gallery = document.querySelector('.album-grid');

        if (!gallery) {
            console.warn('[album-viewer] .album-grid not found');
            return;
        }

        console.log('[album-viewer] initializing PhotoSwipe');

        const lightbox = new PhotoSwipeLightbox({
            gallery: '.album-grid',
            children: '.album-link',
            pswpModule: () =>
                import('https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js'),
            appendToEl: document.body
        });

        lightbox.on('uiRegister', () => {
            lightbox.pswp.ui.registerElement({
                name: 'download',
                order: 8,
                isButton: true,
                tagName: 'a',
                html: {
                    isCustomSVG: true,
                    inner: `
            <path d="M20.5 14.3 17.1 18V10h-2.2v7.9l-3.4-3.6L10 16l6 6.1 6-6.1ZM23 23H9v2h14Z"/>
          `,
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAlbumLightbox);
    } else {
        initAlbumLightbox();
    }
}
