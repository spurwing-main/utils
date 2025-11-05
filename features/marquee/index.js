// marquee - Smooth infinite ticker with minimal cloning
// Main thread rAF animation with velocity-based movement

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

function createStructure(container) {
  const originals = Array.from(container.childNodes);

  // Wrapper moves as whole unit
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    flexWrap: "nowrap",
    width: "max-content",
    gap: "inherit",
    willChange: "transform",
  });

  // Items in normal flex flow
  const items = [];
  for (const node of originals) {
    const itemContainer = document.createElement("div");
    Object.assign(itemContainer.style, {
      display: "flex",
      flexWrap: "nowrap",
      gap: "inherit",
      flexShrink: "0",
    });
    itemContainer.appendChild(node);
    wrapper.appendChild(itemContainer);

    items.push({
      element: itemContainer,
      width: 0,
      isClone: false,
      original: node,
    });
  }

  // Setup container
  Object.assign(container.style, {
    overflow: "hidden",
    display: "flex",
    position: "relative",
  });

  container.appendChild(wrapper);

  return { wrapper, items, originals };
}

function measureAndClone(state) {
  const { wrapper, items, container } = state;
  const marqueeWidth = container.getBoundingClientRect().width;

  // Measure original items
  let originalWidth = 0;
  for (const item of items) {
    if (item.isClone) continue;
    item.width = item.element.getBoundingClientRect().width;
    originalWidth += item.width;
  }

  // For seamless loop, we need at least 2x original content
  // Plus enough to fill viewport at max offset
  const minWidth = Math.max(originalWidth * 2, marqueeWidth + originalWidth);
  let currentWidth = originalWidth;
  const clonedItems = [];

  while (currentWidth < minWidth && items.length + clonedItems.length < 50) {
    for (const originalItem of items) {
      if (originalItem.isClone) continue;
      if (currentWidth >= minWidth) break;

      const clone = document.createElement("div");
      Object.assign(clone.style, {
        display: "flex",
        flexWrap: "nowrap",
        gap: "inherit",
        flexShrink: "0",
      });

      const clonedNode = originalItem.original.cloneNode(true);
      deepRemoveIds(clonedNode);
      clone.appendChild(clonedNode);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");

      wrapper.appendChild(clone);

      clonedItems.push({
        element: clone,
        width: originalItem.width,
        isClone: true,
        original: clonedNode,
      });

      currentWidth += originalItem.width;
    }
  }

  items.push(...clonedItems);
  return originalWidth;
}

function attach(container) {
  if (!container || container.nodeType !== 1) return;
  if (instances.has(container)) {
    refresh(instances.get(container));
    return;
  }

  const id = genId();
  const settings = readSettings(container);
  const { wrapper, items, originals } = createStructure(container);
  const originalStyle = container.getAttribute("style");

  const ac = new AbortController();
  const signal = ac.signal;

  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    id,
    container,
    wrapper,
    items,
    originals,
    originalStyle,
    settings,
    reducedMotion: reducedQuery.matches,
    reducedQuery,
    ac,
    signal,
    wrapperOffset: 0,
    originalWidth: 0,
    lastTimestamp: 0,
    rafId: null,
    isIntersecting: true,
    playing: true,
    initialized: false,
    resizeObserver: null,
    intersectionObserver: null,
  };

  // Measure and create clones
  state.originalWidth = measureAndClone(state);

  // Viewport awareness - pause when off-screen
  state.intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      state.isIntersecting = entry.isIntersecting;
      if (entry.isIntersecting && state.playing && !state.reducedMotion) {
        startAnimation(state);
      } else {
        stopAnimation(state);
      }
    }
  }, { threshold: 0 });
  state.intersectionObserver.observe(container);

  // Responsive - rebuild clones on resize
  state.resizeObserver = new ResizeObserver(() => {
    if (!instances.has(container)) return;
    updateSize(state);
  });
  state.resizeObserver.observe(container);

  // Reduced motion support
  reducedQuery.addEventListener("change", () => {
    state.reducedMotion = reducedQuery.matches;
    if (state.reducedMotion) {
      stopAnimation(state);
      resetPositions(state);
    } else if (state.isIntersecting && state.playing) {
      startAnimation(state);
    }
  }, { signal });

  // Font loading support
  document.fonts?.ready?.then?.(() => {
    if (instances.has(container)) {
      updateSize(state);
    }
  });

  // Pause on hover
  if (settings.pauseOnHover) {
    container.addEventListener("pointerenter", () => {
      state.playing = false;
      stopAnimation(state);
    }, { signal });

    container.addEventListener("pointerleave", () => {
      state.playing = true;
      if (state.isIntersecting && !state.reducedMotion) {
        startAnimation(state);
      }
    }, { signal });
  }

  instances.set(container, state);
  state.initialized = true;

  // Start if visible
  if (state.isIntersecting && state.playing && !state.reducedMotion) {
    startAnimation(state);
  }
}

