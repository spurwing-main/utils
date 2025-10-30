function findHostScript() {
  const currentUrl = new URL(import.meta.url, document.baseURI).href;
  const scripts = document.getElementsByTagName("script");
  for (const script of scripts) {
    if (!script?.src) continue;
    const scriptUrl = new URL(script.src, document.baseURI).href;
    if (scriptUrl === currentUrl) return script;
  }
  return null;
}

function parseList(str) {
  return String(str || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    // POLICY: capability detection fallback to avoid noisy logs in normal operation
    return fallback;
  }
}

function installDebugger(scriptElement) {
  if (window.__UTILS_DEBUG__) return;

  const localStorageValue = safe(() => localStorage.getItem("utils:debug"), null);
  const attributeValue = scriptElement?.getAttribute?.("data-debug");
  const debugValue = attributeValue !== null ? attributeValue : localStorageValue;
  if (debugValue == null) return;

  const enableAll =
    debugValue === "" || debugValue === "*" || debugValue === "true" || debugValue === "1";
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

const scriptElement = findHostScript();
installDebugger(scriptElement);

const DBG = window.__UTILS_DEBUG__?.createLogger?.("loader");

function getFeatures(scriptElement) {
  const items = parseList(scriptElement?.dataset?.features);
  return items.map((item) => item.toLowerCase()).filter(Boolean);
}

const features = getFeatures(scriptElement);
const INITED_FEATURES = new Set();
const VALID_NAME = /^[a-z0-9_-]+$/;
const uniqueFeatures = [...new Set(features)];

for (const name of uniqueFeatures) {
  if (!VALID_NAME.test(name)) {
    DBG?.warn("invalid feature name:", name);
    continue;
  }

  if (INITED_FEATURES.has(name)) continue;

  try {
    const url = new URL(`./features/${name}/index.js`, import.meta.url).href;
    const module = await import(url);
    const init = module?.init ?? module?.default?.init;
    if (typeof init === "function") {
      await init();
      INITED_FEATURES.add(name);
    }
  } catch (error) {
    DBG?.warn("feature failed:", name, error);
  }
}

// Package version (mirrors package.json). Update on release.
export const VERSION = "0.1.18";
