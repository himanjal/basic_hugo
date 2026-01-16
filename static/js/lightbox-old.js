/* static/js/lightbox-old.js
   Robust lightbox with:
   - full-resolution loading (reads data-hi2x or data-hi)
   - wheel zoom, pointer pan, pinch-to-zoom
   - pinch & double-tap support on touch
   - dblclick on desktop to toggle/reset zoom
   - pan clamping so image edges remain visible
   - download anchor uses the hi-res URL

   This version:
   - resolves thumbnails -> full via window.HG_IMAGES if available
   - exposes window.Lightbox.openWithSrc(src)
*/

(function () {
    'use strict';

    const lightbox = document.getElementById('lightbox');
    if (!lightbox) {
        console.warn('[lightbox] lightbox element not found');
        return;
    }

    const backdrop = lightbox.querySelector('.lightbox-backdrop');
    const btnClose = lightbox.querySelector('.lb-close');
    const btnPrev = lightbox.querySelector('.lb-prev');
    const btnNext = lightbox.querySelector('.lb-next');
    const btnDownload = lightbox.querySelector('.lb-download');

    const viewport = lightbox.querySelector('.lb-viewport');
    const img = lightbox.querySelector('.lb-img');

    if (!viewport || !img) {
        console.warn('[lightbox] viewport or img not found in lightbox markup');
        return;
    }

    // Collect carousel items in DOM order (if you use a featured-carousel elsewhere)
    const containers = Array.from(document.querySelectorAll('.featured-carousel .hc-container'));
    const items = containers.map((el, idx) => ({
        el,
        hi: el.dataset.hi2x || el.dataset.hi || el.getAttribute('data-hi2x') || el.getAttribute('data-hi'),
        index: idx
    }));

    let current = -1;
    let lastFocused = null;

    const state = { scale: 1, minScale: 1, maxScale: 6, tx: 0, ty: 0 };
    const DOUBLE_TAP_TIMEOUT = 320;
    let lastTap = 0;

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function applyTransform() {
        clampTranslation();
        img.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    }

    function clampTranslation() {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const vpRect = viewport.getBoundingClientRect();
        const vpW = Math.max(1, vpRect.width);
        const vpH = Math.max(1, vpRect.height);
        const imgW = img.naturalWidth * state.scale;
        const imgH = img.naturalHeight * state.scale;
        const halfVpW = vpW / 2, halfVpH = vpH / 2;
        const halfImgW = imgW / 2, halfImgH = imgH / 2;

        if (halfImgW > halfVpW) {
            const maxTx = halfImgW - halfVpW;
            state.tx = clamp(state.tx, -maxTx, maxTx);
        }
        if (halfImgH > halfVpH) {
            const maxTy = halfImgH - halfVpH;
            state.ty = clamp(state.ty, -maxTy, maxTy);
        }
    }

    function computeMinScale() {
        if (!img.naturalWidth || !img.naturalHeight) return 1;
        const vpRect = viewport.getBoundingClientRect();
        const fitScale = Math.min(vpRect.width / img.naturalWidth, vpRect.height / img.naturalHeight);
        return Math.min(1, fitScale);
    }

    function centerAndResetPosition() {
        state.tx = 0; state.ty = 0; clampTranslation(); applyTransform();
    }

    function preload(i) {
        if (i < 0 || i >= items.length) return;
        const s = items[i].hi;
        if (!s) return;
        const p = new Image();
        p.src = s;
    }

    function normalizeUrl(u) {
        try {
            const url = new URL(u, location.origin);
            return url.pathname + (url.search || '');
        } catch (e) {
            return String(u || '');
        }
    }

    // resolveFullUrl: given a src (maybe a thumbnail), return the highest-res matching "full" URL
    function resolveFullUrl(src) {
        try {
            if (!src) return src;
            if (typeof src === 'object' && src.full) return src.full;

            const arr = window.HG_IMAGES;
            if (Array.isArray(arr) && arr.length) {
                for (let i = 0; i < arr.length; i++) {
                    const it = arr[i];
                    if (!it) continue;
                    if (typeof it === 'string') {
                        if (normalizeUrl(it) === normalizeUrl(src)) return it;
                        continue;
                    }
                    const thumb = String(it.thumb || it.t || '');
                    const full  = String(it.full  || it.f || '');
                    if (thumb && (normalizeUrl(thumb) === normalizeUrl(src) || normalizeUrl(thumb).endsWith(normalizeUrl(src)))) {
                        return full || src;
                    }
                    if (full && (normalizeUrl(full) === normalizeUrl(src) || normalizeUrl(full).endsWith(normalizeUrl(src)))) {
                        return full;
                    }
                }
            }
            return src;
        } catch (err) {
            return src;
        }
    }

    function show(i) {
        if (!items.length) return;
        if (i < 0) i = items.length - 1;
        if (i >= items.length) i = 0;
        current = i;

        const src = items[i].hi || '';
        const fullSrc = resolveFullUrl(src);

        if (btnDownload) {
            btnDownload.href = fullSrc || '';
            try {
                const filename = (fullSrc || src).split('/').pop() || 'image.jpg';
                btnDownload.setAttribute('download', filename);
            } catch (err) {
                btnDownload.setAttribute('download', 'image.jpg');
            }
        }

        img.onload = () => {
            try { img.style.width = img.naturalWidth + 'px'; img.style.height = img.naturalHeight + 'px'; } catch (err) { img.style.width=''; img.style.height=''; }
            state.minScale = computeMinScale();
            const vpRect = viewport.getBoundingClientRect();
            const fitScale = Math.min(vpRect.width / img.naturalWidth, vpRect.height / img.naturalHeight);
            state.scale = Math.min(1, Math.max(fitScale, state.minScale));
            state.tx = 0; state.ty = 0;
            centerAndResetPosition();
            preload(i-1); preload(i+1);
        };

        img.onerror = () => { console.warn('[lightbox] failed to load', fullSrc || src); img.removeAttribute('src'); };

        img.src = fullSrc || src;
    }

    function open(i) {
        if (!items[i]) return;
        lastFocused = document.activeElement;
        lightbox.setAttribute('aria-hidden','false');
        show(i);
        if (btnClose && btnClose.focus) btnClose.focus();
        document.addEventListener('keydown', onKey);
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    }

    function close() {
        lightbox.setAttribute('aria-hidden','true');
        img.removeAttribute('src');
        img.style.width = ''; img.style.height = '';
        state.scale = 1; state.tx = 0; state.ty = 0;
        document.removeEventListener('keydown', onKey);
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    // openWithSrc: open arbitrary full or thumb src — will resolve to full when possible
    function openWithSrc(src) {
        if (!src) return;
        const finalSrc = resolveFullUrl(src);
        lastFocused = document.activeElement;
        lightbox.setAttribute('aria-hidden','false');

        if (btnDownload) {
            btnDownload.href = finalSrc || '';
            try {
                const filename = (finalSrc || src).split('/').pop() || 'image.jpg';
                btnDownload.setAttribute('download', filename);
            } catch (err) {
                btnDownload.setAttribute('download', 'image.jpg');
            }
        }

        img.onload = () => {
            try { img.style.width = img.naturalWidth + 'px'; img.style.height = img.naturalHeight + 'px'; } catch (err) { img.style.width=''; img.style.height=''; }
            state.minScale = computeMinScale();
            const vpRect = viewport.getBoundingClientRect();
            const fitScale = Math.min(vpRect.width / img.naturalWidth, vpRect.height / img.naturalHeight);
            state.scale = Math.min(1, Math.max(fitScale, state.minScale));
            state.tx = 0; state.ty = 0;
            centerAndResetPosition();
        };

        img.onerror = () => { console.warn('[lightbox] failed to load', finalSrc); img.removeAttribute('src'); };

        img.src = finalSrc;

        if (btnClose && btnClose.focus) btnClose.focus();
        document.addEventListener('keydown', onKey);
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    }

    function onKey(e) {
        if (e.key === 'Escape') return close();
        if (e.key === 'ArrowLeft') return show(current - 1);
        if (e.key === 'ArrowRight') return show(current + 1);
    }

    if (btnPrev) btnPrev.addEventListener('click', (ev) => { ev.stopPropagation(); show(current - 1); });
    if (btnNext) btnNext.addEventListener('click', (ev) => { ev.stopPropagation(); show(current + 1); });
    if (btnClose) btnClose.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    if (backdrop) backdrop.addEventListener('click', close);

    viewport.addEventListener('wheel', function (e) {
        if (!img.src) return;
        e.preventDefault();
        const vpRect = viewport.getBoundingClientRect();
        const cx = e.clientX - vpRect.left - vpRect.width/2;
        const cy = e.clientY - vpRect.top - vpRect.height/2;
        const delta = -e.deltaY;
        const zoomFactor = Math.exp(delta * 0.0016);
        const newScale = clamp(state.scale * zoomFactor, state.minScale, state.maxScale);
        if (newScale !== state.scale) {
            const ratio = newScale / state.scale;
            state.tx = state.tx * ratio + cx * (1 - ratio);
            state.ty = state.ty * ratio + cy * (1 - ratio);
            state.scale = newScale;
            applyTransform();
        }
    }, { passive: false });

    // Pointer pan
    let isPointerDown = false;
    let ptrStart = { x: 0, y: 0 };
    let txStart = 0, tyStart = 0;
    viewport.addEventListener('pointerdown', (e) => {
        if (!img.src) return;
        isPointerDown = true;
        try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
        ptrStart.x = e.clientX; ptrStart.y = e.clientY;
        txStart = state.tx; tyStart = state.ty;
    });
    viewport.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        e.preventDefault();
        const dx = e.clientX - ptrStart.x; const dy = e.clientY - ptrStart.y;
        state.tx = txStart + dx; state.ty = tyStart + dy;
        applyTransform();
    });
    viewport.addEventListener('pointerup', (e) => { isPointerDown = false; try { viewport.releasePointerCapture(e.pointerId); } catch (err){}; applyTransform(); });
    viewport.addEventListener('pointercancel', (e) => { isPointerDown = false; try { viewport.releasePointerCapture(e.pointerId); } catch (err){}; applyTransform(); });

    // Touch gestures
    let ongoingTouches = [];
    function copyTouch(t) { return { id: t.identifier, x: t.clientX, y: t.clientY }; }

    viewport.addEventListener('touchstart', (e) => {
        if (!img.src) return;
        if (e.touches.length === 1) {
            const now = Date.now();
            if (now - lastTap <= DOUBLE_TAP_TIMEOUT) {
                const targetScale = (Math.abs(state.scale - 1) < 0.05) ? state.minScale : 1;
                state.scale = clamp(targetScale, state.minScale, state.maxScale);
                centerAndResetPosition();
                lastTap = 0;
                applyTransform();
                return;
            }
            lastTap = now;
        }
        ongoingTouches = Array.from(e.touches).map(copyTouch);
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
        if (!img.src) return;
        if (e.touches.length === 1 && ongoingTouches.length === 1) {
            if (state.scale > state.minScale + 0.01) {
                e.preventDefault();
                const t = e.touches[0];
                const dx = t.clientX - ongoingTouches[0].x;
                const dy = t.clientY - ongoingTouches[0].y;
                state.tx += dx; state.ty += dy;
                ongoingTouches[0] = copyTouch(t);
                applyTransform();
            }
            return;
        }
        if (e.touches.length >= 2) {
            e.preventDefault();
            const t0 = e.touches[0], t1 = e.touches[1];
            const curDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
            if (ongoingTouches.length >= 2) {
                const p0 = ongoingTouches[0], p1 = ongoingTouches[1];
                const prevDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
                if (prevDist > 0) {
                    const ratio = curDist / prevDist;
                    const newScale = clamp(state.scale * ratio, state.minScale, state.maxScale);
                    const vpRect = viewport.getBoundingClientRect();
                    const midX = ((t0.clientX + t1.clientX)/2) - (vpRect.left + vpRect.width/2);
                    const midY = ((t0.clientY + t1.clientY)/2) - (vpRect.top + vpRect.height/2);
                    if (newScale !== state.scale) {
                        const sratio = newScale / state.scale;
                        state.tx = state.tx * sratio + midX * (1 - sratio);
                        state.ty = state.ty * sratio + midY * (1 - sratio);
                        state.scale = newScale;
                    }
                }
            }
            ongoingTouches = [copyTouch(t0), copyTouch(t1)];
            applyTransform();
        }
    }, { passive: false });

    viewport.addEventListener('touchend', (e) => { ongoingTouches = Array.from(e.touches).map(copyTouch); applyTransform(); }, { passive: true });

    // Thumbnail click handlers (for featured carousel)
    const containersEls = containers || [];
    containersEls.forEach((el, i) => {
        el.addEventListener('click', (ev) => { ev.stopPropagation(); open(i); });
        el.addEventListener('dblclick', (ev) => { ev.stopPropagation(); open(i); });

        let lastTouchTime = 0;
        el.addEventListener('touchend', function (ev) {
            const now = Date.now();
            if (now - lastTouchTime <= DOUBLE_TAP_TIMEOUT) {
                ev.preventDefault();
                open(i);
                lastTouchTime = 0;
                return;
            }
            lastTouchTime = now;
        }, { passive: false });

        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
        });
    });

    // dblclick to toggle/reset zoom
    function toggleResetZoomAtCenter() {
        if (!img.src || !img.naturalWidth) return;
        const nearNative = Math.abs(state.scale - 1) < 0.05;
        const target = nearNative ? state.minScale : 1;
        state.scale = clamp(target, state.minScale, state.maxScale);
        state.tx = 0; state.ty = 0; applyTransform();
    }
    viewport.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); toggleResetZoomAtCenter(); }, false);
    img.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); toggleResetZoomAtCenter(); }, false);

    // expose debug + API
    window.__lightboxDebug = { state, items, showIndex: (i)=>show(i), openIndex: (i)=>open(i), close };
    window.Lightbox = window.Lightbox || {};
    window.Lightbox.openWithSrc = openWithSrc;

})();
