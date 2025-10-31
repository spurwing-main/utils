// marquee.pixelperfect.js — WAAPI, pixel-quantized, no fallbacks

const instances = new Map();
let initialized = false;
function genId() { return `mq-${Math.random().toString(36).slice(2, 10)}`; }

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
    metrics: { halfWidth: 0, durationMs: 0 },
    _scheduled: false,
    resizeObserver: null,
    mutationObserver: null,
  };

  state.resizeObserver = new ResizeObserver(() => scheduleUpdate(state));
  state.resizeObserver.observe(container);

  state.mutationObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      if (/^data-marquee/.test(m.attributeName)) {
        state.settings = readSettings(container);
        scheduleUpdate(state);
        return;
      }
    }
  });
  state.mutationObserver.observe(container, {
    attributes: true,
    attributeFilter: ["data-marquee-speed", "data-marquee-direction", "data-marquee-pause-on-hover"],
  });

  reducedQuery.addEventListener("change", () => {
    state.reducedMotion = reducedQuery.matches;
    scheduleUpdate(state);
  }, { signal });

  document.fonts?.ready?.then?.(() => scheduleUpdate(state));
  addHoverHandlers(state);
  instances.set(container, state);
  update(state);
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
  scheduleUpdate(state);
}

function rescan(root = document) {
  const found = queryTargets(root);
  for (const el of Array.from(instances.keys())) {
    if (!el.isConnected) { detach(el); continue; }
    if (root !== document && !root.contains(el)) detach(el);
  }
  for (const el of found) attach(el);
}

function addHoverHandlers(state) {
  const { container, signal } = state;
  container.addEventListener("pointerenter", () => {
    if (state.settings.pauseOnHover) state.anim?.pause?.();
  }, { signal });
  container.addEventListener("pointerleave", () => {
    if (state.settings.pauseOnHover) state.anim?.play?.();
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

  // Remove extra clones in A, keep original unit
  while (unitOriginal.nextSibling) unitOriginal.nextSibling.remove();

  const containerWidth = Math.ceil(container.getBoundingClientRect().width || 0);
  const minHalf = Math.max(1, containerWidth + 1);

  let baseWidth = unitOriginal.scrollWidth;
  if (!baseWidth) {
    const temp = cleanClone(unitOriginal);
    temp.setAttribute("aria-hidden", "true");
    temp.setAttribute("inert", "");
    halfA.appendChild(temp);
    baseWidth = unitOriginal.scrollWidth;
  }

  // Add clones until the half exceeds container width; guard against no-layout envs
  let guard = 0;
  let lastWidth = halfA.scrollWidth | 0;
  while (halfA.scrollWidth < minHalf) {
    const c = cleanClone(unitOriginal);
    c.setAttribute("aria-hidden", "true");
    c.setAttribute("inert", "");
    halfA.appendChild(c);
    guard += 1;
    const w = halfA.scrollWidth | 0;
    if (w <= lastWidth || guard > 32) break; // safety: jsdom may keep scrollWidth at 0
    lastWidth = w;
  }

  // Rebuild B as mirror of A
  const oldB = state.halfB;
  const newB = oldB.cloneNode(false);
  newB.setAttribute("aria-hidden", "true");
  newB.setAttribute("inert", "");
  for (const child of Array.from(halfA.children)) {
    const c = child.cloneNode(true);
    deepRemoveIds(c);
    newB.appendChild(c);
  }
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

function ensureAnimation(state, halfWidth, normalizedPhase) {
  const { inner, settings } = state;

  // --- Pixel-snapping & step easing ---
  const dpr = window.devicePixelRatio || 1;
  const distance = Math.max(1, Math.round(halfWidth * dpr) / dpr); // snap distance to DPR grid
  const pxSteps = Math.max(1, Math.round(distance));               // one step per CSS px

  const durationMs = Math.max(1, Math.round((distance / settings.speed) * 1000));
  const fromX = settings.direction === "left" ? 0 : -distance;
  const toX = settings.direction === "left" ? -distance : 0;

  // Snap phase to the nearest whole-pixel step to avoid fractional currentTime
  const stepIndex = Math.round((normalizedPhase * pxSteps)) % pxSteps;
  const phaseTime = (stepIndex / pxSteps) * durationMs;

  if (!state.anim) {
    state.anim = inner.animate(
      [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }],
      { duration: durationMs, iterations: Number.POSITIVE_INFINITY, easing: `steps(${pxSteps}, end)` }
    );
    state.anim.currentTime = phaseTime;
  } else {
    state.anim.effect.setKeyframes(
      [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }]
    );
    state.anim.effect.updateTiming({
      duration: durationMs,
      iterations: Number.POSITIVE_INFINITY,
      easing: `steps(${pxSteps}, end)`
    });
    state.anim.currentTime = phaseTime; // resume exactly on an integer-px step
  }

  state.metrics.halfWidth = distance;
  state.metrics.durationMs = durationMs;

  if (state.reducedMotion) {
    state.anim.cancel();
    inner.style.transform = "translateX(0px)";
  }
}

function update(state) {
  const currentTx = readTranslateX(state.inner);
  const prevHalf = state.metrics.halfWidth || 0;
  const prevDir = state.settings.direction;

  const halfWidth = buildHalves(state);
  watchImagesOnce(state);

  const phase = computePhaseFromTransform(prevDir, prevHalf, currentTx, halfWidth);
  ensureAnimation(state, halfWidth, phase);
}

export const Marquee = { attach, detach, rescan };

export function init() {
  if (initialized) return;
  initialized = true;
  if (typeof window !== "undefined") window.Marquee = Marquee;
  Marquee.rescan();
}

export default { init, Marquee };
