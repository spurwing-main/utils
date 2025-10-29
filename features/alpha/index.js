// Minimal test feature used only by automated tests.
//
// Contract:
// - Export init() which performs a visible side effect so tests can assert it ran.
// - Idempotent: calling init multiple times is harmless, but loader should only
//   invoke it once per feature load (subsequent loadFeatures calls are cached).
//
// Side effect: increment window.__ALPHA_INITED__ counter.

let _inited = false;

export function init() {
  if (_inited) return; // idempotent
  _inited = true;
  if (typeof window !== "undefined") {
    window.__ALPHA_INITED__ = (window.__ALPHA_INITED__ || 0) + 1;
  }
}

export default { init };
