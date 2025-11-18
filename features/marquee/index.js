/* KISS Marquee — minimal + performant, loader-compatible */

// Debug logger (no top-level side effects)
const DBG = typeof window !== "undefined" ? window.__UTILS_DEBUG__?.createLogger?.("marquee") : null;

const MAX_UNITS = 1000;
const REG = new Map(); // element -> instance
const PENDING = new Set();
let RAF_ID = 0;

let booted = false;
let initScheduled = false;
let IO = null; // IntersectionObserver (shared)
let RO = null; // ResizeObserver (shared)
let MO = null; // MutationObserver (shared)

let HOVER_BOUND = false;
function ensureHoverDelegation() {
  const d = getDocument();
  if (!d || HOVER_BOUND || typeof window === "undefined") return;
  const onEnter = (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-marquee][data-pause-on-hover]') : null;
    if (el) el.setAttribute('data-hovering', 'true');
  };
  const onLeave = (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-marquee][data-pause-on-hover]') : null;
    if (el) el.removeAttribute('data-hovering');
  };
  window.addEventListener('pointerenter', onEnter, true);
  window.addEventListener('pointerleave', onLeave, true);
  HOVER_BOUND = true;
}

function getDocument() {
  try {
    return typeof document !== "undefined" ? document : null;
  } catch {
    return null;
  }
}

function ensureCSS() {
  const d = getDocument();
  if (!d) return;
  const existing = d.getElementById("marquee-css");
  const css = `
        [data-marquee]{
          display:flex;
          overflow:hidden;
          contain:layout paint style;
          content-visibility:auto;
          contain-intrinsic-size:0 40px; /* tune the 40px to your typical height */
        }
        @supports (contain-intrinsic-size:auto 40px){
          [data-marquee]{ contain-intrinsic-size:auto 40px; }
        }
        [data-marquee] .marquee-inner{
          display:flex;
          gap:inherit;
          width:max-content;
          will-change:transform;
          animation-name:marquee-scroll;
          animation-timing-function:linear;
          animation-iteration-count:infinite;
          animation-duration:0ms;
        }
        [data-marquee] .marquee-inner>*{flex:0 0 auto; pointer-events:none}
        @keyframes marquee-scroll{
          from{transform:translate3d(var(--from,0px),0,0)}
          to  {transform:translate3d(var(--to,-100px),0,0)}
        }
        [data-marquee][data-running="false"] .marquee-inner{animation-play-state:paused !important}
        [data-marquee][data-pause-on-hover]:is(:hover,[data-hovering="true"]) .marquee-inner{animation-play-state:paused !important}
        @media (prefers-reduced-motion: reduce){
          [data-marquee] .marquee-inner{animation:none !important}
        }
      `;
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const tag = d.createElement("style");
  tag.id = "marquee-css";
  tag.textContent = css;
  d.head.appendChild(tag);
}

function refreshAllInstances() {
  REG.forEach((inst) => inst.scheduleUpdate(true));
}

function queueFrame(inst, force) {
  inst._force = inst._force || !!force;
  PENDING.add(inst);
  if (RAF_ID) return;
  RAF_ID = requestAnimationFrame(() => {
    const toRun = Array.from(PENDING);
    PENDING.clear();
    RAF_ID = 0;
    for (const i of toRun) {
      i._rafQueued = false;
      const f = i._force;
      i._force = false;
      i._update(f);
    }
  });
}

function ensureIO() {
  const d = getDocument();
  if (!d || IO) return;
  if (typeof window !== "undefined" && "IntersectionObserver" in window) {
    IO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const inst = REG.get(e.target);
        if (!inst) continue;
        const running = e.isIntersecting && !d.hidden;
        inst._visible = e.isIntersecting;
        inst.el.setAttribute("data-running", running ? "true" : "false");
        inst.inner.style.willChange = running ? "transform" : "auto";
        if (e.isIntersecting) inst.scheduleUpdate(true);
      }
    }, { root: null, rootMargin: "200px 0px 200px 0px", threshold: 0 });
  }
}

function ensureRO() {
  const d = getDocument();
  if (!d || RO) return;
  if (typeof window !== "undefined" && "ResizeObserver" in window) {
    RO = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // If we are observing inner, we need to find the instance from the parent
        const target = entry.target;
        const inst = REG.get(target) || REG.get(target.parentElement);
        inst?.scheduleUpdate(true);
      }
    });
  }
}

