/*
Control delegation functions for video feature
Extracted from features/video/index.js for better modularity
*/

import { isVideo, getDOC } from './internal-utils.js';

import { A, logError } from './constants.js';

function warn(...args){ logError('controls', args); }

// Delegated controls - these handlers require INSTANCES to be passed
export function onControlClick(e, Video, INSTANCES){
  const target = resolveActionFromEvent(e, INSTANCES);
  if (!target) return;
  const action = String(target.action || '').toLowerCase();
  const vids = target.videos;
  for (let i=0;i<vids.length;i++){
    const v = vids[i];
    if (action === 'play') Video.play(v);
    else if (action === 'pause') Video.pause(v);
    else Video.toggle(v);
  }
  e.preventDefault?.();
  e.stopPropagation?.();
}

export function onControlKeydown(e, Video, INSTANCES){
  const key = e.key || e.code;
  if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
  onControlClick(e, Video, INSTANCES);
}

function resolveActionTarget(start, INSTANCES){
  const doc = getDOC();
  let el = start;
  while (el && el !== doc?.documentElement){
    if (el?.hasAttribute?.(A.ACTION)){
      const action = el.getAttribute(A.ACTION);
      const sel = el.getAttribute(A.TARGET);
      let vids = [];
      if (sel){
        try { vids = Array.from(doc.querySelectorAll(sel)).filter(n => isVideo(n) && INSTANCES.has(n)); } catch { /* POLICY-EXCEPTION: invalid selector; fallback to nearest video */ }
      }
      if (!vids.length){
        // nearest or descendant managed video (instance exists)
        let p = el;
        while (p && p !== doc.documentElement){
          if (isVideo(p) && INSTANCES.has(p)) { vids = [p]; break; }
          const list = p.querySelectorAll?.('video');
          if (list && list.length){
            for (let i=0;i<list.length;i++){
              const node = list[i];
              if (INSTANCES.has(node)) { vids = [node]; break; }
            }
            if (vids.length) break;
          }
          p = p.parentElement;
        }
      }
      if (!vids.length){ warn('[video] control activated but no target video found'); return null; }
      return { action, videos: vids };
    }
    el = el.parentElement;
  }
  return null;
}

function resolveActionFromEvent(e, INSTANCES){
  const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
  if (Array.isArray(path)){
    for (let i=0;i<path.length;i++){
      const n = path[i];
      if (n && n.nodeType === 1 && n.hasAttribute?.(A.ACTION)){
        const res = resolveActionTarget(n, INSTANCES);
        if (res) return res;
      }
    }
  }
  return resolveActionTarget(e.target, INSTANCES);
}

// Setup delegated control listeners
export function setupControlListeners(Video, INSTANCES) {
  const doc = getDOC();
  if (!doc) return undefined; // No-op teardown since no listeners were attached

  // Bound handlers with INSTANCES closed over
  const clickHandler = (e) => onControlClick(e, Video, INSTANCES);
  const keydownHandler = (e) => onControlKeydown(e, Video, INSTANCES);

  doc.addEventListener('click', clickHandler);
  doc.addEventListener('keydown', keydownHandler);

  // Return teardown function
  return () => {
    doc.removeEventListener('click', clickHandler);
    doc.removeEventListener('keydown', keydownHandler);
  };
}