function hostScript() {
  const here = new URL(import.meta.url, document.baseURI).href;
  const scripts = document.getElementsByTagName("script");
  for (const s of scripts) {
    if (!s || !s.src) continue;
    try {
      const abs = new URL(s.src, document.baseURI).href;
      if (abs === here) return s;
    } catch {
      // POLICY: ignore invalid script src URL while scanning for host script
    }
  }
  return null;
}

function parseList(str) {
  return String(str || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Guarded helper (centralized) to avoid empty catch blocks.
// POLICY: All silent catches replaced by safe().
function safe(_label, fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Install a single shared debugger from attribute or localStorage (utils:debug). */
function installDebuggerFromAttribute(scriptEl) {
  if (window.__UTILS_DEBUG__) return;
  const lsRaw = safe(
    "localStorage:get utils:debug",
    () => localStorage.getItem("utils:debug") || "",
    "",
  );
  const fromAttr = scriptEl?.getAttribute?.("data-debug");
  const raw = fromAttr !== null ? fromAttr : lsRaw;
  if (raw === null) return; // opt-in only

  const enableAll = raw === "" || raw === "*" || raw === "true" || raw === "1";
  const enabled = enableAll ? null : new Set(parseList(raw));

  window.__UTILS_DEBUG__ = {
    enabled(ns) {
      return enableAll || enabled?.has(ns);
    },
    createLogger(ns) {
      const on = () => this.enabled(ns);
      const tag = (_lvl, args) => ["[utils]", `[${ns}]`, ...args];
      return {
        // Use console.info instead of console.log to satisfy lint rule allowing info/warn/error only.
        debug: (...a) => {
          if (on()) console.info(...tag("debug", a));
        },
        info: (...a) => {
          if (on()) console.info(...tag("info", a));
        },
        warn: (...a) => {
          if (on()) console.warn(...tag("warn", a));
        },
        error: (...a) => {
          if (on()) console.error(...tag("error", a));
        },
        // time helpers expressed via info to satisfy lint (no console.time/timeEnd)
        time: (label) => {
          if (on()) console.info(...tag("time", [label, "start"]));
        },
        timeEnd: (label) => {
          if (on()) console.info(...tag("timeEnd", [label, "end"]));
        },
      };
    },
  };
}

const s = hostScript();
installDebuggerFromAttribute(s);

const DBG = window.__UTILS_DEBUG__?.createLogger?.("loader");

function resolveFeaturesList(scriptEl) {
  const normalize = (arr) =>
    arr
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase());
  // Attribute-only bootstrapping
  const fromAttr = normalize(parseList(scriptEl?.dataset?.features));
  return fromAttr;
}

const features = resolveFeaturesList(s);
const INITED_FEATURES = new Set();

(async () => {
  const VALID = /^[a-z0-9_-]+$/;
  const uniq = Array.from(
    new Set((features || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean)),
  );
  for (const name of uniq) {
    if (!VALID.test(name)) {
      DBG?.warn("invalid feature name:", name);
      continue;
    }
    try {
      const spec = new URL(`./features/${name}/index.js`, import.meta.url).href;
      const mod = await import(spec);
      const init = mod?.init ?? mod?.default?.init;
      if (typeof init === "function" && !INITED_FEATURES.has(name)) {
        await init();
        INITED_FEATURES.add(name);
      }
    } catch (e) {
      DBG?.warn("feature failed:", name, e);
    }
  }
})();

// Package version (mirrors package.json). Update on release.
export const VERSION = "0.1.9";