function ensureMO() {
  const d = getDocument();
  if (!d || MO) return;
  if (typeof window !== "undefined" && "MutationObserver" in window) {
    MO = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          if (REG.has(m.target)) {
            const inst = REG.get(m.target);
            const next = readSettings(m.target);
            inst.applySettings(next);
          }
          continue;
        }
        for (const node of m.removedNodes) {
          if (node.nodeType !== 1) continue;
          if (REG.has(node)) {
            REG.get(node)?.destroy();
            REG.delete(node);
          }
          // Also check descendants if a parent was removed
          if (node.querySelectorAll) {
            const kids = node.querySelectorAll("[data-marquee]");
            for (const k of kids) {
              if (REG.has(k)) {
                REG.get(k)?.destroy();
                REG.delete(k);
              }
            }
          }
        }
      }
    });
    MO.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-speed", "data-direction", "data-pause-on-hover"] });
  }
}

function readSettings(el) {
  const raw = Number.parseFloat(el.dataset.speed);
  const speed = Number.isFinite(raw) ? raw : 100;
  const clamped = Math.min(2000, Math.max(10, speed));
  return {
    direction: (el.dataset.direction || "left").toLowerCase() === "right" ? "right" : "left",
    speed: clamped,
  };
}

class Instance {
  constructor(el) {
    this.el = el;
    this.inner = null;
    this.settings = readSettings(el);
    this._unitTemplate = null;
    this._unitWidth = 0;
    this._visible = false;
    this._rafQueued = false;
    this._last = { total: 0, unit: 0, dir: this.settings.direction };

    this._ensureStructure();
    this._attach();
    this._update(true);
  }

  _ensureStructure() {
    const d = getDocument();
    if (!d) return;
    let inner = this.el.querySelector(":scope > .marquee-inner");
    if (!inner) {
      inner = d.createElement("div");
      inner.className = "marquee-inner";
      const frag = d.createDocumentFragment();
      while (this.el.firstChild) frag.appendChild(this.el.firstChild);
      inner.appendChild(frag);
      this.el.appendChild(inner);
    }
    this.inner = inner;
    this.el.setAttribute("data-running", "false");
    this._unitTemplate = Array.from(inner.children).map((n) => n.cloneNode(true));
    if (this._unitTemplate.length === 0) {
      this.el.setAttribute("data-running", "false");
    }
    this._unitWidth = 0; // lazy
  }

  _measureUnitWidth() {
    const d = getDocument();
    if (!d) return 0;

    // Optimization: If we already have enough clones (at least 2 groups),
    // we can measure the stride directly from the DOM without cloning.
    // This avoids expensive operations during resize.
    const templateLen = this._unitTemplate.length;
    if (templateLen > 0 && this.inner.children.length >= 2 * templateLen) {
      const first = this.inner.children[0];
      const secondGroupFirst = this.inner.children[templateLen];
      if (first && secondGroupFirst) {
        const rect1 = first.getBoundingClientRect();
        const rect2 = secondGroupFirst.getBoundingClientRect();
        // The difference in 'left' is the stride (width + gap)
        const stride = Math.abs(rect2.left - rect1.left);
        if (stride > 0) {
          this._unitWidth = stride;
          return stride;
        }
      }
    }

    const probe = d.createElement("div");
    probe.style.cssText =
      "display:flex;gap:inherit;width:max-content;position:absolute;visibility:hidden;pointer-events:none;contain:layout paint style;";
    const frag = d.createDocumentFragment();
    this._unitTemplate.forEach((n) => frag.appendChild(n.cloneNode(true)));
    probe.appendChild(frag);
    this.el.appendChild(probe);
    const w1 = probe.scrollWidth;

    // Add a second set to measure the stride (width + gap)
    const frag2 = d.createDocumentFragment();
    this._unitTemplate.forEach((n) => frag2.appendChild(n.cloneNode(true)));
    probe.appendChild(frag2);
    const w2 = probe.scrollWidth;

    this.el.removeChild(probe);

    // The stride is the difference (width of group + gap)
    const stride = Math.max(1, w2 - w1);
    this._unitWidth = stride;
    return this._unitWidth;
  }

