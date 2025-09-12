/*
Instance class for video management
Extracted from features/video/index.js for better modularity
*/

import {
  isVideo,
  parseTokens,
  parseThresholdInput,
  parseRootMargin,
  closest,
  getWIN,
  getDOC,
} from "./internal-utils.js";
import { A, logError } from "./constants.js";

const getWin = getWIN;
const getDoc = getDOC;
const PRIORITY_PLAY_MS = 120; // pointer-on priority window to override hidden-pause

function emit(el, name, detail) {
  try {
    el.dispatchEvent(new CustomEvent(name, { bubbles: false, cancelable: false, detail }));
  } catch (e) {
    logError("emit", e);
  }
}
function log(...args) {
  try {
    getWin()
      .__UTILS_DEBUG__?.createLogger?.("video")
      ?.debug(...args);
  } catch {
    /* POLICY-EXCEPTION: debug logger unavailable */
  }
}
function warn(...args) {
  logError("instance", args);
}

function envHasHover() {
  try {
    return getWin().matchMedia?.("(hover: hover) and (pointer: fine)")?.matches === true;
  } catch {
    return false;
  }
}

function hasNativeSrc(v) {
  return !!(v?.src || v?.currentSrc);
}

function selectedFirstManagedInContainer(container, INSTANCES) {
  if (!container) return null;
  const nodes = container.querySelectorAll("video");
  for (let i = 0; i < nodes.length; i++) {
    const vid = nodes[i];
    if (INSTANCES.has(vid)) return vid;
    if (vid.hasAttribute(A.SRC)) return vid;
  }
  return null;
}

function resolvePointerContainer(v, selector) {
  if (!selector) return null; // no selector → will bind on the video itself
  try {
    const c = closest(v, selector);
    return c || null;
  } catch {
    return null;
  }
}

function _ioVisible(entry, threshold) {
  const ratio = entry?.intersectionRatio || 0;
  if (!Number.isFinite(threshold) || threshold <= 0) return ratio > 0; // threshold 0 => any intersection
  return ratio >= threshold;
}

// Instance class
export function Instance(video, { INSTANCES, CONTAINER_CLAIMS }) {
  if (!isVideo(video)) throw new TypeError("video feature: attach() expects a <video>");
  this.v = video;
  this.cfg = this._readConfig();
  this.srcPrimary = this.cfg.srcPrimary;
  this.srcMobile = this.cfg.srcMobile;
  // Managed vs native src: if managed, ignore any native src/currentSrc and defer until load trigger.
  if (hasNativeSrc(video)) {
    warn("[video] native src/currentSrc present but ignored due to data-video-src");
    // Best-effort neutralization to avoid unintended network work before triggers.
    try {
      video.removeAttribute("src");
    } catch (e) {
      logError("removeAttribute src failed", e);
    }
    try {
      video.src = "";
    } catch (e) {
      logError("clear src failed", e);
    }
    try {
      video.load();
    } catch (e) {
      logError("video.load() failed during neutralize", e);
    }
  }
  this.loaded = false;
  this.chosenSrc = null;
  this.requestedPreload = this.cfg.preload;
  this.upgradedAutoPreload = false;
  this.pointerActive = this.cfg.pointerEnabled; // env capability
  this.io = null;
  this._visible = null; // tri-state: null unknown, boolean known
  this._pausedByHidden = false;
  this._pausedByPointerOff = false;
  this._pointerOn = false; // live state of pointer within bound scope
  this._containerBound = null; // element with listeners bound (video or container)
  this._containerOwns = false; // whether this instance owns the container per rule 4
  this._errorTriedAlt = false;
  this._destroyFns = [];
  // Store references to external dependencies
  this._INSTANCES = INSTANCES;
  this._CONTAINER_CLAIMS = CONTAINER_CLAIMS;
  this._setup();
  emit(this.v, "video:managed", { trigger: "manual" });
  log("[video] attached", this.v);
}

