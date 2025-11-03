// marquee.pixelperfect.js — WAAPI, pixel-quantized, no fallbacks

const instances = new Map();
let initialized = false;
function genId() { return `mq-${Math.random().toString(36).slice(2, 10)}`; }

// POLICY-EXCEPTION: In non-browser test environments, requestAnimationFrame may not exist.
// Provide a minimal fallback using setTimeout solely to schedule a single frame.
function scheduleRaf(cb) {
  const w = typeof window !== 'undefined' ? window : undefined;
  const rafFn = (w && typeof w.requestAnimationFrame === 'function')
    ? w.requestAnimationFrame
    : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  if (rafFn) return rafFn(cb);
  return setTimeout(cb, 16);
}

function readSettings(el) {
  const dir = (el.getAttribute("data-marquee-direction") || "left").toLowerCase();
  const speedRaw = el.getAttribute("data-marquee-speed");
  const parsed = Number.parseFloat(speedRaw);
  const speed = Number.isFinite(parsed) && parsed > 0 ? parsed : 100; // px/s
  const pauseOnHover = el.hasAttribute("data-marquee-pause-on-hover");
  return { direction: dir === "right" ? "right" : "left", speed, pauseOnHover };
}

function queryTargets(root) {
  const set = new Set();
  for (const el of root.querySelectorAll?.("[data-marquee]") || []) set.add(el);
  if (root !== document && root?.nodeType === 1 && root.hasAttribute?.("data-marquee")) set.add(root);
  return set;
}

function deepRemoveIds(el) {
  if (el.nodeType !== 1) return;
  el.removeAttribute("id");
  for (const n of el.children) deepRemoveIds(n);
}

function createStructure(container) {
  const originals = Array.from(container.childNodes);

  const inner = document.createElement("div");
  Object.assign(inner.style, {
    display: "flex",
    flexWrap: "nowrap",
    width: "max-content",
    gap: "inherit",
    willChange: "transform",
    transform: "translateX(0px)",
    contain: "paint style layout",
    isolation: "isolate",
  });

  const halfA = document.createElement("div");
  Object.assign(halfA.style, { display: "flex", flexWrap: "nowrap", width: "max-content", gap: "inherit" });

  const unitOriginal = document.createElement("div");
  Object.assign(unitOriginal.style, { display: "flex", flexWrap: "nowrap", width: "max-content", gap: "inherit" });
  for (const n of originals) unitOriginal.appendChild(n);

  halfA.appendChild(unitOriginal);

  const halfB = document.createElement("div");
  Object.assign(halfB.style, { display: "flex", flexWrap: "nowrap", width: "max-content", gap: "inherit" });
  halfB.setAttribute("aria-hidden", "true");
  halfB.setAttribute("inert", "");

  const outer = container;
  Object.assign(outer.style, {
    overflow: "hidden",
    display: "flex",
    contain: "layout paint style",
  });

  inner.append(halfA, halfB);
  outer.append(inner);
  return { inner, halfA, halfB, unitOriginal, originals };
}

function cleanClone(node) {
  const clone = node.cloneNode(true);
  deepRemoveIds(clone);
  return clone;
}

function readTranslateX(el) {
  const t = (typeof window !== "undefined" ? window.getComputedStyle?.(el)?.transform : "") || "";
  if (t === "none") return 0;
  const m = t.match(/^matrix\(([^)]+)\)$/);
  if (m) return Number.parseFloat(m[1].split(",")[4]) || 0;
  const m3 = t.match(/^matrix3d\(([^)]+)\)$/);
  if (m3) return Number.parseFloat(m3[1].split(",")[12]) || 0;
  return 0;
}

function scheduleUpdate(state) {
  if (state._scheduled) return;

  // If currently updating, mark pending and return
  if (state._updating) {
    state._pendingUpdate = true;
    return;
  }

  state._scheduled = true;
  queueMicrotask(() => { state._scheduled = false; update(state); });
}

