const debug =
  typeof window !== "undefined" ? window.__UTILS_DEBUG__?.createLogger?.("marquee") : null;

let initialized = false;

const attrMarquee = "data-marquee";
const attrSpeed = "data-marquee-speed";
const FRAME_TIME = 1000 / 60;
const MIN_WIDTH = 1;
const WIDTH_EPSILON = 1;
// POLICY-EXCEPTION: Use UPPER_CASE constant to match existing file style
const HEIGHT_RATIO_THRESHOLD = 0.25; // 25% change required to trigger refresh for height
const FOCUSABLE_SELECTOR =
  "a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

const instances = new Map();

function isElement(node) {
  return node?.nodeType === 1;
}

function readSpeed(element) {
  const raw = element.getAttribute(attrSpeed);
  if (!raw) return 1;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function sanitiseClone(node) {
  if (node?.nodeType !== 1) return;
  const element = node;
  element.setAttribute("data-marquee-clone", "true");
  element.setAttribute("aria-hidden", "true");
  element.removeAttribute("id");

  if ("inert" in element) {
    try {
      element.inert = true;
    } catch (error) {
      debug?.warn("unable to apply inert to clone", error);
    }
  }

  if (element.matches(FOCUSABLE_SELECTOR)) {
    element.setAttribute("tabindex", "-1");
  }

  for (const focusable of element.querySelectorAll(FOCUSABLE_SELECTOR)) {
    focusable.setAttribute("tabindex", "-1");
    focusable.setAttribute("aria-hidden", "true");
  }
}

function removeClones(state) {
  for (const clone of state.clones) {
    clone.remove();
  }
  state.clones.length = 0;
}

function addClones(state) {
  if (state.originals.length === 0) return;

  const baseWidth = state.loopWidth;
  const containerWidth = Math.max(state.container.clientWidth, MIN_WIDTH);

  // If container is hidden/zero-width or content has no width, create minimal clones
  // ResizeObserver will trigger refresh and create proper clones when visible
  const isHiddenOrEmpty = containerWidth <= MIN_WIDTH || baseWidth <= MIN_WIDTH;

  let totalWidth = baseWidth;
  const fragment = state.container.ownerDocument.createDocumentFragment();

  // For hidden/empty containers, create at least one set of clones for structure
  // For visible containers, create enough clones to fill the viewport plus one loop
  const minIterations = isHiddenOrEmpty ? 1 : 0;
  let iterations = 0;

  while (totalWidth < containerWidth + baseWidth || iterations < minIterations) {
    for (const node of state.originals) {
      const clone = node.cloneNode(true);
      sanitiseClone(clone);
      fragment.append(clone);
      state.clones.push(clone);
    }
    totalWidth += baseWidth;
    iterations++;

    // Safety limit to prevent infinite loops
    if (iterations > 1000) break;
  }

  state.wrapper.append(fragment);
}

function refresh(state) {
  removeClones(state);

  state.loopWidth = Math.max(state.wrapper.scrollWidth, MIN_WIDTH);
  state.speed = readSpeed(state.container);
  state.pixelsPerMs = state.speed / FRAME_TIME;
  state.offset %= state.loopWidth;
  if (!Number.isFinite(state.offset)) state.offset = 0;

  addClones(state);
  state.wrapper.style.transform = `translateX(-${state.offset}px)`;
  state.lastContainerWidth = state.container.clientWidth;
  state.lastContainerHeight = state.container.clientHeight;
  state.lastWrapperWidth = state.wrapper.scrollWidth;

  // If content appears to have zero/minimal width (hidden container, fonts loading, etc.),
  // schedule a retry when ResizeObserver fires
  if (state.loopWidth <= MIN_WIDTH && state.originals.length > 0) {
    debug?.warn("marquee content has minimal width, will retry on resize");
  }
}

function stopAnimation(state) {
  if (state.animationId === null) return;
  state.cancelAnimationFrame(state.animationId);
  state.animationId = null;
  state.lastTick = null;
}

function startAnimation(state) {
  if (state.reducedMotion) {
    stopAnimation(state);
    state.offset = 0;
    state.wrapper.style.transform = "translateX(0)";
    return;
  }

  if (state.animationId !== null) return;

  const step = (timestamp) => {
    if (state.animationId === null) return;
    if (!state.container.isConnected || !state.container.hasAttribute(attrMarquee)) {
      detach(state.container);
      return;
    }

    if (state.lastTick === null) {
      state.lastTick = timestamp;
    }

    const delta = timestamp - state.lastTick;
    state.lastTick = timestamp;

    state.offset += state.pixelsPerMs * delta;

    if (state.offset >= state.loopWidth) {
      state.offset %= state.loopWidth;
    }

    state.wrapper.style.transform = `translateX(-${state.offset}px)`;
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
  const doc = container.ownerDocument;
  const view = doc?.defaultView;

  if (!view?.ResizeObserver) {
    throw new Error("Marquee requires ResizeObserver support.");
  }
  if (!view.requestAnimationFrame || !view.cancelAnimationFrame) {
    throw new Error("Marquee requires requestAnimationFrame support.");
  }

  const computed = view.getComputedStyle(container);
  const originalColumnGap = computed.columnGap;

  const wrapper = doc.createElement("div");
  wrapper.style.cssText =
    "display:inline-flex;white-space:nowrap;will-change:transform;grid-area:1/1";

  if (originalColumnGap && originalColumnGap !== "normal") {
    wrapper.style.columnGap = originalColumnGap;
  }

  const originals = Array.from(container.childNodes);
  for (const node of originals) {
    wrapper.append(node);
  }

  const originalOverflow = container.style.overflow;
  const originalDisplay = container.style.display;

  container.style.overflow = "hidden";
  container.style.display = "grid";
  container.style.gridTemplateColumns = "1fr";

  container.append(wrapper);

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
    originalDisplay,
    requestAnimationFrame: view.requestAnimationFrame.bind(view),
    cancelAnimationFrame: view.cancelAnimationFrame.bind(view),
    mutationObserver: null,
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

        // Only trigger on significant height changes (>= 25% of last height)
        // Ignore jitter and minor content shifts; height is less critical for marquee.
        const baseline = state.lastContainerHeight;
        if (baseline > 0) {
          const delta = Math.abs(height - baseline);
          const ratio = delta / baseline;
          if (ratio >= HEIGHT_RATIO_THRESHOLD) {
            state.lastContainerHeight = height;
            heightChanged = true;
          }
        } else {
          // Establish baseline without triggering a refresh when previous height is 0/invalid
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

  // Defer initial refresh until after browser layout is complete
  // This prevents measuring scrollWidth before content is rendered
  state.requestAnimationFrame(() => {
    if (!instances.has(state.container)) return;
    refresh(state);
    startAnimation(state);
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
  if (!state) return;

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
  state.container.style.display = state.originalDisplay;
  state.container.style.gridTemplateColumns = "";

  instances.delete(container);
  debug?.info("marquee detached");
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