Instance.prototype._readConfig = function () {
  const v = this.v;
  // Stacked tokens
  const loadTokens = parseTokens(v.getAttribute(A.LOAD_WHEN));
  const playTokens = parseTokens(v.getAttribute(A.PLAY_WHEN));
  const pauseTokens = parseTokens(v.getAttribute(A.PAUSE_WHEN));
  // Cache author-provided sources for reliable retries
  const srcPrimary = v.getAttribute(A.SRC) || null;
  const srcMobile = v.getAttribute(A.SRC_MOB) || null;
  // Normalize threshold & margin
  const threshold = parseThresholdInput(v.getAttribute(A.THRESHOLD));
  const margin = parseRootMargin(v.getAttribute(A.MARGIN) || "300px 0px");
  // Pointer scope
  const parentPointer = v.getAttribute(A.PARENT_POINTER) || null;
  // Preload request (default metadata)
  const preloadRaw = String(v.getAttribute(A.PRELOAD) || "metadata").toLowerCase();
  const preload =
    preloadRaw === "auto" || preloadRaw === "metadata" || preloadRaw === "none"
      ? preloadRaw
      : "metadata";
  // Restart policies: new multi-token API with back-compat for legacy boolean
  const restartTokens = parseTokens(v.getAttribute(A.RESTART_WHEN));
  const restartWhen = {
    finished: restartTokens.includes("finished"),
    onPointer: restartTokens.includes("pointer-on"),
    // Accept both 'scroll' and 'visible' as visibility-driven restart
    onVisible: restartTokens.includes("scroll") || restartTokens.includes("visible"),
  };
  // Legacy boolean attribute mapped to pointer-on restart
  if (!restartWhen.onPointer && v.hasAttribute(A.RESTART_LEGACY)) {
    restartWhen.onPointer = true;
    try {
      logError("legacy data-video-play-restart detected; treating as pointer-on restart", null);
    } catch {
      /* POLICY-EXCEPTION: debug logger unavailable */
    }
  }
  // Force muted when present
  const muted = v.hasAttribute(A.MUTED);

  return {
    load: {
      onScroll: loadTokens.includes("scroll"),
      onPointer: loadTokens.includes("pointer-on"),
    },
    play: {
      onVisible: playTokens.includes("visible"),
      onPointer: playTokens.includes("pointer-on"),
    },
    pause: {
      onHidden: pauseTokens.includes("hidden"),
      onPointerOff: pauseTokens.includes("pointer-off"),
    },
    threshold,
    margin,
    parentPointer,
    preload,
    // Restart policy flags
    restartWhen,
    pointerEnabled: envHasHover(),
    srcPrimary,
    srcMobile,
    // Muted lock: when true, the instance enforces muted=true and will not attempt unmuted autoplay
    muted,
  };
};

