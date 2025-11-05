// marquee - Web Animations API based infinite marquee
// Based on reference implementation with smooth linear animation

const instances = new Map();
let initialized = false;

function genId() {
  return `mq-${Math.random().toString(36).slice(2, 10)}`;
}

function readSettings(el) {
  const dir = (el.getAttribute("data-marquee-direction") || "left").toLowerCase();
  const speedRaw = el.getAttribute("data-marquee-speed");
  const parsed = Number.parseFloat(speedRaw);
  const speed = Number.isFinite(parsed) && parsed > 0 ? parsed : 100; // px/s
  const pauseOnHover = el.hasAttribute("data-marquee-pause-on-hover");
  return {
    direction: dir === "right" ? -1 : 1,
    speed,
    pauseOnHover
  };
}

function queryTargets(root) {
  const set = new Set();
  for (const el of root.querySelectorAll?.("[data-marquee]") || []) set.add(el);
  if (root !== document && root?.nodeType === 1 && root.hasAttribute?.("data-marquee")) {
    set.add(root);
  }
  return set;
}

function deepRemoveIds(el) {
  if (el.nodeType !== 1) return;
  el.removeAttribute("id");
  for (const n of el.children) deepRemoveIds(n);
}

function pxPerSecond(width, speed) {
  return (width / speed) * 1000;
}

function createStructure(container) {
  const originals = Array.from(container.childNodes);

  // Wrapper that will be animated
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    flexWrap: "nowrap",
    width: "max-content",
    gap: "inherit",
    willChange: "transform",
    transform: "translateX(0px)",
  });

  // Original content container
  const originalChild = document.createElement("div");
  Object.assign(originalChild.style, {
    display: "flex",
    flexWrap: "nowrap",
    width: "max-content",
    gap: "inherit"
  });
  for (const n of originals) originalChild.appendChild(n);

  // Clone for seamless loop
  const clonedChild = originalChild.cloneNode(true);
  deepRemoveIds(clonedChild);
  clonedChild.setAttribute("aria-hidden", "true");
  clonedChild.setAttribute("inert", "");

  wrapper.append(originalChild, clonedChild);

  // Setup container
  Object.assign(container.style, {
    overflow: "hidden",
    display: "flex",
  });

  container.appendChild(wrapper);

  return { wrapper, originalChild, clonedChild, originals };
}

function attach(container) {
  if (!container || container.nodeType !== 1) return;
  if (instances.has(container)) {
    refresh(instances.get(container));
    return;
  }

  const id = genId();
  const settings = readSettings(container);
  const { wrapper, originalChild, clonedChild, originals } = createStructure(container);
  const originalStyle = container.getAttribute("style");

  const ac = (typeof window !== "undefined" && window.AbortController)
    ? new window.AbortController()
    : new AbortController();
  const signal = ac.signal;

  const reducedQuery = typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false, addEventListener: () => {} };

  const state = {
    id,
    container,
    wrapper,
    originalChild,
    clonedChild,
    originals,
    originalStyle,
    settings,
    reducedMotion: !!reducedQuery.matches,
    reducedQuery,
    ac,
    signal,
    animation: null,
    childWidth: 0,
    playing: true,
    initialized: false,
    resizeObserver: null,
  };

  // Setup ResizeObserver
  state.resizeObserver = new ResizeObserver(() => {
    if (!instances.has(container)) return;
    updateSize(state);
  });
  state.resizeObserver.observe(originalChild);

  // Listen for reduced motion changes
  reducedQuery.addEventListener?.("change", () => {
    state.reducedMotion = reducedQuery.matches;
    if (state.reducedMotion && state.animation) {
      state.animation.cancel();
      wrapper.style.transform = "translateX(0px)";
    } else {
      start(state);
    }
  }, { signal });

  // Listen for font load
  if (typeof document !== "undefined") {
    document.fonts?.ready?.then?.(() => {
      if (instances.has(container)) {
        updateSize(state);
      }
    });
  }

  // Setup hover handlers
  if (settings.pauseOnHover) {
    container.addEventListener("pointerenter", () => {
      if (state.animation && state.playing) {
        state.animation.pause();
      }
    }, { signal });

    container.addEventListener("pointerleave", () => {
      if (state.animation && state.playing) {
        state.animation.play();
      }
    }, { signal });
  }

  instances.set(container, state);

  // Initialize
  state.childWidth = originalChild.offsetWidth;
  state.initialized = true;
  start(state);
}

function start(state, startProgress) {
  if (!state.childWidth || state.reducedMotion) return;

  const { wrapper, settings, childWidth } = state;

  // Cancel existing animation
  state.animation?.cancel();

  const duration = pxPerSecond(childWidth, settings.speed);
  const direction = settings.direction;

  const keyframes = direction === 1
    ? [{ transform: "translateX(0%)" }, { transform: "translateX(-50%)" }]
    : [{ transform: "translateX(-50%)" }, { transform: "translateX(0%)" }];

  state.animation = wrapper.animate(keyframes, {
    duration,
    easing: "linear",
    iterations: Infinity,
  });

  if (!state.playing) {
    state.animation.pause();
  }

  // Restore progress if provided
  if (startProgress !== undefined && state.animation.effect) {
    state.animation.currentTime = duration * startProgress;
  }
}

function updateSize(state) {
  if (!state.initialized || !state.originalChild) return;

  const newWidth = state.originalChild.offsetWidth;

  if (newWidth !== state.childWidth && newWidth > 0) {
    // Get current progress before restarting
    const currentProgress = state.animation?.effect?.getComputedTiming()?.progress;

    state.childWidth = newWidth;

    // Recreate clone with new content
    if (state.clonedChild && state.clonedChild.parentNode === state.wrapper) {
      state.wrapper.removeChild(state.clonedChild);
    }

    state.clonedChild = state.originalChild.cloneNode(true);
    deepRemoveIds(state.clonedChild);
    state.clonedChild.setAttribute("aria-hidden", "true");
    state.clonedChild.setAttribute("inert", "");
    state.wrapper.appendChild(state.clonedChild);

    // Restart animation maintaining progress
    start(state, currentProgress);
  }
}

function detach(container) {
  const state = instances.get(container);
  if (!state) return;

  state.resizeObserver?.disconnect();
  state.ac.abort();
  state.animation?.cancel?.();

  try {
    // Restore original content
    for (const n of state.originals) {
      container.appendChild(n);
    }
    state.wrapper?.remove();
  } catch (_error) {
    // Best-effort cleanup
  }

  if (state.originalStyle == null) {
    container.style.overflow = "";
    container.style.display = "";
  } else {
    container.setAttribute("style", state.originalStyle);
  }

  instances.delete(container);
}

function refresh(state) {
  state.settings = readSettings(state.container);

  // Get current progress
  const currentProgress = state.animation?.effect?.getComputedTiming()?.progress;

  // Restart with new settings
  start(state, currentProgress);
}

function rescan(root = document) {
  const found = queryTargets(root);

  // Detach elements that are disconnected or lost data-marquee attribute
  for (const el of instances.keys()) {
    if (!el.isConnected) {
      detach(el);
      continue;
    }
    if (root !== document && !root.contains(el)) {
      detach(el);
      continue;
    }
    if ((root === document || root.contains(el)) && !el.hasAttribute('data-marquee')) {
      detach(el);
    }
  }

  // Attach or refresh all found elements
  for (const el of found) {
    attach(el);
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
