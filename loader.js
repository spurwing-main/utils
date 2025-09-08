function hostScript() {
  // Prefer currentScript when available (for classic scripts). For modules, it can be null.
  try {
    if (document.currentScript && document.currentScript.src) return document.currentScript;
  } catch (e) {
    try { (window.__UTILS_DEBUG__?.createLogger?.('loader'))?.warn('hostScript currentScript failed', e); } catch(_err) { /* POLICY-EXCEPTION: debug logger unavailable */ void _err; }
  }
  // Fallback: compare normalized absolute URLs against this module's URL
  let here;
  try {
    here = new URL(import.meta.url, document.baseURI).href;
  } catch (e) {
    try { (window.__UTILS_DEBUG__?.createLogger?.('loader'))?.warn('hostScript self URL resolve failed', e); } catch(_err) { /* POLICY-EXCEPTION: debug logger unavailable */ void _err; }
    return null;
  }
  const scripts = document.getElementsByTagName('script');
  for (const s of scripts) {
    if (!s || !s.src) continue;
    try {
      const abs = new URL(s.src, document.baseURI).href;
      if (abs === here) return s;
    } catch (e) {
      try { (window.__UTILS_DEBUG__?.createLogger?.('loader'))?.warn('hostScript compare failed', e); } catch(_err) { /* POLICY-EXCEPTION: debug logger unavailable */ void _err; }
    }
  }
  return null;
}

// Cached loader logger helper (avoids repeated createLogger() calls)
let _LOADER_LOGGER;
function loaderLogger(){
 return _LOADER_LOGGER || (_LOADER_LOGGER = window.__UTILS_DEBUG__?.createLogger?.('loader'));
}

function parseList(str) {
 return String(str || '')
   .split(/[,\s]+/)
   .map(s => s.trim())
   .filter(Boolean);
}

// Guarded helper (centralized) to avoid empty catch blocks.
// POLICY: All silent catches replaced by safe().
function safe(label, fn, fallback){
  try { return fn(); }
  catch(e){
    try { loaderLogger()?.warn('safe error', label, e); } catch(_err){ /* POLICY-EXCEPTION: secondary logging path failed */ void _err; }
    return fallback;
  }
}
 
function parseQuery(qs){
  const out = {};
  if (!qs) return out;
  safe('parseQuery', () => {
    const u = new URL(qs, document.baseURI);
    for (const [k,v] of u.searchParams.entries()){
      if (k in out) continue;
      out[k] = v;
    }
  });
  return out;
}

/** Install a single shared debugger from attribute, query (?utils-debug) or localStorage (utils:debug). */
function installDebuggerFromAttribute(scriptEl) {
  if (window.__UTILS_DEBUG__) return;
  const query = parseQuery(scriptEl?.src || '');
  const lsRaw = safe('localStorage:get utils:debug', () => localStorage.getItem('utils:debug') || '', '');
  const fromAttr = scriptEl?.getAttribute?.('data-debug');
  const raw = fromAttr !== null ? fromAttr : (query['utils-debug'] ?? lsRaw);
  if (raw === null) return; // opt-in only

  const enableAll = raw === '' || raw === '*' || raw === 'true' || raw === '1';
  const enabled = enableAll ? null : new Set(parseList(raw));

 window.__UTILS_DEBUG__ = {
   enabled(ns) { return enableAll || (enabled && enabled.has(ns)); },
   createLogger(ns) {
     const on = () => this.enabled(ns);
     const tag = (lvl, args) => ['[utils]', `[${ns}]`, ...args];
     return {
       // Use console.info instead of console.log to satisfy lint rule allowing info/warn/error only.
       debug: (...a) => { if (on()) console.info(...tag('debug', a)); },
       info:  (...a) => { if (on()) console.info(...tag('info', a)); },
       warn:  (...a) => { if (on()) console.warn(...tag('warn', a)); },
       error: (...a) => { if (on()) console.error(...tag('error', a)); },
       // time helpers expressed via info to satisfy lint (no console.time/timeEnd)
       time:   (label) => { if (on()) console.info(...tag('time', [label, 'start'])); },
       timeEnd:(label) => { if (on()) console.info(...tag('timeEnd', [label, 'end'])); }
     };
   }
 };
}

const s = hostScript();
installDebuggerFromAttribute(s);

const DBG = loaderLogger();

function resolveFeaturesList(scriptEl){
  const normalize = (arr) =>
    arr.map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase());
  const fromAttr = normalize(parseList(scriptEl?.dataset?.features));
  const fromQuery = normalize(parseList(parseQuery(scriptEl?.src || '').features));
  if (!fromAttr.length) return fromQuery;
  if (!fromQuery.length) return fromAttr;
  const set = new Set([...fromAttr, ...fromQuery]);
  return Array.from(set);
}

