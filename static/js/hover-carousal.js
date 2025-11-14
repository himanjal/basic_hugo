// static/js/hover-carousal.js
// Hover-wave controller that:
// - reads tuning knobs from CSS variables
// - computes per-item targets for --scaleX/--scaleY/--tx/--tilt/--bright/--z
// - writes CSS vars to items AND explicit numeric style.zIndex for deterministic stacking
// - toggles .in-front on the top-most element
// - lazy-loads hi-res images on first hover (if data-hires set on the item element)

(function () {
    'use strict';

    const nav = document.querySelector('.hover-carousel');
    if (!nav) return;
    const items = Array.from(nav.querySelectorAll('.hc-item'));
    if (!items.length) return;

    /* ---------------------------
       Helpers to read CSS variables
       --------------------------- */
    function cssVarNumber(name, fallback = 0) {
        const s = getComputedStyle(document.documentElement).getPropertyValue(name);
        if (!s) return fallback;
        const trimmed = s.trim();
        // px value
        const px = trimmed.match(/^(-?\d+(\.\d+)?)px$/i);
        if (px) return parseFloat(px[1]);
        // plain number
        const n = parseFloat(trimmed);
        return Number.isFinite(n) ? n : fallback;
    }

    function cssVarString(name, fallback = '') {
        const s = getComputedStyle(document.documentElement).getPropertyValue(name);
        return s ? s.trim() : fallback;
    }

    /* read runtime config from CSS variables (so users can tweak in CSS only) */
    function readConfigFromCSS() {
        return {
            imgWidthMult: cssVarNumber('--img-width-mult', 1.04),

            centerScaleX: cssVarNumber('--center-scale-x', 1.6),
            centerScaleY: cssVarNumber('--center-scale-y', 1.14),

            adjacentScaleX: cssVarNumber('--adjacent-scale-x', 1.28),
            adjacentScaleY: cssVarNumber('--adjacent-scale-y', 1.08),

            nextScaleX: cssVarNumber('--next-scale-x', 1.12),
            nextScaleY: cssVarNumber('--next-scale-y', 1.04),

            centerBright: cssVarNumber('--center-bright', 1.0),
            adjacentBright: cssVarNumber('--adjacent-bright', 0.78),
            nextBright: cssVarNumber('--next-bright', 0.62),
            baseBright: cssVarNumber('--base-bright', 0.32),

            baseTx: cssVarNumber('--base-tx', 80),
            txDecay: cssVarNumber('--tx-decay', 0.5),
            txMult: cssVarNumber('--tx-mult', 1),

            baseTiltDeg: parseFloat(cssVarString('--base-tilt-deg', '18deg')) || 18,
            zBase: cssVarNumber('--z-base', 1000),
            zDecay: cssVarNumber('--z-decay', 0.5),

            inertia: 0.12 // smoothing factor used by JS (kept in code)
        };
    }

    // current config
    let cfg = readConfigFromCSS();

    // allow external reload when user updates CSS vars live:
    window.reloadHoverConfigFromCSS = function () {
        cfg = readConfigFromCSS();
        document.documentElement.style.setProperty('--img-width-mult', String(cfg.imgWidthMult));
    };

    // small lerp helper
    const lerp = (a, b, t) => a + (b - a) * t;

    // compute target values for a signed distance (i - centerIndex)
    function computeForSignedDist(signedDist) {
        const dist = Math.abs(signedDist);
        const sign = Math.sign(signedDist) || 0;

        let scaleX, scaleY, bright;
        if (dist === 0) {
            scaleX = cfg.centerScaleX; scaleY = cfg.centerScaleY; bright = cfg.centerBright;
        } else if (dist === 1) {
            scaleX = cfg.adjacentScaleX; scaleY = cfg.adjacentScaleY; bright = cfg.adjacentBright;
        } else if (dist === 2) {
            scaleX = cfg.nextScaleX; scaleY = cfg.nextScaleY; bright = cfg.nextBright;
        } else {
            scaleX = 1; scaleY = 1; bright = cfg.baseBright;
        }

        // tx decays multiplicatively per extra distance step
        const decayFactor = dist >= 1 ? Math.pow(cfg.txDecay, dist - 1) : 0;
        const tx = sign * cfg.baseTx * decayFactor * cfg.txMult;

        const tilt = sign * cfg.baseTiltDeg * (dist >= 1 ? Math.pow(cfg.txDecay, dist - 1) : 0);

        // deterministic base z for this distance
        const z = Math.round(cfg.zBase * Math.pow(cfg.zDecay, dist));

        return { scaleX, scaleY, bright, tx, tilt, z };
    }

    /* ---------------------------
       state + smoothing
       --------------------------- */
    const state = items.map(() => ({
        scaleX: 1, scaleY: 1, bright: cfg.baseBright, tx: 0, tilt: 0, z: 1,
        target: { scaleX: 1, scaleY: 1, bright: cfg.baseBright, tx: 0, tilt: 0, z: 1 }
    }));

    let rafId = null;

    /* RAF loop: update smoothed values and write to DOM.
       Here we compute a deterministic final numeric z-index for each item:
         finalZ = (s.target.z) + tieBreaker
       where tieBreaker = (items.length - index) ensures uniqueness and stable ordering.
    */
    function rafLoop() {
        let active = false;

        // smooth primary numeric state first
        for (let i = 0; i < items.length; i++) {
            const s = state[i];
            s.scaleX = lerp(s.scaleX, s.target.scaleX, cfg.inertia);
            s.scaleY = lerp(s.scaleY, s.target.scaleY, cfg.inertia);
            s.bright = lerp(s.bright, s.target.bright, cfg.inertia);
            s.tx = lerp(s.tx, s.target.tx, cfg.inertia);
            s.tilt = lerp(s.tilt, s.target.tilt, cfg.inertia);
            s.z = lerp(s.z, s.target.z, Math.min(0.35, cfg.inertia * 1.8));
        }

        // compute deterministic numeric z for each element (unique ascending tie-breaker)
        const numericZs = state.map((s, idx) => {
            const baseZ = Math.round(s.target.z || cfg.zBase * Math.pow(cfg.zDecay, 999));
            const tie = (items.length - idx); // larger for earlier items -> uniqueness
            return baseZ + tie;
        });

        // find top-most index
        let maxZ = -Infinity, maxIndex = -1;
        for (let i = 0; i < numericZs.length; i++) {
            if (numericZs[i] > maxZ) { maxZ = numericZs[i]; maxIndex = i; }
        }

        for (let i = 0; i < items.length; i++) {
            const s = state[i];
            const el = items[i];

            // write CSS vars for transforms + visual state
            el.style.setProperty('--scaleX', s.scaleX.toFixed(3));
            el.style.setProperty('--scaleY', s.scaleY.toFixed(3));
            el.style.setProperty('--bright', s.bright.toFixed(3));
            el.style.setProperty('--tx', Math.round(s.tx) + 'px');
            el.style.setProperty('--tilt', s.tilt.toFixed(3) + 'deg');

            // write deterministic numeric z-index (explicit)
            const finalZ = numericZs[i];
            el.style.zIndex = String(finalZ);
            el.style.setProperty('--z', String(finalZ));
            el.setAttribute('data-z', String(finalZ));

            // toggle in-front class for the top-most element
            if (i === maxIndex) {
                if (!el.classList.contains('in-front')) el.classList.add('in-front');
            } else {
                if (el.classList.contains('in-front')) el.classList.remove('in-front');
            }

            // aria-current for highest z
            if (finalZ === maxZ) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');

            // detect if animation still in progress
            if (Math.abs(s.scaleX - s.target.scaleX) > 0.0008 ||
                Math.abs(s.scaleY - s.target.scaleY) > 0.0005 ||
                Math.abs(s.tx - s.target.tx) > 0.6 ||
                Math.abs(s.tilt - s.target.tilt) > 0.02) active = true;
        }

        if (active) rafId = requestAnimationFrame(rafLoop);
        else rafId = null;
    }

    /* ---------------------------
       target setting API
       --------------------------- */

    // set per-item targets based on center index and pointerFrac in [-1..1]
    function setTargets(centerIndex, pointerFrac = 0) {
        // re-read CSS-config (useful when live-editing CSS vars)
        cfg = readConfigFromCSS();

        for (let i = 0; i < items.length; i++) {
            const primary = computeForSignedDist(i - centerIndex);

            if (Math.abs(pointerFrac) > 0.001) {
                // blend toward neighbor center for pointer fractional movement
                const neighborCenter = Math.max(0, Math.min(items.length - 1, centerIndex + (pointerFrac > 0 ? 1 : -1)));
                const neighbor = computeForSignedDist(i - neighborCenter);
                const t = Math.min(1, Math.abs(pointerFrac));
                state[i].target.scaleX = lerp(primary.scaleX, neighbor.scaleX, t * 0.88);
                state[i].target.scaleY = lerp(primary.scaleY, neighbor.scaleY, t * 0.88);
                state[i].target.bright = lerp(primary.bright, neighbor.bright, t * 0.88);
                state[i].target.tx = lerp(primary.tx, neighbor.tx, t * 0.9);
                state[i].target.tilt = lerp(primary.tilt, neighbor.tilt, t * 0.9);
                state[i].target.z = Math.round(lerp(primary.z, neighbor.z, t * 0.9));
            } else {
                state[i].target.scaleX = primary.scaleX;
                state[i].target.scaleY = primary.scaleY;
                state[i].target.bright = primary.bright;
                state[i].target.tx = primary.tx;
                state[i].target.tilt = primary.tilt;
                state[i].target.z = primary.z;
            }
        }

        if (!rafId) rafId = requestAnimationFrame(rafLoop);
    }

    // reset targets (return to neutral)
    function resetTargets() {
        cfg = readConfigFromCSS();
        for (let i = 0; i < items.length; i++) {
            state[i].target.scaleX = 1;
            state[i].target.scaleY = 1;
            state[i].target.bright = cfg.baseBright;
            state[i].target.tx = 0;
            state[i].target.tilt = 0;
            state[i].target.z = 1;
        }
        if (!rafId) rafId = requestAnimationFrame(rafLoop);
    }

    /* ---------------------------
       lazy hi-res loader
       --------------------------- */
    function ensureHiResLoaded(item) {
        try {
            const img = item.querySelector('.hc-img');
            if (!img) return;
            if (img.dataset.hiresApplied === '1') return;
            const hires = item.dataset.hires;
            if (!hires) return;
            const pre = new Image();
            pre.src = hires;
            pre.onload = () => {
                if (img && img.isConnected) {
                    img.src = hires;
                    img.dataset.hiresApplied = '1';
                }
            };
            pre.onerror = () => { /* ignore */ };
        } catch (e) { /* ignore */ }
    }

    /* ---------------------------
       attach pointer handlers to items
       --------------------------- */
    items.forEach((item, idx) => {
        item.dataset.index = idx;

        item.addEventListener('pointerenter', (ev) => {
            ensureHiResLoaded(item);
            const rect = item.getBoundingClientRect();
            const x = ev.clientX - rect.left;
            const prog = ((x / rect.width) - 0.5) * 2; // -1..1
            setTargets(idx, prog);
        });

        item.addEventListener('pointermove', (ev) => {
            const rect = item.getBoundingClientRect();
            const x = ev.clientX - rect.left;
            const prog = ((x / rect.width) - 0.5) * 2;
            setTargets(idx, prog);
        });

        item.addEventListener('pointerleave', resetTargets);
        item.addEventListener('focus', () => setTargets(idx, 0));
        item.addEventListener('blur', resetTargets);

        item.addEventListener('click', (e) => {
            e.preventDefault();
            const index = idx;
            // default click behavior — go to album-viewer (adjust path accordingly)
            window.location.href = `/album-viewer/featured?index=${index}`;
        });
    });

    /* ---------------------------
       nav-level pointermove for continuous center selection
       --------------------------- */
    nav.addEventListener('pointermove', (ev) => {
        const rect = nav.getBoundingClientRect();
        const relX = ev.clientX - rect.left;
        let floatIndex = (relX / rect.width) * items.length - 0.5;
        floatIndex = Math.max(0, Math.min(items.length - 1, floatIndex));
        const center = Math.round(floatIndex);
        const pointerFrac = floatIndex - center;
        setTargets(center, pointerFrac);
    });

    nav.addEventListener('pointerleave', resetTargets);

    // initial baseline
    resetTargets();

    // convenience runtime API to tweak main knobs via console
    window.carousel = {
        reloadConfig: readConfigFromCSS,
        setImgWidthMult: (v) => {
            document.documentElement.style.setProperty('--img-width-mult', String(v));
            cfg.imgWidthMult = v;
        },
        setBaseTxPx: (v) => {
            document.documentElement.style.setProperty('--base-tx', String(v) + 'px');
            cfg.baseTx = v;
        },
        setTxDecay: (v) => {
            document.documentElement.style.setProperty('--tx-decay', String(v));
            cfg.txDecay = v;
        },
        setZBase: (v) => {
            document.documentElement.style.setProperty('--z-base', String(v));
            cfg.zBase = v;
        },
        setZDecay: (v) => {
            document.documentElement.style.setProperty('--z-decay', String(v));
            cfg.zDecay = v;
        }
    };

})();
