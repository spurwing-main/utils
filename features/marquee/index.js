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

  // Wrapper moves as a unit - will be animated via transform
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "relative",
    display: "flex",
    gap: "inherit", // Inherit gap from container
    width: "max-content",
    willChange: "transform",
  });

  // Items flow naturally in flexbox - no absolute positioning needed
  const items = [];
  for (const node of originals) {
    const itemContainer = document.createElement("div");
    Object.assign(itemContainer.style, {
      flexShrink: "0",
    });
    itemContainer.appendChild(node);
    wrapper.appendChild(itemContainer);

    items.push({
      element: itemContainer,
      width: 0,
      offset: 0, // Item's position within the wrapper
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
  const originalItems = items.filter(item => !item.isClone);

  for (const item of originalItems) {
    const rect = item.element.getBoundingClientRect();
    item.width = rect.width;
    originalWidth += item.width + gap;
  }

  // Clone enough times to fill at least 3x the viewport width
  // This ensures seamless looping with plenty of buffer
  const minWidth = marqueeWidth * 3;
  const clonedItems = [];

  while (originalWidth * (1 + clonedItems.length / originalItems.length) < minWidth) {
    for (const originalItem of originalItems) {
      const clonedNode = originalItem.original.cloneNode(true);
      deepRemoveIds(clonedNode);

      const clone = document.createElement("div");
      Object.assign(clone.style, {
        flexShrink: "0",
      });
      clone.appendChild(clonedNode);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("inert", "");
      wrapper.appendChild(clone);

      clonedItems.push({
        element: clone,
        width: originalItem.width,
        offset: 0,
        isClone: true,
        original: clonedNode,
      });
    }
  }

  items.push(...clonedItems);

  // Measure all items and calculate offsets
  let offset = 0;
  for (const item of items) {
    item.offset = offset;
    offset += item.width + gap;
  }

  return { originalWidth, totalWidth: offset - gap };
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
  // Reset wrapper position
  state.progress = 0;
  state.wrapper.style.transform = "translate3d(0, 0, 0)";

  // Recalculate item offsets
  const gap = state.gap || 0;
  let offset = 0;

  for (const item of state.items) {
    item.offset = offset;
    offset += item.width + gap;
  }

  // Calculate original width for looping
  const originalItems = state.items.filter(item => !item.isClone);
  let originalWidth = 0;
  for (const item of originalItems) {
    originalWidth += item.width + gap;
  }

  state.originalWidth = originalWidth;
  state.totalWidth = offset - gap;
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

  // Loop wrapper position seamlessly at one cycle length
  // This creates infinite scrolling without any visible jump
  if (state.settings.direction === 1) {
    // Moving left
    if (state.progress <= -state.originalWidth) {
      state.progress += state.originalWidth;
    }
  } else {
    // Moving right
    if (state.progress >= state.originalWidth) {
      state.progress -= state.originalWidth;
    }
  }

  // Update wrapper transform - ONLY ONE STYLE CHANGE PER FRAME
  state.wrapper.style.transform = `translate3d(${state.progress}px, 0, 0)`;

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
