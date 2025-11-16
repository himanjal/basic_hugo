// static/js/playground.js — playground spawn + left-click lightbox opener
// Stronger fit-to-screen constraints for portrait images (no overflow).
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
    function applyStackRules(){
        while(activeNodes.length>MAX_VISIBLE){ const o=activeNodes.shift(); if(o&&o.parentNode) o.parentNode.removeChild(o); }
        for(let i=0;i<activeNodes.length;i++){
            const node = activeNodes[i];
            const fromNewest = activeNodes.length - 1 - i;
            if(fromNewest < PERMANENT_LAST){ node.classList.remove('decay-full'); node.classList.add('decay-partial'); if(node._decayTimeout){ clearTimeout(node._decayTimeout); node._decayTimeout=null; } }
            else { node.classList.remove('decay-partial'); node.classList.add('decay-full'); if(!node._decayTimeout){ node._decayTimeout = setTimeout(()=>{ if(activeNodes.indexOf(node)!==-1) removeNode(node); }, DECAY_MS+240); } }
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
        requestAnimationFrame(()=> setTimeout(()=> { img.classList.remove('spawn'); applyStackRules(); }, 60));
    }

    let lastPos = { x:-9999, y:-9999 };
    function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
    const THRESH = cssNumber('--hg-spawn-threshold', 48);
    function handleMove(e){ const p={x:e.clientX,y:e.clientY}; if(dist(p,lastPos)>=THRESH){ spawnAt(e.clientX,e.clientY); lastPos=p; } }
    function handleEnter(e){ lastPos={x:e.clientX,y:e.clientY}; spawnAt(e.clientX,e.clientY); }

    let pointerActive=false;
    canvas.addEventListener('pointerenter',(e)=>{ pointerActive=true; handleEnter(e); });
    canvas.addEventListener('pointermove',(e)=>{ if(pointerActive) handleMove(e); });
    canvas.addEventListener('pointerleave',()=>{ pointerActive=false; });

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

    // delegated left-click handler
    (function installDelegatedLightbox(){
        if(!canvas) return;
        if(canvas._playgroundLightboxHandler){ canvas.removeEventListener('pointerdown', canvas._playgroundLightboxHandler); canvas._playgroundLightboxHandler = null; }

        function findTopImageAtPoint(x,y){
            const imgs = Array.from(document.querySelectorAll('.hg-img'));
            for(let i=imgs.length-1;i>=0;i--){
                const im = imgs[i];
                const r = im.getBoundingClientRect();
                if(x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return im;
            }
            return null;
        }

        const handler = function(ev){
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

    LOG('playground initialized — maxVisible=' + MAX_VISIBLE + ', permanentLast=' + PERMANENT_LAST);
})();
