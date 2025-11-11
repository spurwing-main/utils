/* KISS Marquee — minimal + performant, loader-compatible */

// Debug logger (no top-level side effects)
const DBG = typeof window !== "undefined" ? window.__UTILS_DEBUG__?.createLogger?.("marquee") : null;

const MAX_UNITS = 6;
const REG = new Map(); // element -> instance

let booted = false;
let initScheduled = false;
let IO = null; // IntersectionObserver instance (created on init)

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
  if (d.getElementById("marquee-css")) return;
  const tag = d.createElement("style");
  tag.id = "marquee-css";
  tag.textContent = `
      [data-marquee]{display:flex;overflow:hidden;contain:content}
      [data-marquee] .marquee-inner{display:flex;gap:inherit;width:max-content;will-change:transform}
      [data-marquee] .marquee-inner>*{flex:0 0 auto}
      @keyframes marquee-scroll{
        from{transform:translateX(var(--from,0px))}
        to  {transform:translateX(var(--to,-100px))}
      }
      @media (prefers-reduced-motion: reduce){
        [data-marquee] .marquee-inner{animation:none !important}
      }
    `;
  d.head.appendChild(tag);
}

function ensureIO() {
  const d = getDocument();
  if (!d || IO) return;
  try {
    if ("IntersectionObserver" in window) {
      IO = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const inst = REG.get(e.target);
          if (!inst) continue;
          const running = e.isIntersecting && !d.hidden;
          inst.inner.style.animationPlayState = running ? "running" : "paused";
          inst.inner.style.willChange = running ? "transform" : "auto";
        }
      });
    }
  } catch (error) {
    DBG?.warn("IO setup failed", error);
  }
}

function readSettings(el) {
  return {
    direction: (el.dataset.direction || "left").toLowerCase() === "right" ? "right" : "left",
    speed: Number.isFinite(Number.parseFloat(el.dataset.speed))
      ? Number.parseFloat(el.dataset.speed)
      : 100,
    pauseOnHover: el.hasAttribute("data-pause-on-hover"),
  };
}

class Instance {
  constructor(el) {
    this.el = el;
    this.inner = null;
    this.settings = readSettings(el);
    this._unitTemplate = null;
    this._unitWidth = 0;
    this._hoverIn = this._hoverOut = null;
    this._resizeObs = null;
    this._rafQueued = false;
    this._last = { total: 0, dir: this.settings.direction };

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
    this._unitTemplate = Array.from(inner.children).map((n) => n.cloneNode(true));
    this._unitWidth = 0; // lazy
  }

  _measureUnitWidth() {
    const before = this.inner.scrollWidth;
    const frag = document.createDocumentFragment();
    this._unitTemplate.forEach((n) => frag.appendChild(n.cloneNode(true)));
    this.inner.appendChild(frag);
    const after = this.inner.scrollWidth;
    for (let i = 0; i < this._unitTemplate.length; i++) this.inner.removeChild(this.inner.lastChild);
    this._unitWidth = Math.max(1, after - before);
    return this._unitWidth;
  }

  _fill() {
    const w = this.el.clientWidth;
    if (w <= 0) return this.inner.scrollWidth;
    while (this.inner.children.length > this._unitTemplate.length) this.inner.removeChild(this.inner.lastChild);
    const unit = this._unitWidth || this._measureUnitWidth();
    const target = Math.max(2 * w, 2 * unit);
    let width = this.inner.scrollWidth;
    let unitsNow = Math.ceil(this.inner.children.length / this._unitTemplate.length);
    while (width < target && unitsNow < MAX_UNITS) {
      const frag = document.createDocumentFragment();
      this._unitTemplate.forEach((n) => frag.appendChild(n.cloneNode(true)));
      this.inner.appendChild(frag);
      width = this.inner.scrollWidth;
      unitsNow++;
    }
    return width;
  }

  _setAnimation(total) {
    const half = Math.floor(total / 2);
    const from = this.settings.direction === "left" ? 0 : -half;
    const to = this.settings.direction === "left" ? -half : 0;
    this.inner.style.setProperty("--from", from + "px");
    this.inner.style.setProperty("--to", to + "px");
    const dur = (Math.abs(half) / Math.max(1, this.settings.speed)) * 1000;
    this.inner.style.animation = `marquee-scroll ${dur}ms linear infinite`;
  }

  _update(force = false) {
    if (this._rafQueued) this._rafQueued = false;
    if (this.el.clientWidth <= 0) return;
    const total = this._fill();
    if (force || total !== this._last.total || this.settings.direction !== this._last.dir) {
      this._setAnimation(total);
    }
    this._applyHover();
    this._last = { total, dir: this.settings.direction };
  }

  scheduleUpdate(force = false) {
    if (this._rafQueued) return;
    this._rafQueued = true;
    requestAnimationFrame(() => this._update(force));
  }

  _applyHover() {
    if (this._hoverIn) {
      this.el.removeEventListener("mouseenter", this._hoverIn);
      this.el.removeEventListener("mouseleave", this._hoverOut);
      this._hoverIn = this._hoverOut = null;
    }
    if (!this.settings.pauseOnHover) return;
    this._hoverIn = () => {
      this.inner.style.animationPlayState = "paused";
    };
    this._hoverOut = () => {
      this.inner.style.animationPlayState = "running";
    };
    this.el.addEventListener("mouseenter", this._hoverIn);
    this.el.addEventListener("mouseleave", this._hoverOut);
  }

  applySettings(next) {
    const changedDir = this.settings.direction !== next.direction;
    const changedSpeed = this.settings.speed !== next.speed;
    const changedHover = this.settings.pauseOnHover !== next.pauseOnHover;
    this.settings = next;
    if (changedHover) this._applyHover();
    if (changedDir) this.scheduleUpdate(true);
    else if (changedSpeed) this.scheduleUpdate(true); // force to recompute duration
  }

  _attach() {
    if ("ResizeObserver" in window) {
      this._resizeObs = new ResizeObserver(() => this.scheduleUpdate(true));
      this._resizeObs.observe(this.el);
    } else {
      window.addEventListener("resize", () => this.scheduleUpdate(true));
    }
    if (IO) IO.observe(this.el);
  }

  destroy() {
    try {
      if (this._resizeObs) this._resizeObs.disconnect();
    } catch (_) {}
    this._resizeObs = null;
    try {
      if (IO) IO.unobserve(this.el);
    } catch (_) {}
    if (this._hoverIn) {
      this.el.removeEventListener("mouseenter", this._hoverIn);
      this.el.removeEventListener("mouseleave", this._hoverOut);
    }
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    this._unitTemplate.forEach((n) => this.el.appendChild(n.cloneNode(true)));
  }
}

function rescan() {
  const d = getDocument();
  if (!d) return;
  ensureCSS();
  ensureIO();
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
  try {
    if ("IntersectionObserver" in window) {
      IO = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const inst = REG.get(e.target);
          if (!inst) continue;
          const running = e.isIntersecting && !d.hidden;
          inst.inner.style.animationPlayState = running ? "running" : "paused";
          inst.inner.style.willChange = running ? "transform" : "auto";
        }
      });
    }
  } catch (error) {
    DBG?.warn("IO setup failed", error);
  }

  d.addEventListener("visibilitychange", () => {
    const paused = d.hidden;
    REG.forEach((inst) => {
      inst.inner.style.animationPlayState = paused ? "paused" : "running";
      inst.inner.style.willChange = paused ? "auto" : "transform";
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
  } catch (_) {}
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