function attach(container) {
  if (!container || container.nodeType !== 1) return;
  if (instances.has(container)) { refresh(instances.get(container)); return; }

  const id = genId();
  const settings = readSettings(container);
  const { inner, halfA, halfB, unitOriginal, originals } = createStructure(container);
  const originalStyle = container.getAttribute("style");

  const ac = (typeof window !== "undefined" && window.AbortController)
    ? new window.AbortController()
    : new AbortController();
  const signal = ac.signal;
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    id, container, inner, halfA, halfB, unitOriginal, originals,
    originalStyle,
    settings,
    reducedMotion: !!reducedQuery.matches,
    reducedQuery, ac, signal,
    anim: null,
    metrics: { halfWidth: 0, durationMs: 0, containerWidth: 0, contentWidth: 0 },
    _scheduled: false,
    _updating: false, // Prevent ResizeObserver feedback loop
    _pendingUpdate: false, // Track if update was requested during _updating
    resizeObserver: null,
    mutationObserver: null,
    // Startup momentum state
    startupPhase: 'waiting',  // 'waiting' | 'ramping' | 'running'
    startupMultiplier: 0.2,   // Start at 20% speed
    startupStartTime: 0,
    startupRampDuration: 400, // Ramp up over 400ms
  };

  // Use ResizeObserver with debouncing to prevent feedback loops
  let resizeCheckScheduled = false;
  state.resizeObserver = new ResizeObserver((entries) => {
    if (resizeCheckScheduled) return;
    resizeCheckScheduled = true;

    // Use RAF to batch resize checks and avoid feedback loops
    requestAnimationFrame(() => {
      resizeCheckScheduled = false;

      for (const entry of entries) {
        // Only trigger if container's border-box actually changed size
        const newWidth = Math.ceil(entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect.width || 0);
        const prevWidth = state.metrics.containerWidth || 0;
        if (newWidth !== prevWidth) {
          scheduleUpdate(state);
          break;
        }
      }
    });
  });
  state.resizeObserver.observe(container, { box: 'border-box' });

  state.mutationObserver = new MutationObserver((muts) => {
    let needsUpdate = false;

    for (const m of muts) {
      // Check for attribute changes
      if (m.type === 'attributes' && /^data-marquee/.test(m.attributeName)) {
        state.settings = readSettings(container);
        needsUpdate = true;
      }
      // Check for content changes (childList, characterData)
      if (m.type === 'childList' || m.type === 'characterData') {
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      scheduleUpdate(state);
    }
  });
  state.mutationObserver.observe(container, {
    attributes: true,
    attributeFilter: ["data-marquee-speed", "data-marquee-direction", "data-marquee-pause-on-hover"],
    childList: true, // Watch for added/removed children
    subtree: true,   // Watch all descendants
    characterData: true, // Watch text changes
  });

  reducedQuery.addEventListener("change", () => {
    state.reducedMotion = reducedQuery.matches;
    if (state.reducedMotion && state.startupPhase === 'ramping') {
      state.startupPhase = 'running'; // Stop ramp immediately
    }
    scheduleUpdate(state);
  }, { signal });

  document.fonts?.ready?.then?.(() => scheduleUpdate(state));
  addHoverHandlers(state);
  instances.set(container, state);

  // Build structure immediately (clones, halves, animation in paused state)
  update(state);

  // Defer animation start for smoother page load
  const startAnimation = () => {
    if (!instances.has(container)) return; // Detached before startup
    // Only start ramping if still in waiting phase (prevent race conditions)
    if (state.startupPhase !== 'waiting') return;

    state.startupPhase = 'ramping';
    state.startupStartTime = performance.now();
    scheduleRaf(() => updateStartupMomentum(state));
  };

  // Use requestIdleCallback for better performance during page load
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(startAnimation, { timeout: 500 });
  } else {
    setTimeout(startAnimation, 100);
  }
}

function detach(container) {
  const state = instances.get(container);
  if (!state) return;
  state.resizeObserver?.disconnect();
  state.mutationObserver?.disconnect();
  state.ac.abort();
  state.anim?.cancel?.();
  try {
    for (const n of state.originals) state.container.appendChild(n);
    state.inner.remove();
  } catch (_error) {
    // POLICY: contain failures; attempt best-effort cleanup without throwing
  }
  if (state.originalStyle == null) {
    // Explicitly reset inline styles we set
    state.container.style.overflow = "visible";
    state.container.style.display = "";
    state.container.style.contain = "";
  } else {
    state.container.setAttribute("style", state.originalStyle);
  }
  instances.delete(container);
}

function refresh(state) {
  state.settings = readSettings(state.container);
  // Do not force-start the animation; preserve startup phase so ramp always applies.
  scheduleUpdate(state);
}

function rescan(root = document) {
  const found = queryTargets(root);

  // Detach elements that are disconnected, outside root, or lost data-marquee attribute
  for (const el of Array.from(instances.keys())) {
    if (!el.isConnected) { detach(el); continue; }
    if (root !== document && !root.contains(el)) { detach(el); continue; }
    // Detach if in scope but lost the data-marquee attribute
    if (root === document || root.contains(el)) {
      if (!el.hasAttribute('data-marquee')) {
        detach(el);
      }
    }
  }

  // Attach or refresh all found elements to keep dynamic content in sync
  for (const el of found) {
    attach(el); // attach() refreshes if already initialized
  }
}

