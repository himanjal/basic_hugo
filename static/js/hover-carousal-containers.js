// static/js/hover-carousal-containers.js
// Recreated: reads new CSS variables for per-attribute hover control and decay
(function () {
    'use strict';

    const nav = document.querySelector('.hover-carousel');
    if (!nav) { console.warn('Hover carousel: .hover-carousel not found.'); return; }
    const containers = Array.from(nav.querySelectorAll('.hc-container'));
    if (!containers.length) { console.warn('Hover carousel: no .hc-container elements found.'); return; }

    // ---------- helpers to read CSS vars ----------
    function cssRaw(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name);
        return v ? v.trim() : fallback;
    }
    function cssNum(name, fallback) {
        const raw = cssRaw(name, null);
        if (!raw) return fallback;
        const m = raw.match(/-?\d+(\.\d+)?/);
        return m ? parseFloat(m[0]) : fallback;
    }
    function cssFloat(name, fallback) { return cssNum(name, fallback); }

    // ---------- config read from CSS vars ----------
    const cfg = {
        gap: Math.max(cssNum('--gap', 8), 1),
        minImgMult: cssNum('--min-img-mult', 1.35),
        maxImgMult: cssNum('--max-img-mult', 2.0),
        imgHeightMult: cssNum('--img-height-mult', 1.5),
        inertia: cssNum('--inertia', 0.16),
        dimmer: cssNum('--dimmer', 0.1),
        brightMax: cssNum('--bright-max', 1),
        hoverXMult: Math.max(1, cssNum('--hover-x-mult', 1.5)),
        hoverYMult: Math.max(1, cssNum('--hover-y-mult', 1.12)),
        hoverJumpPx: Math.max(0, cssNum('--hover-jump-px', 18)),
        hoverShadowMult: Math.max(0, cssNum('--hover-shadow-mult', 1.8)),
        hoverBrightMin: cssNum('--hover-dimmer-min', cssNum('--dimmer', 0.1)),
        hoverBrightMax: cssNum('--hover-bright-max', cssNum('--bright-max', 1)),
        decaySteps: Math.max(1, Math.floor(cssNum('--decay-steps', 3))),
        decayWidth: cssFloat('--decay-factor-width', 0.7),
        decayHeight: cssFloat('--decay-factor-height', 0.72),
        decayJump: cssFloat('--decay-factor-jump', 0.6),
        decayShadow: cssFloat('--decay-factor-shadow', 0.68),
        decayBright: cssFloat('--decay-factor-bright', 0.65),
        hoverPushPx: Math.max(0, cssNum('--hover-push-px', 18)),
    };

    // mobile detection and lighter interactions
    (function applyMobileOptimizations() {
        const smallViewport = (window.innerWidth || document.documentElement.clientWidth) <= 640;
        const coarsePointer = window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);
        const touchDevice = 'ontouchstart' in window || coarsePointer || smallViewport;
        cfg._mobileMode = Boolean(touchDevice);
        if (cfg._mobileMode) {
            cfg.inertia = Math.min(cfg.inertia * 1.8, 0.36);
            // soften hover multipliers on touch
            cfg.hoverXMult = Math.max(1, Math.min(cfg.hoverXMult, 1.12));
            cfg.hoverYMult = Math.max(1, Math.min(cfg.hoverYMult, 1.06));
            cfg.hoverJumpPx = Math.min(cfg.hoverJumpPx, 8);
            cfg.hoverPushPx = 0;
        }
    })();

    // state
    const state = containers.map(() => ({
        width: 0, height: 0, translateX: 0, translateY: 0, bright: cfg.dimmer,
        targetWidth: 0, targetHeight: 0, targetTranslateX: 0, targetTranslateY: 0, targetBright: cfg.dimmer
    }));

    // ---------- baseline sizing (enforce 80% vw and 1:4 tiles) ----------
    function baselineSizes() {
        const css = getComputedStyle(document.documentElement);
        const maxW = Math.max(1, parseInt(css.getPropertyValue('--carousel-max-width')) || 1300);
        const minW = Math.max(1, parseInt(css.getPropertyValue('--carousel-min-width')) || 320);
        const vwFrac = parseFloat(css.getPropertyValue('--carousel-vw')) || 0.8;
        const sidePad = Math.max(0, parseInt(css.getPropertyValue('--carousel-side-padding')) || 24);
        const maxHCap = Math.max(80, parseInt(css.getPropertyValue('--carousel-max-height')) || 340);

        const viewportW = Math.max(320, (window.innerWidth || document.documentElement.clientWidth));
        let effectiveWidth = Math.round(Math.max(minW, Math.min(maxW, Math.round(viewportW * vwFrac))));

        // subtract side padding
        effectiveWidth = Math.max(160, effectiveWidth - (sidePad * 2));

        // tile aspect
        const tileAW = Math.max(1, cssNum('--tile-aspect-w', 1));
        const tileAH = Math.max(1, cssNum('--tile-aspect-h', 4));
        const count = Math.max(1, containers.length);

        // base tile width
        let baseW = Math.max(24, Math.floor(effectiveWidth / count));
        let baseH = Math.max(40, Math.round(baseW * (tileAH / tileAW)));

        // shrink height slightly as items increase (keeps carousel compact)
        const extraCount = Math.max(0, count - 4);
        const reduceFactor = Math.min(0.35, extraCount * 0.05);
        baseH = Math.round(baseH * (1 - reduceFactor));

        // cap by guide and explicit cap
        const guideH = Math.round(effectiveWidth / (parseFloat(css.getPropertyValue('--carousel-aspect')) || 4));
        const finalH = Math.min(baseH, Math.max(80, Math.min(maxHCap, guideH)));

        // recompute width to maintain exact aspect
        const finalW = Math.max(24, Math.round(finalH * (tileAW / tileAH)));

        // ensure finalW fits per tile
        const maxPerTileAvailable = Math.max(24, Math.floor(effectiveWidth / count));
        const usedW = Math.min(finalW, maxPerTileAvailable);

        // keep nav width consistent (JS + CSS)
        nav.style.maxWidth = (usedW * count + (count - 1) * cfg.gap) + 'px';
        nav.style.paddingInline = sidePad + 'px';
        nav.style.marginInline = 'auto';

        return { baseW: usedW, baseH: Math.round(usedW * (tileAH / tileAW)) };
    }

    // ---------- compute attribute-specific targets with per-attribute decay ----------
    function computeTargets(centerIndex = -1, pointerFrac = 0) {
        const { baseW, baseH } = baselineSizes();
        const n = containers.length;
        const targets = {
            widths: new Array(n).fill(baseW),
            heights: new Array(n).fill(baseH),
            translateXs: new Array(n).fill(0),
            translateYs: new Array(n).fill(0),
            brights: new Array(n).fill(cfg.dimmer)
        };
        if (centerIndex < 0) return targets;

        // distance and attribute weights
        const dArr = new Array(n);
        for (let i = 0; i < n; i++) {
            const d = Math.abs(i - centerIndex - pointerFrac);
            dArr[i] = d;
        }

        // compute raw attribute weights using per-attribute decay factors
        const widthWeights = dArr.map(d => (d > cfg.decaySteps ? 0 : Math.pow(cfg.decayWidth, d)));
        const heightWeights = dArr.map(d => (d > cfg.decaySteps ? 0 : Math.pow(cfg.decayHeight, d)));
        const jumpWeights = dArr.map(d => (d > cfg.decaySteps ? 0 : Math.pow(cfg.decayJump, d)));
        const shadowWeights = dArr.map(d => (d > cfg.decaySteps ? 0 : Math.pow(cfg.decayShadow, d)));
        const brightWeights = dArr.map(d => (d > cfg.decaySteps ? 0 : Math.pow(cfg.decayBright, d)));

        // normalization not strictly needed since center weight==1, but keep max normalization per attribute for stability
        const maxW = Math.max(1, ...widthWeights);
        const maxH = Math.max(1, ...heightWeights);
        const maxJ = Math.max(1, ...jumpWeights);
        const maxS = Math.max(1, ...shadowWeights);
        const maxB = Math.max(1, ...brightWeights);

        for (let i = 0; i < n; i++) {
            const wNorm = widthWeights[i] / maxW;
            const hNorm = heightWeights[i] / maxH;
            const jNorm = jumpWeights[i] / maxJ;
            const sNorm = shadowWeights[i] / maxS;
            const bNorm = brightWeights[i] / maxB;

            // width/height multipliers
            const wMul = 1 + (cfg.hoverXMult - 1) * wNorm;
            const hMul = 1 + (cfg.hoverYMult - 1) * hNorm;
            targets.widths[i] = Math.max(8, Math.round(baseW * wMul));
            targets.heights[i] = Math.max(8, Math.round(baseH * hMul));

            // jump (vertical lift) — negative translateY to lift upwards
            targets.translateYs[i] = Math.round(-cfg.hoverJumpPx * jNorm);

            // simple horizontal push for neighbors to create breathing room
            const side = Math.sign(i - centerIndex - pointerFrac);
            targets.translateXs[i] = Math.round(side * (cfg.hoverPushPx) * wNorm);

            // brightness
            targets.brights[i] = cfg.hoverBrightMin + (cfg.hoverBrightMax - cfg.hoverBrightMin) * bNorm;

            // attach computed shadow hint (store in targetShadow for RAF loop to consume)
            // We'll encode as an object saved to state.targetShadow
            const baseDepth = 8;
            const depth = Math.round(baseDepth + 20 * sNorm * cfg.hoverShadowMult);
            const blur = Math.round(28 + 90 * sNorm * cfg.hoverShadowMult);
            const alpha = Math.min(0.9, 0.28 + 0.5 * sNorm * (cfg.hoverShadowMult / 2));
            // store as a string
            const shadowStr = `0 ${depth}px ${blur}px rgba(0,0,0,${alpha})`;
            targets.shadowStr = targets.shadowStr || [];
            targets.shadowStr[i] = shadowStr;
        }

        return targets;
    }

    // ---------- state setter ----------
    function setTargets(centerIndex = -1, pointerFrac = 0) {
        const t = computeTargets(centerIndex, pointerFrac);
        for (let i = 0; i < containers.length; i++) {
            state[i].targetWidth = t.widths[i] || state[i].width || 0;
            state[i].targetHeight = t.heights[i] || state[i].height || 0;
            state[i].targetTranslateX = t.translateXs[i] || 0;
            state[i].targetTranslateY = t.translateYs[i] || 0;
            state[i].targetBright = t.brights[i] || cfg.dimmer;
            state[i].targetShadow = (t.shadowStr && t.shadowStr[i]) ? t.shadowStr[i] : null;
        }
        if (!rafId) rafId = requestAnimationFrame(rafLoop);
    }

    function resetTargets() {
        const b = baselineSizes();
        for (let i = 0; i < containers.length; i++) {
            state[i].targetWidth = b.baseW;
            state[i].targetHeight = b.baseH;
            state[i].targetTranslateX = 0;
            state[i].targetTranslateY = 0;
            state[i].targetBright = cfg.dimmer;
            state[i].targetShadow = getComputedStyle(document.documentElement).getPropertyValue('--shadow-base') || '0 8px 28px rgba(0,0,0,0.28)';
        }
        if (!rafId) rafId = requestAnimationFrame(rafLoop);
    }

    // ---------- ensure images visible (defensive) ----------
    function ensureImageVisibility(imgEl, containerEl) {
        if (!imgEl) return;
        try {
            if (!imgEl.getAttribute('src') || imgEl.getAttribute('src').trim() === '') {
                const hi = containerEl.dataset.hi2x || containerEl.dataset._hi2x || '';
                if (hi) imgEl.src = hi;
                else {
                    const ss = imgEl.getAttribute('srcset') || '';
                    const first = ss.split(',').map(s => s.trim()).filter(Boolean)[0];
                    if (first) imgEl.src = first.split(' ')[0];
                }
            }
            imgEl.style.display = 'block';
            imgEl.style.visibility = 'visible';
            imgEl.style.pointerEvents = 'none';
            imgEl.style.position = 'absolute';
        } catch (e) {
            console.warn('ensureImageVisibility error', e);
        }
    }

    // ---------- RAF loop ----------
    let rafId = null;
    function rafLoop() {
        let active = false;
        for (let i = 0; i < containers.length; i++) {
            const el = containers[i];
            const s = state[i];

            s.width += (s.targetWidth - s.width) * cfg.inertia;
            s.height += (s.targetHeight - s.height) * cfg.inertia;
            s.translateX += (s.targetTranslateX - (s.translateX || 0)) * cfg.inertia;
            s.translateY += (s.targetTranslateY - s.translateY) * cfg.inertia;
            s.bright += (s.targetBright - s.bright) * cfg.inertia;

            const w = Math.round(s.width);
            const h = Math.round(s.height);
            const tx = Math.round(s.translateX || 0);
            const ty = Math.round(s.translateY || 0);
            const br = +(s.bright.toFixed(3));

            if (el._lastW !== w) { el.style.width = w + 'px'; el._lastW = w; }
            if (el._lastH !== h) { el.style.height = h + 'px'; el._lastH = h; }

            const tr = `translateX(${tx}px) translateY(${ty}px)`;
            if (el._lastTr !== tr) { el.style.transform = tr; el._lastTr = tr; }

            // shadow
            if (s.targetShadow && el._lastShadow !== s.targetShadow) {
                el.style.boxShadow = s.targetShadow;
                el._lastShadow = s.targetShadow;
            }

            const img = el.querySelector('.hc-img');
            if (img) {
                if (img._lastBright !== br) { img.style.filter = `brightness(${br})`; img._lastBright = br; }

                // fixed image sizing if previously computed
                const iw = img._fixedW || img.naturalWidth || Math.max(1, Math.round(el.clientWidth * cfg.minImgMult));
                const ih = img._fixedH || img.naturalHeight || Math.max(1, Math.round(el.clientHeight * cfg.minImgMult));

                const cw = el.clientWidth;
                const ch = el.clientHeight;
                const left = Math.round((cw - iw) / 2);
                const top = Math.round((ch - ih) / 2);

                if (img._lastLeft !== left) { img.style.left = left + 'px'; img._lastLeft = left; }
                if (img._lastTop !== top) { img.style.top = top + 'px'; img._lastTop = top; }
            }

            if (Math.abs(s.width - s.targetWidth) > 0.5 ||
                Math.abs(s.height - s.targetHeight) > 0.5 ||
                Math.abs((s.translateX || 0) - s.targetTranslateX) > 0.5 ||
                Math.abs(s.bright - s.targetBright) > 0.005) {
                active = true;
            }
        }

        if (active) rafId = requestAnimationFrame(rafLoop);
        else rafId = null;
    }

    // ---------- initLayout: compute sizes and freeze image sizing ----------
    function initLayout() {
        const b = baselineSizes();
        const baseW = b.baseW;
        const baseH = b.baseH;

        // add extra padding to allow hover expansion
        const perTileExtra = Math.ceil(baseW * (cfg.hoverXMult - 1));
        const neighborAllowance = Math.ceil(perTileExtra * 0.6);
        const pad = Math.ceil(perTileExtra + neighborAllowance);

        const existingPad = parseInt(getComputedStyle(nav).paddingInline) || 0;
        nav.style.paddingInline = (existingPad + pad) + 'px';
        nav.style.justifyContent = 'center';

        // freeze sizes and compute image fixed size
        const absoluteMaxMult = 4.0;

        for (let i = 0; i < containers.length; i++) {
            const el = containers[i];
            const img = el.querySelector('.hc-img');

            state[i].width = baseW;
            state[i].height = baseH;
            state[i].bright = cfg.dimmer;

            el.style.width = baseW + 'px';
            el.style.height = baseH + 'px';
            el.style.transform = 'translateX(0px) translateY(0px)';
            el.style.boxShadow = getComputedStyle(document.documentElement).getPropertyValue('--shadow-base');

            if (!img) continue;
            ensureImageVisibility(img, el);

            const sizeAndFreeze = () => {
                const cw = Math.max(1, el.clientWidth);
                const ch = Math.max(1, el.clientHeight);

                const targetH_byMult = Math.round(ch * cfg.imgHeightMult);
                const minW = Math.round(cw * cfg.minImgMult);
                const capW = Math.round(cw * cfg.maxImgMult);

                const natW = img.naturalWidth || 0;
                const natH = img.naturalHeight || 0;
                let finalW, finalH;

                if (natW && natH) {
                    const neededWidthForTargetHeight = Math.round(targetH_byMult * (natW / natH));
                    const effectiveMaxMult = Math.min(absoluteMaxMult, Math.max(cfg.maxImgMult, neededWidthForTargetHeight / cw));
                    const capWAdj = Math.round(cw * effectiveMaxMult);

                    let scale = Math.max(minW / natW, 1);
                    const maxAllowedScale = Math.max(1, Math.min((capWAdj / natW) || Infinity, absoluteMaxMult));
                    if (scale > maxAllowedScale) scale = maxAllowedScale;

                    finalW = Math.round(natW * scale);
                    finalH = Math.round(natH * scale);

                    if (finalH < targetH_byMult) {
                        const needScale = targetH_byMult / finalH;
                        finalW = Math.round(Math.min(finalW * needScale, cw * absoluteMaxMult));
                        finalH = Math.round(finalW * natH / natW);
                    }
                    if (finalW > capWAdj) { finalW = capWAdj; finalH = Math.round(finalW * natH / natW); }
                } else {
                    finalH = Math.min(Math.round(ch * absoluteMaxMult), Math.max(targetH_byMult, Math.round(ch * cfg.minImgMult)));
                    finalW = Math.min(Math.round(cw * absoluteMaxMult), Math.max(Math.round(cw * cfg.minImgMult), Math.round(finalH * (cw / ch))));
                }

                // ensure final dims at least container dims
                if (finalW < cw || finalH < ch) {
                    finalW = Math.max(finalW, cw);
                    finalH = Math.max(finalH, ch);
                }

                img.style.width = finalW + 'px';
                img.style.height = finalH + 'px';
                img._fixedW = finalW;
                img._fixedH = finalH;

                img.style.objectFit = 'cover';
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
                img.style.display = 'block';
                img.style.visibility = 'visible';
                img.style.pointerEvents = 'none';
                img.style.transform = 'none';
                img.style.position = 'absolute';

                const left = Math.round((cw - finalW) / 2);
                const top = Math.round((ch - finalH) / 2);
                img.style.left = left + 'px';
                img.style.top = top + 'px';

                img.style.filter = `brightness(${cfg.dimmer})`;
            };

            if (img.complete) setTimeout(sizeAndFreeze, 0);
            else {
                const onLoad = () => { sizeAndFreeze(); img.removeEventListener('load', onLoad); };
                img.addEventListener('load', onLoad);
                setTimeout(() => { if (img.complete) sizeAndFreeze(); }, 60);
            }
        }
    }

    // ---------- pointer & keyboard bindings ----------
    let lastPointerMoveRaf = null;
    let pendingPointer = null;
    let navRect = nav.getBoundingClientRect();

    function handlePointerMoveEvent(ev) {
        navRect = nav.getBoundingClientRect();
        const rel = Math.max(0, Math.min(1, (ev.clientX - navRect.left) / Math.max(1, navRect.width)));
        const floatIndex = rel * containers.length - 0.5;
        const center = Math.round(floatIndex);
        const pointerFrac = floatIndex - center;
        setTargets(center, pointerFrac);
    }

    nav.addEventListener('pointermove', (ev) => {
        pendingPointer = ev;
        if (lastPointerMoveRaf) return;
        lastPointerMoveRaf = requestAnimationFrame(() => {
            handlePointerMoveEvent(pendingPointer);
            lastPointerMoveRaf = null;
            pendingPointer = null;
        });
    }, { passive: true });

    nav.addEventListener('pointerleave', () => resetTargets());

    containers.forEach((c, idx) => {
        c.addEventListener('pointerenter', () => { c.classList.add('in-focus'); setTargets(idx, 0); });
        c.addEventListener('pointermove', (ev) => {
            const r = c.getBoundingClientRect();
            const local = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)));
            const frac = (local - 0.5) * 2;
            setTargets(idx, frac);
        });
        c.addEventListener('pointerleave', () => { c.classList.remove('in-focus'); resetTargets(); });
        c.addEventListener('focus', () => setTargets(idx, 0));
        c.addEventListener('blur', () => resetTargets());
    });

    // mobile quick-tap loads hi-res image if present
    if (cfg._mobileMode) {
        containers.forEach((el) => {
            el.addEventListener('pointerup', function onTap(e) {
                const img = el.querySelector('.hc-img');
                const hi = el.dataset._hi2x || el.dataset.hi2x;
                if (img && hi) {
                    img.src = hi;
                    delete el.dataset._hi2x;
                }
            }, { passive: true });
        });
    }

    // ---------- resize handling ----------
    let resizeTO = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTO);
        resizeTO = setTimeout(() => {
            initLayout();
            resetTargets();
        }, 120);
    });

    // ---------- start ----------
    initLayout();
    resetTargets();
    if (!rafId) rafId = requestAnimationFrame(rafLoop);
    console.debug('Hover carousel initialized — items:', containers.length);

})();