Instance.prototype._setup = function () {
  const v = this.v;
  const c = this.cfg;

  // Gate preload until first successful play attempt if requested auto
  if (!this.loaded) {
    if (c.preload === "auto") v.preload = "metadata";
    else v.preload = c.preload;
  }
  // Enforce forced muted when configured via attribute
  if (c.muted) {
    try {
      v.muted = true;
    } catch (_e) {
      /* POLICY-EXCEPTION: cannot set muted flag (non-fatal) */
    }
  }

  // Visibility observation (modern browsers only)
  const needsVis = c.load.onScroll || c.play.onVisible || c.pause.onHidden;
  if (needsVis) {
    const w = getWin();
    this.io = new w.IntersectionObserver(
      (entries) => {
        this._onIntersect(entries);
      },
      {
        root: null,
        rootMargin: c.margin,
        threshold: c.threshold,
      },
    );
    this.io.observe(v);
  }

  // Pointer observation (desktop only)
  if (c.pointerEnabled && (c.load.onPointer || c.play.onPointer || c.pause.onPointerOff)) {
    const container = resolvePointerContainer(v, c.parentPointer);
    if (container) {
      // Determine ownership: only first managed descendant should bind
      const first = selectedFirstManagedInContainer(container, this._INSTANCES);
      const owns = first ? first === v : true; // if none found, allow this instance to claim
      if (owns && !this._CONTAINER_CLAIMS.has(container)) {
        this._CONTAINER_CLAIMS.set(container, v);
      }
      this._containerOwns = this._CONTAINER_CLAIMS.get(container) === v;
      if (this._containerOwns) {
        this._bindPointer(container);
        this._containerBound = container;
      } else {
        // Not owning; ignore pointer tokens per rule 4
        log("[video] container has another managed first descendant; skipping pointer for", v);
      }
    } else if (!c.parentPointer) {
      // No container selector → bind on the video itself
      this._bindPointer(v);
      this._containerBound = v;
    } else {
      // Invalid selector or no match → pointer tokens are no-ops
      warn("[video] parent pointer selector not matched; ignoring pointer tokens");
    }
  }

  // Media error handling (retry alternate once)
  const onError = (e) => {
    if (this._errorTriedAlt) {
      emit(v, "video:error", {
        trigger: "manual",
        reason: "media-error",
        url: v.currentSrc || this.chosenSrc || null,
      });
      logError("media error; no alternate remaining", e);
      return;
    }
    // Try alternate source once
    const alt = this._pickAlternate();
    if (alt && alt !== this.chosenSrc) {
      this._errorTriedAlt = true;
      this._applySrc(alt);
      v.load();
      log("[video] retrying alternate src");
    } else {
      this._errorTriedAlt = true;
      emit(v, "video:error", {
        trigger: "manual",
        reason: "no-alternate",
        url: v.currentSrc || this.chosenSrc || null,
      });
      logError("media error and no alternate");
    }
  };
  v.addEventListener("error", onError);
  this._destroyFns.push(() => v.removeEventListener("error", onError));

  // Forward native playing/pause to custom events (once per state change)
  this._lastPlayTrigger = "manual";
  const onPlaying = () => {
    const trig = this._lastPlayTrigger || "manual";
    emit(v, "video:playing", { trigger: trig });
  };
  v.addEventListener("playing", onPlaying);
  this._destroyFns.push(() => {
    v.removeEventListener("playing", onPlaying);
  });
  // Restart on finished when configured; optionally gated by pointer presence
  const onEnded = () => {
    const c = this.cfg;
    if (!c?.restartWhen?.finished) return;
    if (c.restartWhen.onPointer && !this._pointerOn) return;
    try {
      v.currentTime = 0;
    } catch {
      /* POLICY-EXCEPTION: cannot reset currentTime on ended */
    }
    this._requestPlay("finished");
  };
  v.addEventListener("ended", onEnded);
  this._destroyFns.push(() => v.removeEventListener("ended", onEnded));
};

Instance.prototype._bindPointer = function (target) {
  const c = this.cfg;
  const onEnter = () => {
    this._pointerOn = true;
    // Load if requested
    if (c.load.onPointer) this._ensureLoaded("pointer-on");
    // Play if requested
    if (c.play.onPointer) this._requestPlay("pointer-on", /*priority*/ true);
  };
  const onLeave = () => {
    this._pointerOn = false;
    if (c.pause.onPointerOff) {
      this._requestPause("pointer-off");
      this._pausedByPointerOff = true;
    }
  };
  const onCancel = () => {
    this._pointerOn = false;
    if (c.pause.onPointerOff) {
      this._requestPause("pointer-off");
      this._pausedByPointerOff = true;
    }
  };
  const opts = (() => {
    try {
      return { passive: true };
    } catch {
      return false;
    }
  })();
  target.addEventListener("pointerenter", onEnter, opts);
  target.addEventListener("pointerleave", onLeave, opts);
  target.addEventListener("pointercancel", onCancel, opts);
  this._destroyFns.push(() => {
    target.removeEventListener("pointerenter", onEnter);
    target.removeEventListener("pointerleave", onLeave);
    target.removeEventListener("pointercancel", onCancel);
  });
};

Instance.prototype._pickSrc = function () {
  const src = this.srcPrimary;
  const mob = this.srcMobile;
  if (!src && !mob) return null;
  const isMob = (() => {
    try {
      return getWin().matchMedia?.("(max-width: 812px)")?.matches === true;
    } catch {
      return false;
    }
  })();
  const chosen = isMob && mob ? mob : src || mob;
  return chosen || null;
};