function addHoverHandlers(state) {
  const { container, signal } = state;
  container.addEventListener("pointerenter", () => {
    // Don't pause during waiting phase (already paused for startup)
    if (state.settings.pauseOnHover && state.startupPhase !== 'waiting') {
      state.anim?.pause?.();
    }
  }, { signal });
  container.addEventListener("pointerleave", () => {
    // Don't play during waiting phase (startup will handle it)
    if (state.settings.pauseOnHover && state.startupPhase !== 'waiting') {
      state.anim?.play?.();
    }
  }, { signal });
}

function watchImagesOnce(state) {
  const imgs = state.inner.querySelectorAll("img");
  for (const img of imgs) {
    if (img.complete) continue;
    img.addEventListener("load", () => scheduleUpdate(state), { once: true, signal: state.signal });
    img.addEventListener("error", () => scheduleUpdate(state), { once: true, signal: state.signal });
  }
}

function buildHalves(state) {
  const { container, halfA, unitOriginal } = state;

  const containerWidth = Math.ceil(container.getBoundingClientRect().width || 0);
  const currentContentWidth = unitOriginal.scrollWidth;

  const prevContainerWidth = state.metrics.containerWidth || 0;
  const prevContentWidth = state.metrics.contentWidth || 0;

  // Skip rebuild only if BOTH container AND content unchanged
  if (containerWidth === prevContainerWidth &&
      currentContentWidth === prevContentWidth &&
      halfA.children.length > 1) {
    return halfA.scrollWidth;
  }

  state.metrics.containerWidth = containerWidth;
  state.metrics.contentWidth = currentContentWidth;

  // Remove extra clones in A, keep original unit
  while (unitOriginal.nextSibling) unitOriginal.nextSibling.remove();

  const minHalf = Math.max(1, containerWidth + 1);

  // Batch DOM operations: collect clones first, append once
  const clonesToAdd = [];
  const baseWidth = unitOriginal.scrollWidth;

  if (!baseWidth) {
    const temp = cleanClone(unitOriginal);
    temp.setAttribute("aria-hidden", "true");
    temp.setAttribute("inert", "");
    clonesToAdd.push(temp);
  }

  // Calculate how many clones needed - be generous to avoid second pass
  const estimatedUnitWidth = baseWidth || 200;
  const estimatedClonesNeeded = Math.ceil(minHalf / estimatedUnitWidth) + 2;

  for (let i = 0; i < estimatedClonesNeeded && i < 32; i++) {
    const c = cleanClone(unitOriginal);
    c.setAttribute("aria-hidden", "true");
    c.setAttribute("inert", "");
    clonesToAdd.push(c);
  }

  // Single batch append
  halfA.append(...clonesToAdd);

  // If estimation was wrong, add clones until we have enough
  let safetyCount = 0;
  while (halfA.scrollWidth < minHalf && safetyCount < 32) {
    const extra = cleanClone(unitOriginal);
    extra.setAttribute("aria-hidden", "true");
    extra.setAttribute("inert", "");
    halfA.appendChild(extra);
    safetyCount++;
  }

  // Rebuild B as mirror of A
  const oldB = state.halfB;
  const newB = oldB.cloneNode(false);
  newB.setAttribute("aria-hidden", "true");
  newB.setAttribute("inert", "");

  const fragment = document.createDocumentFragment();
  for (const child of Array.from(halfA.children)) {
    const c = child.cloneNode(true);
    deepRemoveIds(c);
    fragment.appendChild(c);
  }
  newB.appendChild(fragment);
  oldB.replaceWith(newB);
  state.halfB = newB;

  return halfA.scrollWidth;
}

function computePhaseFromTransform(prevDir, prevHalf, currentTx, newHalf) {
  if (!Number.isFinite(currentTx) || prevHalf <= 0 || newHalf <= 0) return 0;
  const offsetPx = prevDir === "left" ? Math.max(0, Math.min(prevHalf, -currentTx))
    : Math.max(0, Math.min(prevHalf, currentTx + prevHalf));
  return (offsetPx % newHalf) / newHalf; // [0,1)
}

