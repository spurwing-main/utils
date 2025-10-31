const DBG = typeof window !== "undefined"
  ? window.__UTILS_DEBUG__?.createLogger?.("marquee")
  : undefined;
let initialized = false;
const instances = new Map();

// Centralized guard for operations that may throw.
function safe(label, fn) {
  try {
    fn();
  } catch (error) {
    // POLICY: guard non-critical failures with debug logging only
    DBG?.warn?.(label, error);
  }
}

function readSpeed(el) {
  const raw = el.getAttribute("data-marquee-speed");
  const val = Number.parseFloat(raw);
  return Number.isFinite(val) && val > 0 ? val : 1;
}

function getCycleGap(container) {
  // Resolve the desired horizontal gap between repeated cycles.
  // Priority:
  // 1) data-marquee-gap (number, px)
  // 2) computed gap/column-gap from the marquee container (so authors can style the host)
  // 3) 0 as a safe default
  const fromAttr = container?.getAttribute?.("data-marquee-gap");
  const parsed = Number.parseFloat(fromAttr);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;

  if (!container || typeof window === "undefined" || !window.getComputedStyle) return 0;
  const style = window.getComputedStyle(container);
  const raw = style.columnGap !== "normal" ? style.columnGap : style.gap;
  const val = Number.parseFloat(raw);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

function cleanClone(node) {
  // Only decorate element nodes; text/comments don't support attributes
  if (node && node.nodeType === 1) {
    safe("clone: set data-marquee-clone", () => node.setAttribute("data-marquee-clone", "true"));
    safe("clone: set aria-hidden", () => node.setAttribute("aria-hidden", "true"));
    safe("clone: set inert", () => node.setAttribute("inert", ""));
    safe("clone: remove id", () => node.removeAttribute("id"));
  }
}

function removeClones(state) {
  for (const clone of state.clones) clone.remove();
  state.clones = [];
}

function addClones(state) {
  if (!state.originals.length || !state.cycle) return;
  const containerW = state.container.clientWidth || 0;
  // Ensure enough whole cycles to cover viewport in both directions
  let needed = Math.ceil((containerW / (state.loopWidth || 1))) + 2;
  if (!Number.isFinite(needed) || needed < 3) needed = 3;

  const fragBefore = document.createDocumentFragment();
  const fragAfter = document.createDocumentFragment();

  // Prepend exactly one full cycle to avoid left-edge disappearance
  const before = state.cycle.cloneNode(true);
  cleanClone(before);
  fragBefore.append(before);
  state.clones.push(before);

  // Append multiple full cycles based on viewport coverage
  for (let i = 0; i < needed; i++) {
    const after = state.cycle.cloneNode(true);
    cleanClone(after);
    fragAfter.append(after);
    state.clones.push(after);
  }

  state.wrapper.prepend(fragBefore);
  state.wrapper.append(fragAfter);
}

function refresh(state) {
  removeClones(state);
  const prevLoop = state.loopWidth || 1;
  const progress = state.offset / prevLoop;

  // Resolve host-defined cycle gap and apply it to the flex wrapper (between cycles).
  const gap = getCycleGap(state.container);
  // Snap gap to whole pixels to avoid fractional cycle widths that cause visible seams
  const gapPx = gap > 0 ? Math.round(gap) : 0;
  if (gapPx > 0) {
    state.wrapper.style.columnGap = `${gapPx}px`;
    state.wrapper.style.gap = `${gapPx}px`;
  } else {
    state.wrapper.style.columnGap = "";
    state.wrapper.style.gap = "";
  }

  // loopWidth equals one full cycle width (originals only) plus one inter-cycle gap.
  // Measure the cycle element directly to avoid counting clones.
  let cycleWidth = 0;
  try {
    const rect = state.cycle?.getBoundingClientRect?.();
    if (rect && Number.isFinite(rect.width)) cycleWidth = rect.width;
  } catch (error) {
    DBG?.warn?.("refresh: measure cycle failed", error);
  }
  const fallbackCycle = state.cycle?.scrollWidth || 0;
  const resolvedCycle = Math.max(fallbackCycle, Math.ceil(cycleWidth));
  state.loopWidth = Math.max(1, Math.round(resolvedCycle + gapPx));
  state.speed = readSpeed(state.container);
  state.pixelsPerMs = (state.speed * 60) / 1000;

  // Normalize progress to avoid jumps during refresh
  const normalizedProgress = progress - Math.floor(progress);
  // Start offset at loopWidth (past the prepended cycle clone, aligned to originals)
  state.offset = Math.round(normalizedProgress * state.loopWidth + state.loopWidth);

  addClones(state);
  const roundedOffset = Math.round(state.offset);
  const dir = state.direction;
  const sign = dir === "right" ? 1 : -1;
  state.wrapper.style.transform = `translate3d(${sign * roundedOffset}px,0,0)`;
}

function startAnimation(state) {
  if (state.loopWidth <= 1 || state.reducedMotion || state.animationId !== null) {
    state.offset = 0;
    state.wrapper.style.transform = "translate3d(0,0,0)";
    return;
  }

  const step = (timestamp) => {
    if (state.animationId === null) return;
    if (!state.container.isConnected) {
      detach(state.container);
      return;
    }

    if (state.lastTick === null) {
      state.lastTick = timestamp;
      state.animationId = requestAnimationFrame(step);
      return;
    }

    const delta = timestamp - state.lastTick;
    state.lastTick = timestamp;

    if (delta > 1000) {
      state.animationId = requestAnimationFrame(step);
      return;
    }

    if (!state.paused) {
      state.offset += state.pixelsPerMs * delta;
    }

    // Wrap when offset exceeds 2*loopWidth (we start at loopWidth, so we wrap back to loopWidth)
    while (state.offset >= state.loopWidth * 2) {
      state.offset -= state.loopWidth;
    }

    // Round to nearest pixel to prevent sub-pixel jitter
    const roundedOffset = Math.round(state.offset);
    const dir = state.direction;
    const sign = dir === "right" ? 1 : -1;
    state.wrapper.style.transform = `translate3d(${sign * roundedOffset}px,0,0)`;
    const raf = (typeof window !== "undefined" && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : (cb) => setTimeout(() => cb(Date.now()), 0);
    state.animationId = raf(step);
  };

  const raf = (typeof window !== "undefined" && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : (cb) => setTimeout(() => cb(Date.now()), 0);
  state.animationId = raf(step);
}

function stopAnimation(state) {
  if (state.animationId !== null) {
    if (typeof window !== "undefined" && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(state.animationId);
    }
    state.animationId = null;
    state.lastTick = null;
  }
}

function scheduleRefresh(state) {
  if (state.refreshPending) return;
  state.refreshPending = true;
  queueMicrotask(() => {
    if (!instances.has(state.container)) {
      state.refreshPending = false;
      return;
    }
    const wasRunning = state.animationId !== null;
    stopAnimation(state);
    refresh(state);
    if (wasRunning) startAnimation(state);
    state.refreshPending = false;
  });
}

function createInstance(container) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;white-space:nowrap;transform:translateZ(0);backface-visibility:hidden;perspective:1000px;will-change:transform;grid-area:1/1;width:max-content;overflow:visible;flex-shrink:0;contain:layout style;pointer-events:none";

  // Build a single cycle element that wraps all original nodes.
  const cycle = document.createElement("div");
  cycle.setAttribute("data-marquee-cycle", "true");
  cycle.style.cssText = "display:flex;white-space:nowrap;width:max-content;flex-shrink:0";
  const originals = Array.from(container.childNodes);
  for (const node of originals) cycle.append(node);
  wrapper.append(cycle);

  const gap = getCycleGap(container);
  if (gap > 0) {
    wrapper.style.columnGap = `${gap}px`;
    wrapper.style.gap = `${gap}px`;
  }

  const speed = readSpeed(container);
  const directionAttr = (container.getAttribute("data-marquee-direction") || "left").toLowerCase();
  const direction = directionAttr === "right" ? "right" : "left";
  const pauseOnHover = container.hasAttribute("data-marquee-pause-on-hover");
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const state = {
    container,
    wrapper,
    cycle,
    originals,
    clones: [],
    speed,
    pixelsPerMs: (speed * 60) / 1000,
    offset: 0,
    loopWidth: 0,
    animationId: null,
    lastTick: null,
    reducedMotion,
    refreshPending: false,
    paused: false,
    direction,
    pauseOnHover,
    resizeObserver: null,
    lastObservedWidth: container.clientWidth || 0,
    lastObservedHeight: container.clientHeight || 0,
    motionQuery: null,
    motionHandler: null,
    mutationObserver: null,
    originalOverflow: container.style.overflow,
    originalOverflowX: container.style.overflowX,
    originalDisplay: container.style.display,
    originalContain: container.style.contain,
    originalPointerEvents: container.style.pointerEvents,
  };

  container.style.overflow = "hidden";
  container.style.overflowX = "hidden";
  container.style.display = "grid";
  container.style.gridTemplateColumns = "100%";
  container.style.contain = "layout style paint";
  container.style.pointerEvents = "none";
  container.style.transform = "translateZ(0)"; // Force GPU acceleration on container
  container.append(wrapper);

  // Optional pause-on-hover behavior
  if (pauseOnHover) {
    container.addEventListener("mouseenter", () => { state.paused = true; }, { passive: true });
    container.addEventListener("mouseleave", () => { state.paused = false; }, { passive: true });
  }

  // Remeasure on font load and image load events
  try {
    const docFonts = document?.fonts;
    if (docFonts?.ready && typeof docFonts.ready.then === "function") {
      docFonts.ready.then(() => scheduleRefresh(state));
    }
  } catch (error) {
    // POLICY: fonts API unsupported; skip font-based refresh hook
    DBG?.info?.("fonts.ready not available", error);
  }

  try {
    const imgs = wrapper.querySelectorAll?.("img");
    for (const img of imgs || []) {
      if (!img.complete) {
        img.addEventListener?.("load", () => scheduleRefresh(state), { once: true });
        img.addEventListener?.("error", () => scheduleRefresh(state), { once: true });
      }
    }
  } catch (error) {
    // POLICY: image hooks not critical; marquee will still refresh via observers
    DBG?.warn?.("image listeners failed", error);
  }

  if (typeof window !== "undefined" && window.ResizeObserver) {
    state.resizeObserver = new window.ResizeObserver((entries) => {
      try {
        const entry = entries?.[0];
        const rect = entry?.contentRect;
        const nextWidth = Math.round((rect?.width ?? container.clientWidth) || 0);
        const nextHeight = Math.round((rect?.height ?? container.clientHeight) || 0);
        const widthChanged = Math.abs(nextWidth - state.lastObservedWidth) >= 1; // react to width changes (includes zoom)
        const heightChanged = Math.abs(nextHeight - state.lastObservedHeight) >= 8; // ignore tiny height jitter
        if (widthChanged || heightChanged) {
          state.lastObservedWidth = nextWidth;
          state.lastObservedHeight = nextHeight;
          scheduleRefresh(state);
        }
      } catch (_) {
        scheduleRefresh(state);
      }
    });
    state.resizeObserver.observe(container);
  }

  const Obs = (typeof window !== "undefined" && window.MutationObserver) ? window.MutationObserver : null;
  if (Obs) {
    const mutObs = new Obs((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (!node.hasAttribute?.("data-marquee-clone")) {
            scheduleRefresh(state);
            return;
          }
        }
        for (const node of mut.removedNodes) {
          if (state.originals.includes(node)) {
            scheduleRefresh(state);
            return;
          }
        }
      }
    });
    // Observe direct children of the cycle to react to content edits.
    mutObs.observe(state.cycle, { childList: true, subtree: false });
    state.mutationObserver = mutObs;
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => {
      state.reducedMotion = query.matches;
      if (state.reducedMotion) {
        stopAnimation(state);
        state.offset = 0;
        state.wrapper.style.transform = "translate3d(0,0,0)";
      } else {
        scheduleRefresh(state);
        startAnimation(state);
      }
    };
    query.addEventListener("change", handler);
    state.motionQuery = query;
    state.motionHandler = handler;
  }

  const raf = (typeof window !== "undefined" && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : (cb) => setTimeout(() => cb(Date.now()), 0);
  raf(() => {
    raf(() => {
      if (!instances.has(state.container)) return;
      refresh(state);
      startAnimation(state);
    });
  });

  return state;
}

function attach(container) {
  if (container?.nodeType !== 1) {
    DBG?.warn?.("invalid container");
    return;
  }

  const existing = instances.get(container);
  if (existing) {
    existing.speed = readSpeed(container);
    existing.pixelsPerMs = (existing.speed * 60) / 1000;
    scheduleRefresh(existing);
    return;
  }

  try {
    const state = createInstance(container);
    instances.set(container, state);
  } catch (error) {
    DBG?.error?.("attach failed", error);
  }
}

function detach(container) {
  const state = instances.get(container);
  if (!state) return;

  stopAnimation(state);

  if (state.resizeObserver) {
    state.resizeObserver.disconnect();
    state.resizeObserver = null;
  }

  if (state.motionQuery && state.motionHandler) {
    state.motionQuery.removeEventListener("change", state.motionHandler);
    state.motionQuery = null;
    state.motionHandler = null;
  }

  if (state.mutationObserver) {
    state.mutationObserver.disconnect();
    state.mutationObserver = null;
  }

  removeClones(state);

  for (const node of state.originals) {
    state.container.append(node);
  }

  state.wrapper.remove();

  state.container.style.overflow = state.originalOverflow;
  state.container.style.overflowX = state.originalOverflowX;
  state.container.style.display = state.originalDisplay;
  state.container.style.contain = state.originalContain;
  state.container.style.pointerEvents = state.originalPointerEvents;
  state.container.style.gridTemplateColumns = "";

  instances.delete(container);
}

function rescan(root = document) {
  if (!root?.querySelectorAll) return;

  const found = new Set(root.querySelectorAll("[data-marquee]"));
  if (root !== document && root?.nodeType === 1 && root.hasAttribute?.("data-marquee")) {
    found.add(root);
  }

  for (const element of Array.from(instances.keys())) {
    if (!element.isConnected) {
      detach(element);
      continue;
    }

    const withinScope = root === document ? true : root.contains(element);
    if (withinScope && !found.has(element)) {
      detach(element);
    }
  }

  for (const element of found) {
    attach(element);
  }
}

export const Marquee = { attach, detach, rescan };

export function init() {
  if (initialized) return;
  initialized = true;
  if (typeof window !== "undefined") window.Marquee = Marquee;
  Marquee.rescan();
}

export default { init, Marquee };
