// static/js/lightbox.js
(function () {
    'use strict';

    document.querySelectorAll('.album-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            window.lightbox.open(
                link.dataset.full,   // MUST be original image
                link.dataset.name
            );
        });
    });


    class LightboxController {
        constructor(root) {
            this.root = root;
            this.backdrop = root.querySelector('.lightbox-backdrop');
            this.viewport = root.querySelector('.lb-viewport');
            this.img = root.querySelector('.lb-img');
            this.closeBtn = root.querySelector('.lb-close');

            /* transform state */
            this.scale = 1;
            this.baseScale = 1;
            this.maxScale = 4;
            this.translateX = 0;
            this.translateY = 0;

            /* gesture state */
            this.isPanning = false;
            this.startX = 0;
            this.startY = 0;
            this.lastTouchDistance = null;
            this.lastTapTime = 0;

            this.bindEvents();
        }

        /* --------------------------
           Utilities
        -------------------------- */

        clamp(v, min, max) {
            return Math.min(max, Math.max(min, v));
        }

        applyTransform() {
            this.img.style.transform =
                `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
        }

        clampPan() {
            const vw = this.viewport.clientWidth;
            const vh = this.viewport.clientHeight;

            const iw = this.img.naturalWidth * this.scale;
            const ih = this.img.naturalHeight * this.scale;

            const maxX = Math.max(0, (iw - vw) / 2);
            const maxY = Math.max(0, (ih - vh) / 2);

            this.translateX = this.clamp(this.translateX, -maxX, maxX);
            this.translateY = this.clamp(this.translateY, -maxY, maxY);
        }

        /* --------------------------
           Fit-to-screen (CRITICAL)
        -------------------------- */

        resetTransform() {
            const vw = this.viewport.clientWidth;
            const vh = this.viewport.clientHeight;
            const iw = this.img.naturalWidth;
            const ih = this.img.naturalHeight;

            if (!iw || !ih) return;

            // contain fit
            const scaleX = vw / iw;
            const scaleY = vh / ih;

            this.baseScale = Math.min(scaleX, scaleY);
            this.scale = this.baseScale;
            this.translateX = 0;
            this.translateY = 0;

            this.applyTransform();
        }

        open(src, alt = '') {
            // ensure highest possible quality
            this.img.removeAttribute('srcset');
            this.img.src = src;
            this.img.alt = alt;

            this.root.setAttribute('aria-hidden', 'false');
        }

        close() {
            this.root.setAttribute('aria-hidden', 'true');
            this.resetTransform();
        }

        /* --------------------------
           Event binding
        -------------------------- */

        bindEvents() {
            /* close */
            this.backdrop.addEventListener('touchend', () => this.close());
            this.backdrop.addEventListener('click', () => this.close());

            this.closeBtn?.addEventListener('click', () => this.close());

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.close();
            });

            this.img.addEventListener('click', (e) => e.stopPropagation());

            this.viewport.addEventListener('touchend', (e) => {
                e.stopPropagation();
            });


            // this.img.addEventListener('load', () => {
            //     this.resetTransform();
            // });

            this.bindDoubleTap();
            this.bindPinchZoom();
            this.bindPan();
        }

        /* --------------------------
           Double-tap zoom
        -------------------------- */

        bindDoubleTap() {
            let lastTap = 0;

            this.viewport.addEventListener(
                'touchend',
                (e) => {
                    if (e.touches.length > 0) return;

                    const now = Date.now();
                    if (now - lastTap < 300) {
                        if (this.scale > this.baseScale) {
                            this.scale = this.baseScale;
                            this.translateX = 0;
                            this.translateY = 0;
                        } else {
                            this.scale = this.baseScale * 2;
                        }

                        this.clampPan();
                        this.applyTransform();
                    }
                    lastTap = now;
                },
                { passive: true }
            );
        }



        /* --------------------------
           Pinch-to-zoom
        -------------------------- */

        bindPinchZoom() {
            this.viewport.addEventListener(
                'touchstart',
                (e) => {
                    if (e.touches.length === 2) {
                        this.lastTouchDistance = null;
                    }
                },
                { passive: false }
            );

            this.viewport.addEventListener(
                'touchmove',
                (e) => {
                    if (e.touches.length !== 2) return;

                    e.preventDefault();

                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const distance = Math.hypot(dx, dy);

                    if (this.lastTouchDistance) {
                        const delta = distance / this.lastTouchDistance;

                        this.scale = this.clamp(
                            this.scale * delta,
                            this.baseScale,
                            this.baseScale * this.maxScale
                        );

                        this.clampPan();
                        this.applyTransform();
                    }

                    this.lastTouchDistance = distance;
                },
                { passive: false }
            );

            this.viewport.addEventListener('touchend', () => {
                this.lastTouchDistance = null;
            });
        }



        /* --------------------------
           Pan (bounded)
        -------------------------- */

        bindPan() {
            this.viewport.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1 && this.scale > this.baseScale) {
                    this.isPanning = true;
                    this.startX = e.touches[0].clientX - this.translateX;
                    this.startY = e.touches[0].clientY - this.translateY;
                }
            });

            this.viewport.addEventListener('touchmove', (e) => {
                if (!this.isPanning || e.touches.length !== 1) return;

                this.translateX = e.touches[0].clientX - this.startX;
                this.translateY = e.touches[0].clientY - this.startY;

                this.clampPan();
                this.applyTransform();
            });

            this.viewport.addEventListener('touchend', () => {
                this.isPanning = false;
            });
        }
    }

    /* --------------------------
       Init
    -------------------------- */

    const el = document.querySelector('.lightbox');
    if (el) {
        window.lightbox = new LightboxController(el);
    }
})();
