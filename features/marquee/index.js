const debug =
  typeof window !== "undefined" ? window.__UTILS_DEBUG__?.createLogger?.("marquee") : null;

let initialized = false;

const attrMarquee = "data-marquee";
const attrSpeed = "data-marquee-speed";
const FRAME_TIME = 1000 / 60;
const MIN_WIDTH = 1;
const WIDTH_EPSILON = 1;
const HEIGHT_RATIO_THRESHOLD = 0.25;
const CLONE_SAFETY_MARGIN = 2;
const MAX_CLONE_ITERATIONS = 100;
const SUBPIXEL_PRECISION = 1000;
const LOOP_WRAP_EPSILON = 2; // px threshold to snap to 0 at loop

const instances = new Map();

function isElement(node) {
  return node?.nodeType === 1;
}

function assert(condition, message) {
  if (!condition) {
    const error = new Error(`[Marquee] ${message}`);
    debug?.error(error.message, { stack: error.stack });
    throw error;
  }
}

function readSpeed(element) {
  const raw = element.getAttribute(attrSpeed);
  if (!raw) return 1;
  const value = Number.parseFloat(raw);
  const speed = Number.isFinite(value) && value > 0 ? value : 1;
  if (raw && speed === 1 && raw !== "1") {
    debug?.warn(`Invalid speed value "${raw}", defaulting to 1`, { element });
  }
  return speed;
}

function sanitiseClone(node) {
  if (node?.nodeType !== 1) return;
  const element = node;
  element.setAttribute("data-marquee-clone", "true");
  // Keep clones strictly visual; no IDs that could duplicate
  element.removeAttribute("id");
}

