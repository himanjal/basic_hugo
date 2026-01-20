import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';

(function () {
    const wrap = document.querySelector('.hg-wrap');
    if (!wrap) return;

    // --- UI Elements ---
    const loaderEl = document.getElementById('hg-loader');
    const barEl = document.getElementById('hg-loader-bar');
    const hintEl = document.getElementById('hg-start-hint');

    // --- 1. Dynamic Data Loading ---
    let images = [];
    const manifestUrl = wrap.dataset.manifestUrl;
    const configBase = wrap.dataset.configBase;

    async function startProgressiveLoad() {
        if (!manifestUrl) return;
        try {
            const resp = await fetch(manifestUrl);
            if (!resp.ok) return;
            const albums = await resp.json();

            const total = albums.length;
            let loadedCount = 0;

            const updateProgress = () => {
                loadedCount++;
                const pct = Math.min((loadedCount / total) * 100, 100);
                if (barEl) barEl.style.width = `${pct}%`;

                if (loadedCount >= total) {
                    setTimeout(onLoadingComplete, 400);
                }
            };

            albums.forEach(albumId => {
                fetch(`${configBase}${albumId}.json`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.images && Array.isArray(data.images)) {
                            const newBatch = data.images.map(img => ({
                                thumb: img.thumb, full: img.src, w: img.width, h: img.height
                            }));
                            images.push(...newBatch);
                        }
                    })
                    .catch(() => {})
                    .finally(updateProgress);
            });
        } catch (e) { console.error('[playground] Load failed', e); }
    }
    startProgressiveLoad();

    // --- UI State Transitions ---
    function onLoadingComplete() {
        if (loaderEl) loaderEl.classList.add('is-hidden');
        if (hintEl) hintEl.classList.add('is-visible');

        setupInteractionListener();
    }

    function setupInteractionListener() {
        const removeHint = () => {
            if (hintEl) {
                hintEl.classList.remove('is-visible');
                hintEl.classList.add('is-hidden');
            }
            window.removeEventListener('mousemove', removeHint);
            window.removeEventListener('touchstart', removeHint);
            window.removeEventListener('keydown', removeHint);
        };

        window.addEventListener('mousemove', removeHint);
        window.addEventListener('touchstart', removeHint);
        window.addEventListener('keydown', removeHint);
    }

    // --- 2. Configuration & Helpers ---
    const TAG = '[playground]';
    const LOG = (...a) => console.log('%c' + TAG, 'color:#0a7; font-weight:700;', ...a);

    function cssVar(name, fallback) {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name);
            if (!v) return fallback;
            if (v.includes('ms')) return parseInt(v) || fallback;
            return parseFloat(v.replace(/[^0-9.-]+/g, '')) || fallback;
        } catch { return fallback; }
    }

    // EXPOSED VARIABLES (Controlled via CSS)
    let CFG = {
        threshDesktop: cssVar('--hg-threshold-desktop', 50),
        threshMobile:  cssVar('--hg-threshold-mobile', 35),
        scaleMin:      cssVar('--hg-scale-min', 0.5),
        scaleMax:      cssVar('--hg-scale-max', 1.0),
        maxVisible:    cssVar('--hg-visible-count', 12),
        fadeDuration:  cssVar('--hg-fade-duration', 1200),
        idleDelay:     cssVar('--hg-mouse-stop-delay', 150),
        fadeAllDelay:  cssVar('--hg-fade-all-delay', 2000),
    };

    window.addEventListener('resize', () => {
        CFG.threshDesktop = cssVar('--hg-threshold-desktop', 48);
        CFG.threshMobile  = cssVar('--hg-threshold-mobile', 35);
        CFG.scaleMin      = cssVar('--hg-scale-min', 0.1);
        CFG.scaleMax      = cssVar('--hg-scale-max', 1.0);
    });

    const canvas = document.getElementById('hg-canvas');
    if (!canvas) return;

    const activeNodes = [];
    let z = 1000;

    // --- 3. Stack & Fading Logic ---
    const KEEP_LAST_N = 3;
    let idleTimer = null;
    let fadeAllTimer = null;
    let isFadingAll = false;

    function removeNode(node){
        if(!node) return;
        const idx = activeNodes.indexOf(node);
        if(idx!==-1) activeNodes.splice(idx,1);
        if(node.parentNode) node.parentNode.removeChild(node);
    }

    function applyStackRules(){
        while(activeNodes.length > CFG.maxVisible){
            const o = activeNodes.shift();
            if(o && o.parentNode) o.parentNode.removeChild(o);
        }

        for(let i=0; i<activeNodes.length; i++){
            const node = activeNodes[i];
            const fromNewest = activeNodes.length - 1 - i;
            const isFresh = (fromNewest < KEEP_LAST_N) && !isFadingAll;

            if(isFresh) {
                node.classList.remove('decay-full');
                node.style.opacity = '1';
                if(node._removeTimer) { clearTimeout(node._removeTimer); node._removeTimer = null; }
            } else {
                if (!node.classList.contains('decay-full')) {
                    node.classList.add('decay-full');
                    if(!node._removeTimer) {
                        node._removeTimer = setTimeout(() => {
                            removeNode(node);
                        }, CFG.fadeDuration + 200);
                    }
                }
            }
        }
    }

    function scheduleIdleCleanup() {
        if(fadeAllTimer) clearTimeout(fadeAllTimer);
        isFadingAll = false;

        fadeAllTimer = setTimeout(() => {
            isFadingAll = true;
            applyStackRules();
        }, CFG.fadeAllDelay);
    }

    // --- 4. Spawner ---
    function spawnAt(clientX, clientY, velocityScale = 1.0){
        if(!images.length) return;

        isFadingAll = false;
        if(fadeAllTimer) clearTimeout(fadeAllTimer);

        const item = images[Math.floor(Math.random()*images.length)];
        const img = document.createElement('img');
        img.className = 'hg-img spawn';
        img.src = item.thumb;
        img.loading = 'eager';
        img.draggable = false;

        img.dataset.pswpSrc = item.full;
        img.dataset.pswpWidth = item.w;
        img.dataset.pswpHeight = item.h;

        const r = canvas.getBoundingClientRect();
        img.style.left = (clientX - r.left) + 'px';
        img.style.top = (clientY - r.top) + 'px';
        img.style.zIndex = ++z;
        img.style.position = 'absolute';
        img.style.transformOrigin = 'center center';
        img.style.transform = `translate(-50%,-50%) scale(0.5)`;

        canvas.appendChild(img);
        activeNodes.push(img);

        if (navigator.vibrate) navigator.vibrate(5);

        let targetScale = Math.max(CFG.scaleMin, Math.min(velocityScale, CFG.scaleMax));

        img.onload = () => {
            if ((img.naturalWidth || 0) > (img.naturalHeight || 0)) {
                img.classList.add('hg-landscape');
                targetScale *= 1.15;
            } else {
                img.classList.add('hg-portrait');
            }
            img.style.transform = `translate(-50%,-50%) scale(${targetScale})`;
            applyStackRules();
        };

        requestAnimationFrame(()=> {
            if(img.complete && img.onload) img.onload();
            setTimeout(() => img.classList.remove('spawn'), 60);
        });
    }

    // --- 5. Input Handling ---
    let lastPos = {x:0, y:0};
    let lastTime = Date.now();
    let isTouchDragging = false;
    let touchStartTime = 0;

    function handleInputMove(x, y, isTouch) {
        const now = Date.now();
        const dist = Math.sqrt(Math.pow(x - lastPos.x, 2) + Math.pow(y - lastPos.y, 2));
        const limit = isTouch ? CFG.threshMobile : CFG.threshDesktop;

        if (dist >= limit) {
            const dt = now - lastTime || 1;
            const velocity = dist / dt;
            const vScale = 0.85 + (velocity * 0.5);
            const yOffset = isTouch ? -65 : 0;

            spawnAt(x, y + yOffset, vScale);

            lastPos = {x, y};
            lastTime = now;

            if(idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(scheduleIdleCleanup, CFG.idleDelay);
        }
    }

    canvas.addEventListener('touchstart', (e) => {
        if (e.target === canvas || e.target.classList.contains('hg-img')) e.preventDefault();
        const t = e.touches[0];
        lastPos = {x: t.clientX, y: t.clientY};
        lastTime = Date.now();
        touchStartTime = Date.now();
        isTouchDragging = true;
        if(fadeAllTimer) clearTimeout(fadeAllTimer);
        isFadingAll = false;
    }, {passive: false});

    canvas.addEventListener('touchmove', (e) => {
        if (!isTouchDragging) return;
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0];
        handleInputMove(t.clientX, t.clientY, true);
    }, {passive: false});

    canvas.addEventListener('touchend', (e) => {
        isTouchDragging = false;
        const dt = Date.now() - touchStartTime;
        if (dt < 200) {
            const t = e.changedTouches[0];
            const target = document.elementFromPoint(t.clientX, t.clientY);
            if (target && target.classList.contains('hg-img')) {
                openPhotoSwipe(target);
            } else {
                spawnAt(t.clientX, t.clientY - 65, 1.0);
            }
        }
        scheduleIdleCleanup();
    });

    canvas.addEventListener('mousemove', (e) => {
        handleInputMove(e.clientX, e.clientY, false);
    });

    canvas.addEventListener('pointerdown', (ev) => {
        if(ev.pointerType !== 'mouse') return;
        const target = ev.target.closest('.hg-img');
        if(target) {
            ev.stopPropagation();
            openPhotoSwipe(target);
        } else {
            spawnAt(ev.clientX, ev.clientY, 1.0);
            lastPos = {x: ev.clientX, y: ev.clientY};
        }
    });

    // --- 6. PhotoSwipe ---
    function openPhotoSwipe(imgElement) {
        if (!imgElement) return;
        const pswp = new PhotoSwipeLightbox({
            dataSource: [{
                src: imgElement.dataset.pswpSrc,
                width: parseInt(imgElement.dataset.pswpWidth),
                height: parseInt(imgElement.dataset.pswpHeight),
                msrc: imgElement.src
            }],
            pswpModule: PhotoSwipe,
            index: 0
        });

        pswp.on('uiRegister', () => {
            pswp.pswp.ui.registerElement({
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

        pswp.init();
        pswp.loadAndOpen(0);
    }

    LOG('playground initialized');
})();