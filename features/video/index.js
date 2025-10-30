/* Video Feature – see README.md for usage and AGENTS.md for rules. */

import { isVideo, getDocument } from "./internal/internal-utils.js";
import { Instance } from "./internal/instance.js";
import { setupMutationObserver } from "./internal/observers.js";
import { setupControlListeners } from "./internal/controls.js";

import { attr } from "./internal/constants.js";

// Registry of instances by video
const INSTANCES = new WeakMap();
// Map a pointer container to its bound instance (first managed descendant)
const CONTAINER_CLAIMS = new WeakMap();

// Public API
export const Video = {
  attach(el) {
    if (!isVideo(el) || !el.hasAttribute(attr.src)) return null;
    const prev = INSTANCES.get(el);
    if (prev) {
      prev.destroy();
    }
    const inst = new Instance(el, { INSTANCES, CONTAINER_CLAIMS });
    INSTANCES.set(el, inst);
    return inst;
  },
  detach(el) {
    const inst = INSTANCES.get(el);
    if (inst) {
      inst.destroy();
      INSTANCES.delete(el);
    }
  },
  refresh(el) {
    const inst = INSTANCES.get(el);
    if (inst) inst.refresh();
  },
  reloadSources(el) {
    const inst = INSTANCES.get(el);
    if (inst) inst.reloadSources();
  },
  ensureLoaded(el) {
    if (!INSTANCES.has(el)) {
      if (!el.hasAttribute(attr.src)) {
        // emit error for missing src
        try {
          el.dispatchEvent(
            new CustomEvent("video:error", {
              bubbles: false,
              cancelable: false,
              detail: { trigger: "manual", reason: "missing-src", url: null },
            }),
          );
        } catch (e) {
          console.error(e);
        }
        return;
      }
      Video.attach(el); // if has attribute
    }
    const inst = INSTANCES.get(el);
    if (inst) inst._ensureLoaded("manual");
  },
  play(el) {
    const inst = INSTANCES.get(el);
    if (inst) inst._requestPlay("manual");
  },
  pause(el) {
    const inst = INSTANCES.get(el);
    if (inst) inst._requestPause("manual");
  },
  toggle(el) {
    const inst = INSTANCES.get(el);
    if (!inst) return;
    if (inst.v.paused) inst._requestPlay("manual");
    else inst._requestPause("manual");
  },
  attachAll(root) {
    const ctx = root || getDocument();
    if (!ctx) return [];
    const nodes = ctx.querySelectorAll?.(`video[${attr.src}]`) || [];
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
      const v = nodes[i];
      out.push(Video.attach(v));
    }
    return out;
  },
};

// Mutation observation
let _booted = false;
let _initScheduled = false;
let _controlTeardown = null;
function boot() {
  const doc = getDocument();
  if (!doc || _booted) return;
  _booted = true;
  Video.attachAll(doc);

  // Setup mutation observer
  setupMutationObserver(Video, INSTANCES);

  // Setup delegated controls (store teardown for cleanup)
  _controlTeardown = setupControlListeners(Video, INSTANCES);
}

export function init() {
  const doc = getDocument();
  if (!doc) return;
  if (_booted) return; // already initialized
  if (_initScheduled) return; // idempotent: do not schedule multiple listeners
  _initScheduled = true;
  if (doc.readyState === "complete" || doc.readyState === "interactive") {
    boot();
  } else {
    doc.addEventListener("DOMContentLoaded", boot, { once: true });
  }
}

export default { init, Video };

/*
=== Quick Acceptance Checklist ===

Manual verification:
1. ATTACH: Check `video:managed` fires after `Video.attach(video)`.
2. LOAD: Pointer-on should trigger load (data attrs removed) and play; check events.
3. VISIBILITY: Scroll into view → play; scroll out → pause (IntersectionObserver).
4. DETACH: Remove from DOM → subsequent interactions no longer emit events.
5. CONTROLS: data-video-action buttons work via delegation.
6. ERROR: Invalid URLs emit `video:error`; alternates retry once.
7. PRIORITY: pointer-on during hidden should override pause briefly.
8. PRELOAD: auto → metadata until first play, then auto.
9. MUTE: non-gesture plays force muted; pointer gestures try unmuted first.
10. CLEANUP: No lingering listeners after detach/remove.
*/
