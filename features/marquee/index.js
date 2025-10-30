const DBG = typeof window !== "undefined"
  ? window.__UTILS_DEBUG__?.createLogger?.("marquee")
  : undefined;
let initialized = false;
const instances = new Map();

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
  try {
    const fromAttr = container?.getAttribute?.("data-marquee-gap");
    const parsed = Number.parseFloat(fromAttr);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  } catch (_) {}

  if (!container || typeof window === "undefined" || !window.getComputedStyle) return 0;
  const style = window.getComputedStyle(container);
  const raw = style.columnGap !== "normal" ? style.columnGap : style.gap;
  const val = Number.parseFloat(raw);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

function cleanClone(node) {
  // Only decorate element nodes; text/comments don't support attributes
  if (node && node.nodeType === 1) {
    try { node.setAttribute("data-marquee-clone", "true"); } catch (_) {}
    try { node.setAttribute("aria-hidden", "true"); } catch (_) {}
    try { node.setAttribute("inert", ""); } catch (_) {}
    try { node.removeAttribute("id"); } catch (_) {}
  }
}

function removeClones(state) {
  for (const clone of state.clones) clone.remove();
  state.clones = [];
}

function addClones(state) {
  if (!state.originals.length) return;
  const containerW = state.container.clientWidth || 0;
  // Ensure coverage: container width plus at least one extra cycle for seamless wrapping.
  let needed = Math.ceil((containerW + (state.loopWidth || 0)) / (state.loopWidth || 1)) + 1;
  if (!Number.isFinite(needed) || needed < 1) needed = 3; // Fallback in non-layout environments
  const frag = document.createDocumentFragment();

  for (let i = 0; i < needed; i++) {
    for (const node of state.originals) {
      const clone = node.cloneNode(true);
      cleanClone(clone);
      frag.append(clone);
      state.clones.push(clone);
    }
  }
  state.wrapper.append(frag);
}

function refresh(state) {
  removeClones(state);
  const prevLoop = state.loopWidth || 1;
  const progress = state.offset / prevLoop;

  // Resolve host-defined cycle gap and apply it to the flex wrapper (between cycles).
  const gap = getCycleGap(state.container);
  if (gap > 0) {
    state.wrapper.style.columnGap = `${gap}px`;
    state.wrapper.style.gap = `${gap}px`;
  } else {
    state.wrapper.style.columnGap = "";
    state.wrapper.style.gap = "";
  }

  // loopWidth is measured from the original content width plus one cycle gap.
  // This is independent of the container width to prevent jitter on container resizes.
  state.loopWidth = state.wrapper.scrollWidth + gap;
  state.speed = readSpeed(state.container);
  state.pixelsPerMs = (state.speed * 60) / 1000;
  state.offset = progress * state.loopWidth;

  addClones(state);
  state.wrapper.style.transform = `translate3d(-${state.offset}px,0,0)`;
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

    state.offset += state.pixelsPerMs * delta;
    if (state.offset >= state.loopWidth) {
      state.offset %= state.loopWidth;
    }

    state.wrapper.style.transform = `translate3d(-${state.offset}px,0,0)`;
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
    "display:flex;white-space:nowrap;will-change:transform;grid-area:1/1;width:max-content;overflow:visible;flex-shrink:0;contain:layout style;pointer-events:none";

  const originals = Array.from(container.childNodes);
  for (const node of originals) wrapper.append(node);

  const gap = getCycleGap(container);
  if (gap > 0) {
    wrapper.style.columnGap = `${gap}px`;
    wrapper.style.gap = `${gap}px`;
  }

  const speed = readSpeed(container);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const state = {
    container,
    wrapper,
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
  container.append(wrapper);

  // Remeasure on font load and image load events
  try {
    const docFonts = document?.fonts;
    if (docFonts?.ready && typeof docFonts.ready.then === "function") {
      docFonts.ready.then(() => scheduleRefresh(state));
    }
  } catch (_) {}

  try {
    const imgs = wrapper.querySelectorAll?.("img");
    for (const img of imgs || []) {
      if (!img.complete) {
        img.addEventListener?.("load", () => scheduleRefresh(state), { once: true });
        img.addEventListener?.("error", () => scheduleRefresh(state), { once: true });
      }
    }
  } catch (_) {}

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
  mutObs.observe(container, { childList: true, subtree: false });
  state.mutationObserver = mutObs;
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => {
      state.reducedMotion = query.matches;
      if (state.reducedMotion) {
        stopAnimation(state);
        state.offset = 0;
        state.wrapper.style.transform = "translateX(0)";
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
    try {
      DBG?.warn("invalid container");
    } catch (_) {}
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
    try {
      DBG?.error("attach failed", error);
    } catch (_) {}
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
