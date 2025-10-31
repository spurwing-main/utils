const DBG = typeof window !== "undefined"
  ? window.__UTILS_DEBUG__?.createLogger?.("marquee")
  : undefined;

let initialized = false;
const instances = new Map();

// Guard utility for safe ops
function safe(label, fn) {
  try {
    return fn();
  } catch (error) {
    DBG?.warn?.(label, error);
    return undefined;
  }
}

function queryTargets(root) {
  const set = new Set();
  for (const el of root.querySelectorAll?.("[data-marquee]") || []) set.add(el);
  if (root !== document && root?.nodeType === 1) {
    if (root.hasAttribute?.("data-marquee")) set.add(root);
  }
  return set;
}

function generateId() {
  return `marquee-${Math.random().toString(36).slice(2, 11)}`;
}

function readSettings(container) {
  const defaultSpeed = 100; // px per second
  const directionRaw = (container.getAttribute("data-marquee-direction") || "left").toLowerCase();
  const direction = directionRaw === "right" ? "right" : "left";
  const speedRaw = container.getAttribute("data-marquee-speed");
  const speedParsed = Number.parseFloat(speedRaw ?? "");
  const speed = Number.isFinite(speedParsed) && speedParsed > 0 ? speedParsed : defaultSpeed;
  const pauseOnHover = container.hasAttribute("data-marquee-pause-on-hover");
  return { direction, speed, pauseOnHover };
}

function ensureStructure(container) {
  // Build inner wrapper and a single original cycle node
  const inner = document.createElement("div");
  inner.style.display = "flex";
  inner.style.gap = "inherit";
  inner.style.flexWrap = "nowrap";
  inner.style.width = "max-content";
  inner.style.backfaceVisibility = "hidden";
  inner.style.perspective = "1000px";
  inner.style.willChange = "transform";

  const cycle = document.createElement("div");
  cycle.setAttribute("data-marquee-cycle", "true");
  cycle.style.display = "flex";
  cycle.style.width = "max-content";
  cycle.style.flexShrink = "0";
  cycle.style.gap = "inherit";
  cycle.style.flexWrap = "nowrap";

  const originals = Array.from(container.childNodes);
  for (const node of originals) cycle.append(node);
  inner.append(cycle);
  
  // Surface styles (no pointer-events suppression to keep content interactive)
  container.style.display = "flex";
  container.style.overflow = "hidden";

  container.append(inner);
  return { inner, cycle, originals };
}

function clearClones(state) {
  // Keep the first child as the original cycle
  const { inner, cycle } = state;
  for (const child of Array.from(inner.children)) {
    if (child !== cycle) child.remove();
  }
}

function cleanClone(node) {
  if (node && node.nodeType === 1) {
    safe("clone: mark", () => node.setAttribute("data-marquee-clone", "true"));
    safe("clone: aria-hidden", () => node.setAttribute("aria-hidden", "true"));
    safe("clone: inert", () => node.setAttribute("inert", ""));
    safe("clone: remove id", () => node.removeAttribute("id"));
  }
}

function cloneChildrenOnce(el) {
  const frag = document.createDocumentFragment();
  for (const child of Array.from(el.children)) {
    const c = child.cloneNode(true);
    cleanClone(c);
    frag.append(c);
  }
  return frag;
}

function injectKeyframes(state, totalWidth) {
  const { id, settings } = state;
  const half = Math.round(totalWidth / 2);
  const fromX = settings.direction === "left" ? 0 : -half;
  const toX = settings.direction === "left" ? -half : 0;
  const css = `@keyframes ${id} {\n  from { transform: translateX(${fromX}px); }\n  to { transform: translateX(${toX}px); }\n}`;
  const head = document.head || document.getElementsByTagName("head")[0];
  if (!head) return;
  const prev = document.getElementById(`${id}-style`);
  if (prev) prev.remove();
  const style = document.createElement("style");
  style.id = `${id}-style`;
  style.textContent = css;
  head.append(style);
}

function applyAnimation(state, totalWidth) {
  const { inner, settings } = state;
  const half = Math.max(1, Math.round(totalWidth / 2));
  const durationMs = Math.max(1, Math.round((half / settings.speed) * 1000));
  injectKeyframes(state, totalWidth);
  inner.style.animation = `${state.id} ${durationMs}ms linear infinite`;
}

function removeAnimation(state) {
  safe("remove animation style tag", () => document.getElementById(`${state.id}-style`)?.remove());
  state.inner.style.animation = "none";
}

function update(state) {

  clearClones(state);

  // Ensure content repeats at least to 2x container width
  const containerWidth = Math.ceil(state.container.getBoundingClientRect().width || 0);
  // Always ensure at least two identical halves by doubling once when needed
  if (state.inner.children.length < 2) {
    state.inner.append(cloneChildrenOnce(state.inner));
  }
  let contentWidth = state.inner.scrollWidth;
  // Continue doubling until content comfortably covers 2x the container width
  while (contentWidth < containerWidth * 2) {
    state.inner.append(cloneChildrenOnce(state.inner));
    contentWidth = state.inner.scrollWidth;
  }

  // No external interaction hooks

  // Honor prefers-reduced-motion
  if (state.reducedMotion) {
    removeAnimation(state);
    return;
  }

  const totalWidth = state.inner.scrollWidth;
  applyAnimation(state, totalWidth);
}

