// static/js/playground.js — playground spawn + left-click lightbox opener
(function () {
    const TAG = '[playground]';
    const LOG = (...a) => console.log('%c' + TAG, 'color:#0a7; font-weight:700;', ...a);
    const WARN = (...a) => console.warn('%c' + TAG, 'color:#ea0; font-weight:700;', ...a);

    // --- Normalize window.HG_IMAGES into an array of objects {thumb, full} ---
    function normalizeHGImages() {
        try {
            let raw = window.HG_IMAGES;
            if (typeof raw === 'undefined' || raw === null) {
                window.HG_IMAGES = [];
                return;
            }
            if (typeof raw === 'string') {
                // try parse
                try { raw = JSON.parse(raw); } catch (e) {
                    // crude split fallback
                    raw = raw.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g,'')).filter(Boolean);
                }
            }
            if (!Array.isArray(raw)) raw = Array.from(raw || []);
            // Normalize into objects {thumb, full}
            const origin = (typeof location !== 'undefined' && location.origin) ? location.origin.replace(/\/$/,'') : '';
            const out = raw.map(u => {
                if (!u) return null;
                if (typeof u === 'object') {
                    const thumb = String(u.thumb || u.t || u.thumbUrl || u.thumb_url || u[0] || '');
                    const full  = String(u.full  || u.f || u.fullUrl  || u.full_url  || u[1] || thumb);
                    return { thumb, full };
                }
                // string - treat as thumb==full (best-effort)
                const s = String(u).trim().replace(/^"|'|`|`'|`"|'`/g,'').replace(/"|'$/,'');
                // make absolute if starts with '/'
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

    // --- Read CSS knobs ---
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

    // activeNodes: ordered oldest -> newest
    const activeNodes = [];
    let z = 1000;

    function removeNode(node) {
        if (!node) return;
        const idx = activeNodes.indexOf(node);
        if (idx !== -1) activeNodes.splice(idx, 1);
        if (node.parentNode) node.parentNode.removeChild(node);
    }

    function applyStackRules() {
        // enforce max visible
        while (activeNodes.length > MAX_VISIBLE) {
            const obsolete = activeNodes.shift();
            if (obsolete && obsolete.parentNode) obsolete.parentNode.removeChild(obsolete);
        }

        const n = activeNodes.length;
        for (let i = 0; i < n; i++) {
            const node = activeNodes[i];
            const fromNewest = n - 1 - i;
            if (fromNewest < PERMANENT_LAST) {
                node.classList.remove('decay-full');
                node.classList.add('decay-partial');
                if (node._decayTimeout) { clearTimeout(node._decayTimeout); node._decayTimeout = null; }
            } else {
                node.classList.remove('decay-partial');
                node.classList.add('decay-full');
                if (!node._decayTimeout) {
                    node._decayTimeout = setTimeout(() => {
                        if (activeNodes.indexOf(node) !== -1) removeNode(node);
                    }, DECAY_MS + 240);
                }
            }
        }
    }

    function spawnAt(clientX, clientY) {
        if (!images.length) return;
        const item = images[Math.floor(Math.random() * images.length)];
        const thumbUrl = item && item.thumb ? item.thumb : (item || '');
        const fullUrl  = item && item.full  ? item.full  : thumbUrl;

        const img = document.createElement('img');
        img.className = 'hg-img spawn';
        img.src = thumbUrl;
        img.loading = 'lazy';
        img.alt = '';
        img.draggable = false;
        img.style.position = 'absolute';
        img.style.pointerEvents = 'auto'; // allow clicks
        // center at pointer within canvas
        const r = canvas.getBoundingClientRect();
        const x = clientX - r.left;
        const y = clientY - r.top;
        img.style.left = x + 'px';
        img.style.top = y + 'px';
        img.style.zIndex = ++z;
        img.setAttribute('data-z', String(z));
        img.dataset.full = fullUrl; // always attach full-res url (preferred)

        img._decayTimeout = null;

        canvas.appendChild(img);
        activeNodes.push(img);

        requestAnimationFrame(()=> setTimeout(()=> {
            img.classList.remove('spawn');
            applyStackRules();
        }, 60));
    }

    // pointer handling & spawn threshold
    let lastPos = { x:-9999, y:-9999 };
    function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
    const THRESH = cssNumber('--hg-spawn-threshold', 48);

    function handleMove(e) {
        const p = { x: e.clientX, y: e.clientY };
        if (dist(p, lastPos) >= THRESH) {
            spawnAt(e.clientX, e.clientY);
            lastPos = p;
        }
    }
    function handleEnter(e) {
        lastPos = { x: e.clientX, y: e.clientY };
        spawnAt(e.clientX, e.clientY);
    }

    let pointerActive = false;
    canvas.addEventListener('pointerenter', (e)=>{ pointerActive = true; handleEnter(e); });
    canvas.addEventListener('pointermove', (e)=>{ if (pointerActive) handleMove(e); });
    canvas.addEventListener('pointerleave', ()=>{ pointerActive = false; });

    // keyboard spawn
    canvas.addEventListener('keydown', (e)=> {
        if (e.key === 'Enter' || e.key === ' ') {
            const r = canvas.getBoundingClientRect();
            const cx = r.left + r.width/2 + (Math.random()-0.5)*80;
            const cy = r.top + r.height/2 + (Math.random()-0.5)*80;
            spawnAt(cx, cy);
        }
    });

    // preload sample
    (function preloadSome() {
        const sample = images.slice(0, Math.min(images.length, 8));
        sample.forEach(u => { if (u && u.thumb) { const i = new Image(); i.src = u.thumb; i.loading='lazy'; } });
    })();

    // --- Delegated left-click handler (primary button only) ---
    (function installDelegatedLightbox() {
        if (!canvas) return;
        // remove old handler if present
        if (canvas._playgroundLightboxHandler) {
            canvas.removeEventListener('pointerdown', canvas._playgroundLightboxHandler);
            canvas._playgroundLightboxHandler = null;
        }

        function findTopImageAtPoint(x,y) {
            const imgs = Array.from(document.querySelectorAll('.hg-img'));
            for (let i = imgs.length - 1; i >= 0; i--) {
                const im = imgs[i];
                const r = im.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return im;
            }
            return null;
        }

        const handler = function(ev) {
            // Only respond to primary (left) button
            if (ev.button !== 0) return;
            const x = ev.clientX, y = ev.clientY;
            const hit = findTopImageAtPoint(x,y);
            if (!hit) return;
            ev.preventDefault(); ev.stopPropagation();
            const full = hit.dataset && hit.dataset.full ? hit.dataset.full : hit.src;
            LOG('open full (left click):', full);
            if (window.Lightbox && typeof window.Lightbox.openWithSrc === 'function') {
                window.Lightbox.openWithSrc(full);
            } else {
                // as a last resort (shouldn't happen), open new tab
                window.open(full, '_blank');
            }
        };

        canvas.addEventListener('pointerdown', handler, { passive: false });
        canvas._playgroundLightboxHandler = handler;
    })();

    LOG('playground initialized — maxVisible=' + MAX_VISIBLE + ', permanentLast=' + PERMANENT_LAST);
})();
