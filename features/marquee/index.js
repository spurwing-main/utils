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

  // Wrapper is positioned container for absolute items
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "relative",
    display: "block",
    width: "0px", // Will be set after measurement
  });

  // Items absolutely positioned, each with individual offset
  const items = [];
  for (const node of originals) {
    const itemContainer = document.createElement("div");
    Object.assign(itemContainer.style, {
      position: "absolute",
      top: "0",
      left: "0",
      display: "inline-flex",
      willChange: "transform",
    });
    itemContainer.appendChild(node);
    wrapper.appendChild(itemContainer);

    items.push({
      element: itemContainer,
      width: 0,
      baseOffset: 0, // Base position in sequence
      projectionOffset: 0, // Reprojection offset (±totalWidth)
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

  // Get gap value from container
  const computedStyle = window.getComputedStyle(container);
  const gap = parseFloat(computedStyle.gap) || 0;

  // Measure original items
  let originalWidth = 0;
  let maxHeight = 0;
  const originalItems = items.filter(item => !item.isClone);

  for (let i = 0; i < originalItems.length; i++) {
    const item = originalItems[i];
    const rect = item.element.getBoundingClientRect();
    item.width = rect.width;
    maxHeight = Math.max(maxHeight, rect.height);
    originalWidth += item.width;
    if (i < originalItems.length - 1) {
      originalWidth += gap;
    }
  }

  // Set wrapper height to tallest item
  wrapper.style.height = `${maxHeight}px`;

  // Only clone enough to fill viewport + small buffer
  // Item reprojection eliminates need for 2x cloning
  const minWidth = marqueeWidth + originalWidth * 0.5;
  let currentWidth = originalWidth;
  const clonedItems = [];

  while (currentWidth < minWidth && items.length + clonedItems.length < 50) {
    for (const originalItem of originalItems) {
      if (currentWidth >= minWidth) break;

      const clonedNode = originalItem.original.cloneNode(true);
      deepRemoveIds(clonedNode);

      const clone = document.createElement("div");
      Object.assign(clone.style, {
        position: "absolute",
        top: "0",
        left: "0",
        display: "inline-flex",
        willChange: "transform",
      });
      clone.appendChild(clonedNode);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");
      wrapper.appendChild(clone);

      clonedItems.push({
        element: clone,
        baseOffset: 0, // Will be set in resetPositions
        projectionOffset: 0,
        width: originalItem.width,
        isClone: true,
        original: clonedNode,
      });

      currentWidth += originalItem.width + gap;
    }
  }

  items.push(...clonedItems);
  return { originalWidth, totalWidth: currentWidth };
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
    originalWidth: 0, // Width of original items only (for reprojection)
    lastTimestamp: 0,
    rafId: null,
    isIntersecting: true,
    isPaused: false,
    isHovered: false,
    resizeObserver: null,
    intersectionObserver: null,
  };

  // Get gap value from container
  const computedStyle = window.getComputedStyle(container);
  const gap = parseFloat(computedStyle.gap) || 0;
  state.gap = gap;

  // Measure and create minimal clones
  const { originalWidth, totalWidth } = measureAndClone(state);
  state.originalWidth = originalWidth;
  state.totalWidth = totalWidth;

  // Calculate base offsets (natural position in sequence)
  let accumulated = 0;
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    item.baseOffset = accumulated;
    item.projectionOffset = 0;
    accumulated += item.width + (i < state.items.length - 1 ? gap : 0);
  }

  // Set wrapper width to total accumulated width
  wrapper.style.width = `${accumulated}px`;

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
  // Reset projection offsets and recalculate base offsets with gaps
  const gap = state.gap || 0;
  let accumulated = 0;
  let originalAccumulated = 0;
  const originalItems = state.items.filter(item => !item.isClone);

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    item.baseOffset = accumulated;
    item.projectionOffset = 0;
    // Position item at its baseOffset
    item.element.style.transform = `translateX(${item.baseOffset}px)`;
    accumulated += item.width + (i < state.items.length - 1 ? gap : 0);
  }

  // Calculate original width (used for cloning strategy)
  for (let i = 0; i < originalItems.length; i++) {
    originalAccumulated += originalItems[i].width;
    if (i < originalItems.length - 1) {
      originalAccumulated += gap;
    }
  }

  // Update widths and wrapper width
  state.originalWidth = originalAccumulated;
  state.totalWidth = accumulated;
  state.wrapper.style.width = `${accumulated}px`;
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

  // Reproject items as they exit viewport
  const containerWidth = state.container.getBoundingClientRect().width;
  // Reprojection distance: total width + gap (to appear after all current items)
  const reprojectionDistance = state.totalWidth + state.gap;

  for (const item of state.items) {
    // Calculate item's visual position
    // All items at left: 0, positioned via transform
    const visualPosition = item.baseOffset + state.progress + item.projectionOffset;

    if (state.settings.direction === 1) {
      // Moving left - item exits on left, reappears on right
      if (visualPosition + item.width < 0) {
        // Item completely off-screen left, teleport to right
        // Reproject to appear after all current items
        item.projectionOffset += reprojectionDistance;
      }
    } else {
      // Moving right - item exits on right, reappears on left
      if (visualPosition > containerWidth) {
        // Item completely off-screen right, teleport to left
        // Reproject to appear before all current items
        item.projectionOffset -= reprojectionDistance;
      }
    }

    // Apply transform: base position + global progress + individual reprojection
    // Items all start at left: 0, so transform must include baseOffset
    const transformOffset = item.baseOffset + state.progress + item.projectionOffset;
    item.element.style.transform = `translateX(${transformOffset}px)`;
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

  // Remove clone elements from DOM and items array
  const clones = state.items.filter(item => item.isClone);
  for (const clone of clones) {
    clone.element.remove();
  }
  state.items = state.items.filter(item => !item.isClone);

  // Re-measure and clone
  const { originalWidth, totalWidth } = measureAndClone(state);
  state.originalWidth = originalWidth;
  state.totalWidth = totalWidth;

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