  _fill() {
    const existingLen = this.inner.children.length;
    const templateLen = this._unitTemplate.length;
    if (templateLen === 0) {
      return { total: this.inner.scrollWidth, unit: this._unitWidth || 0, groups: existingLen ? 1 : 0 };
    }



    const w = this.el.clientWidth;
    if (w <= 0) return { total: 0, unit: 0, groups: 0 };

    const unit = this._unitWidth || this._measureUnitWidth();
    if (unit <= 0) {
      return { total: this.inner.scrollWidth, unit: 0, groups: 1 };
    }

    // Need at least 2 groups for seamless loop.
    // We need enough width to cover the viewport (w) plus one full unit (unit) because we scroll by 'unit'.
    // So total width >= w + unit.
    let groupsNeeded = Math.ceil((w + unit) / unit);
    groupsNeeded = Math.max(2, Math.min(MAX_UNITS, groupsNeeded));

    const currentNodes = this.inner.children.length;
    const targetNodes = groupsNeeded * templateLen;

    if (targetNodes > currentNodes) {
      const toAdd = targetNodes - currentNodes;
      // We can just append clones. Since we repeat the template, we can just cycle through it.
      // But simpler to just append full groups if we can, or just append individual nodes.
      // Since we want to maintain the template order:
      const frag = document.createDocumentFragment();
      for (let i = 0; i < toAdd; i++) {
        // Which node from template?
        // currentNodes + i is the index.
        // template index = (currentNodes + i) % templateLen
        const templateIndex = (currentNodes + i) % templateLen;
        frag.appendChild(this._unitTemplate[templateIndex].cloneNode(true));
      }
      this.inner.appendChild(frag);
    } else if (targetNodes < currentNodes) {
      let toRemove = currentNodes - targetNodes;
      while (toRemove > 0 && this.inner.lastChild) {
        this.inner.removeChild(this.inner.lastChild);
        toRemove--;
      }
    }

    this._markClonesA11y();
    return { total: unit * groupsNeeded, unit, groups: groupsNeeded };
  }

  _markClonesA11y() {
    const kids = Array.from(this.inner.children);
    const unitLen = this._unitTemplate.length;
    if (unitLen <= 0) return;
    for (let i = 0; i < unitLen && i < kids.length; i++) {
      if (kids[i].hasAttribute("aria-hidden")) kids[i].removeAttribute("aria-hidden");
      if (kids[i].hasAttribute("inert")) kids[i].removeAttribute("inert");
    }
    for (let i = unitLen; i < kids.length; i++) {
      kids[i].setAttribute("aria-hidden", "true");
      kids[i].setAttribute("inert", "");
      // Strip IDs to avoid duplicates
      if (kids[i].id) kids[i].removeAttribute("id");
      const nestedIds = kids[i].querySelectorAll("[id]");
      nestedIds.forEach((el) => el.removeAttribute("id"));
    }
  }

  _setAnimation(unit) {
    const distance = Math.max(0, Math.floor(unit));
    const from = this.settings.direction === "left" ? 0 : -distance;
    const to = this.settings.direction === "left" ? -distance : 0;
    this.inner.style.setProperty("--from", from + "px");
    this.inner.style.setProperty("--to", to + "px");
    const pxPerSec = Math.max(1, this.settings.speed);
    const dur = Math.min(600_000, Math.max(16, (distance / pxPerSec) * 1000)); // 16ms–10m
    this.inner.style.animationDuration = `${dur}ms`;
  }

  _update(force = false) {
    if (this._rafQueued) this._rafQueued = false;
    if (this.el.clientWidth <= 0 || !this._visible) return;
    if (force) this._unitWidth = 0;

    const { total, unit } = this._fill();
    const needAnimUpdate =
      force ||
      total !== this._last.total ||
      unit !== this._last.unit ||
      this.settings.direction !== this._last.dir;

    if (needAnimUpdate) {
      this._setAnimation(unit);
    }

    this._last = { total, unit, dir: this.settings.direction };
  }

  scheduleUpdate(force = false) {
    if (this._rafQueued) return;
    this._rafQueued = true;
    queueFrame(this, force);
  }

  _applyHover() {
    // handled in CSS
  }

  applySettings(next) {
    const changedDir = this.settings.direction !== next.direction;
    const changedSpeed = this.settings.speed !== next.speed;
    this.settings = next;
    if (changedDir || changedSpeed) this.scheduleUpdate(true);
  }