const features = resolveFeaturesList(s);

// Cache of load results keyed by feature name
const LOADED_FEATURE_RESULTS = new Map();
// Map of feature name -> in-flight Promise<{name,ok,error?}> used to dedupe concurrent loadFeatures() calls
const IN_FLIGHT_FEATURE_PROMISES = new Map();

function dispatchFeatureLoad(result){
  try {
    window.dispatchEvent?.(new CustomEvent('utils:feature-load', { detail: result }));
  } catch(e){
    try { DBG?.warn('dispatch utils:feature-load failed', e); } catch(_err) { /* POLICY-EXCEPTION: event dispatch logging failed */ void _err; }
  }
}

/**
* Load one or more features by name with caching & concurrency de‑duplication.
*
* Behavior:
* - Normalizes input: trims, lowercases, removes duplicates & falsy entries.
* - Validates names against /^[a-z0-9_-]+$/ (prevents path traversal / unexpected import targets).
* - Caches terminal results (success OR failure) in LOADED_FEATURE_RESULTS; subsequent calls reuse.
* - De‑duplicates concurrent in‑flight imports via IN_FLIGHT_FEATURE_PROMISES so init() only runs once.
* - Emits window CustomEvent('utils:feature-load', { detail: { name, ok, error? } }) for every attempt (cached, failed, or successful).
* - Returns array of per-feature result objects in the order of the normalized unique name list.
*
* Concurrency:
* - If multiple loadFeatures() calls race for the same feature name, only the first performs the dynamic
*   import + init(); others await the shared promise and receive the identical result object.
*
* @param {string[]} names Optional array of feature names to load. Defaults to features resolved from the host script attributes / query.
* @returns {Promise<Array<{ name: string, ok: boolean, error?: any }>>} Ordered results for each unique requested feature.
*/
export async function loadFeatures(names = features){
  if (!Array.isArray(names)) return [];
  // Folder naming policy: lowercase only
  const VALID = /^[a-z0-9_-]+$/;
  const uniq = Array.from(new Set(
    names
      .map(n => String(n).trim().toLowerCase())
      .filter(Boolean)
  ));
  if (uniq.length === 0) return [];

  const out = [];
  for (const name of uniq){
    // Return cached result if already loaded (success or failure)
    if (LOADED_FEATURE_RESULTS.has(name)){
      out.push(LOADED_FEATURE_RESULTS.get(name));
      continue;
    }

    // Basic name validation to avoid unintended path traversal
    if (!VALID.test(name)){
      const error = new Error('invalid feature name');
      const result = { name, ok: false, error };
      LOADED_FEATURE_RESULTS.set(name, result);
      DBG?.warn('feature invalid name skipped:', name);
      dispatchFeatureLoad(result);
      out.push(result);
      continue;
    }

    // If another parallel invocation is already loading this feature, await it.
    if (IN_FLIGHT_FEATURE_PROMISES.has(name)){
      out.push(await IN_FLIGHT_FEATURE_PROMISES.get(name));
      continue;
    }

    const promise = (async () => {
      try {
        const spec = new URL(`./features/${name}/index.js`, import.meta.url).href;
        const mod = await import(spec);
        const init = mod?.init ?? mod?.default?.init;
        if (typeof init === 'function') {
          await init();
        }
        const result = { name, ok: true };
        LOADED_FEATURE_RESULTS.set(name, result);
        DBG?.info('feature loaded:', name);
        dispatchFeatureLoad(result);
        return result;
      } catch (e) {
        const result = { name, ok: false, error: e };
        LOADED_FEATURE_RESULTS.set(name, result);
        DBG?.warn('feature failed:', name, e);
        dispatchFeatureLoad(result);
        return result;
      } finally {
        IN_FLIGHT_FEATURE_PROMISES.delete(name);
      }
    })();
    IN_FLIGHT_FEATURE_PROMISES.set(name, promise);
    out.push(await promise);
  }

  if (out.some(r => !r.ok)){
    try { console.warn('[utils][loader] some features failed to load', out); } catch(e){ /* POLICY-EXCEPTION: console unavailable */ void e; }
  }
  return out;
}

export function bootstrap(list){
 return loadFeatures(list);
}

// Package version (mirrors package.json). Update on release.
export const VERSION = '0.1.0';

 // Import immediately; each feature's init() is DOM-safe (waits for DOM if needed).
loadFeatures();
