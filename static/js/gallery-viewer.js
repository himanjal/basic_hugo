(function () {
    'use strict';
    const overlay = document.getElementById('viewer-overlay');
    const wrap = document.getElementById('viewer-image-wrap');
    const closeBtn = document.getElementById('viewer-close');
    let scale = 1;
    let minScale = 1;
    let maxScale = 6;
    let pos = { x: 0, y: 0 };
    let start = null;
    let pointers = new Map();
    let baseDistance = 0;
    let baseScale = 1;
    let originalSize = { w: 0, h: 0 };
    function resetState() {
        scale = 1; pos = { x:0, y:0 }; start = null; pointers.clear(); baseDistance=0; baseScale=1; applyTransform();
    }
    function applyTransform() { if (wrap) wrap.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`; }
    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function openViewer(src, alt) {
        if(!wrap || !overlay) return;
        wrap.innerHTML = '';
        const img = new Image();
        img.alt = alt || '';
        img.draggable = false;
        img.decoding = 'async';
        img.onload = function() {
            originalSize.w = img.naturalWidth;
            originalSize.h = img.naturalHeight;
            minScale = 1;
            maxScale = Math.max(2, Math.min(6, Math.max(originalSize.w / 800, originalSize.h / 600)));
        };
        img.src = src;
        wrap.appendChild(img);
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden','false');
        resetState();
        closeBtn && closeBtn.focus();
    }
    function closeViewer() { if(!overlay) return; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); wrap && (wrap.innerHTML=''); resetState(); }
    function onPointerDown(e){ overlay.focus?.(); pointers.set(e.pointerId,e); e.target.setPointerCapture?.(e.pointerId); if(pointers.size===1){ const p = pointers.values().next().value; start = { x: p.clientX - pos.x, y: p.clientY - pos.y }; } else if (pointers.size===2){ const [a,b]=Array.from(pointers.values()); baseDistance = Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); baseScale = scale; } }
    function onPointerMove(e){ if(!pointers.has(e.pointerId)) return; pointers.set(e.pointerId,e); if(pointers.size===1){ const p = pointers.values().next().value; pos.x = p.clientX - start.x; pos.y = p.clientY - start.y; applyTransform(); } else if (pointers.size===2){ const [a,b]=Array.from(pointers.values()); const dist = Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); const delta = dist / (baseDistance || 1); scale = clamp(baseScale * delta, minScale * 0.8, maxScale); applyTransform(); } }
    function onPointerUp(e){ if(pointers.has(e.pointerId)){ try{ e.target.releasePointerCapture?.(e.pointerId); }catch(_){} pointers.delete(e.pointerId);} if(pointers.size<2){ baseDistance=0; baseScale=scale; } if(scale<=1.01){ pos={x:0,y:0}; } else { pos.x = clamp(pos.x, -2000, 2000); pos.y = clamp(pos.y, -2000, 2000); } applyTransform(); }
    function onWheel(e){ if(!overlay || !overlay.classList.contains('open')) return; e.preventDefault(); const delta = -e.deltaY || e.wheelDelta || -e.detail; const zoomFactor = delta > 0 ? 1.12 : 0.88; const rect = wrap.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top; const newScale = clamp(scale * zoomFactor, minScale * 0.5, maxScale); const scaleDelta = newScale / scale; pos.x = (pos.x - cx) * scaleDelta + cx; pos.y = (pos.y - cy) * scaleDelta + cy; scale = newScale; applyTransform(); }
    let lastTap = 0;
    function onDoubleClick(e){ const now = Date.now(); if(now - lastTap < 350){ if(scale <= 1.05){ scale = clamp(2, minScale, maxScale); } else { scale = 1; pos = { x:0,y:0 }; } applyTransform(); } lastTap = now; }
    function onKey(e){ if(overlay && overlay.classList.contains('open')){ if(e.key==='Escape') closeViewer(); if(e.key==='+'||e.key==='='){ scale = clamp(scale * 1.15, minScale, maxScale); applyTransform(); } if(e.key==='-'){ scale = clamp(scale / 1.15, minScale, maxScale); applyTransform(); } const panStep=40; if(e.key==='ArrowLeft'){ pos.x += panStep; applyTransform(); } if(e.key==='ArrowRight'){ pos.x -= panStep; applyTransform(); } if(e.key==='ArrowUp'){ pos.y += panStep; applyTransform(); } if(e.key==='ArrowDown'){ pos.y -= panStep; applyTransform(); } } }
    function initFeaturedClicks(){ const slides = document.querySelectorAll('.featured-scroller .slide'); slides.forEach(slide=>{ let inner = slide.querySelector('.slide-inner'); const img = slide.querySelector('img'); if(!img) return; if(!inner){ inner = document.createElement('div'); inner.className='slide-inner'; slide.insertBefore(inner,img); inner.appendChild(img); } inner.style.cursor='zoom-in'; inner.addEventListener('click', function(ev){ const imgEl = inner.querySelector('img'); const full = imgEl.dataset && imgEl.dataset.full ? imgEl.dataset.full : imgEl.src; openViewer(full, imgEl.alt || ''); }); }); }
    function bindOverlayHandlers(){ if(!overlay) return; overlay.addEventListener('pointerdown', onPointerDown, { passive:false }); overlay.addEventListener('pointermove', onPointerMove, { passive:false }); overlay.addEventListener('pointerup', onPointerUp); overlay.addEventListener('pointercancel', onPointerUp); overlay.addEventListener('wheel', onWheel, { passive:false }); overlay.addEventListener('dblclick', onDoubleClick); overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeViewer(); }); closeBtn && closeBtn.addEventListener('click', closeViewer); document.addEventListener('keydown', onKey); }
    function init(){ if(!overlay || !wrap) return; initFeaturedClicks(); bindOverlayHandlers(); const scroller = document.getElementById('featured-scroller'); if(scroller){ const mo = new MutationObserver(()=>{ initFeaturedClicks(); }); mo.observe(scroller, { childList:true, subtree:true }); } }
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
