// marquee - Motion+ Ticker style implementation
// Main thread animation with item translation for minimal cloning

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

  // Wrapper holds absolutely positioned items
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    position: "relative",
    width: "max-content",
    gap: "inherit",
  });

  // Create item containers - each positioned absolutely
  const items = [];
  for (const node of originals) {
    const itemContainer = document.createElement("div");
    Object.assign(itemContainer.style, {
      display: "flex",
      flexWrap: "nowrap",
      gap: "inherit",
      position: "absolute",
      left: "0",
      top: "0",
      willChange: "transform",
    });
    itemContainer.appendChild(node);
    wrapper.appendChild(itemContainer);

    items.push({
      element: itemContainer,
      baseOffset: 0,
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

  // Measure original items and position them
  let totalWidth = 0;
  for (const item of items) {
    if (item.isClone) continue;

    item.element.style.transform = `translateX(${totalWidth}px)`;
    item.width = item.element.getBoundingClientRect().width;
    item.baseOffset = totalWidth;
    totalWidth += item.width;
  }

  // Clone only if needed to fill viewport + one cycle for smooth looping
  const minWidth = marqueeWidth + totalWidth;
  let currentWidth = totalWidth;
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
        position: "absolute",
        left: "0",
        top: "0",
        willChange: "transform",
      });

      const clonedNode = originalItem.original.cloneNode(true);
      deepRemoveIds(clonedNode);
      clone.appendChild(clonedNode);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");

      wrapper.appendChild(clone);

      clonedItems.push({
        element: clone,
        baseOffset: currentWidth,
        width: originalItem.width,
        isClone: true,
        original: clonedNode,
      });

      currentWidth += originalItem.width;
    }
  }

  items.push(...clonedItems);
  return totalWidth;
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
    offset: 0,
    totalWidth: 0,
    lastTimestamp: 0,
    rafId: null,
    isIntersecting: true,
    playing: true,
    initialized: false,
    resizeObserver: null,
    intersectionObserver: null,
  };

  // Measure and create minimal clones
  state.totalWidth = measureAndClone(state);

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

  // Update offset based on velocity
  const velocity = state.settings.speed * state.settings.direction;
  state.offset += (velocity * deltaTime) / 1000;

  // Update item positions
  updatePositions(state);

  // Continue loop
  state.rafId = requestAnimationFrame((ts) => tick(state, ts));
}

function updatePositions(state) {
  const { items, offset, totalWidth, settings } = state;

  for (const item of items) {
    // Calculate current position
    let position = item.baseOffset + offset;

    // Item translation when exiting viewport
    if (settings.direction === 1) {
      // Moving left
      if (position < -item.width) {
        // Item exited left - translate to end
        item.baseOffset += totalWidth;
        position = item.baseOffset + offset;
      }
    } else {
      // Moving right
      if (position > totalWidth) {
        // Item exited right - translate to start
        item.baseOffset -= totalWidth;
        position = item.baseOffset + offset;
      }
    }

    // Apply transform
    item.element.style.transform = `translateX(${position}px)`;
  }
}

function resetPositions(state) {
  const { items } = state;
  state.offset = 0;

  let position = 0;
  for (const item of items) {
    item.baseOffset = position;
    item.element.style.transform = `translateX(${position}px)`;
    position += item.width;
  }
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
  state.totalWidth = measureAndClone(state);
  state.offset = 0;
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