function tick(state, timestamp) {
  if (!state.rafId) return;

  // Calculate delta time
  if (!state.lastTimestamp) {
    state.lastTimestamp = timestamp;
  }
  const deltaTime = timestamp - state.lastTimestamp;
  state.lastTimestamp = timestamp;

  // Update wrapper offset based on velocity
  const velocity = state.settings.speed * state.settings.direction;
  state.wrapperOffset += (velocity * deltaTime) / 1000;

  // Loop at original content width for seamless repeat
  // When we've moved by originalWidth, clones look identical to originals
  if (state.settings.direction === 1) {
    // Moving left
    if (state.wrapperOffset <= -state.originalWidth) {
      state.wrapperOffset += state.originalWidth;
    }
  } else {
    // Moving right
    if (state.wrapperOffset >= state.originalWidth) {
      state.wrapperOffset -= state.originalWidth;
    }
  }

  // Apply transform to wrapper
  state.wrapper.style.transform = `translateX(${state.wrapperOffset}px)`;

  // Continue loop
  state.rafId = requestAnimationFrame((ts) => tick(state, ts));
}

function resetPositions(state) {
  state.wrapperOffset = 0;
  state.wrapper.style.transform = `translateX(0px)`;
}

function startAnimation(state) {
  if (state.rafId || state.reducedMotion) return;

  state.lastTimestamp = 0;
  state.rafId = requestAnimationFrame((ts) => tick(state, ts));
}

function stopAnimation(state) {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
    state.lastTimestamp = 0;
  }
}

function updateSize(state) {
  if (!state.initialized) return;

  stopAnimation(state);

  // Remove clones
  for (const item of state.items) {
    if (item.isClone) {
      item.element.remove();
    }
  }

  // Keep only originals
  state.items = state.items.filter(item => !item.isClone);

  // Re-measure and clone
  state.originalWidth = measureAndClone(state);
  state.wrapperOffset = 0;
  resetPositions(state);

  // Restart if should be playing
  if (state.isIntersecting && state.playing && !state.reducedMotion) {
    startAnimation(state);
  }
}

function detach(container) {
  const state = instances.get(container);
  if (!state) return;

  stopAnimation(state);
  state.resizeObserver?.disconnect();
  state.intersectionObserver?.disconnect();
  state.ac.abort();

  try {
    // Restore original content
    for (const node of state.originals) {
      container.appendChild(node);
    }
    state.wrapper?.remove();
  } catch (_error) {
    // Best-effort cleanup
  }

  if (state.originalStyle == null) {
    container.style.overflow = "";
    container.style.display = "";
    container.style.position = "";
  } else {
    container.setAttribute("style", state.originalStyle);
  }

  instances.delete(container);
}

function refresh(state) {
  state.settings = readSettings(state.container);
  // Animation continues with new settings
}

function rescan(root = document) {
  const found = queryTargets(root);

  // Detach disconnected or removed elements
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

  // Attach or refresh found elements
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