function ensureAnimation(state, halfWidth, normalizedPhase, speedMultiplier = 1.0) {
  const { inner, settings } = state;

  // --- Pixel-snapping & step easing ---
  const dpr = window.devicePixelRatio || 1;
  const distance = Math.max(1, Math.round(halfWidth * dpr) / dpr);
  const pxSteps = Math.max(1, Math.round(distance));

  const effectiveSpeed = settings.speed;
  const durationMs = Math.max(1, Math.round((distance / effectiveSpeed) * 1000));
  const fromX = settings.direction === "left" ? 0 : -distance;
  const toX = settings.direction === "left" ? -distance : 0;

  const stepIndex = Math.round((normalizedPhase * pxSteps)) % pxSteps;
  const phaseTime = (stepIndex / pxSteps) * durationMs;

  // Check if animation parameters actually changed
  const paramsChanged =
    state.metrics.halfWidth !== distance ||
    state.metrics.durationMs !== durationMs;

  if (!state.anim) {
    // Create animation with correct playbackRate from the start
    state.anim = inner.animate(
      [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }],
      { duration: durationMs, iterations: Number.POSITIVE_INFINITY, easing: `steps(${pxSteps}, end)` }
    );
    state.anim.currentTime = phaseTime;

    // Set playbackRate BEFORE play to avoid race condition
    state.anim.playbackRate = Math.max(0.0001, speedMultiplier);

    // Pause on initial creation if still in waiting phase
    if (state.startupPhase === 'waiting') {
      state.anim.pause();
    }
  } else if (paramsChanged) {
    // Only update if parameters actually changed
    state.anim.effect.setKeyframes(
      [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }]
    );
    state.anim.effect.updateTiming({
      duration: durationMs,
      iterations: Number.POSITIVE_INFINITY,
      easing: `steps(${pxSteps}, end)`
    });
    state.anim.currentTime = phaseTime;
    state.anim.playbackRate = Math.max(0.0001, speedMultiplier);
  } else {
    // Just update playbackRate if needed (smooth ramp updates)
    if (Math.abs(state.anim.playbackRate - speedMultiplier) > 0.001) {
      state.anim.playbackRate = Math.max(0.0001, speedMultiplier);
    }
  }

  state.metrics.halfWidth = distance;
  state.metrics.durationMs = durationMs;

  if (state.reducedMotion) {
    state.anim.cancel();
    inner.style.transform = "translateX(0px)";
  }
}

function updateStartupMomentum(state) {
  // Stop if detached, not ramping, or reduced motion enabled
  if (!instances.has(state.container)) return;
  if (state.startupPhase !== 'ramping') return;
  if (state.reducedMotion) return;

  const now = performance.now();
  const elapsed = now - state.startupStartTime;
  const progress = Math.min(1, elapsed / state.startupRampDuration);

  // Ease-out cubic for smooth acceleration
  const easedProgress = 1 - (1 - progress) ** 3;
  state.startupMultiplier = 0.2 + (0.8 * easedProgress); // 0.2 → 1.0

  // Set playbackRate FIRST, then ensure playing
  if (state.anim && state.anim.playState !== 'idle') {
    state.anim.playbackRate = Math.max(0.0001, state.startupMultiplier);
    if (state.anim.playState === 'paused') {
      state.anim.play();
    }
  }

  if (progress >= 1) {
    state.startupPhase = 'running';
    state.startupMultiplier = 1.0;
    if (state.anim && state.anim.playState !== 'idle') {
      state.anim.playbackRate = 1.0;
    }
    return; // Don't schedule next frame
  }

  if (state.startupPhase === 'ramping') {
    scheduleRaf(() => updateStartupMomentum(state));
  }
}

function update(state) {
  // Prevent ResizeObserver feedback loop
  if (state._updating) return;
  state._updating = true;

  // Disconnect observers to prevent feedback from our own DOM changes
  state.mutationObserver?.disconnect();

  try {
    const currentTx = readTranslateX(state.inner);
    const prevHalf = state.metrics.halfWidth || 0;
    const prevDir = state.settings.direction;

    const halfWidth = buildHalves(state);
    watchImagesOnce(state);

    const phase = computePhaseFromTransform(prevDir, prevHalf, currentTx, halfWidth);

    // Determine speed multiplier based on startup phase
    let multiplier = state.startupMultiplier; // Default to current multiplier
    if (state.startupPhase === 'waiting') {
      multiplier = 0.2; // Start slow, animation will be paused anyway
    } else if (state.startupPhase === 'running') {
      multiplier = 1.0; // Full speed when running
    }
    // else startupPhase === 'ramping', use current startupMultiplier

    ensureAnimation(state, halfWidth, phase, multiplier);
  } finally {
    state._updating = false;

    // Only reconnect if still attached
    if (instances.has(state.container) && state.mutationObserver) {
      state.mutationObserver.observe(state.container, {
        attributes: true,
        attributeFilter: ["data-marquee-speed", "data-marquee-direction", "data-marquee-pause-on-hover"],
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    // Process any pending update that was blocked (only if still attached)
    if (state._pendingUpdate && instances.has(state.container)) {
      state._pendingUpdate = false;
      scheduleUpdate(state);
    }
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