  _attach() {
    ensureRO();
    if (RO) {
      RO.observe(this.el);
      if (this.inner) RO.observe(this.inner);
    }
    if (IO) IO.observe(this.el);
    if (!IO) {
      this._visible = true;
      this.el.setAttribute("data-running", "true");
      this.scheduleUpdate(true);
    }
  }

  destroy() {
    try {
      if (RO) {
        RO.unobserve(this.el);
        if (this.inner) RO.unobserve(this.inner);
      }
    } catch (_) { }
    try {
      if (IO) IO.unobserve(this.el);
    } catch (_) { }
    if (this.inner) {
      this.inner.style.animation = "none";
      this.inner.style.willChange = "auto";
    }

    // Try to restore original nodes (the first group)
    const frag = document.createDocumentFragment();
    const templateLen = this._unitTemplate.length;

    // If inner still has children, the first 'templateLen' are likely the originals
    // (unless we did something fancy, but we generally append clones)
    if (this.inner && this.inner.children.length >= templateLen) {
      for (let i = 0; i < templateLen; i++) {
        frag.appendChild(this.inner.children[0]); // Always take 0 as we move them out
      }
    } else {
      // Fallback to clones if something went wrong
      this._unitTemplate.forEach((n) => frag.appendChild(n.cloneNode(true)));
    }

    this.el.replaceChildren(frag);
  }
}

function rescan() {
  const d = getDocument();
  if (!d) return;
  ensureCSS();
  ensureIO();
  ensureRO();
  const nodes = new Set(d.querySelectorAll("[data-marquee]"));
  nodes.forEach((el) => {
    const inst = REG.get(el);
    const next = readSettings(el);
    if (!inst) REG.set(el, new Instance(el));
    else inst.applySettings(next);
  });
  Array.from(REG.keys()).forEach((el) => {
    if (!nodes.has(el) || !el.hasAttribute("data-marquee")) {
      const inst = REG.get(el);
      try {
        inst?.destroy();
      } finally {
        REG.delete(el);
      }
    }
  });
  if (REG.size === 0) {
    try {
      RO?.disconnect();
    } catch (_) { }
    try {
      IO?.disconnect();
    } catch (_) { }
    RO = null;
    IO = null;
    try {
      MO?.disconnect();
    } catch (_) { }
    MO = null;
  }
}

export const Marquee = {
  rescan,
  get size() {
    return REG.size;
  },
};

function boot() {
  const d = getDocument();
  if (!d || booted) return;
  booted = true;
  ensureCSS();
  ensureIO();
  ensureRO();
  ensureMO();
  ensureHoverDelegation();

  try {
    if (d.fonts?.ready) {
      d.fonts.ready.then(refreshAllInstances);
    }
  } catch (error) {
    DBG?.warn("fonts refresh failed", error);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pageshow", refreshAllInstances);
    window.addEventListener("orientationchange", refreshAllInstances, { passive: true });
  }

  try {
    const mq =
      typeof window !== "undefined"
        ? window.matchMedia?.("(prefers-reduced-motion: reduce)")
        : null;
    if (mq?.addEventListener) {
      mq.addEventListener("change", () => {
        const reduce = mq.matches;
        REG.forEach((inst) => {
          const running = !reduce && inst._visible;
          inst.el.setAttribute("data-running", running ? "true" : "false");
          inst.inner.style.willChange = running ? "transform" : "auto";
        });
      });
    }
  } catch (_) { }

  d.addEventListener("visibilitychange", () => {
    const paused = d.hidden;
    REG.forEach((inst) => {
      const running = !paused && inst._visible;
      inst.el.setAttribute("data-running", running ? "true" : "false");
      inst.inner.style.willChange = running ? "transform" : "auto";
    });
  });

  try {
    rescan();
  } catch (error) {
    DBG?.warn("initial rescan failed", error);
  }

  // Optional global API to mirror the script variant
  try {
    if (typeof window !== "undefined") {
      window.Marquee = window.Marquee || {};
      window.Marquee.rescan = rescan;
      Object.defineProperty(window.Marquee, "size", { get: () => REG.size });
    }
  } catch (_) { }
}

export function init() {
  const d = getDocument();
  if (!d) return;
  if (booted) return;
  if (initScheduled) return;
  initScheduled = true;
  if (d.readyState === "complete" || d.readyState === "interactive") boot();
  else d.addEventListener("DOMContentLoaded", boot, { once: true });
}

export default { init, Marquee };
