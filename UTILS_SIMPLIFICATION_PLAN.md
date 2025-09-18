# Utils Simplification Plan (Tasks)

Quick links: [Goals](#goals) · [Naming & Organization](#naming--organization) · [Repo‑Wide Tasks](#repo-wide-tasks) · [Video Example](#video-track-example-application-of-the-tasks) · [Dependency?](#what-if-we-had-a-dependency) · [Acceptance](#acceptance-checklist-per-task)

This repository is a general utilities bundle. The video feature is our first utility, not the only target. This plan defines repo‑wide tasks to reduce code size and file count while improving readability and the order of processes. Tasks are independent and can be tackled in any order that keeps tests green.

## Goals

- Same or better behavior with fewer lines and fewer files.
- Cleanest possible naming and layout across all features.
- Centralized safety, logging, and event patterns (no ad‑hoc try/catch blocks).
- Zero runtime dependencies; dev‑only tooling allowed when it clearly helps.
- Idempotent `init()` for every feature and no top‑level side effects beyond safe capability detection.

## Naming & Organization

Adopt the simplest structure that scales to a few utilities without bloat:

- `loader.js` – root entry. Installs debug logger, discovers features via `data-features`, validates names, and calls `init()` once per feature.
- `features/<name>/index.js` – mandatory entry per feature. Exports `init()` and optional API. Start with this single file.
- Optional helpers (only if needed):
  - `features/<name>/core.js` – core logic (instances/behaviors/config) when `index.js` grows past ~200 lines or mixes distinct concerns.
  - `features/<name>/document-hooks.js` – document‑level listeners (delegated controls, observers) if those concerns exceed ~80 lines.
 

Naming rules:
- Lowercase filenames; avoid dashes unless needed (`core.js`, `document-hooks.js`).
- No `internal/` nesting; keep paths short and obvious.
- Event names: `<feature>:*`.
- Logger namespace = feature directory name.

Packaging note:
- Keep exports stable for `loader.js` and `./features/*`. No shared module is required.

## Repo‑Wide Tasks

T0 – Baseline & guardrails
- Record `wc -l loader.js features/**/*.js shared/**/*.js` and run `npm run test`. Keep these numbers in PR descriptions.
- Impact: Size neutral; Complexity ↓ risk via hard numbers.

T1 – Safety & logging helpers (per feature)
- For each feature, add tiny local helpers in its file(s): `safe(label, fn, fallback)`, `emit(el, name, detail)`, and a namespaced logger via `window.__UTILS_DEBUG__`. Prefer local duplication of these tiny helpers over introducing a shared module.
- Impact: Size ↓ overall (by replacing scattered try/catch); Complexity ↓; structure stays minimal.

T2 – Normalize event and logging usage
- Require features to use `emit()` and namespaced loggers only. Forbid stray `console.*` except within the logger.
- Impact: Size ↓ small; Complexity ↓.

T3 – Feature structure simplification
- Enforce the minimal two‑helper rule (index + up to two helper files). Fold extra internal modules into `core.js` or `document-hooks.js`.
- Impact: Size ↓; Complexity ↓. See [Naming & Organization](#naming--organization).

T4 – Declarative config parsing pattern
- Provide a small pattern (documented in code comments or AGENTS.md) for token parsing and attribute mapping (e.g., `mapTokens(el, attr, allowed)` returning a normalized object). Implement per feature; avoid cross‑feature shared modules unless multiple features converge strongly.
- Impact: Size ↓; Complexity ↓ (without adding repo‑level shared code).

T5 – Public API ergonomics
- Standardize a `withInstance(el, cb)` helper for any feature that manages per‑element instances, defined in its `core.js`. Removes repeated `WeakMap` access boilerplate in `index.js`.
- Impact: Size ↓; Complexity ↓.

T6 – Document hooks pattern
- Create a simple contract in `document-hooks.js`: `install({ API, INSTANCES }) => teardown`. Loader or feature `init()` uses it and stores the teardown if needed.
- Impact: Size neutral→↓; Complexity ↓.

T7 – Policy comment cleanup via `safe()`
- Replace ad‑hoc `try/catch` with `safe()` calls and remove redundant `POLICY-EXCEPTION` comments. Keep `POLICY-EXCEPTION:` only where swallowing is truly by design.
- Impact: Size ↓; Complexity ↓.

T8 – Tests alignment
- Adjust tests to import from flattened paths (no `internal/`), and add smoke tests for shared helpers. Keep feature tests asserting public behavior only.
- Impact: Size neutral; Complexity neutral.

T9 – Packaging and exports
- Update `package.json` `files` and (optionally) `exports` to expose `./shared/*` for internal imports without deep relative paths. Confirm no breaking change for consumers.
- Impact: Size neutral; Complexity neutral.

T10 – Optional dev‑only size check
- Add `npm run size` to print bundle byte counts for each feature entry. Keep it non‑blocking at first.
- Impact: Size neutral; Complexity neutral (dev only).

## Video Track (example application of the tasks)

- Apply T1–T7 to `features/video`. Collapse current `internal/*` into `core.js` and `document-hooks.js`, keep helpers local to the feature, dedupe API logic in `index.js`.
- Replace dual pause flags with a single `lastPauseReason` enum to simplify branching while preserving behavior.

## Next Feature Example: Nav Visibility (hide/show on scroll)

Feature name: `nav` (directory: `features/nav/`).

Behavior:
- Hide the nav when scrolling down; show when scrolling up; optional thresholds to avoid jitter.
- Declarative config via attributes on the nav element:
  - `data-nav-scroll="direction threshold"` where direction tokens: `up-show`, `down-hide` (both by default) and `threshold` number in pixels.
  - Optional `data-nav-offset` (px) before the feature activates (e.g., after hero).
- Events: `nav:show`, `nav:hide` on the nav element; payload `{ reason: 'up'|'down'|'init' }`.

Structure:
- Start single‑file: `features/nav/index.js` exporting `init()` and tiny API `Nav.enable(el) / Nav.disable(el)` if needed.
- If code exceeds ~200 lines or if document listeners and element logic grow distinct, split into `core.js` (state + thresholds) and `document-hooks.js` (scroll listener, debounced).

Implementation outline (order of operations):
- On `init()`: attach a single passive `scroll` listener to `document` (or `window`), compute direction and distances safely via `getWIN/getDOC`.
- Maintain last scroll position and a small hysteresis (threshold) to reduce flicker.
- Toggle a `data-nav-hidden` attribute or CSS class; emit `nav:*` events; no style manipulation in JS.
- Idempotent: multiple `init()` calls keep one listener; teardown handled on disable or ignored if not needed.

## Acceptance Checklist (per task)

- Lint and tests pass: `npm run check`.
- Line count trend is down or flat for same functionality.
- File count does not increase (unless offset by larger deletions elsewhere).
- Public API and events unchanged unless explicitly approved.
