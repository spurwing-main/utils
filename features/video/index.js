/*
Attribute-Driven Video Utility (ESM)

Change Log (Summary)
- IO semantics: visibility is computed as `intersectionRatio >= threshold` (or `> 0` when threshold is 0), matching the rAF fallback exactly.
- Pointer robustness: added `pointercancel` handling; maintained a priority window where recent pointer-on can override a same-frame hidden pause.
- MutationObserver: coalesces multiple attribute changes per element into a single refresh within a microtask.
- Network minimization: neutralizes native `src/currentSrc` on managed videos to avoid unintended requests before triggers.
- Hygiene: removed unused helpers and tightened docs to reflect actual behavior and ownership semantics.

Purpose
- Manage <video> exclusively via attributes; JavaScript is required (no PE).
- Desktop-only pointer semantics; do not emulate hover on touch.
- Minimize network requests: defer media selection and loading until a trigger.
- Attach only what's needed (IntersectionObserver, pointer, mutation); tear down promptly.

How It Works (Author Contract)
- A <video> is managed if and only if it has `data-video-src`.
- Sources:
  - `data-video-src="URL"` (required)
  - `data-video-mob-src="URL"` (optional; chosen if `(max-width: 812px)` matches at first load only)
  - `data-video-preload="none|metadata|auto"`
    - If `auto`, it behaves as `metadata` until the first successful play; then upgrades to `auto`.
- Triggers (stackable; tokens are space-separated, case-insensitive; invalid tokens ignored):
  - `data-video-load-when="scroll pointer-on"`
    - `scroll`: load when the element is visible by threshold/margin.
    - `pointer-on`: load on pointer enter (desktop only).
  - `data-video-play-when="visible pointer-on"`
    - `visible`: play/resume when visible by threshold/margin.
    - `pointer-on`: play on pointer enter (desktop only).
  - `data-video-pause-when="hidden pointer-off"`
    - `hidden`: pause when not visible by threshold.
    - `pointer-off`: pause on pointer leave (desktop only).
- Pointer scope:
  - `data-video-parent-pointer=".selector"` (optional) restricts pointer events to a single container.
  - If selector does not match an ancestor, pointer tokens are ignored.
  - If the container covers multiple managed videos, it controls only the first managed descendant.
- Visibility tuning:
  - `data-video-scroll-threshold="0..1 | any | half | full"` → 0/0.5/1; default 0.
  - `data-video-scroll-margin="CSS margin"` (e.g., `300px 0px`); default `300px 0px`.
- Delegated controls (on any element):
  - `data-video-action="play|pause|toggle"`
  - Optional `data-video-target="<css selector>"`; fallback: nearest/descendant managed video.
  - If using non-button elements, authors should add `role="button"` and `tabindex="0"` for keyboard access.

Rules & Notes
- Source selection and application occur on the first load trigger, then `data-video-src`/`data-video-mob-src` are removed and `video.load()` is called.
- Autoplay policy: before any non-gesture play (e.g., visibility), enforce `muted=true` and add `playsinline`/`webkit-playsinline`.
- Within a single attribute, tokens are ORed; triggers are independent across load/play/pause.
- Conflict resolution in the same frame: pause beats play, unless the play is a direct pointer-on gesture.
- Priority window: pointer-on plays can override a simultaneous hidden-pause for PRIORITY_PLAY_MS (120ms).
- IO visibility: considered visible when `intersectionRatio >= threshold` (or `> 0` when threshold is 0), respecting `rootMargin` and matching the fallback.
- IO is created only if scroll/visible/hidden behavior is requested; fallback to rAF-throttled bounding box checks if IO is unavailable.
- MutationObserver watches subtree for additions/removals and only contract attributes; instances attach/detach/refresh accordingly with coalesced refreshes.
- CustomEvents fired on <video>: `video:managed`, `video:loaded`, `video:play-request`, `video:playing`, `video:paused`, `video:error` with `{ trigger: 'visible'|'pointer-on'|'hidden'|'pointer-off'|'manual', reason?: string }`.
- Debug logging (if present): uses `window.__UTILS_DEBUG__?.createLogger('video')`.
- Resizing across the mobile breakpoint after load does nothing; selection is fixed at the first load moment.
- Ownership: determined at attach time by the first managed descendant within a container and persists until detach; DOM order changes after attach do not reassign.

Source Selection & Retry
- On first load, the module caches both primary and mobile source URLs and removes the DOM attributes. Any retry (e.g., primary fails then mobile) uses these cached values; DOM attributes are not consulted.

Fallback Listeners
- Global rAF fallback listeners for scroll/resize/orientation are bound only when the first instance uses the fallback, and are unbound when the last such instance detaches.

Quality Gates
- No media request before any configured trigger.
- No memory leaks after detach/remove; observers only when needed.
- CustomEvents fire once per state change; no flapping near thresholds.
- Works in modern evergreen browsers; rAF fallback when IO is missing.

Fallback Behavior
- When IntersectionObserver is unavailable, visibility checks are throttled to rAF and require two consecutive stable ticks before applying play/pause to avoid flapping.

Acceptance Checklist (manual): see bottom of file for a quick list.
*/