Instance.prototype._pickAlternate = function () {
  const src = this.srcPrimary;
  const mob = this.srcMobile;
  if (!src && !mob) return null;
  const chosen = this.chosenSrc;
  if (chosen && src && mob) {
    return chosen === src ? mob : src;
  }
  return null;
};

Instance.prototype._applySrc = function (url) {
  const v = this.v;
  try {
    new URL(url, getDoc()?.baseURI);
  } catch (e) {
    emit(v, "video:error", { trigger: "manual", reason: "invalid-url", url: String(url) });
    throw e;
  }
  v.src = url;
  this.chosenSrc = url;
  // Remove data source attributes to lock selection (do not remove trigger config)
  try {
    v.removeAttribute(A.SRC);
  } catch (e) {
    logError("remove data-video-src failed", e);
  }
  try {
    v.removeAttribute(A.SRC_MOB);
  } catch (e) {
    logError("remove data-video-mob-src failed", e);
  }
};

Instance.prototype._ensureLoaded = function (trigger) {
  if (this.loaded) return;
  const v = this.v;
  const url = this._pickSrc();
  if (!url) {
    emit(v, "video:error", { trigger: trigger || "manual", reason: "missing-src", url: null });
    return;
  }
  try {
    this._applySrc(url);
  } catch (e) {
    logError("invalid URL provided", e);
    return;
  }
  v.load();
  this.loaded = true;
  emit(v, "video:loaded", { trigger: trigger || "manual", url: this.chosenSrc || null });
  log("[video] loaded", { trigger });
  // If IO was only for load-on-scroll and no visible/hidden behavior remains, tear it down.
  const needVis = this.cfg.play.onVisible || this.cfg.pause.onHidden;
  if (!needVis) {
    if (this.io) {
      try {
        this.io.unobserve(v);
        this.io.disconnect();
      } catch (e) {
        logError("teardown IO after load failed", e);
      }
      this.io = null;
    }
  }
};

Instance.prototype._requestPlay = function (trigger, priority = false) {
  const v = this.v;
  // If paused due to pointer-off, only a pointer-on should resume (rule 4)
  const isPointerOn = trigger === "pointer-on";
  // Allow manual override; block only auto visible resumes when paused by pointer-off
  if (this._pausedByPointerOff && trigger === "visible") {
    return;
  }

  emit(v, "video:play-request", { trigger });
  log("[video] play-request", trigger);

  // Restart on pointer-on when configured
  if (trigger === "pointer-on" && this.cfg?.restartWhen?.onPointer) {
    try {
      this.v.currentTime = 0;
    } catch (e) {
      logError("set currentTime failed", e);
    }
  }

  // Ensure loaded for play triggers that imply load
  if (!this.loaded) this._ensureLoaded(trigger);

  // Hint inline playback on all platforms
  if (!v.hasAttribute("playsinline")) v.setAttribute("playsinline", "");
  // Respect forced-muted config: if author requested data-video-muted, always keep muted true.
  const enforceMuted = !!this.cfg.muted;
  if (enforceMuted) {
    try {
      v.muted = true;
    } catch (_e) {
      /* POLICY-EXCEPTION: cannot set muted flag (non-fatal) */
    }
  } else {
    // Non-gesture play needs muted; for pointer-on, try unmuted first then fallback to muted on rejection
    if (!isPointerOn) {
      v.muted = true;
    }
  }

  try {
    const p = v.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        // Successful play → upgrade preload if originally requested auto
        if (this.requestedPreload === "auto" && !this.upgradedAutoPreload) {
          v.preload = "auto";
          this.upgradedAutoPreload = true;
        }
      }).catch((_err) => {
        // Autoplay policy fallback for pointer-on: retry muted once (only when not enforced muted)
        if (!enforceMuted && isPointerOn && !v.muted) {
          try {
            v.muted = true;
          } catch {
            /* POLICY-EXCEPTION: mute flag application failed (non-fatal) */
          }
          try {
            const p2 = v.play();
            if (p2 && typeof p2.then === "function") {
              p2.then(() => {
                if (this.requestedPreload === "auto" && !this.upgradedAutoPreload) {
                  v.preload = "auto";
                  this.upgradedAutoPreload = true;
                }
              }).catch(() => {
                /* POLICY-EXCEPTION: secondary play promise rejection ignored (fallback already muted) */
              });
            }
          } catch {
            /* POLICY-EXCEPTION: second play attempt threw (cannot recover) */
          }
        }
      });
    }
  } catch {
    /* POLICY-EXCEPTION: initial play invocation threw (will rely on subsequent triggers) */
  }
  this._lastPlayTrigger = trigger;
  if (priority) {
    const w = getWin();
    this._lastPriorityPlayAt = w.performance?.now?.() ?? Date.now();
  }
  if (isPointerOn || trigger === "manual") this._pausedByPointerOff = false;
};

