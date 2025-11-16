// static/js/playground.js — playground spawn + left-click lightbox opener
// Mobile: touch & drag spawn images only after drag threshold; single-tap last image opens lightbox.
// Last 3 images stay fully opaque; older images decay in opacity.
(function () {
    const TAG = '[playground]';
    const LOG = (...a) => console.log('%c' + TAG, 'color:#0a7; font-weight:700;', ...a);
    const WARN = (...a) => console.warn('%c' + TAG, 'color:#ea0; font-weight:700;', ...a);

    function normalizeHGImages() {
        try {
            let raw = window.HG_IMAGES;
            if (typeof raw === 'undefined' || raw === null) { window.HG_IMAGES = []; return; }
            if (typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch (e) {
                    raw = raw.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g,'')).filter(Boolean);
                }
            }
            if (!Array.isArray(raw)) raw = Array.from(raw || []);
            const origin = (typeof location !== 'undefined' && location.origin) ? location.origin.replace(/\/$/,'') : '';
            const out = raw.map(u => {
                if (!u) return null;
                if (typeof u === 'object') {
                    const thumb = String(u.thumb || u.t || u.thumbUrl || u.thumb_url || u[0] || '');
                    const full  = String(u.full  || u.f || u.fullUrl  || u.full_url  || u[1] || thumb);
                    return { thumb, full };
                }
                const s = String(u).trim().replace(/^"|'|`|`'|`"|'`/g,'').replace(/"|'$/,'');
                const thumb = s.startsWith('/') ? origin + s : s;
                return { thumb, full: thumb };
            }).filter(Boolean);
            window.HG_IMAGES = out;
            LOG('normalized HG_IMAGES →', window.HG_IMAGES.length, 'items');
        } catch (err) {
            console.error(TAG, 'normalizeHGImages failed', err);
            window.HG_IMAGES = [];
        }
    }
    normalizeHGImages();
    const images = Array.isArray(window.HG_IMAGES) ? window.HG_IMAGES : [];

    // small CSS helpers
    function cssNumber(name, fallback) {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name);
            return parseInt(String(v || '').replace(/[^0-9.-]+/g, ''), 10) || fallback;
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
    // NEW: controls for opacity decay
    const KEEP_OPACITY_LAST_N = 3; // last 3 images stay opacity 1
    const MIN_OPACITY = 0.16; // clamp so images never fully disappear
    function applyStackRules(){
        // cap visible count by removing oldest beyond MAX_VISIBLE
        while(activeNodes.length>MAX_VISIBLE){ const o=activeNodes.shift(); if(o&&o.parentNode) o.parentNode.removeChild(o); }
        for(let i=0;i<activeNodes.length;i++){
            const node = activeNodes[i];
            const fromNewest = activeNodes.length - 1 - i;
            // keep transition for smooth fade when classes/styles change
            node.style.transition = node.style.transition || 'opacity 280ms ease, transform 220ms ease';
            if(fromNewest < KEEP_OPACITY_LAST_N){
                // newest images — full opacity and stronger pointer interactions
                node.style.opacity = '1';
                node.style.pointerEvents = 'auto';
                node.classList.remove('decay-full','decay-partial');
                if(node._decayTimeout){ clearTimeout(node._decayTimeout); node._decayTimeout=null; }
            } else {
                // older images — compute a gentle decay proportional to distance
                const d = fromNewest - (KEEP_OPACITY_LAST_N - 1); // 0 means first decayed image
                // decay step (0.12 per step) — adjust to taste
                const decayed = Math.max(MIN_OPACITY, 1 - (d * 0.12));
                node.style.opacity = String(decayed);
                node.style.pointerEvents = 'none';
                node.classList.remove('decay-partial');
                node.classList.add('decay-full');
                // schedule eventual removal for very old images (existing timeout logic)
                if(!node._decayTimeout){
                    node._decayTimeout = setTimeout(()=>{ if(activeNodes.indexOf(node)!==-1) removeNode(node); }, DECAY_MS + 240 + (d*80));
                }
            }
        }
    }

    function spawnAt(clientX, clientY){
        if(!images.length) return;
        const item = images[Math.floor(Math.random()*images.length)];
        const thumbUrl = item && item.thumb ? item.thumb : (item||'');
        const fullUrl = item && item.full ? item.full : thumbUrl;

        const img = document.createElement('img');
        img.className = 'hg-img spawn';
        img.src = thumbUrl;
        img.loading = 'lazy';
        img.alt = '';
        img.draggable = false;
        img.style.position = 'absolute';
        img.style.pointerEvents = 'auto';
        // Ensure transform-origin doesn't cause visual shift when opacity changes
        img.style.transformOrigin = 'center center';
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
        // After append, re-run stack rules to set opacities correctly
        requestAnimationFrame(()=> setTimeout(()=> {
            img.classList.remove('spawn');
            applyStackRules();
        }, 60));
    }

    let lastPos = { x:-9999, y:-9999 };
    function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
    const THRESH = cssNumber('--hg-spawn-threshold', 48);           // spacing between spawn points while dragging
    const DRAG_SENSITIVITY = cssNumber('--hg-drag-threshold', 24);  // how much finger must move before first spawn (configurable)
    function handleMove(e){ const p={x:e.clientX,y:e.clientY}; if(dist(p,lastPos)>=THRESH){ spawnAt(e.clientX,e.clientY); lastPos=p; } }
    function handleEnter(e){ lastPos={x:e.clientX,y:e.clientY}; /* no spawn on enter for desktop - keep */ }

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

    let pointerActive=false;
    // mouse hover behavior remains — pointerenter/pointermove/pointerleave for mouse
    canvas.addEventListener('pointerenter',(e)=>{ pointerActive=true; handleEnter(e); });
    canvas.addEventListener('pointermove',(e)=>{ if(pointerActive) handleMove(e); });
    canvas.addEventListener('pointerleave',()=>{ pointerActive=false; });

    // keyboard support (unchanged)
    canvas.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ const r=canvas.getBoundingClientRect(); const cx=r.left+r.width/2+(Math.random()-0.5)*80; const cy=r.top+r.height/2+(Math.random()-0.5)*80; spawnAt(cx,cy); } });

    (function preloadSome(){ const sample = images.slice(0, Math.min(images.length,8)); sample.forEach(u=>{ if(u&&u.thumb){ const i=new Image(); i.src=u.thumb; i.loading='lazy'; } }); })();

    // --- Lightbox: enforce fit-to-screen (explicit calc values) ---
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

        // wrapper centers and constrains image to viewport with a consistent gap
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        // explicit calc ensures portrait images fit within viewport
        wrapper.style.maxWidth = 'calc(100vw - 40px)';
        wrapper.style.maxHeight = 'calc(100vh - 40px)';
        wrapper.style.width = 'auto';
        wrapper.style.height = 'auto';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        wrapper.style.overflow = 'hidden'; // prevent any internal scroll
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.boxSizing = 'border-box';
        wrapper.style.padding = '0'; // ensure no extra padding eats space

        const img = document.createElement('img');
        img.className = 'hg-lightbox-img';
        img.alt = '';
        img.draggable = false;
        img.style.display = 'block';
        img.style.boxShadow = '0 10px 40px rgba(0,0,0,0.6)';
        // EXPLICIT fit-to-screen using viewport calc values (stronger than %)
        img.style.maxWidth = 'calc(100vw - 40px)';
        img.style.maxHeight = 'calc(100vh - 40px)';
        img.style.width = 'auto';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
        img.style.boxSizing = 'border-box';
        img.style.transform = 'none'; // clear any transforms that might shift position
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

        // dblclick: toggle to natural size ONLY if it still fits viewport-with-gap
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
                    // don't toggle if natural would overflow — keep fit
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
                    // lock scroll
                    document.documentElement.style.overflow = 'hidden';
                    window.addEventListener('keydown', onKey);
                }
                // ensure no layout shift; image will scale to fit
                img.onload = () => {
                    // Force reflow to ensure computed constraints apply
                    void img.offsetWidth;
                    LOG('lightbox image loaded; natural size:', img.naturalWidth, img.naturalHeight);
                };
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

    // --- Delegated left-click handler (mouse only) ---
    (function installDelegatedLightbox(){
        if(!canvas) return;
        if(canvas._playgroundLightboxHandler){ canvas.removeEventListener('pointerdown', canvas._playgroundLightboxHandler); canvas._playgroundLightboxHandler = null; }

        const handler = function(ev){
            // Only handle mouse pointer events here (avoid touching behavior)
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

    // --- Touch / Pen support: start/continue/stop spawning while dragging.
    // Also detect double-tap to open image in lightbox. Single-tap will open the LAST image if tapped.
    // CHANGED: Do NOT spawn on pointerdown. Spawn only once pointer has moved past DRAG_SENSITIVITY.
    (function installTouchDragDoubleTap(){
        if(!canvas) return;

        // track taps for double-tap and single-tap detection
        let lastTapTime = 0;
        let lastTapPos = { x: 0, y: 0 };
        const DOUBLE_TAP_MS = 350;
        const DOUBLE_TAP_DIST = 30; // px
        const TAP_MOVE_DIST = 12; // px — if movement <= this, treat as a tap

        // state while pointer is down
        let pointerDownPos = null;   // {x,y,t}
        let pointerHasMovedEnough = false; // whether we've passed DRAG_SENSITIVITY and started spawning
        let pointerIdForCapture = null;

        function onPointerDown(e){
            if(!(e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'touchpad')) return;
            // DON'T spawn here — just record start pos and capture pointer
            pointerActive = false; // not yet actively spawning until movement exceeds DRAG_SENSITIVITY
            pointerHasMovedEnough = false;
            pointerDownPos = { x: e.clientX, y: e.clientY, t: Date.now() };
            pointerIdForCapture = e.pointerId;
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) {}
            // prevent synthetic mouse events on some devices
            e.preventDefault && e.preventDefault();
        }

        function onPointerMove(e){
            if(!(e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'touchpad')) return;

            if(!pointerDownPos) return;
            const dx = e.clientX - pointerDownPos.x;
            const dy = e.clientY - pointerDownPos.y;
            const movedSinceDown = Math.sqrt(dx*dx + dy*dy);

            if(!pointerHasMovedEnough){
                // if movement exceeds drag sensitivity, start spawning and mark lastPos for spacing
                if(movedSinceDown >= DRAG_SENSITIVITY){
                    pointerHasMovedEnough = true;
                    pointerActive = true;
                    lastPos = { x: e.clientX, y: e.clientY };
                    // spawn first image at current position
                    spawnAt(e.clientX, e.clientY);
                }
                // else — still within tap/intent; do not spawn
            } else {
                // already in spawning mode — continue spawning per THRESH spacing
                if(pointerActive) handleMove(e);
            }
        }

        function onPointerUp(e){
            if(!(e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'touchpad')) return;
            // release capture
            try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (err) {}
            const now = Date.now();
            // if pointer never moved enough to spawn, consider this a tap (or small move)
            const dx = e.clientX - (pointerDownPos ? pointerDownPos.x : e.clientX);
            const dy = e.clientY - (pointerDownPos ? pointerDownPos.y : e.clientY);
            const moved = Math.sqrt(dx*dx + dy*dy);

            // Double-tap detection (existing behavior)
            const distFromLastTap = Math.sqrt(Math.pow(e.clientX - lastTapPos.x,2) + Math.pow(e.clientY - lastTapPos.y,2));
            if(now - lastTapTime <= DOUBLE_TAP_MS && distFromLastTap <= DOUBLE_TAP_DIST){
                // double-tap detected — open lightbox if tapped an image
                const hit = findTopImageAtPoint(e.clientX, e.clientY);
                if(hit){
                    const full = hit.dataset && hit.dataset.full ? hit.dataset.full : hit.src;
                    LOG('open full (double-tap — lightbox):', full);
                    openLightbox(full);
                    lastTapTime = 0;
                    lastTapPos = { x: 0, y: 0 };
                    // reset pointer state
                    pointerDownPos = null;
                    pointerHasMovedEnough = false;
                    pointerActive = false;
                    pointerIdForCapture = null;
                    return;
                }
            }

            // SINGLE TAP: if user did NOT move past DRAG_SENSITIVITY (pointerHasMovedEnough === false)
            // and the movement was small (moved <= TAP_MOVE_DIST), treat as tap — open last image if tapped.
            if(!pointerHasMovedEnough && moved <= TAP_MOVE_DIST){
                const hit = findTopImageAtPoint(e.clientX, e.clientY);
                if(hit && activeNodes.length){
                    const last = activeNodes[activeNodes.length - 1];
                    if(hit === last){
                        const full = hit.dataset && hit.dataset.full ? hit.dataset.full : hit.src;
                        LOG('open full (single-tap on last image — lightbox):', full);
                        openLightbox(full);
                        // record tap for double-tap tracking
                        lastTapTime = now;
                        lastTapPos = { x: e.clientX, y: e.clientY };
                        // reset pointer state
                        pointerDownPos = null;
                        pointerHasMovedEnough = false;
                        pointerActive = false;
                        pointerIdForCapture = null;
                        return;
                    }
                }
            }

            // if pointer was spawning, allow decay rules to run; otherwise just record last tap (for double tap)
            lastTapTime = now;
            lastTapPos = { x: e.clientX, y: e.clientY };
            pointerDownPos = null;
            pointerHasMovedEnough = false;
            pointerActive = false;
            pointerIdForCapture = null;
        }

        canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
        canvas.addEventListener('pointermove', onPointerMove, { passive: true });
        canvas.addEventListener('pointerup', onPointerUp, { passive: true });
        canvas.addEventListener('pointercancel', ()=>{ pointerActive=false; pointerDownPos=null; pointerHasMovedEnough=false; }, { passive: true });

    })();

    // --- Mobile scroll handling + draggable-pointer fallback (unchanged) ---
    (function mobileScrollHandlerAndFallback(){
        if(!canvas || typeof spawnAt !== 'function') { WARN('mobile scroll handler needs canvas & spawnAt'); return; }

        const TAGM = '[playground:mobile-scroll]';
        const LOGM = (...a)=>console.log('%c'+TAGM,'color:#0a7;font-weight:700;',...a);
        const WARNM = (...a)=>console.warn('%c'+TAGM,'color:#ea0;font-weight:700;',...a);

        // Try to disable native scrolling while interacting with the canvas.
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
            p.innerHTML = '&#9679;'; // small dot

            let dragging = false;
            let pointerId = null;

            function onStart(ev){
                ev.preventDefault && ev.preventDefault();
                dragging = true;
                pointerId = ev.pointerId;
                p.style.cursor = 'grabbing';
                try{ p.setPointerCapture && p.setPointerCapture(pointerId); } catch(e){}
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

        // Expose a helper to force toggle fallback pointer
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

    LOG('playground initialized — maxVisible=' + MAX_VISIBLE + ', permanentLast=' + PERMANENT_LAST + ', dragThreshold=' + DRAG_SENSITIVITY);
})();
