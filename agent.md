# Agent Development Guide

This document contains the project policies, development guidelines, and build rules for contributing to the utils repository. For user-facing documentation, see [`README.md`](README.md).

## Project Policies

A concise set of repository-wide rules to keep code explicit, low complexity, and consistent. Any intentional deviation MUST include an inline comment containing `POLICY-EXCEPTION:` with a short rationale.

1. **Naming & Structure**
   - Feature directories: lowercase only `[a-z0-9_-]+`.
   - Export surface: each feature exports [`init()`](features/) (either named or via default object).
   - Internal helpers stay file-scoped unless reused.

2. **Idempotent Initialization**
   - [`init()`](features/) must tolerate multiple calls (loader ensures single effective run; extra calls no-op).

3. **Error Handling (No Silent Failures)**
   - Empty `catch {}` blocks forbidden.
   - Each catch must either:
     - Log via gated debugger (`window.__UTILS_DEBUG__?.createLogger(namespace)`) OR
     - Return a deterministic fallback with comment: `// POLICY: <reason>`
   - Swallowing by design: add `// POLICY-EXCEPTION: <reason>`.

4. **Debug & Logging**
   - Use only the namespaced logger for verbose tracing.
   - `console.warn|error|info` allowed for surfaced operational issues; avoid `console.log` (lint warns).
   - Enable via attribute, query, or localStorage (see Debugging section).

5. **Side Effects & Imports**
   - No DOM mutations or network work at module top-level besides safe capability detection.
   - Feature side effects happen inside [`init()`](features/) (or functions it calls).

6. **Complexity & Size**
   - Prefer small pure helpers over repeated inline try/catch.
   - Reuse a `safe(label, fn)` pattern to centralize guarded operations.
   - Avoid deep nesting (>3 levels); early returns favored.

7. **Source Safety (Loader)**
   - Loader only accepts validated feature names (`^[a-z0-9_-]+$`).
   - All normalization to lowercase before import.
   - Caching prevents double initialization.

8. **Policy Exceptions**
   - Must include inline comment `// POLICY-EXCEPTION: reason`.
   - PR / commit message should reference why the rule is temporarily waived.

9. **Lint Enforcement (See [`eslint.config.js`](eslint.config.js))**
   - Modern JS only: `no-var`, `prefer-const`, shorthand objects, arrow callbacks.
   - `no-empty` (no silent catch), `consistent-return`, `eqeqeq`.
   - `no-console` (warns) except `warn|error|info`.

10. **Testing Contract**
    - Feature tests assert only documented behavior (init idempotence, events, validation).
    - No reliance on private internal symbols.

## Agent Development Guide

### Terminology

- **Agent / Feature:** A directory under [`features/`](features/) with a lowercase name (`^[a-z0-9_-]+$`) exporting an [`init()`](features/) entry point.
- **Managed Loader:** [`loader.js`](loader.js) which discovers and loads agents.
- **Debug Logger:** Provided (when enabled) via `window.__UTILS_DEBUG__?.createLogger(namespace)`.

### Structure Requirements

- Directory: lowercase only (policy enforced by loader validation).
- Entry file: `features/<name>/index.js`.
- Must export:
  - `export function init()` OR
  - `export default { init }`
- [`init()`](features/) MUST be idempotent (multiple calls cause no harmful side effects).
- No module-top DOM mutations or network requests; defer to [`init()`](features/).

### Init Contract

[`init()`](features/):

1. Performs lightweight setup (event listeners, observers, mutation hooks).
2. Avoids throwing; internal failures are contained and logged via debug logger.
3. Must not assume presence of other agents unless explicitly documented.

### Lifecycle States

1. **Discovered:** Name requested via attribute / query / programmatic list.
2. **Imported:** Dynamic `import()` of [`index.js`](features/) resolved.
3. **Initialized:** [`init()`](features/) invoked (at most once per agent name per page).
4. **Active:** Runtime observers / listeners attached.
5. **Error** (optional): Initialization failure captured and reported (loader surfaces `ok:false`).
6. **Cached:** Subsequent load requests return prior result without re-import or re-init.

### Loader Interaction

The loader ([`loader.js`](loader.js)) will:

- Normalize requested names to lowercase.
- Deduplicate names.
- Reject invalid names (`^[a-z0-9_-]+$` only).
- Cache success & failure results.
- Emit `CustomEvent('utils:feature-load', { detail: { name, ok, error? } })` for each attempt.

### Events

If emitting DOM `CustomEvent`s:

- Prefix with concise namespace (example: video feature uses `video:*`).
- Payload object must be stable and documented in the feature README.
- Events SHOULD NOT throw; wrap dispatch in safe handling.

### Cross-Agent Independence

- An agent must function (no uncaught failures) when any other agent is absent.
- Shared util patterns (e.g. parsing helpers) may be copied if that reduces coupling; micro duplication preferred over premature shared abstractions.

### Performance & Resource Hygiene

- Attach observers/listeners only when necessary; detach on feature teardown if supported.
- Avoid global intervals/timeouts unless strictly required; prefer event or observer driven flows.
- Minimize synchronous layout thrash; batch DOM reads/writes if doing multiple operations.

### Testing Expectations

Tests (see [`test/loader.test.mjs`](test/loader.test.mjs)) should verify:

- Single initialization (idempotence).
- Correct event emission (if applicable).
- Graceful handling of invalid configuration.
- No reliance on private internal symbols (public surface only).

### Author Checklist (Pre-Commit)

- [ ] Directory name lowercase matches loader validation.
- [ ] [`init()`](features/) exported and idempotent.
- [ ] No silent catch blocks (each catch logs or documented with POLICY-EXCEPTION).
- [ ] No top-level DOM mutations or premature network requests.
- [ ] Debug logging gated by `__UTILS_DEBUG__`.
- [ ] README section (or existing feature README updated) documenting attributes / API / events.
- [ ] Lint passes (`npm run lint`).
- [ ] (If applicable) Tests updated or added.

### Agent Template

```js
// features/example/index.js
const DBG = window.__UTILS_DEBUG__?.createLogger?.('example');

let _inited = false;

export function init() {
  if (_inited) return; // idempotent
  _inited = true;
  try {
    // setup listeners / observers
  } catch (e) {
    try { DBG?.warn('init failure', e); } catch (_) {}
  }
}

export default { init };
```

### Future Enhancements

- Optional shared `safe()` micro utility in a common location if multiple agents converge on the same guarded pattern.
- Metrics hook (debug only) for measuring attach / init durations.

## Feature Naming Policy

All feature directory names are lowercase. The loader normalizes requested feature names to lowercase and only accepts: `[a-z0-9_-]+`. (Example: request `Video` → loads `video`.)