import { isVideo, getDOC } from './internal-utils.js';
import { Instance } from './instance.js';
import { VIEW_FALLBACK, setupMutationObserver } from './observers.js';
import { setupControlListeners } from './controls.js';

import { A } from './constants.js';

// Registry of instances by video
const INSTANCES = new WeakMap();
// Map a pointer container to its bound instance (first managed descendant)
const CONTAINER_CLAIMS = new WeakMap();

// Public API
export const Video = {
  attach(el){ 
    if (!isVideo(el) || !el.hasAttribute(A.SRC)) return null; 
    const prev = INSTANCES.get(el); 
    if (prev){ prev.destroy(); } 
    const inst = new Instance(el, { INSTANCES, CONTAINER_CLAIMS, VIEW_FALLBACK }); 
    INSTANCES.set(el, inst); 
    return inst; 
  },
  detach(el){ 
    const inst = INSTANCES.get(el); 
    if (inst){ inst.destroy(); INSTANCES.delete(el); } 
  },
  refresh(el){ 
    const inst = INSTANCES.get(el); 
    if (inst) inst.refresh(); 
  },
  reloadSources(el){ 
    const inst = INSTANCES.get(el); 
    if (inst) inst.reloadSources(); 
  },
  ensureLoaded(el){
    if (!INSTANCES.has(el)) {
      if (!el.hasAttribute(A.SRC)) {
        // emit error for missing src
        try {
          el.dispatchEvent(new CustomEvent('video:error', { bubbles: false, cancelable: false, detail: { trigger: 'manual', reason: 'missing-src', url: null } }));
        } catch(e){
          console.error(e);
        }
        return;
      }
      Video.attach(el); // if has attribute
    }
    const inst = INSTANCES.get(el);
    if (inst) inst._ensureLoaded('manual');
  },
  play(el){ 
    const inst = INSTANCES.get(el); 
    if (inst) inst._requestPlay('manual'); 
  },
  pause(el){ 
    const inst = INSTANCES.get(el); 
    if (inst) inst._requestPause('manual'); 
  },
  toggle(el){ 
    const inst = INSTANCES.get(el); 
    if (!inst) return; 
    if (inst.v.paused) inst._requestPlay('manual'); 
    else inst._requestPause('manual'); 
  },
  attachAll(root){
    root = root || getDOC();
    if (!root) return [];
    const nodes = root.querySelectorAll?.('video['+A.SRC+']') || [];
    const out = [];
    for (let i=0;i<nodes.length;i++){
      const v = nodes[i];
      out.push(Video.attach(v));
    }
    return out;
  }
};

// Mutation observation
let _booted = false;
function boot(){
  const doc = getDOC();
  if (!doc || _booted) return;
  _booted = true;
  Video.attachAll(doc);

  // Setup mutation observer
  setupMutationObserver(Video, INSTANCES);

  // Setup delegated controls
  setupControlListeners(Video, INSTANCES);
}

export function init(){
  const doc = getDOC();
  if (!doc) return;
  if (doc.readyState === 'complete' || doc.readyState === 'interactive') boot();
  else doc.addEventListener('DOMContentLoaded', boot, { once: true });
}

export default { init, Video };

/*
=== Quick Acceptance Checklist ===

Manual verification:
1. ATTACH: Check `video:managed` fires after `Video.attach(video)`.
2. LOAD: Pointer-on should trigger load (data attrs removed) and play; check events.
3. VISIBILITY: Scroll into view → play; scroll out → pause (with IO or fallback).
4. DETACH: Remove from DOM → subsequent interactions no longer emit events.
5. CONTROLS: data-video-action buttons work via delegation.
6. ERROR: Invalid URLs emit `video:error`; alternates retry once.
7. PRIORITY: pointer-on during hidden should override pause briefly.
8. PRELOAD: auto → metadata until first play, then auto.
9. MUTE: non-gesture plays force muted; pointer gestures try unmuted first.
10. CLEANUP: No lingering listeners after detach/remove.
*/