function addHoverHandlers(state) {
  if (!state.settings.pauseOnHover) return;
  const onEnter = () => { state.inner.style.animationPlayState = "paused"; };
  const onLeave = () => { state.inner.style.animationPlayState = "running"; };
  state._hoverEnter = onEnter;
  state._hoverLeave = onLeave;
  state.container.addEventListener("mouseenter", onEnter, { passive: true });
  state.container.addEventListener("mouseleave", onLeave, { passive: true });
}

function removeHoverHandlers(state) {
  if (!state._hoverEnter || !state._hoverLeave) return;
  state.container.removeEventListener("mouseenter", state._hoverEnter);
  state.container.removeEventListener("mouseleave", state._hoverLeave);
  state._hoverEnter = undefined;
  state._hoverLeave = undefined;
}

function attach(container) {
  if (container?.nodeType !== 1) return;
  if (instances.has(container)) {
    // Refresh settings and animation
    const state = instances.get(container);
    state.settings = readSettings(container);
    removeHoverHandlers(state);
    addHoverHandlers(state);
    update(state);
    return;
  }

  try {
    const id = generateId();
    const settings = readSettings(container);
    // Capture original styles before mutation
    const originalOverflow = container.style.overflow;
    const originalDisplay = container.style.display;
    const { inner, cycle, originals } = ensureStructure(container);
    const reducedMotion = typeof window !== "undefined" && window.matchMedia
      ? !!window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

    const state = {
      id,
      container,
      inner,
      cycle,
      originals,
      settings,
      reducedMotion,
      resizeObserver: null,
      mutationObserver: null,
      motionQuery: null,
      motionHandler: null,
      originalOverflow,
      originalDisplay,
    };

    // Observe container size changes (modern browsers only)
    if (typeof window !== "undefined" && window.ResizeObserver) {
      state.resizeObserver = new window.ResizeObserver(() => update(state));
      state.resizeObserver.observe(container);
    }

    // Watch style + data-marquee-* attributes like the reference
    const Obs = (typeof window !== "undefined" && window.MutationObserver) ? window.MutationObserver : null;
    if (Obs) {
      state.mutationObserver = new Obs((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === "style") { update(state); return; }
          if (m.attributeName && /^data-marquee/.test(m.attributeName)) { update(state); return; }
        }
      });
      state.mutationObserver.observe(container, { attributes: true, attributeFilter: [
        "style",
        "data-marquee-speed","data-marquee-direction","data-marquee-pause-on-hover",
      ] });
    }

    // Fonts and image loads can change measurements
    safe("fonts.ready", () => document?.fonts?.ready?.then?.(() => update(state)));
    try {
      for (const img of state.inner.querySelectorAll?.("img") || []) {
        if (!img.complete) {
          img.addEventListener("load", () => update(state), { once: true });
          img.addEventListener("error", () => update(state), { once: true });
        }
      }
    } catch (error) {
      DBG?.warn?.("image listeners failed", error);
    }

    // Prefers-reduced-motion updates
    if (typeof window !== "undefined" && window.matchMedia) {
      const q = window.matchMedia("(prefers-reduced-motion: reduce)");
      const handler = () => { state.reducedMotion = q.matches; update(state); };
      q.addEventListener("change", handler);
      state.motionQuery = q;
      state.motionHandler = handler;
    }

    addHoverHandlers(state);

    instances.set(container, state);
    update(state);
  } catch (error) {
    DBG?.error?.("attach failed", error);
  }
}

function detach(container) {
  const state = instances.get(container);
  if (!state) return;

  // Remove observers
  if (state.resizeObserver) state.resizeObserver.disconnect();
  if (state.mutationObserver) state.mutationObserver.disconnect();
  if (state.motionQuery && state.motionHandler) state.motionQuery.removeEventListener("change", state.motionHandler);

  removeHoverHandlers(state);
  removeAnimation(state);

  // Restore DOM
  try {
    for (const node of state.originals) container.append(node);
    state.inner.remove();
    container.style.overflow = state.originalOverflow ?? "";
    container.style.display = state.originalDisplay ?? "";
  } catch (error) {
    DBG?.warn?.("restore failure", error);
  }

  instances.delete(container);
}

function rescan(root = document) {
  if (!root?.querySelectorAll) return;
  const found = queryTargets(root);

  // Detach instances that are gone or outside scope
  for (const el of Array.from(instances.keys())) {
    if (!el.isConnected) { detach(el); continue; }
    const withinScope = root === document ? true : root.contains(el);
    if (withinScope && !found.has(el)) detach(el);
  }

  // Attach new ones
  for (const el of found) attach(el);
}

export const Marquee = { attach, detach, rescan };

export function init() {
  if (initialized) return; // idempotent
  initialized = true;
  try {
    if (typeof window !== "undefined") window.Marquee = Marquee;
  } catch (_) {}
  Marquee.rescan();
}

export default { init, Marquee };
