// static/js/playground.js — playground spawn + left-click lightbox opener
// Mouse & touch: spawn images on drag threshold; last-N opacity kept; thumbnails centered on pointer.
// Landscapes are scaled (configurable via --hg-landscape-scale).
// New: last 3 stick around for --hg-last-three-hold ms (default 1000ms), then fade sequentially.
// Desktop starts the hold countdown when mouse movement *stops* (debounced by --hg-mouse-stop-delay).
(function () {
    // if (document.body.dataset.page !== 'playground') return;

    const wrap = document.querySelector('.hg-wrap');
    if (!wrap) return;

    let images = [];

    try {
        images = JSON.parse(wrap.dataset.images || '[]');
    } catch (e) {
        console.error('[playground] failed to parse data-images', e);
        images = [];
    }

    if (!Array.isArray(images) || images.length === 0) {
        console.warn('[playground] no images available — playground disabled');
        return;
    }

    window.HG_IMAGES = images; // optional debug hook
    console.log('[playground] images loaded:', images.length);


    const TAG = '[playground]';
    const LOG = (...a) => console.log('%c' + TAG, 'color:#0a7; font-weight:700;', ...a);
    const WARN = (...a) => console.warn('%c' + TAG, 'color:#ea0; font-weight:700;', ...a);

    // function normalizeHGImages() {
    //     try {
    //         let raw = window.HG_IMAGES;
    //         if (typeof raw === 'undefined' || raw === null) { window.HG_IMAGES = []; return; }
    //         if (typeof raw === 'string') {
    //             try { raw = JSON.parse(raw); } catch (e) {
    //                 raw = raw.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g,'')).filter(Boolean);
    //             }
    //         }
    //         if (!Array.isArray(raw)) raw = Array.from(raw || []);
    //         const origin = (typeof location !== 'undefined' && location.origin) ? location.origin.replace(/\/$/,'') : '';
    //         const out = raw.map(u => {
    //             if (!u) return null;
    //             if (typeof u === 'object') {
    //                 const thumb = String(u.thumb || u.t || u.thumbUrl || u.thumb_url || u[0] || '');
    //                 const full  = String(u.full  || u.f || u.fullUrl  || u.full_url  || u[1] || thumb);
    //                 return { thumb, full };
    //             }
    //             const s = String(u).trim().replace(/^"|'|`|`'|`"|'`/g,'').replace(/"|'$/,'');
    //             const thumb = s.startsWith('/') ? origin + s : s;
    //             return { thumb, full: thumb };
    //         }).filter(Boolean);
    //         window.HG_IMAGES = out;
    //         LOG('normalized HG_IMAGES →', window.HG_IMAGES.length, 'items');
    //     } catch (err) {
    //         console.error(TAG, 'normalizeHGImages failed', err);
    //         window.HG_IMAGES = [];
    //     }
    // }
    // normalizeHGImages();
    // const images = Array.isArray(window.HG_IMAGES) ? window.HG_IMAGES : [];

    // small CSS helpers
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
    const PERMANENT_LAST = cssNumber('--hg-permanent-count', 5);
    const DECAY_MS = cssTimeMs('--hg-fade-duration', 1200);
    const canvas = document.getElementById('hg-canvas');
    if (!canvas) { WARN('No #hg-canvas element found — playground disabled'); return; }

    const activeNodes = [];
    let z = 1000;
    function removeNode(node){ if(!node)return; const idx = activeNodes.indexOf(node); if(idx!==-1) activeNodes.splice(idx,1); if(node.parentNode) node.parentNode.removeChild(node); }

    // controls for opacity decay & last-three scheduling
    const KEEP_OPACITY_LAST_N = 3; // last N images remain fully opaque while interacting
    const MIN_OPACITY = 0.16; // clamp so images never fully disappear

    // NEW: exposed via CSS
    const LAST_THREE_HOLD = cssTimeMs('--hg-last-three-hold', 1000); // ms (default 1000)
    const MOUSE_STOP_DELAY = cssNumber('--hg-mouse-stop-delay', 120); // ms (default 120)
    const STEP_DELAY = cssNumber('--hg-last-three-step', 140); // ms between fading each of the three (configurable)

    // schedule handles for sequential fade after stop
    let lastThreeFadeTimers = []; // will hold timeout ids for scheduled fades
    let lastThreeFadeStarted = false; // whether scheduled fade run is active
    let mouseStopTimer = null; // debounce timer for mouse-stop detection

    // helper to clear any scheduled last-three fades (call on new interaction / spawn)
    function clearScheduledLastThreeFade(){
        lastThreeFadeTimers.forEach(t => clearTimeout(t));
        lastThreeFadeTimers = [];
        lastThreeFadeStarted = false;
    }

    function computeDecayedOpacity(fromNewestIndex){
        // same decay curve used elsewhere: decayed = max(MIN_OPACITY, 1 - (d * 0.12))
        const d = Math.max(0, fromNewestIndex - (KEEP_OPACITY_LAST_N - 1));
        return Math.max(MIN_OPACITY, 1 - (d * 0.12));
    }

    function applyStackRules(){
        // cap visible count by removing oldest beyond MAX_VISIBLE
        while(activeNodes.length>MAX_VISIBLE){ const o=activeNodes.shift(); if(o&&o.parentNode) o.parentNode.removeChild(o); }

        for(let i=0;i<activeNodes.length;i++){
            const node = activeNodes[i];
            const fromNewest = activeNodes.length - 1 - i;
            node.style.transition = node.style.transition || 'opacity 280ms ease, transform 220ms ease';
            // If fade sequence hasn't started, keep last N fully opaque while interacting
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
        if(!images.length) return;
        // New spawn cancels any scheduled fades so last-3 remain visible
        clearScheduledLastThreeFade();

        const item = images[Math.floor(Math.random()*images.length)];
        const thumbUrl = item && item.thumb ? item.thumb : (item||'');
        const fullUrl = item && item.full ? item.full : thumbUrl;

        const img = document.createElement('img');
        img.className = 'hg-img spawn';
        img.src = thumbUrl;
        img.loading = 'lazy';
        img.alt = '';
        img.draggable = false;
        // center thumbnails on the pointer by default
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
        img.setAttribute('data-z', String(z));
        img.dataset.full = fullUrl;
        img._decayTimeout = null;
        canvas.appendChild(img);
        activeNodes.push(img);

        // when image loads, check orientation and optionally enlarge if landscape
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
            } catch (err) {
                console.warn(TAG, 'orientation/scale apply failed', err);
            } finally {
                applyStackRules();
            }
        };

        // In case cached image loaded before onload binding, ensure stack rules run.
        requestAnimationFrame(()=> setTimeout(()=> {
            img.classList.remove('spawn');
            applyStackRules();
        }, 60));
    }

    let lastPos = { x:-9999, y:-9999 };
    function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
    const THRESH = cssNumber('--hg-spawn-threshold', 48);           // spacing between spawn points while dragging
    const DRAG_SENSITIVITY = cssNumber('--hg-drag-threshold', 24);  // how much pointer must move before first spawn (configurable)
    function handleMove(e){ const p={x:e.clientX,y:e.clientY}; if(dist(p,lastPos)>=THRESH){ spawnAt(e.clientX,e.clientY); lastPos=p; } }

    // --- Make findTopImageAtPoint globally available to both mouse and touch handlers ---
    function findTopImageAtPoint(x,y){
        const imgs = Array.from(document.querySelectorAll('.hg-img'));
        for(let i=imgs.length-1;i>=0;i--){
            const im = imgs[i];
            const r = im.getBoundingClientRect();
            if(x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return im;
        }
        return null;
    }

    // --- When interaction stops, schedule the last 3 to fade sequentially after LAST_THREE_HOLD ---
    // order: bottom of the three (oldest) fades first, then middle, then top (newest).
    function scheduleLastThreeFade(){
        clearScheduledLastThreeFade();

        if(!activeNodes.length) return;
        const n = Math.min(KEEP_OPACITY_LAST_N, activeNodes.length);
        if(n === 0) return;

        const holdDelay = LAST_THREE_HOLD; // ms from CSS var (now default 1000)
        const stepDelay = STEP_DELAY;      // ms between each fade

        // we mark started only when holdDelay expires and actual fade begins
        lastThreeFadeStarted = false;
        const starter = setTimeout(()=>{
            lastThreeFadeStarted = true;
            const startIndex = Math.max(0, activeNodes.length - n);
            for(let i = 0; i < n; i++){
                const nodeIndex = startIndex + i; // i=0 oldest of last-n
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
                }, i * stepDelay);
                lastThreeFadeTimers.push(t);
            }
            const finalize = setTimeout(()=> applyStackRules(), n * stepDelay + 40);
            lastThreeFadeTimers.push(finalize);
        }, holdDelay);
        lastThreeFadeTimers.push(starter);
    }

    // helper to cancel scheduled fade when interaction resumes
    function onInteractionResume(){
        clearScheduledLastThreeFade();
        lastThreeFadeStarted = false;
        applyStackRules();
    }

    // --- State & event wiring for mouse hover threshold & movement-stop detection ---
    let pointerActive=false;
    let mouseEntryPos = null;
    let mouseHasMovedEnough = false;

    // mouse enter: reset movement-stop debouncer & treat as interaction resume
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
            // any mouse movement resets scheduled fades and mouse-stop debounce
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

            // start debounce timer to detect mouse STOPPED moving
            mouseStopTimer = setTimeout(()=>{
                // when the mouse has stopped moving for MOUSE_STOP_DELAY, begin the last-three hold countdown
                scheduleLastThreeFade();
                mouseStopTimer = null;
            }, Math.max(10, cssNumber('--hg-mouse-stop-delay', MOUSE_STOP_DELAY)));
        } else {
            // touch/pen move — behave like before
            if(pointerActive) handleMove(e);
        }
    });

    canvas.addEventListener('pointerleave',()=>{
        // If mouse leaves, we also treat as interaction stopping — start schedule immediately (user wanted stop on movement stop)
        if(mouseStopTimer){ clearTimeout(mouseStopTimer); mouseStopTimer = null; }
        pointerActive = false;
        mouseEntryPos = null;
        mouseHasMovedEnough = false;
        scheduleLastThreeFade();
    });

    // keyboard support (unchanged)
    canvas.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ const r=canvas.getBoundingClientRect(); const cx=r.left+r.width/2+(Math.random()-0.5)*80; const cy=r.top+r.height/2+(Math.random()-0.5)*80; spawnAt(cx,cy); } });

    (function preloadSome(){ const sample = images.slice(0, Math.min(images.length,8)); sample.forEach(u=>{ if(u&&u.thumb){ const i=new Image(); i.src=u.thumb; i.loading='lazy'; } }); })();

    // --- Lightbox (unchanged) ---
    let _lightbox = null;
    function createLightbox(){
        if(_lightbox) return _lightbox;

        const overlay = document.createElement('div');
        overlay.className = 'hg-lightbox-overlay';
        overlay.setAttribute('role','dialog');
        overlay.setAttribute('aria-modal','true');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.background = 'rgba(0,0,0,0.85)';
        overlay.style.zIndex = String(20000);
        overlay.style.cursor = 'zoom-out';
        overlay.style.backdropFilter = 'blur(3px)';

        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.maxWidth = 'calc(100vw - 40px)';
        wrapper.style.maxHeight = 'calc(100vh - 40px)';
        wrapper.style.width = 'auto';
        wrapper.style.height = 'auto';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        wrapper.style.overflow = 'hidden';
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.boxSizing = 'border-box';
        wrapper.style.padding = '0';

        const img = document.createElement('img');
        img.className = 'hg-lightbox-img';
        img.alt = '';
        img.draggable = false;
        img.style.display = 'block';
        img.style.boxShadow = '0 10px 40px rgba(0,0,0,0.6)';
        img.style.maxWidth = 'calc(100vw - 40px)';
        img.style.maxHeight = 'calc(100vh - 40px)';
        img.style.width = 'auto';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
        img.style.boxSizing = 'border-box';
        img.style.transform = 'none';
        img.style.margin = '0';
        img.style.pointerEvents = 'auto';

        const btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.innerHTML = '&times;';
        btnClose.setAttribute('aria-label','Close image');
        btnClose.style.position = 'absolute';
        btnClose.style.top = '12px';
        btnClose.style.right = '12px';
        btnClose.style.width = '44px';
        btnClose.style.height = '44px';
        btnClose.style.border = 'none';
        btnClose.style.borderRadius = '24px';
        btnClose.style.background = 'rgba(0,0,0,0.6)';
        btnClose.style.color = '#fff';
        btnClose.style.fontSize = '28px';
        btnClose.style.cursor = 'pointer';
        btnClose.style.zIndex = '20010';

        const btnDownload = document.createElement('a');
        btnDownload.setAttribute('download','');
        btnDownload.setAttribute('aria-label','Download image');
        btnDownload.style.position = 'absolute';
        btnDownload.style.top = '12px';
        btnDownload.style.left = '12px';
        btnDownload.style.width = '44px';
        btnDownload.style.height = '44px';
        btnDownload.style.borderRadius = '24px';
        btnDownload.style.background = 'rgba(0,0,0,0.6)';
        btnDownload.style.color = '#fff';
        btnDownload.style.fontSize = '18px';
        btnDownload.style.textDecoration = 'none';
        btnDownload.style.display = 'flex';
        btnDownload.style.alignItems = 'center';
        btnDownload.style.justifyContent = 'center';
        btnDownload.style.zIndex = '20010';
        btnDownload.innerHTML = '&#8681;';

        wrapper.appendChild(img);
        wrapper.appendChild(btnClose);
        wrapper.appendChild(btnDownload);
        overlay.appendChild(wrapper);

        let fitMode = true; // start fit-to-screen

        function close(){
            if(!document.body.contains(overlay)) return;
            document.body.removeChild(overlay);
            document.documentElement.style.overflow = '';
            window.removeEventListener('keydown', onKey);
            LOG('lightbox closed');
        }
        function onOverlayClick(e){
            if(e.target === overlay) close();
        }
        function onKey(e){
            if(e.key === 'Escape') close();
        }
        btnClose.addEventListener('click', close);
        overlay.addEventListener('click', onOverlayClick);
        img.addEventListener('click', (ev)=> ev.stopPropagation());

        img.addEventListener('dblclick', (ev)=>{
            ev.stopPropagation();
            if(fitMode){
                const gapX = 40, gapY = 40;
                const availW = Math.max(100, window.innerWidth - gapX);
                const availH = Math.max(100, window.innerHeight - gapY);
                const naturalW = img.naturalWidth || img.width;
                const naturalH = img.naturalHeight || img.height;
                if(!naturalW || !naturalH) return;
                if(naturalW <= availW && naturalH <= availH){
                    fitMode = false;
                    img.style.maxWidth = 'none';
                    img.style.maxHeight = 'none';
                    img.style.width = naturalW + 'px';
                    img.style.height = naturalH + 'px';
                } else {
                    return;
                }
            } else {
                fitMode = true;
                img.style.maxWidth = 'calc(100vw - 40px)';
                img.style.maxHeight = 'calc(100vh - 40px)';
                img.style.width = 'auto';
                img.style.height = 'auto';
            }
        });

        _lightbox = {
            overlay, wrapper, img, btnClose, btnDownload,
            open: function(src, filename){
                fitMode = true;
                img.style.maxWidth = 'calc(100vw - 40px)';
                img.style.maxHeight = 'calc(100vh - 40px)';
                img.style.width = 'auto';
                img.style.height = 'auto';
                img.src = src;
                btnDownload.href = src;
                if(filename) btnDownload.setAttribute('download', filename); else btnDownload.setAttribute('download','');
                if(!document.body.contains(overlay)){
                    document.body.appendChild(overlay);
                    document.documentElement.style.overflow = 'hidden';
                    window.addEventListener('keydown', onKey);
                }
                img.onload = () => { void img.offsetWidth; LOG('lightbox image loaded; natural size:', img.naturalWidth, img.naturalHeight); };
                LOG('lightbox opened (strict fit-to-screen):', src);
            },
            close
        };

        return _lightbox;
    }

    function openLightbox(url){
        try{
            const lb = createLightbox();
            lb.open(url);
        }catch(err){
            WARN('openLightbox failed — fallback to new tab', err);
            window.open(url, '_blank');
        }
    }

    // delegated left-click handler (mouse only)
    (function installDelegatedLightbox(){
        if(!canvas) return;
        if(canvas._playgroundLightboxHandler){ canvas.removeEventListener('pointerdown', canvas._playgroundLightboxHandler); canvas._playgroundLightboxHandler = null; }

        const handler = function(ev){
            if(ev.pointerType && ev.pointerType !== 'mouse') return;
            if(ev.button !== 0) return;
            const x = ev.clientX, y = ev.clientY;
            const hit = findTopImageAtPoint(x,y);
            if(!hit) return;
            ev.preventDefault(); ev.stopPropagation();
            const full = hit.dataset && hit.dataset.full ? hit.dataset.full : hit.src;
            LOG('open full (left click — lightbox):', full);
            openLightbox(full);
        };

        canvas.addEventListener('pointerdown', handler, { passive: false });
        canvas._playgroundLightboxHandler = handler;
    })();

    // touch/pen support: spawn only after drag threshold; single-tap last image opens lightbox
    (function installTouchDragDoubleTap(){
        if(!canvas) return;

        let lastTapTime = 0;
        let lastTapPos = { x: 0, y: 0 };
        const DOUBLE_TAP_MS = 350;
        const DOUBLE_TAP_DIST = 30; // px
        const TAP_MOVE_DIST = 12; // px — if movement <= this, treat as a tap

        let pointerDownPos = null;
        let pointerHasMovedEnough = false;
        let pointerIdForCapture = null;

        function onPointerDown(e){
            if(!(e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'touchpad')) return;
            pointerActive = false;
            pointerHasMovedEnough = false;
            pointerDownPos = { x: e.clientX, y: e.clientY, t: Date.now() };
            pointerIdForCapture = e.pointerId;
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault && e.preventDefault();
            // interaction resumed — cancel scheduled fades
            onInteractionResume();
        }

        function onPointerMove(e){
            if(!(e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'touchpad')) return;
            if(!pointerDownPos) return;
            const dx = e.clientX - pointerDownPos.x;
            const dy = e.clientY - pointerDownPos.y;
            const movedSinceDown = Math.sqrt(dx*dx + dy*dy);

            if(!pointerHasMovedEnough){
                if(movedSinceDown >= DRAG_SENSITIVITY){
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
            if(!(e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'touchpad')) return;
            try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (err) {}
            const now = Date.now();
            const dx = e.clientX - (pointerDownPos ? pointerDownPos.x : e.clientX);
            const dy = e.clientY - (pointerDownPos ? pointerDownPos.y : e.clientY);
            const moved = Math.sqrt(dx*dx + dy*dy);

            const distFromLastTap = Math.sqrt(Math.pow(e.clientX - lastTapPos.x,2) + Math.pow(e.clientY - lastTapPos.y,2));
            if(now - lastTapTime <= DOUBLE_TAP_MS && distFromLastTap <= DOUBLE_TAP_DIST){
                const hit = findTopImageAtPoint(e.clientX, e.clientY);
                if(hit){
                    const full = hit.dataset && hit.dataset.full ? hit.dataset.full : hit.src;
                    LOG('open full (double-tap — lightbox):', full);
                    openLightbox(full);
                    lastTapTime = 0;
                    lastTapPos = { x: 0, y: 0 };
                    pointerDownPos = null;
                    pointerHasMovedEnough = false;
                    pointerActive = false;
                    pointerIdForCapture = null;
                    // schedule fade after stop (if no further interaction)
                    scheduleLastThreeFade();
                    return;
                }
            }

            if(!pointerHasMovedEnough && moved <= TAP_MOVE_DIST){
                const hit = findTopImageAtPoint(e.clientX, e.clientY);
                if(hit && activeNodes.length){
                    const last = activeNodes[activeNodes.length - 1];
                    if(hit === last){
                        const full = hit.dataset && hit.dataset.full ? hit.dataset.full : hit.src;
                        LOG('open full (single-tap on last image — lightbox):', full);
                        openLightbox(full);
                        lastTapTime = now;
                        lastTapPos = { x: e.clientX, y: e.clientY };
                        pointerDownPos = null;
                        pointerHasMovedEnough = false;
                        pointerActive = false;
                        pointerIdForCapture = null;
                        scheduleLastThreeFade();
                        return;
                    }
                }
            }

            lastTapTime = now;
            lastTapPos = { x: e.clientX, y: e.clientY };
            pointerDownPos = null;
            pointerHasMovedEnough = false;
            pointerActive = false;
            pointerIdForCapture = null;
            // schedule fade after stop
            scheduleLastThreeFade();
        }

        canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
        canvas.addEventListener('pointermove', onPointerMove, { passive: true });
        canvas.addEventListener('pointerup', onPointerUp, { passive: true });
        canvas.addEventListener('pointercancel', ()=>{ pointerActive=false; pointerDownPos=null; pointerHasMovedEnough=false; scheduleLastThreeFade(); }, { passive: true });

    })();

    // mobile scroll handling + draggable-pointer fallback (unchanged)
    (function mobileScrollHandlerAndFallback(){
        if(!canvas || typeof spawnAt !== 'function') { WARN('mobile scroll handler needs canvas & spawnAt'); return; }

        const TAGM = '[playground:mobile-scroll]';
        const LOGM = (...a)=>console.log('%c'+TAGM,'color:#0a7;font-weight:700;',...a);
        const WARNM = (...a)=>console.warn('%c'+TAGM,'color:#ea0;font-weight:700;',...a);

        let scrollPreventionActive = false;
        try {
            canvas.style.touchAction = 'none';
            canvas.style.webkitTouchCallout = 'none';
            canvas.style.webkitTapHighlightColor = 'transparent';

            const touchStartHandler = function(e){
                e.preventDefault && e.preventDefault();
            };
            canvas.addEventListener('touchstart', touchStartHandler, { passive: false });

            canvas.addEventListener('pointerdown', (ev)=>{
                if(ev.pointerType === 'touch' || ev.pointerType === 'pen'){
                    try { ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId); } catch(err){}
                    ev.preventDefault && ev.preventDefault();
                    scrollPreventionActive = true;
                }
            }, { passive: false });

            LOGM('touch-action / touchstart scroll prevention installed (attempt).');
        } catch(err){
            WARNM('Unable to install aggressive scroll prevention — will fallback to draggable pointer', err);
            scrollPreventionActive = false;
        }

        function verifyScrollPrevention(callback){
            setTimeout(()=>{ callback(Boolean(scrollPreventionActive)); }, 60);
        }

        function createDraggablePointer(){
            if(document.getElementById('hg-drag-pointer')) return;
            const p = document.createElement('div');
            p.id = 'hg-drag-pointer';
            p.setAttribute('aria-label','Playground drag pointer');
            Object.assign(p.style, {
                position: 'fixed',
                right: '18px',
                bottom: '120px',
                width: '56px',
                height: '56px',
                borderRadius: '28px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,240,240,0.9))',
                boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
                zIndex: '15000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                color: '#111',
                cursor: 'grab',
                touchAction: 'none',
                userSelect:'none',
                opacity: '0.98'
            });
            p.innerHTML = '&#9679;';

            let dragging = false;
            let pointerId = null;

            function onStart(ev){
                ev.preventDefault && ev.preventDefault();
                dragging = true;
                pointerId = ev.pointerId;
                p.style.cursor = 'grabbing';
                try{ p.setPointerCapture && p.setPointerCapture(pointerId); } catch(e){}
                // interaction resumed — cancel scheduled fades
                onInteractionResume();
            }
            function onMove(ev){
                if(!dragging) return;
                if(ev.pointerId !== pointerId) return;
                const w = window.innerWidth, h = window.innerHeight;
                let x = ev.clientX - 28;
                let y = ev.clientY - 28;
                x = Math.max(8, Math.min(w - 64, x));
                y = Math.max(8, Math.min(h - 64, y));
                p.style.left = x + 'px';
                p.style.top = y + 'px';
                p.style.right = 'auto';
                p.style.bottom = 'auto';
                const cx = x + 28 + window.scrollX;
                const cy = y + 28 + window.scrollY;
                spawnAt(cx, cy);
            }
            function onEnd(ev){
                if(ev.pointerId !== pointerId) return;
                dragging = false;
                pointerId = null;
                p.style.cursor = 'grab';
                try{ p.releasePointerCapture && p.releasePointerCapture(ev.pointerId); } catch(e){}
                // schedule fades after pointer stops
                scheduleLastThreeFade();
            }

            p.addEventListener('pointerdown', onStart, { passive: false });
            window.addEventListener('pointermove', onMove, { passive: true });
            window.addEventListener('pointerup', onEnd, { passive: true });
            window.addEventListener('pointercancel', onEnd, { passive: true });

            const hint = document.createElement('div');
            hint.id = 'hg-drag-pointer-hint';
            hint.textContent = 'Drag to spawn images';
            Object.assign(hint.style, {
                position: 'fixed',
                right: '18px',
                bottom: '186px',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '13px',
                zIndex: '15000',
                opacity: '0.95'
            });
            document.body.appendChild(p);
            document.body.appendChild(hint);
            setTimeout(()=>{ hint.style.transition='opacity 300ms'; hint.style.opacity='0'; setTimeout(()=>hint.remove(),400); }, 2200);

            LOGM('draggable pointer installed (fallback).');
        }

        verifyScrollPrevention((active)=>{
            if(active){
                LOGM('scroll prevention active — touch drag will spawn images directly on canvas');
                canvas.style.touchAction = 'none';
                canvas.style.webkitTouchCallout = 'none';
                return;
            } else {
                WARNM('scroll prevention not active — enabling draggable pointer fallback');
                createDraggablePointer();
            }
        });

        window.HG_ForcePointerFallback = function(enabled){
            if(enabled) createDraggablePointer();
            else {
                const el = document.getElementById('hg-drag-pointer');
                const hint = document.getElementById('hg-drag-pointer-hint');
                el && el.remove();
                hint && hint.remove();
                LOGM('draggable pointer removed via HG_ForcePointerFallback(false)');
            }
        };

    })();

    LOG('playground initialized — maxVisible=' + MAX_VISIBLE + ', permanentLast=' + PERMANENT_LAST + ', dragThreshold=' + DRAG_SENSITIVITY + ', lastThreeHold=' + LAST_THREE_HOLD + 'ms, mouseStopDelay=' + MOUSE_STOP_DELAY + 'ms');
})();