function readGapPx(element) {
  if (!element || !element.ownerDocument) return 0;
  const view = element.ownerDocument.defaultView;
  if (!view?.getComputedStyle) return 0;
  const computed = view.getComputedStyle(element);
  // Prefer column-gap for horizontal marquees; fallback to gap shorthand
  const raw = computed.columnGap && computed.columnGap !== "normal" ? computed.columnGap : computed.gap;
  if (!raw || raw === "normal" || raw === "0px") return 0;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function findGapElement(container) {
  if (!container?.querySelector) return null;
  // Prefer explicit class hooks first
  let el = container.querySelector(".marquee_content-list");
  if (!el) el = container.querySelector(".marquee-content");
  if (el) return el;
  // Fallback: first descendant element with a non-zero computed gap
  const candidates = container.querySelectorAll("*:not([data-marquee-clone])");
  for (const node of candidates) {
    if (readGapPx(node) > 0) return node;
  }
  return null;
}

function removeClones(state) {
  const cloneCount = state.clones.length;
  for (const clone of state.clones) {
    clone.remove();
  }
  state.clones.length = 0;
  debug?.info(`Removed ${cloneCount} clones`, {
    container: state.container.id || state.container.className || "unnamed",
  });
}

function addClones(state) {
  const startTime = performance.now();

  if (state.originals.length === 0) {
    debug?.warn("No original content to clone", {
      container: state.container.id || state.container.className || "unnamed",
    });
    return;
  }

  const baseWidth = state.loopWidth;
  const containerWidth = Math.max(state.container.clientWidth, MIN_WIDTH);

  if (!Number.isFinite(baseWidth) || !Number.isFinite(containerWidth)) {
    debug?.error("Invalid dimensions for clone creation", {
      baseWidth,
      containerWidth,
      loopWidth: state.loopWidth,
    });
    return;
  }

  const fragment = state.container.ownerDocument.createDocumentFragment();
  const targetWidth = containerWidth + baseWidth * CLONE_SAFETY_MARGIN;
  let totalWidth = 0;
  let iterations = 0;
  const minIterations = 2;

  while (
    (totalWidth < targetWidth || iterations < minIterations) &&
    iterations < MAX_CLONE_ITERATIONS
  ) {
    for (const node of state.originals) {
      const clone = node.cloneNode(true);
      sanitiseClone(clone);
      fragment.append(clone);
      state.clones.push(clone);
    }
    totalWidth += baseWidth;
    iterations++;
  }

  if (iterations >= MAX_CLONE_ITERATIONS) {
    debug?.error(`Hit max clone iterations limit (${MAX_CLONE_ITERATIONS})`, {
      baseWidth,
      containerWidth,
      targetWidth,
    });
  }

  state.wrapper.append(fragment);

  const duration = performance.now() - startTime;
  debug?.info(`Created ${state.clones.length} clones in ${duration.toFixed(2)}ms`, {
    iterations,
    baseWidth: baseWidth.toFixed(2),
    containerWidth: containerWidth.toFixed(2),
  });
}

function refresh(state) {
  const startTime = performance.now();

  debug?.info("Starting refresh", {
    container: state.container.id || state.container.className || "unnamed",
    currentOffset: state.offset.toFixed(2),
    loopWidth: state.loopWidth.toFixed(2),
  });

  removeClones(state);

  // Preserve relative progress across width changes to avoid visible jumps
  const prevLoop = state.loopWidth > 0 ? state.loopWidth : MIN_WIDTH;
  const progress = Math.max(0, Math.min(1, state.offset / prevLoop));

  let contentWidth = state.wrapper.scrollWidth;
  const view = state.container.ownerDocument?.defaultView;

  if (view) {
    const sourceEl = state.gapElement || state.wrapper;
    const gapValue = readGapPx(sourceEl) || readGapPx(state.wrapper);
    if (gapValue > 0) {
      // Keep wrapper spacing in sync with source so clones are spaced correctly
      state.wrapper.style.columnGap = `${gapValue}px`;
      state.wrapper.style.gap = `${gapValue}px`;
      contentWidth += gapValue;
      debug?.info(`Added trailing gap: ${gapValue}px`, {
        originalWidth: state.wrapper.scrollWidth,
        withGap: contentWidth,
      });
    } else {
      state.wrapper.style.columnGap = "";
      state.wrapper.style.gap = "";
    }
  }

  if (!Number.isFinite(contentWidth) || contentWidth < 0) {
    debug?.error("Invalid content width measured", {
      scrollWidth: state.wrapper.scrollWidth,
      contentWidth,
    });
    contentWidth = MIN_WIDTH;
  }

  state.loopWidth = Math.max(contentWidth, MIN_WIDTH);
  state.speed = readSpeed(state.container);
  state.pixelsPerMs = state.speed / FRAME_TIME;

  if (!Number.isFinite(state.offset)) {
    debug?.warn("Invalid offset detected, resetting to 0", { offset: state.offset });
    state.offset = 0;
  } else {
    // Recompute offset from preserved progress to keep continuity when width changes
    state.offset = progress * state.loopWidth;
    const remainder = state.offset % state.loopWidth;
    state.offset = remainder <= LOOP_WRAP_EPSILON ? 0 : remainder;
  }

  addClones(state);

  const roundedOffset = Math.round(state.offset * SUBPIXEL_PRECISION) / SUBPIXEL_PRECISION;
  state.wrapper.style.transform = `translateX(-${roundedOffset}px)`;

  state.lastContainerWidth = state.container.clientWidth;
  state.lastContainerHeight = state.container.clientHeight;
  state.lastWrapperWidth = state.wrapper.scrollWidth;

  if (state.loopWidth <= MIN_WIDTH && state.originals.length > 0) {
    debug?.warn("Marquee content has minimal width - possible blank spaces until resize", {
      loopWidth: state.loopWidth,
      originalsCount: state.originals.length,
      containerWidth: state.container.clientWidth,
    });
  }

  const duration = performance.now() - startTime;
  debug?.info(`Refresh complete in ${duration.toFixed(2)}ms`, {
    loopWidth: state.loopWidth.toFixed(2),
    speed: state.speed,
    cloneCount: state.clones.length,
  });
}

function stopAnimation(state) {
  if (state.animationId === null) return;
  state.cancelAnimationFrame(state.animationId);
  state.animationId = null;
  state.lastTick = null;
}

function startAnimation(state) {
  // Guard against invalid/too-small measurements to avoid jitter loops
  if (!Number.isFinite(state.loopWidth) || state.loopWidth <= MIN_WIDTH + 0.5) {
    debug?.info("Animation deferred due to minimal loop width", {
      loopWidth: state.loopWidth,
    });
    stopAnimation(state);
    state.offset = 0;
    state.wrapper.style.transform = "translate3d(0,0,0)";
    return;
  }

  if (state.reducedMotion) {
    debug?.info("Animation disabled due to prefers-reduced-motion");
    stopAnimation(state);
    state.offset = 0;
    state.wrapper.style.transform = "translate3d(0,0,0)";
    return;
  }

  if (state.animationId !== null) {
    debug?.warn("Animation already running", { animationId: state.animationId });
    return;
  }

  debug?.info("Starting animation", {
    speed: state.speed,
    loopWidth: state.loopWidth.toFixed(2),
  });

  const step = (timestamp) => {
    if (state.animationId === null) return;

    if (!state.container.isConnected || !state.container.hasAttribute(attrMarquee)) {
      debug?.info("Container disconnected or attribute removed, auto-detaching");
      detach(state.container);
      return;
    }

    if (state.lastTick === null) {
      state.lastTick = timestamp;
      state.animationId = state.requestAnimationFrame(step);
      return;
    }

    const delta = timestamp - state.lastTick;
    state.lastTick = timestamp;

    if (delta > 1000) {
      debug?.warn("Large frame delta detected, skipping", { delta });
      state.animationId = state.requestAnimationFrame(step);
      return;
    }

    state.offset += state.pixelsPerMs * delta;

    if (state.offset >= state.loopWidth) {
      const remainder = state.offset % state.loopWidth;
      state.offset = remainder <= LOOP_WRAP_EPSILON ? 0 : remainder;
      debug?.info("Loop point reached", {
        newOffset: state.offset.toFixed(2),
        loopWidth: state.loopWidth.toFixed(2),
      });
    }

    if (!Number.isFinite(state.offset)) {
      debug?.error("Invalid offset in animation loop", { offset: state.offset });
      state.offset = 0;
    }

  const roundedOffset = Math.round(state.offset * SUBPIXEL_PRECISION) / SUBPIXEL_PRECISION;
  state.wrapper.style.transform = `translate3d(-${roundedOffset}px,0,0)`;
    state.animationId = state.requestAnimationFrame(step);
  };

  state.animationId = state.requestAnimationFrame(step);
}

function scheduleRefresh(state) {
  if (state.refreshPending) return;
  state.refreshPending = true;

  queueMicrotask(() => {
    if (!instances.has(state.container)) {
      state.refreshPending = false;
      return;
    }

    if (!state.container.isConnected || !state.container.hasAttribute(attrMarquee)) {
      state.refreshPending = false;
      detach(state.container);
      return;
    }

    const wasRunning = state.animationId !== null;
    stopAnimation(state);
    refresh(state);
    if (wasRunning) {
      startAnimation(state);
    }
    state.refreshPending = false;
  });
}

function createInstance(container) {
  const startTime = performance.now();
  const doc = container.ownerDocument;
  const view = doc?.defaultView;

  assert(view, "Container must be in a document with a window");
  assert(view.ResizeObserver, "ResizeObserver not supported - required for marquee");
  assert(
    view.requestAnimationFrame && view.cancelAnimationFrame,
    "requestAnimationFrame/cancelAnimationFrame not supported - required for marquee",
  );

  debug?.info("Creating marquee instance", {
    container: container.id || container.className || "unnamed",
  });

  const gapElement = findGapElement(container);
  const initialGapPx = readGapPx(gapElement) || 0;

  const wrapper = doc.createElement("div");
  wrapper.style.cssText = [
    "display:flex",
    "white-space:nowrap",
    "will-change:transform",
    "grid-area:1/1",
    "width:0",
    "min-width:100%",
    "max-width:100%",
    "overflow:visible",
    "flex-shrink:0",
    "contain:layout style",
  ].join(";");

  if (initialGapPx > 0) {
    // Apply the measured gap to wrapper so clones are spaced consistently
    wrapper.style.columnGap = `${initialGapPx}px`;
    wrapper.style.gap = `${initialGapPx}px`;
  }

  const originals = Array.from(container.childNodes);
  if (originals.length === 0) {
    debug?.warn("Container has no child nodes to animate", { container });
  }

  for (const node of originals) {
    wrapper.append(node);
  }

  const originalOverflow = container.style.overflow;
  const originalOverflowX = container.style.overflowX;
  const originalDisplay = container.style.display;
  const originalContain = container.style.contain;

  container.style.overflow = "hidden";
  container.style.overflowX = "hidden";
  container.style.display = "grid";
  container.style.gridTemplateColumns = "1fr";
  container.style.contain = "layout style paint";
  // This element is purely decorative/visual; it must not receive input
  container.style.pointerEvents = "none";

  container.append(wrapper);
  wrapper.style.pointerEvents = "none";

  const state = {
    container,
    wrapper,
    originals,
    clones: [],
    loopWidth: MIN_WIDTH,
    offset: 0,
    speed: readSpeed(container),
    pixelsPerMs: 1 / FRAME_TIME,
    animationId: null,
    lastTick: null,
    refreshPending: false,
    resizeObserver: null,
    resizeFrame: null,
    reducedMotion: false,
    motionQuery: null,
    motionHandler: null,
    originalOverflow,
    originalOverflowX,
    originalDisplay,
    originalContain,
    originalPointerEvents: container.style.pointerEvents,
    originalWrapperPointerEvents: wrapper.style.pointerEvents,
    requestAnimationFrame: view.requestAnimationFrame.bind(view),
    cancelAnimationFrame: view.cancelAnimationFrame.bind(view),
    mutationObserver: null,
    gapElement,
  };

  state.pixelsPerMs = state.speed / FRAME_TIME;

  state.lastContainerWidth = container.clientWidth;
  state.lastContainerHeight = container.clientHeight;
  state.lastWrapperWidth = wrapper.scrollWidth;

  const resizeObserver = new view.ResizeObserver((entries) => {
    if (!instances.has(container)) {
      return;
    }

    if (!container.isConnected) {
      detach(container);
      return;
    }

    let widthChanged = false;
    let heightChanged = false;

    for (const entry of entries) {
      if (entry.target === container) {
        const { width, height } = entry.contentRect;
        if (Math.abs(width - state.lastContainerWidth) >= WIDTH_EPSILON) {
          state.lastContainerWidth = width;
          widthChanged = true;
        }

        const baseline = state.lastContainerHeight;
        if (baseline > 0) {
          const delta = Math.abs(height - baseline);
          const ratio = delta / baseline;
          if (ratio >= HEIGHT_RATIO_THRESHOLD) {
            state.lastContainerHeight = height;
            heightChanged = true;
          }
        } else {
          state.lastContainerHeight = height;
        }
      } else if (entry.target === wrapper) {
        const { width } = entry.contentRect;
        if (Math.abs(width - state.lastWrapperWidth) >= WIDTH_EPSILON) {
          state.lastWrapperWidth = width;
          widthChanged = true;
        }
      }
    }

    if (!widthChanged && !heightChanged) {
      return;
    }

    if (state.resizeFrame !== null) {
      return;
    }

    state.resizeFrame = state.requestAnimationFrame(() => {
      state.resizeFrame = null;
      scheduleRefresh(state);
    });
  });
  resizeObserver.observe(container);
  resizeObserver.observe(wrapper);
  state.resizeObserver = resizeObserver;

  // Ensure marquee is visual-only: handled via pointer-events none on container and wrapper

  if (view.MutationObserver) {
    const mutationObserver = new view.MutationObserver((records) => {
      if (!instances.has(container)) return;
      if (!container.isConnected) {
        detach(container);
        return;
      }

      let shouldDetach = false;
      let shouldRefresh = false;

      for (const record of records) {
        if (record.type !== "attributes") continue;
        if (record.attributeName === attrMarquee && !container.hasAttribute(attrMarquee)) {
          shouldDetach = true;
          break;
        }

        if (record.attributeName === attrSpeed) {
          const nextSpeed = readSpeed(container);
          if (nextSpeed !== state.speed) {
            state.speed = nextSpeed;
            state.pixelsPerMs = state.speed / FRAME_TIME;
            shouldRefresh = true;
          }
        }
      }

      if (shouldDetach) {
        detach(container);
        return;
      }

      if (shouldRefresh) {
        scheduleRefresh(state);
      }
    });

    mutationObserver.observe(container, {
      attributes: true,
      attributeFilter: [attrMarquee, attrSpeed],
    });

    state.mutationObserver = mutationObserver;
  }

  if (view.matchMedia) {
    const query = view.matchMedia("(prefers-reduced-motion: reduce)");
    state.reducedMotion = query.matches;
    const handler = (event) => {
      state.reducedMotion = event.matches;
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

  // Double rAF ensures flex layout with gaps is fully computed before measuring
  state.requestAnimationFrame(() => {
    state.requestAnimationFrame(() => {
      if (!instances.has(state.container)) {
        debug?.warn("Container no longer in instances map during initialization");
        return;
      }
      refresh(state);
      startAnimation(state);
    });
  });

  const duration = performance.now() - startTime;
  debug?.info(`Instance created in ${duration.toFixed(2)}ms`, {
    container: container.id || container.className || "unnamed",
    speed: state.speed,
    originalsCount: state.originals.length,
    reducedMotion: state.reducedMotion,
  });

  return state;
}

function attach(container) {
  if (!isElement(container)) {
    debug?.warn("invalid container element");
    return;
  }

  const existing = instances.get(container);
  if (existing) {
    existing.speed = readSpeed(container);
    existing.pixelsPerMs = existing.speed / FRAME_TIME;
    scheduleRefresh(existing);
    debug?.info("marquee already attached to element, refreshed");
    return;
  }

  const state = createInstance(container);
  instances.set(container, state);
  debug?.info("marquee attached", { speed: state.speed });
}

function detach(container) {
  const state = instances.get(container);
  if (!state) {
    debug?.warn("Attempted to detach non-attached container");
    return;
  }

  debug?.info("Detaching marquee", {
    container: container.id || container.className || "unnamed",
    cloneCount: state.clones.length,
  });

  stopAnimation(state);

  if (state.resizeFrame !== null) {
    state.cancelAnimationFrame(state.resizeFrame);
    state.resizeFrame = null;
  }

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

  debug?.info("Marquee detached successfully", {
    container: container.id || container.className || "unnamed",
    activeInstances: instances.size,
  });
}

function rescan(root = document) {
  if (!root?.querySelectorAll) return;

  const found = new Set(root.querySelectorAll(`[${attrMarquee}]`));
  if (root !== document && root?.nodeType === 1 && root.hasAttribute?.(attrMarquee)) {
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

  debug?.info("rescan complete", {
    scope: root === document ? "document" : "element",
    found: found.size,
    active: instances.size,
  });
}

export const Marquee = { attach, detach, rescan };

export function init() {
  if (initialized) return;
  initialized = true;

  if (typeof window !== "undefined") {
    window.Marquee = Marquee;
  }

  debug?.info("marquee feature initialized");
  Marquee.rescan();
}

export default { init, Marquee };
