/*
Observer and mutation logic for video feature
Extracted from features/video/index.js for better modularity
*/

import { isVideo, getWIN, getDOC } from './internal-utils.js';
import { A, logError } from './constants.js';

// Simplified fallback visibility: immediate evaluation on scroll/resize/orientation
export const VIEW_FALLBACK = (() => {
  const list = new Set();
  function tick(){
    list.forEach(inst => {
      try {
        inst._checkVisibilityFallback();
      } catch(e){
        logError('visibility fallback error', e);
      }
    });
  }
  function add(inst){
    const first = list.size === 0;
    list.add(inst);
    if (first){
      const win = getWIN();
      win.addEventListener('scroll', tick, { passive: true });
      win.addEventListener('resize', tick);
      win.addEventListener('orientationchange', tick);
    }
    tick();
  }
  function remove(inst){
    list.delete(inst);
    if (list.size === 0){
      const win = getWIN();
      win.removeEventListener('scroll', tick);
      win.removeEventListener('resize', tick);
      win.removeEventListener('orientationchange', tick);
    }
  }
  return { add, remove, schedule: tick };
})();

// Mutation observation setup
export function setupMutationObserver(Video, INSTANCES) {
  if (!getDOC()) return null;

  const ATTR_FILTER = [
    A.SRC, A.SRC_MOB, A.PRELOAD, A.RESTART,
    A.LOAD_WHEN, A.PLAY_WHEN, A.PAUSE_WHEN,
    A.PARENT_POINTER, A.THRESHOLD, A.MARGIN, A.MUTED,
    A.ACTION, A.TARGET
  ];

  // Coalesced attribute refreshes per microtask to reduce churn
  const _refreshQueue = new Set();
  let _refreshScheduled = false;
  function scheduleRefresh(v){
    if (!INSTANCES.has(v)) return;
    _refreshQueue.add(v);
    if (_refreshScheduled) return;
    _refreshScheduled = true;
    Promise.resolve().then(() => {
      _refreshScheduled = false;
      const items = Array.from(_refreshQueue);
      _refreshQueue.clear();
      for (let i=0;i<items.length;i++){
        const node = items[i];
        const inst = INSTANCES.get(node);
        if (inst) inst.refresh();
      }
    });
  }

  const mo = new MutationObserver((list) => {
    for (let i=0;i<list.length;i++){
      const m = list[i];
      if (m.type === 'childList'){
        if (m.addedNodes){
          for (let j=0;j<m.addedNodes.length;j++){
            const n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (isVideo(n) && n.hasAttribute(A.SRC)) Video.attach(n);
            else if (n.querySelectorAll){
              const vids = n.querySelectorAll('video['+A.SRC+']');
              for (let k=0;k<vids.length;k++) Video.attach(vids[k]);
            }
          }
        }
        if (m.removedNodes){
          for (let j=0;j<m.removedNodes.length;j++){
            const n = m.removedNodes[j];
            if (n.nodeType !== 1) continue;
            if (isVideo(n)) Video.detach(n);
            else if (n.querySelectorAll){
              const vids = n.querySelectorAll('video');
              for (let k=0;k<vids.length;k++) Video.detach(vids[k]);
            }
          }
        }
      } else if (m.type === 'attributes' && isVideo(m.target) && ATTR_FILTER.includes(m.attributeName)){
        const v = m.target;
        // If not managed yet but now has data-video-src → attach
        if (!INSTANCES.has(v) && v.hasAttribute(A.SRC)) { Video.attach(v); continue; }
        // If managed → refresh (coalesced)
        if (INSTANCES.has(v)) {
          const inst = INSTANCES.get(v);
          // Avoid tearing down when our own code removed source attrs after load
          if ((m.attributeName === A.SRC || m.attributeName === A.SRC_MOB) && inst.loaded) continue;
          scheduleRefresh(v);
        }
      }
    }
  });

  const doc = getDOC();
  mo.observe(doc.documentElement || doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ATTR_FILTER });
  return mo;
}