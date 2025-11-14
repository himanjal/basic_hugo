// static/js/hover-carousal-containers.js
// Full drop-in file: wave carousel with responsive sizing, mobile optimizations,
// defensive image handling, tap-to-load hi-res on mobile, pointermove throttle.

(function () {
    'use strict';

    const nav = document.querySelector('.hover-carousel');
    if (!nav) {
        console.warn('Hover carousel: .hover-carousel not found.');
        return;
    }
    const containers = Array.from(nav.querySelectorAll('.hc-container'));
    if (!containers.length) {
        console.warn('Hover carousel: no .hc-container elements found.');
        return;
    }

    // ---------- helpers to read CSS numeric variables ----------
    function cssNum(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const m = v.match(/^(-?\d+(\.\d+)?)/);
        return m ? parseFloat(m[1]) : fallback;
    }

    // ---------- config (read from CSS vars where possible) ----------
    const cfg = {
        gap: Math.max(cssNum('--gap', 6), cssNum('--min-gap', 1)),
        hoverWidthBoost: cssNum('--hover-width-boost', 1.5),
        hoverHeightBoost: cssNum('--hover-height-boost', 1.18),
        hoverBounce: cssNum('--hover-bounce-px', 22),
        decayFactor: cssNum('--decay-factor', 0.55),
        decaySteps: Math.max(1, Math.floor(cssNum('--decay-steps', 4))),
        dimmer: cssNum('--dimmer', 0.28),
        brightMax: cssNum('--bright-max', 1),
        shadowBase: getComputedStyle(document.documentElement).getPropertyValue('--shadow-base') || '0 8px 28px rgba(0,0,0,0.28)',
        shadowMax: getComputedStyle(document.documentElement).getPropertyValue('--shadow-max') || '0 36px 120px rgba(0,0,0,0.66)',
        minImgMult: cssNum('--min-img-mult', 1.35),
        maxImgMult: cssNum('--max-img-mult', 2.0),
        imgHeightMult: cssNum('--img-height-mult', 1.5),
        hoverPushPx: cssNum('--hover-push-px', 18),
        inertia: cssNum('--inertia', 0.16)
    };

    // ---------- Mobile / small-screen runtime optimizations ----------
    (function applyMobileOptimizations() {
        const smallViewport = (window.innerWidth || document.documentElement.clientWidth) <= 640;
        const coarsePointer = window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);
        const touchDevice = 'ontouchstart' in window || coarsePointer || smallViewport;

        cfg._mobileMode = Boolean(touchDevice);

        if (cfg._mobileMode) {
            // dial down heavy animation effects
            cfg.hoverWidthBoost = Math.min(cfg.hoverWidthBoost, 1.08);
            cfg.hoverHeightBoost = Math.min(cfg.hoverHeightBoost, 1.06);
            cfg.hoverPushPx = 0;            // no horizontal push on touch
            cfg.decaySteps = 1;
            cfg.decayFactor = Math.max(cfg.decayFactor * 0.7, 0.4);
            cfg.inertia = 0.28;            // slightly snappier
            cfg.imgHeightMult = Math.max(cfg.imgHeightMult * 0.85, 1.05);

            // lower image multipliers to prefer smaller assets
            cfg.minImgMult = Math.max(cfg.minImgMult * 0.8, 1.0);
            cfg.maxImgMult = Math.min(cfg.maxImgMult * 0.9, 2.0);

            // reduce shadow intensity
            cfg.shadowBase = '0 6px 20px rgba(0,0,0,0.18)';
            cfg.shadowMax = '0 18px 64px rgba(0,0,0,0.4)';

            // Prevent aggressive preloading of hi-res images: move data-hi2x -> data-_hi2x for later
            containers.forEach((el) => {
                const h = el.dataset.hi2x;
                if (h) { el.dataset._hi2x = h; delete el.dataset.hi2x; }
            });
        }
    })();

    // ---------- per-container state ----------
    const state = containers.map(() => ({
        width: 0, height: 0, translateX: 0, translateY: 0, bright: cfg.dimmer, shadow: cfg.shadowBase,
        targetWidth: 0, targetHeight: 0, targetTranslateX: 0, targetTranslateY: 0, targetBright: cfg.dimmer, targetShadow: cfg.shadowBase
    }));

    // ---------- measurement helpers ----------
    function measure() {
        const rect = nav.getBoundingClientRect();
        const gapPx = cfg.gap;
        const totalGap = gapPx * Math.max(0, containers.length - 1);
        const avail = Math.max(0, Math.round(rect.width - totalGap));
        return { rect, gapPx, totalGap, avail };
    }

    // ---------- responsive baselineSizes (reads CSS responsive vars) ----------
    function baselineSizes() {
        const css = getComputedStyle(document.documentElement);
        const maxW = parseInt(css.getPropertyValue('--carousel-max-width')) || 1300;
        const minW = parseInt(css.getPropertyValue('--carousel-min-width')) || 320;
        const sidePad = parseInt(css.getPropertyValue('--carousel-side-padding')) || 24;
        const aspect = parseFloat(css.getPropertyValue('--carousel-aspect')) || 4;
        const maxH = parseInt(css.getPropertyValue('--carousel-max-height')) || 340;

        const viewportW = Math.max(0, (window.innerWidth || document.documentElement.clientWidth));
        const availW = Math.max(0, viewportW - (sidePad * 2));
        const effectiveWidth = Math.max(minW, Math.min(maxW, availW));

        let effectiveHeight = Math.round(effectiveWidth / aspect);
        if (effectiveHeight > maxH) effectiveHeight = maxH;

        const baseW = Math.max(24, Math.floor(effectiveWidth / Math.max(1, containers.length)));
        const baseH = Math.max(40, Math.round(effectiveHeight));

        nav.style.maxWidth = effectiveWidth + 'px';
        // ensure at least CSS sidePad but keep JS hover pad additive later
        nav.style.paddingInline = sidePad + 'px';
        nav.style.marginInline = 'auto';

        return { baseW, baseH };
    }

    // ---------- shadow interpolation ----------
    function buildInterpolatedShadow(norm) {
        if (norm >= 0.999) return cfg.shadowMax;
        if (norm <= 0.01) return cfg.shadowBase;
        const baseAlpha = 0.28;
        const maxAlpha = 0.66;
        const a = +(baseAlpha + (maxAlpha - baseAlpha) * norm).toFixed(3);
        return `0 16px 48px rgba(0,0,0,${a})`;
    }

    // ---------- computeTargets (includes width growth and horizontal push) ----------
    function computeTargets(centerIndex = -1, pointerFrac = 0) {
        const { baseW, baseH } = baselineSizes();
        const weights = [];

        for (let i = 0; i < containers.length; i++) {
            if (centerIndex < 0) { weights.push(0); continue; }
            const distRaw = Math.abs(i - centerIndex - pointerFrac);
            if (distRaw > cfg.decaySteps) { weights.push(0); continue; }
            const w = Math.pow(cfg.decayFactor, distRaw);
            weights.push(w);
        }
        const maxW = Math.max(...weights, 0.0001);

        const targets = {
            widths: new Array(containers.length).fill(baseW),
            heights: new Array(containers.length).fill(baseH),
            translateXs: new Array(containers.length).fill(0),
            translateYs: new Array(containers.length).fill(0),
            brights: new Array(containers.length).fill(cfg.dimmer),
            shadows: new Array(containers.length).fill(cfg.shadowBase)
        };

        if (centerIndex < 0) return targets;

        for (let i = 0; i < containers.length; i++) {
            const norm = weights[i] / maxW; // 0..1
            const wMul = 1 + (cfg.hoverWidthBoost - 1) * norm;
            targets.widths[i] = Math.max(8, Math.round(baseW * wMul));

            const hMul = 1 + (cfg.hoverHeightBoost - 1) * norm;
            targets.heights[i] = Math.round(baseH * hMul);

            targets.translateYs[i] = -Math.round(cfg.hoverBounce * norm);

            targets.brights[i] = cfg.dimmer + (cfg.brightMax - cfg.dimmer) * norm;
            targets.shadows[i] = buildInterpolatedShadow(norm);

            // horizontal push: left of center push left, right of center push right
            const side = Math.sign(i - centerIndex - pointerFrac);
            const pointerAttenuation = 1 - Math.abs(pointerFrac) * 0.6;
            const push = Math.round(side * cfg.hoverPushPx * norm * pointerAttenuation);
            targets.translateXs[i] = push;
        }

        return targets;
    }

    // ---------- setters that update state.target* and start RAF ----------
    function setTargets(centerIndex = -1, pointerFrac = 0) {
        const t = computeTargets(centerIndex, pointerFrac);
        for (let i = 0; i < containers.length; i++) {
            state[i].targetWidth = t.widths[i] || state[i].width || 0;
            state[i].targetHeight = t.heights[i] || state[i].height || 0;
            state[i].targetTranslateX = t.translateXs[i] || 0;
            state[i].targetTranslateY = t.translateYs[i] || 0;
            state[i].targetBright = t.brights[i] || cfg.dimmer;
            state[i].targetShadow = t.shadows[i] || cfg.shadowBase;
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
            state[i].targetShadow = cfg.shadowBase;
        }
        if (!rafId) rafId = requestAnimationFrame(rafLoop);
    }

    // ---------- defensive image helpers ----------
    function ensureImageVisibility(imgEl, containerEl) {
        if (!imgEl) return;
        try {
            const srcAttr = imgEl.getAttribute('src') || '';
            if (!srcAttr.trim()) {
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
            imgEl.style.opacity = imgEl.style.opacity || '1';
            imgEl.style.position = 'absolute';
            imgEl.style.pointerEvents = 'none';
        } catch (e) {
            console.warn('ensureImageVisibility error', e);
        }
    }

    // ---------- RAF loop (lerp container size + translateX+translateY, center image using fixed size) ----------
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
            const ty = Math.round(s.translateY);
            const br = +(s.bright.toFixed(3));

            if (el._lastW !== w) { el.style.width = w + 'px'; el._lastW = w; }
            if (el._lastH !== h) { el.style.height = h + 'px'; el._lastH = h; }

            const tr = `translateX(${tx}px) translateY(${ty}px)`;
            if (el._lastTr !== tr) { el.style.transform = tr; el._lastTr = tr; }

            if (el._lastShadow !== s.targetShadow) {
                el.style.boxShadow = s.targetShadow;
                el._lastShadow = s.targetShadow;
            }

            const img = el.querySelector('.hc-img');
            if (img) {
                if (img._lastBright !== br) { img.style.filter = `brightness(${br})`; img._lastBright = br; }

                const iw = img._fixedW || img.naturalWidth || parseInt(getComputedStyle(img).width) || Math.round(el.clientWidth * cfg.minImgMult);
                const ih = img._fixedH || img.naturalHeight || parseInt(getComputedStyle(img).height) || Math.round(el.clientHeight * cfg.minImgMult);

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
                Math.abs(s.translateY - s.targetTranslateY) > 0.5 ||
                Math.abs(s.bright - s.targetBright) > 0.005) {
                active = true;
            }
        }

        if (active) rafId = requestAnimationFrame(rafLoop);
        else rafId = null;
    }

    // ---------- initLayout: sizes images once, freezes dimensions, computes nav padding to allow growth ----------
    function initLayout() {
        // measurement & nav padding to allow expansion
        const b = baselineSizes();
        const baseW = b.baseW;
        // estimate maximum extra width for hovered tile
        const maxHoverBoost = Math.max(1, cfg.hoverWidthBoost || 1.5);
        const perTileExtra = Math.ceil(baseW * (maxHoverBoost - 1));
        const neighborAllowance = Math.ceil(perTileExtra * Math.min(cfg.decaySteps || 4, 3) * 0.6);
        const pad = Math.ceil(perTileExtra + neighborAllowance);

        // add pad to existing nav padding (baselineSizes set css side pad)
        const existingPad = parseInt(getComputedStyle(nav).paddingInline) || 0;
        nav.style.paddingInline = (existingPad + pad) + 'px';
        nav.style.justifyContent = 'center';

        const minMult = cssNum('--min-img-mult', cfg.minImgMult);
        const maxMultCfg = cssNum('--max-img-mult', cfg.maxImgMult);
        const imgHeightMult = cssNum('--img-height-mult', cfg.imgHeightMult);
        const safety = 1;
        const absoluteMaxMult = 4.0;

        // baseline sizes (recompute after padding)
        const b2 = baselineSizes();

        for (let i = 0; i < containers.length; i++) {
            const el = containers[i];
            const img = el.querySelector('.hc-img');

            // initialize container state & geometry
            state[i].width = b2.baseW;
            state[i].height = b2.baseH;
            state[i].bright = cfg.dimmer;
            el.style.width = b2.baseW + 'px';
            el.style.height = b2.baseH + 'px';
            el.style.transform = 'translateX(0px) translateY(0px)';
            el.style.boxShadow = cfg.shadowBase;

            if (!img) continue;

            ensureImageVisibility(img, el);

            const sizeAndFreeze = () => {
                const cw = Math.max(1, el.clientWidth);
                const ch = Math.max(1, el.clientHeight);

                const targetH_byMult = Math.round(ch * imgHeightMult);
                const minW = Math.round(cw * minMult);
                const minH = Math.round(ch * minMult);
                let capW = Math.round(cw * maxMultCfg);
                let capH = Math.round(ch * maxMultCfg);

                const natW = img.naturalWidth || 0;
                const natH = img.naturalHeight || 0;
                let finalW, finalH;

                if (natW && natH) {
                    // compute needed width to meet targetH
                    const neededWidthForTargetHeight = Math.round(targetH_byMult * (natW / natH));
                    const neededMaxMult = neededWidthForTargetHeight / cw;
                    let effectiveMaxMult = Math.max(maxMultCfg, neededMaxMult);
                    effectiveMaxMult = Math.min(effectiveMaxMult, absoluteMaxMult);

                    capW = Math.round(cw * effectiveMaxMult);
                    capH = Math.round(ch * effectiveMaxMult);

                    const scaleW = minW / natW;
                    const scaleH = minH / natH;
                    let scale = Math.max(scaleW, scaleH, 1);

                    const maxAllowedScale = Math.max(1, Math.min((capW / natW) || Infinity, (capH / natH) || Infinity));
                    if (scale > maxAllowedScale) scale = maxAllowedScale;

                    finalW = Math.round(natW * scale);
                    finalH = Math.round(natH * scale);

                    if (finalH < targetH_byMult) {
                        const needScale = targetH_byMult / finalH;
                        let scaledW = Math.round(finalW * needScale);
                        let scaledH = Math.round(finalH * needScale);
                        const absoluteCapW = Math.round(cw * absoluteMaxMult);
                        const absoluteCapH = Math.round(ch * absoluteMaxMult);
                        if (scaledW > absoluteCapW) { scaledW = absoluteCapW; scaledH = Math.round(scaledW * natH / natW); }
                        if (scaledH > absoluteCapH) { scaledH = absoluteCapH; scaledW = Math.round(scaledH * natW / natH); }
                        finalW = scaledW; finalH = scaledH;
                    }

                    if (finalW > capW) { finalW = capW; finalH = Math.round(finalW * natH / natW); }
                    if (finalH > capH) { finalH = capH; finalW = Math.round(finalH * natW / natH); }
                } else {
                    finalH = Math.min(Math.round(ch * absoluteMaxMult), Math.max(targetH_byMult, Math.round(ch * minMult)));
                    finalW = Math.min(Math.round(cw * absoluteMaxMult), Math.max(Math.round(cw * minMult), Math.round(finalH * (cw / ch))));
                }

                // ---------- START: enforce max aspect ratio (height ÷ width) ----------
                // read desired max aspect ratio from CSS (height / width)
                const maxAspect = cssNum('--hc-max-aspect', 3); // fallback 3:1

                if (finalW > 0) {
                    const currentAspect = finalH / finalW;
                    if (currentAspect > maxAspect) {
                        // Try reducing finalH to match maxAspect while still covering container height if possible
                        const reducedH = Math.round(finalW * maxAspect);

                        if (reducedH >= ch + safety) {
                            // safe to reduce height and still cover the container vertically
                            finalH = reducedH;
                        } else {
                            // reducing would uncover container; compute the width required for target cover respecting maxAspect:
                            // neededWidth such that neededWidth * maxAspect >= container height
                            const neededWidth = Math.ceil((ch + safety) / maxAspect);
                            // cap the neededWidth by absoluteMaxMult limit
                            const allowedMaxW = Math.round(cw * absoluteMaxMult);
                            finalW = Math.min( Math.max(finalW, neededWidth), allowedMaxW );
                            finalH = Math.round(finalW * maxAspect);
                        }
                    }
                }
                // ---------- END: enforce max aspect ratio ----------

                // FINAL COVER clamp: ensure final dims at least container dims + safety (preserve aspect)
                if (finalW < cw + safety || finalH < ch + safety) {
                    if (natW && natH) {
                        const needScaleW = (cw + safety) / finalW;
                        const needScaleH = (ch + safety) / finalH;
                        const needScale = Math.max(needScaleW, needScaleH, 1);
                        let scaledW = Math.round(finalW * needScale);
                        let scaledH = Math.round(finalH * needScale);
                        const absoluteCapW = Math.round(cw * absoluteMaxMult);
                        const absoluteCapH = Math.round(ch * absoluteMaxMult);
                        if (scaledW > absoluteCapW) { scaledW = absoluteCapW; scaledH = Math.round(scaledW * natH / natW); }
                        if (scaledH > absoluteCapH) { scaledH = absoluteCapH; scaledW = Math.round(scaledH * natW / natH); }
                        finalW = scaledW; finalH = scaledH;
                    } else {
                        finalW = Math.max(finalW, cw + safety);
                        finalH = Math.max(finalH, ch + safety);
                    }
                }

                // freeze and defensively apply inline styles
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

            if (img.complete) {
                setTimeout(sizeAndFreeze, 0);
            } else {
                const onLoad = () => { sizeAndFreeze(); img.removeEventListener('load', onLoad); };
                img.addEventListener('load', onLoad);
                setTimeout(() => { if (img.complete) sizeAndFreeze(); }, 60);
            }
        }
    }

    // ---------- pointer and keyboard bindings (with rAF throttle for pointermove) ----------
    let lastPointerMoveRaf = null;
    let pendingPointer = null;
    let navRect = nav.getBoundingClientRect();

    function handlePointerMoveEvent(ev) {
        navRect = nav.getBoundingClientRect();
        const rel = Math.max(0, Math.min(1, (ev.clientX - navRect.left) / navRect.width));
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
            const local = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
            const frac = (local - 0.5) * 2;
            setTargets(idx, frac);
        });
        c.addEventListener('pointerleave', () => { c.classList.remove('in-focus'); resetTargets(); });
        c.addEventListener('focus', () => setTargets(idx, 0));
        c.addEventListener('blur', () => resetTargets());
    });

    // Tap-to-load hi-res on mobile (only if mobileMode moved data-hi2x -> data-_hi2x)
    if (cfg._mobileMode) {
        containers.forEach((el) => {
            el.addEventListener('pointerup', function onTap(e) {
                // quick tap: swap to hi-res if available in dataset._hi2x
                const img = el.querySelector('.hc-img');
                const hi = el.dataset._hi2x || el.dataset.hi2x;
                if (img && hi) {
                    img.src = hi;
                    // optionally set srcset for higher DPRs: (commented, can be enabled)
                    // img.srcset = `${hi} 2x`;
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
            navRect = nav.getBoundingClientRect();
            initLayout();
            resetTargets();
        }, 120);
    });

    // ---------- initialize ----------
    initLayout();
    resetTargets();
    if (!rafId) rafId = requestAnimationFrame(rafLoop);
    console.debug('Hover carousel (full updated JS) initialized — items:', containers.length);

})();