Instance.prototype._requestPause = function (trigger) {
  const v = this.v;
  try {
    v.pause();
  } catch {
    /* POLICY-EXCEPTION: pause failed (already paused or unsupported) */
  }
  if (trigger === "hidden") this._pausedByHidden = true;
  if (trigger === "pointer-off") this._pausedByPointerOff = true;
  emit(v, "video:paused", { trigger });
  log("[video] paused", trigger);
};

Instance.prototype._onIntersect = function (entries) {
  const v = this.v;
  const c = this.cfg;
  let playNow = false;
  let pauseNow = false;
  let loadNow = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.target !== v) continue;
    const isVis = _ioVisible(e, c.threshold);
    // Store only when state changes
    if (this._visible === isVis) continue;
    this._visible = isVis;
    if (isVis) {
      if (c.load.onScroll && !this.loaded) loadNow = true;
      if (c.play.onVisible) playNow = true;
    } else {
      if (c.pause.onHidden) pauseNow = true;
    }
  }
  // Apply in deterministic order: pause > play unless pointer priority overrides (not applicable here)
  if (loadNow) this._ensureLoaded("visible");
  if (pauseNow) {
    // Same-frame conflict: if a priority pointer-on just happened, let play win
    const w = getWin();
    const now = w.performance?.now?.() ?? Date.now();
    if (this._lastPriorityPlayAt && now - this._lastPriorityPlayAt < PRIORITY_PLAY_MS) {
      // Skip this pause due to recent priority play
    } else {
      this._requestPause("hidden");
    }
  } else if (playNow) {
    // Resume rule: if paused because hidden and visible is allowed, resume
    if (this._pausedByHidden || this.v.paused) {
      if (c?.restartWhen?.onVisible) {
        try {
          v.currentTime = 0;
        } catch {
          /* POLICY-EXCEPTION: cannot set currentTime on visible */
        }
      }
      this._requestPlay("visible");
    }
    this._pausedByHidden = false;
    // visibility alone must NOT resume if paused because pointer-off
  }
};

// Fallback visibility path removed (modern browsers only)

Instance.prototype.refresh = function () {
  const wasLoaded = this.loaded;
  this.destroy();
  // If already managed-loaded, preserve; ignore native src on refresh as well
  this.loaded = wasLoaded;
  this.cfg = this._readConfig();
  this._setup();
  log("[video] refreshed");
};

Instance.prototype.reloadSources = function () {
  if (!this.chosenSrc) {
    this._ensureLoaded("manual");
    return;
  }
  this._applySrc(this.chosenSrc);
  this.v.load();
};

Instance.prototype.destroy = function () {
  const v = this.v;
  if (this.io) {
    try {
      this.io.unobserve(v);
      this.io.disconnect();
    } catch (e) {
      logError("destroy IO teardown failed", e);
    }
    this.io = null;
  }
  for (let i = 0; i < this._destroyFns.length; i++) {
    try {
      this._destroyFns[i]();
    } catch (e) {
      logError("destroy fn error", e);
    }
  }
  this._destroyFns.length = 0;
  // Release container claim if we owned it so a new first descendant may claim later
  if (this._containerBound && this._containerOwns) {
    try {
      this._CONTAINER_CLAIMS.delete(this._containerBound);
    } catch (e) {
      logError("container claim release failed", e);
    }
  }
  log("[video] detached");
};
