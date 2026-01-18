import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';

// static/js/playground.js — playground spawn + PhotoSwipe integration
(function () {
    const wrap = document.querySelector('.hg-wrap');
    if (!wrap) return;

    // --- 1. Dynamic Data Loading Strategy ---
    let images = []; // The pool of available images

    const manifestUrl = wrap.dataset.manifestUrl;
    const configBase = wrap.dataset.configBase;

    async function startProgressiveLoad() {
        if (!manifestUrl) return;

        try {
            // A. Fetch the Master List
            const resp = await fetch(manifestUrl);
            if (!resp.ok) return;
            const albums = await resp.json();

            console.log(`[playground] Found ${albums.length} albums. Loading progressively...`);

            // B. Fetch each album independently
            // We do NOT await all of them. We fire requests and let them complete whenever.
            // This allows the user to start playing immediately with whatever arrives first.
            albums.forEach(albumId => {
                fetch(`${configBase}${albumId}.json`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.images && Array.isArray(data.images)) {
                            // Map S3 keys to Playground keys
                            const newBatch = data.images.map(img => ({
                                thumb: img.thumb,  // S3 Thumbnail URL
                                full: img.src,     // S3 Full Res URL
                                w: img.width,
                                h: img.height
                            }));

                            // Add to the live pool
                            images.push(...newBatch);
                            // console.debug(`[playground] +${newBatch.length} images from ${albumId}`);
                        }
                    })
                    .catch(err => console.warn(`[playground] Skipped album ${albumId}`, err));
            });

        } catch (e) {
            console.error('[playground] Manifest load failed', e);
        }
    }

    // Kick off the loading
    startProgressiveLoad();

    // -----------------------------------------------------------

    const TAG = '[playground]';
    const LOG = (...a) => console.log('%c' + TAG, 'color:#0a7; font-weight:700;', ...a);

    // CSS helpers (unchanged)
    function cssNumber(name, fallback) {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name);
            return parseInt(String(v || '').replace(/[^0-9.-]+/g, ''), 10) || fallback;
        } catch (e) { return fallback; }
    }
    function cssFloat(name, fallback) {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name);
            const n = parseFloat(String(v || '').replace(/[^0-9.-]+/g, ''));
            return isNaN(n) ? fallback : n;
        } catch (e) { return fallback; }
    }
    function cssTimeMs(name, fallback) {
        try {
            const v = (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim();
            if (!v) return fallback;
            if (v.endsWith('ms')) return parseInt(v.replace('ms',''),10) || fallback;
            if (v.endsWith('s')) return Math.round(parseFloat(v.replace('s',''))*1000) || fallback;
            return parseInt(v,10) || fallback;
        } catch(e) { return fallback; }
    }

    const MAX_VISIBLE = cssNumber('--hg-visible-count', 10);
    const DECAY_MS = cssTimeMs('--hg-fade-duration', 1200);
    const canvas = document.getElementById('hg-canvas');
    if (!canvas) return;

    const activeNodes = [];
    let z = 1000;
    function removeNode(node){ if(!node)return; const idx = activeNodes.indexOf(node); if(idx!==-1) activeNodes.splice(idx,1); if(node.parentNode) node.parentNode.removeChild(node); }

    const KEEP_OPACITY_LAST_N = 3;
    const MIN_OPACITY = 0.16;
    const LAST_THREE_HOLD = cssTimeMs('--hg-last-three-hold', 1000);
    const MOUSE_STOP_DELAY = cssNumber('--hg-mouse-stop-delay', 120);
    const STEP_DELAY = cssNumber('--hg-last-three-step', 140);

    let lastThreeFadeTimers = [];
    let lastThreeFadeStarted = false;
    let mouseStopTimer = null;

    function clearScheduledLastThreeFade(){
        lastThreeFadeTimers.forEach(t => clearTimeout(t));
        lastThreeFadeTimers = [];
        lastThreeFadeStarted = false;
    }

    function computeDecayedOpacity(fromNewestIndex){
        const d = Math.max(0, fromNewestIndex - (KEEP_OPACITY_LAST_N - 1));
        return Math.max(MIN_OPACITY, 1 - (d * 0.12));
    }

    function applyStackRules(){
        while(activeNodes.length>MAX_VISIBLE){ const o=activeNodes.shift(); if(o&&o.parentNode) o.parentNode.removeChild(o); }

        for(let i=0;i<activeNodes.length;i++){
            const node = activeNodes[i];
            const fromNewest = activeNodes.length - 1 - i;
            node.style.transition = node.style.transition || 'opacity 280ms ease, transform 220ms ease';
            if(!lastThreeFadeStarted && fromNewest < KEEP_OPACITY_LAST_N){
                node.style.opacity = '1';
                node.style.pointerEvents = 'auto';
                node.classList.remove('decay-full','decay-partial');
                if(node._decayTimeout){ clearTimeout(node._decayTimeout); node._decayTimeout=null; }
            } else {
                const decayed = computeDecayedOpacity(fromNewest);
                node.style.opacity = String(decayed);
                node.style.pointerEvents = 'none';
                node.classList.remove('decay-partial');
                node.classList.add('decay-full');
                if(!node._decayTimeout){
                    node._decayTimeout = setTimeout(()=>{ if(activeNodes.indexOf(node)!==-1) removeNode(node); }, DECAY_MS + 240 + (fromNewest*80));
                }
            }
        }
    }

    function spawnAt(clientX, clientY){
        // SAFETY: If manifest hasn't loaded any images yet, just wait.
        if(!images || images.length === 0) return;

        clearScheduledLastThreeFade();

        // 1. Pick Random Image from currently available pool
        const item = images[Math.floor(Math.random()*images.length)];
        const thumbUrl = item.thumb;
        const fullUrl = item.full;
        const w = item.w || 0;
        const h = item.h || 0;

        // 2. Create Image Element
        const img = document.createElement('img');
        img.className = 'hg-img spawn';
        img.src = thumbUrl;
        img.loading = 'eager';
        img.alt = '';
        img.draggable = false;

        // 3. Attach Lightbox Data (Full Res)
        img.dataset.pswpSrc = fullUrl;
        img.dataset.pswpWidth = w;
        img.dataset.pswpHeight = h;

        img.style.position = 'absolute';
        img.style.pointerEvents = 'auto';
        img.style.transformOrigin = 'center center';
        img.style.transform = 'translate(-50%,-50%) scale(1)';
        img.style.willChange = 'transform, opacity';

        const r = canvas.getBoundingClientRect();
        const x = clientX - r.left, y = clientY - r.top;
        img.style.left = x + 'px';
        img.style.top = y + 'px';
        img.style.zIndex = ++z;

        img._decayTimeout = null;
        canvas.appendChild(img);
        activeNodes.push(img);

        img.onload = () => {
            try {
                const natW = img.naturalWidth || img.width;
                const natH = img.naturalHeight || img.height;
                if (natW && natH && natW > natH) {
                    img.classList.add('hg-landscape');
                    const LANDSCAPE_SCALE = cssFloat('--hg-landscape-scale', 1.18);
                    img.style.transform = `translate(-50%,-50%) scale(${LANDSCAPE_SCALE})`;
                } else {
                    img.classList.add('hg-portrait');
                    img.style.transform = 'translate(-50%,-50%) scale(1)';
                }
            } finally {
                applyStackRules();
            }
        };

        requestAnimationFrame(()=> setTimeout(()=> {
            img.classList.remove('spawn');
            applyStackRules();
        }, 60));
    }

    let lastPos = { x:-9999, y:-9999 };
    function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
    const THRESH = cssNumber('--hg-spawn-threshold', 48);
    const DRAG_SENSITIVITY = cssNumber('--hg-drag-threshold', 24);
    function handleMove(e){ const p={x:e.clientX,y:e.clientY}; if(dist(p,lastPos)>=THRESH){ spawnAt(e.clientX,e.clientY); lastPos=p; } }

    function findTopImageAtPoint(x,y){
        const imgs = Array.from(document.querySelectorAll('.hg-img'));
        for(let i=imgs.length-1;i>=0;i--){
            const im = imgs[i];
            const r = im.getBoundingClientRect();
            if(x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return im;
        }
        return null;
    }

    function scheduleLastThreeFade(){
        clearScheduledLastThreeFade();
        if(!activeNodes.length) return;
        const n = Math.min(KEEP_OPACITY_LAST_N, activeNodes.length);
        if(n === 0) return;

        lastThreeFadeStarted = false;
        const starter = setTimeout(()=>{
            lastThreeFadeStarted = true;
            const startIndex = Math.max(0, activeNodes.length - n);
            for(let i = 0; i < n; i++){
                const nodeIndex = startIndex + i;
                const node = activeNodes[nodeIndex];
                if(!node) continue;
                const t = setTimeout(()=>{
                    const idx = activeNodes.indexOf(node);
                    if(idx === -1) return;
                    const fromNewest = activeNodes.length - 1 - idx;
                    const decayed = computeDecayedOpacity(fromNewest);
                    node.style.transition = node.style.transition || 'opacity 280ms ease, transform 220ms ease';
                    node.style.opacity = String(decayed);
                    node.style.pointerEvents = 'none';
                    node.classList.remove('decay-partial');
                    node.classList.add('decay-full');
                    if(!node._decayTimeout){
                        node._decayTimeout = setTimeout(()=>{ if(activeNodes.indexOf(node)!==-1) removeNode(node); }, DECAY_MS + 240 + (fromNewest*80));
                    }
                }, i * STEP_DELAY);
                lastThreeFadeTimers.push(t);
            }
            const finalize = setTimeout(()=> applyStackRules(), n * STEP_DELAY + 40);
            lastThreeFadeTimers.push(finalize);
        }, LAST_THREE_HOLD);
        lastThreeFadeTimers.push(starter);
    }

    function onInteractionResume(){
        clearScheduledLastThreeFade();
        lastThreeFadeStarted = false;
        applyStackRules();
    }

    // --- State & Events ---
    let pointerActive=false;
    let mouseEntryPos = null;
    let mouseHasMovedEnough = false;

    canvas.addEventListener('pointerenter',(e)=>{
        if(e.pointerType === 'mouse'){
            mouseEntryPos = { x: e.clientX, y: e.clientY };
            mouseHasMovedEnough = false;
            pointerActive = false;
            onInteractionResume();
        } else {
            pointerActive = true;
            onInteractionResume();
        }
    });

    canvas.addEventListener('pointermove',(e)=>{
        if(e.pointerType === 'mouse'){
            if(mouseStopTimer){ clearTimeout(mouseStopTimer); mouseStopTimer = null; }
            onInteractionResume();

            if(!mouseEntryPos) mouseEntryPos = { x: e.clientX, y: e.clientY };
            const dx = e.clientX - mouseEntryPos.x;
            const dy = e.clientY - mouseEntryPos.y;
            const moved = Math.sqrt(dx*dx + dy*dy);
            if(!mouseHasMovedEnough){
                if(moved >= DRAG_SENSITIVITY){
                    mouseHasMovedEnough = true;
                    pointerActive = true;
                    lastPos = { x: e.clientX, y: e.clientY };
                    spawnAt(e.clientX, e.clientY);
                }
            } else {
                if(pointerActive) handleMove(e);
            }

            mouseStopTimer = setTimeout(()=>{
                scheduleLastThreeFade();
                mouseStopTimer = null;
            }, Math.max(10, cssNumber('--hg-mouse-stop-delay', MOUSE_STOP_DELAY)));
        } else {
            if(pointerActive) handleMove(e);
        }
    });

    canvas.addEventListener('pointerleave',()=>{
        if(mouseStopTimer){ clearTimeout(mouseStopTimer); mouseStopTimer = null; }
        pointerActive = false;
        mouseEntryPos = null;
        mouseHasMovedEnough = false;
        scheduleLastThreeFade();
    });

    canvas.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ const r=canvas.getBoundingClientRect(); const cx=r.left+r.width/2+(Math.random()-0.5)*80; const cy=r.top+r.height/2+(Math.random()-0.5)*80; spawnAt(cx,cy); } });

    // --- PhotoSwipe Logic ---
    function openPhotoSwipe(imgElement) {
        if (!imgElement) return;

        const highRes = imgElement.dataset.pswpSrc || imgElement.src;
        const lowRes = imgElement.src;
        const w = parseInt(imgElement.dataset.pswpWidth || 0, 10);
        const h = parseInt(imgElement.dataset.pswpHeight || 0, 10);

        const dataSource = [{
            src: highRes,
            msrc: lowRes,
            width: w || 1200,
            height: h || 800,
            alt: 'Playground Image'
        }];

        const options = {
            dataSource: dataSource,
            index: 0,
            pswpModule: PhotoSwipe,
            closeOnVerticalDrag: true,
            bgOpacity: 0.9,
            getThumbBoundsFn: (index) => {
                const pageYScroll = window.pageYOffset || document.documentElement.scrollTop;
                const rect = imgElement.getBoundingClientRect();
                return {x: rect.left, y: rect.top + pageYScroll, w: rect.width};
            }
        };

        const lightbox = new PhotoSwipeLightbox(options);

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
        lightbox.loadAndOpen(0);
        LOG('PhotoSwipe opened for', highRes);
    }

    // --- Interaction Logic (Clicks & Taps) ---
    canvas.addEventListener('pointerdown', (ev) => {
        if(ev.pointerType !== 'mouse') return;
        if(ev.button !== 0) return;

        const hit = findTopImageAtPoint(ev.clientX, ev.clientY);
        if(!hit) return;

        ev.preventDefault();
        ev.stopPropagation();
        openPhotoSwipe(hit);
    }, { passive: false });

    // Touch/Pen logic
    (function installTouchLogic(){
        let lastTapTime = 0;
        let lastTapPos = { x: 0, y: 0 };
        const DOUBLE_TAP_MS = 350;
        const DOUBLE_TAP_DIST = 30;
        const TAP_MOVE_DIST = 12;

        let pointerDownPos = null;
        let pointerHasMovedEnough = false;

        function onPointerDown(e){
            if(e.pointerType === 'mouse') return;
            pointerActive = false;
            pointerHasMovedEnough = false;
            pointerDownPos = { x: e.clientX, y: e.clientY };
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) {}
            onInteractionResume();
        }

        function onPointerMove(e){
            if(e.pointerType === 'mouse') return;
            if(!pointerDownPos) return;
            const dx = e.clientX - pointerDownPos.x;
            const dy = e.clientY - pointerDownPos.y;
            const moved = Math.sqrt(dx*dx + dy*dy);

            if(!pointerHasMovedEnough){
                if(moved >= DRAG_SENSITIVITY){
                    pointerHasMovedEnough = true;
                    pointerActive = true;
                    lastPos = { x: e.clientX, y: e.clientY };
                    spawnAt(e.clientX, e.clientY);
                }
            } else {
                if(pointerActive) handleMove(e);
            }
        }

        function onPointerUp(e){
            if(e.pointerType === 'mouse') return;
            try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (err) {}

            const now = Date.now();
            const dx = e.clientX - (pointerDownPos ? pointerDownPos.x : e.clientX);
            const dy = e.clientY - (pointerDownPos ? pointerDownPos.y : e.clientY);
            const moved = Math.sqrt(dx*dx + dy*dy);
            const distFromLastTap = Math.sqrt(Math.pow(e.clientX - lastTapPos.x,2) + Math.pow(e.clientY - lastTapPos.y,2));

            // Double Tap Check
            if(now - lastTapTime <= DOUBLE_TAP_MS && distFromLastTap <= DOUBLE_TAP_DIST){
                const hit = findTopImageAtPoint(e.clientX, e.clientY);
                if(hit){
                    openPhotoSwipe(hit);
                    resetTouchState();
                    return;
                }
            }

            // Single Tap on Last Image Check
            if(!pointerHasMovedEnough && moved <= TAP_MOVE_DIST){
                const hit = findTopImageAtPoint(e.clientX, e.clientY);
                if(hit && activeNodes.length){
                    if(hit === activeNodes[activeNodes.length - 1]){
                        openPhotoSwipe(hit);
                        resetTouchState();
                        return;
                    }
                }
            }

            lastTapTime = now;
            lastTapPos = { x: e.clientX, y: e.clientY };
            resetTouchState();
        }

        function resetTouchState(){
            pointerDownPos = null;
            pointerHasMovedEnough = false;
            pointerActive = false;
            scheduleLastThreeFade();
        }

        canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
        canvas.addEventListener('pointermove', onPointerMove, { passive: true });
        canvas.addEventListener('pointerup', onPointerUp, { passive: true });
        canvas.addEventListener('pointercancel', resetTouchState, { passive: true });
    })();

    // Mobile Scroll Prevention & Fallback + Draggable Pointer
    (function mobileScrollHandlerAndFallback(){
        let scrollPreventionActive = false;
        try {
            canvas.style.touchAction = 'none';
            canvas.style.webkitTouchCallout = 'none';
            canvas.addEventListener('touchstart', (e) => { e.preventDefault && e.preventDefault(); }, { passive: false });
            canvas.addEventListener('pointerdown', (ev) => {
                if(ev.pointerType === 'touch' || ev.pointerType === 'pen'){
                    ev.preventDefault && ev.preventDefault();
                    scrollPreventionActive = true;
                }
            }, { passive: false });
        } catch(err){}

        function createDraggablePointer(){
            if(document.getElementById('hg-drag-pointer')) return;

            const style = document.createElement('style');
            style.innerHTML = `
                #hg-drag-pointer {
                    position: fixed; right: 44px; bottom: 120px;
                    width: 56px; height: 56px; border-radius: 50%;
                    background: #fff; box-shadow: 0 6px 18px rgba(0,0,0,0.25);
                    z-index: 15000; display: flex; align-items: center; justify-content: center;
                    font-size: 20px; color: #111; cursor: grab; touch-action: none; opacity: 0.98;
                    transition: transform 0.1s;
                }
                @media (max-width: 600px) {
                    #hg-drag-pointer { width: 14px; height: 14px; font-size: 16px; right: 16px; bottom: 90px; }
                }
                #hg-drag-label {
                    position: absolute; top: -38px; left: 50%; transform: translateX(-50%);
                    background: rgba(0,0,0,0.85); color: #fff; padding: 5px 10px; border-radius: 8px;
                    font-size: 12px; font-weight: 600; pointer-events: none;
                    opacity: 1; transition: opacity 0.5s ease; white-space: nowrap;
                }
                #hg-drag-label::after {
                    content: ''; position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
                    border-left: 4px solid transparent; border-right: 4px solid transparent;
                    border-top: 4px solid rgba(0,0,0,0.85);
                }
                #hg-drag-label.vanish { opacity: 0; }
            `;
            document.head.appendChild(style);

            const p = document.createElement('div');
            p.id = 'hg-drag-pointer';
            p.innerHTML = '&#9679;';

            const label = document.createElement('div');
            label.id = 'hg-drag-label';
            label.textContent = "Drag me";
            p.appendChild(label);

            function vanishLabel() {
                if(!label) return;
                label.classList.add('vanish');
                setTimeout(() => { if(label.parentNode) label.parentNode.removeChild(label); }, 600);
                ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(evt =>
                    window.removeEventListener(evt, vanishLabel, {capture: true})
                );
            }

            ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(evt =>
                window.addEventListener(evt, vanishLabel, { once: true, capture: true })
            );

            let dragging = false;
            p.addEventListener('pointerdown', (ev)=>{
                dragging=true;
                p.setPointerCapture(ev.pointerId);
                onInteractionResume();
                vanishLabel();
            });

            window.addEventListener('pointermove', (ev)=>{
                if(!dragging) return;
                const x = Math.max(8, Math.min(window.innerWidth-64, ev.clientX-28));
                const y = Math.max(8, Math.min(window.innerHeight-64, ev.clientY-28));
                p.style.left = x + 'px';
                p.style.top = y + 'px';
                p.style.right = 'auto';
                p.style.bottom = 'auto';
                spawnAt(x+28+window.scrollX, y+28+window.scrollY);
            });

            window.addEventListener('pointerup', (ev)=>{
                dragging=false;
                scheduleLastThreeFade();
            });

            document.body.appendChild(p);
        }

        setTimeout(()=>{ if(!scrollPreventionActive) createDraggablePointer(); }, 60);
    })();

    LOG('playground initialized (Cloud Data Mode)');
})();