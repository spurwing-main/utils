// marquee - Item reprojection ticker
// Minimal cloning with per-item transform repositioning

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
  // Only wrap element nodes, skip text nodes (whitespace)
  const originals = Array.from(container.children);

  // Wrapper stays at origin - items move individually
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    display: "flex",
    flexWrap: "nowrap",
    width: "max-content",
    gap: "inherit",
  });

  // Items in normal flex flow, each with individual transform
  const items = [];
  for (const node of originals) {
    const itemContainer = document.createElement("div");
    Object.assign(itemContainer.style, {
      display: "flex",
      flexWrap: "nowrap",
      gap: "inherit",
      flexShrink: "0",
      willChange: "transform",
    });
    itemContainer.appendChild(node);
    wrapper.appendChild(itemContainer);

    items.push({
      element: itemContainer,
      width: 0,
      offset: 0, // Individual item offset for reprojection
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
  let totalWidth = 0;
  for (const item of items) {
    if (item.isClone) continue;
    item.width = item.element.getBoundingClientRect().width;
    totalWidth += item.width;
  }

  // Only clone enough to fill viewport + small buffer
  // Item reprojection eliminates need for 2x cloning
  const minWidth = marqueeWidth + totalWidth * 0.5;
  let currentWidth = totalWidth;
  const clonedItems = [];

  while (currentWidth < minWidth && items.length + clonedItems.length < 50) {
    for (const originalItem of items) {
      if (originalItem.isClone) continue;
      if (currentWidth >= minWidth) break;

      const clonedNode = originalItem.original.cloneNode(true);
      deepRemoveIds(clonedNode);

      const clone = document.createElement("div");
      Object.assign(clone.style, {
        display: "flex",
        flexWrap: "nowrap",
        gap: "inherit",
        flexShrink: "0",
        willChange: "transform",
      });
      clone.appendChild(clonedNode);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");
      wrapper.appendChild(clone);

      clonedItems.push({
        element: clone,
        offset: 0,
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
  if (instances.has(container)) return;

  const settings = readSettings(container);
  const preferReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedQuery = preferReducedMotion;
  const ac = new AbortController();
  const signal = ac.signal;

  const { wrapper, items, originals } = createStructure(container);

  const state = {
    container,
    wrapper,
    items,
    originals,
    settings,
    reducedQuery,
    ac,
    signal,
    progress: 0, // Overall progress in pixels
    totalWidth: 0,
    lastTimestamp: 0,
    rafId: null,
    isIntersecting: true,
    isPaused: false,
    isHovered: false,
    resizeObserver: null,
    intersectionObserver: null,
  };

  // Measure and create minimal clones
  state.totalWidth = measureAndClone(state);

  // Position items initially
  let accumulated = 0;
  for (const item of state.items) {
    item.offset = accumulated;
    accumulated += item.width;
  }

  // Viewport awareness - pause when off-screen
  state.intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === container) {
        state.isIntersecting = entry.isIntersecting;
        if (state.isIntersecting) {
          start(state);
        } else {
          stop(state);
        }
      }
    }
  }, {
    threshold: 0,
  });
  state.intersectionObserver.observe(container);

  // Responsive - rebuild on resize
  state.resizeObserver = new ResizeObserver(() => {
    updateSize(state);
  });
  state.resizeObserver.observe(container);

  // Pause on hover
  if (state.settings.pauseOnHover) {
    container.addEventListener("mouseenter", () => {
      state.isHovered = true;
      stop(state);
    }, { signal });

    container.addEventListener("mouseleave", () => {
      state.isHovered = false;
      if (state.isIntersecting) start(state);
    }, { signal });
  }

  // Watch for setting changes
  const updateSettings = () => {
    const next = readSettings(container);
    const oldDir = state.settings.direction;
    state.settings = next;
    if (next.direction !== oldDir) {
      resetPositions(state);
    }
  };

  const attrObserver = new MutationObserver(updateSettings);
  attrObserver.observe(container, {
    attributes: true,
    attributeFilter: ["data-marquee-speed", "data-marquee-direction", "data-marquee-pause-on-hover"],
  });
  ac.signal.addEventListener("abort", () => attrObserver.disconnect());

  instances.set(container, state);

  // Start if visible and not paused
  if (state.isIntersecting && !state.isHovered) {
    start(state);
  }

  resetPositions(state);
}

function resetPositions(state) {
  // Reset all item positions
  let accumulated = 0;
  for (const item of state.items) {
    item.offset = accumulated;
    item.element.style.transform = `translateX(${item.offset}px)`;
    accumulated += item.width;
  }
  state.progress = 0;
}

function start(state) {
  if (state.rafId !== null || state.reducedQuery.matches) return;
  state.isPaused = false;
  state.lastTimestamp = 0;
  state.rafId = requestAnimationFrame((ts) => tick(state, ts));
}

function stop(state) {
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  state.isPaused = true;
}

function tick(state, timestamp) {
  // Calculate delta time
  if (!state.lastTimestamp) {
    state.lastTimestamp = timestamp;
  }
  const deltaTime = timestamp - state.lastTimestamp;
  state.lastTimestamp = timestamp;

  // Update progress based on velocity
  // Negate so direction: 1 (left) gives negative movement
  const velocity = -state.settings.speed * state.settings.direction;
  state.progress += (velocity * deltaTime) / 1000;

  // Reproject items
  // For left movement (direction: 1), items moving off left edge get teleported to right
  // For right movement (direction: -1), items moving off right edge get teleported to left
  const containerWidth = state.container.getBoundingClientRect().width;

  for (const item of state.items) {
    // Calculate item's current visual position
    const itemPosition = item.offset + state.progress;

    if (state.settings.direction === 1) {
      // Moving left - item exits on left, reappears on right
      if (itemPosition + item.width < 0) {
        // Item completely off-screen left, teleport to right
        item.offset += state.totalWidth;
      }
    } else {
      // Moving right - item exits on right, reappears on left
      if (itemPosition > containerWidth) {
        // Item completely off-screen right, teleport to left
        item.offset -= state.totalWidth;
      }
    }

    // Apply combined transform
    const finalPosition = item.offset + state.progress;
    item.element.style.transform = `translateX(${finalPosition}px)`;
  }

  // Schedule next frame
  state.rafId = requestAnimationFrame((ts) => tick(state, ts));
}

function detach(container) {
  const state = instances.get(container);
  if (!state) return;

  stop(state);
  state.ac.abort();
  state.resizeObserver?.disconnect();
  state.intersectionObserver?.disconnect();

  // Restore original structure
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  for (const node of state.originals) {
    container.appendChild(node);
  }

  // Clear inline styles
  container.style.overflow = "";
  container.style.display = "";
  container.style.position = "";

  instances.delete(container);
}

function updateSize(state) {
  stop(state);

  // Remove clones
  state.items = state.items.filter(item => !item.isClone);

  // Re-measure and clone
  state.totalWidth = measureAndClone(state);

  // Reset positions
  resetPositions(state);

  // Restart if appropriate
  if (state.isIntersecting && !state.isHovered) {
    start(state);
  }
}

function init() {
  if (initialized) return;
  initialized = true;
  for (const target of queryTargets(document)) {
    attach(target);
  }
}

function rescan() {
  for (const target of queryTargets(document)) {
    attach(target);
  }
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

export const Marquee = { attach, detach, rescan };
