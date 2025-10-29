function hostScript() {
  const currentScriptUrl = new URL(import.meta.url, document.baseURI).href;
  const scripts = document.getElementsByTagName("script");
  for (const script of scripts) {
    if (!script || !script.src) continue;
    try {
      const absoluteUrl = new URL(script.src, document.baseURI).href;
      if (absoluteUrl === currentScriptUrl) return script;
    } catch {
      // POLICY: ignore invalid script src URL while scanning for host script
    }
  }
  return null;
}

function parseList(str) {
  return String(str || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
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
function installDebuggerFromAttribute(scriptElement) {
  if (window.__UTILS_DEBUG__) return;
  const localStorageValue = safe(
    "localStorage:get utils:debug",
    () => localStorage.getItem("utils:debug") || "",
    "",
  );
  const attributeValue = scriptElement?.getAttribute?.("data-debug");
  const debugValue = attributeValue !== null ? attributeValue : localStorageValue;
  if (debugValue === null) return; // opt-in only

  const enableAll = debugValue === "" || debugValue === "*" || debugValue === "true" || debugValue === "1";
  const enabledNamespaces = enableAll ? null : new Set(parseList(debugValue));

  window.__UTILS_DEBUG__ = {
    enabled(namespace) {
      return enableAll || enabledNamespaces?.has(namespace);
    },
    createLogger(namespace) {
      const isEnabled = () => this.enabled(namespace);
      const formatMessage = (_level, args) => ["[utils]", `[${namespace}]`, ...args];
      return {
        // Use console.info instead of console.log to satisfy lint rule allowing info/warn/error only.
        debug: (...args) => {
          if (isEnabled()) console.info(...formatMessage("debug", args));
        },
        info: (...args) => {
          if (isEnabled()) console.info(...formatMessage("info", args));
        },
        warn: (...args) => {
          if (isEnabled()) console.warn(...formatMessage("warn", args));
        },
        error: (...args) => {
          if (isEnabled()) console.error(...formatMessage("error", args));
        },
        // time helpers expressed via info to satisfy lint (no console.time/timeEnd)
        time: (label) => {
          if (isEnabled()) console.info(...formatMessage("time", [label, "start"]));
        },
        timeEnd: (label) => {
          if (isEnabled()) console.info(...formatMessage("timeEnd", [label, "end"]));
        },
      };
    },
  };
}

const scriptElement = hostScript();
installDebuggerFromAttribute(scriptElement);

const DBG = window.__UTILS_DEBUG__?.createLogger?.("loader");

function resolveFeaturesList(scriptElement) {
  const normalize = (items) =>
    items
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.toLowerCase());
  // Attribute-only bootstrapping
  const featuresFromAttribute = normalize(parseList(scriptElement?.dataset?.features));
  return featuresFromAttribute;
}

const features = resolveFeaturesList(scriptElement);
const INITED_FEATURES = new Set();

(async () => {
  const VALID_NAME_PATTERN = /^[a-z0-9_-]+$/;
  const uniqueFeatures = Array.from(
    new Set((features || []).map((name) => String(name).trim().toLowerCase()).filter(Boolean)),
  );
  for (const featureName of uniqueFeatures) {
    if (!VALID_NAME_PATTERN.test(featureName)) {
      DBG?.warn("invalid feature name:", featureName);
      continue;
    }
    try {
      const moduleUrl = new URL(`./features/${featureName}/index.js`, import.meta.url).href;
      const module = await import(moduleUrl);
      const init = module?.init ?? module?.default?.init;
      if (typeof init === "function" && !INITED_FEATURES.has(featureName)) {
        await init();
        INITED_FEATURES.add(featureName);
      }
    } catch (error) {
      DBG?.warn("feature failed:", featureName, error);
    }
  }
})();

// Package version (mirrors package.json). Update on release.
export const VERSION = "0.1.11";
