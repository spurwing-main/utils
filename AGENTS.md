# Agent Development Guide (KISS‑first)

This repo favors simple, explicit code. Keep agents tiny, predictable, and easy to delete. For user‑facing docs, see [`README.md`](README.md).

## Principles

- Keep it small: one clear responsibility per agent.
- Be predictable: no hidden state, no top‑level side effects.
- Fail loudly (but safely): never swallow errors silently.
- Idempotent `init()`: multiple calls must be harmless.
- Stable public surface: no reliance on internals for consumers.

## Working Method (always)

- Begin complex work with a short checklist of 3–7 sub‑tasks.
- Break problems into the smallest possible steps; solve with the simplest effective solution.
- Provide complete working code unless told otherwise.
- Focus on clarity over cleverness; every line must serve a clear purpose.
- Remove redundancy and unnecessary abstractions; prefer explicit behavior.

## Project Policies

Any intentional deviation MUST include an inline `// POLICY-EXCEPTION: <reason>`.

1. **Naming & Structure**
   - Feature directories are lowercase `[a-z0-9_-]+`.
   - Each feature exports an [`init()`](features/) (named or default object).
   - Keep helpers file‑scoped unless reused.

2. **Initialization**
   - No DOM mutations or network work at module top level (safe capability checks only).
   - Do side effects inside `init()` (or functions it calls).
   - `init()` must tolerate multiple calls (loader de‑dupes; extra calls no‑op).

3. **Errors & Logging**
   - Empty `catch {}` is forbidden.
   - In `catch`, either:
     - Log via `window.__UTILS_DEBUG__?.createLogger(namespace)`, or
     - Return a deterministic fallback with `// POLICY: <reason>`.
   - Use `console.warn|error|info` for surfaced issues; avoid `console.log`.

4. **Complexity**
   - Prefer small pure helpers and early returns; avoid deep nesting.
   - Centralize guarded ops with a `safe(label, fn)` helper when useful.

5. **Loader Safety**
   - Loader only accepts validated names (`^[a-z0-9_-]+$`), normalizes to lowercase, and prevents double init.

6. **Style & Tooling**
   - No repo‑enforced linter/formatter or tests.
   - Keep modern JS style: `no-var`, `prefer-const`, arrow callbacks, object shorthand.
   - Validate behavior via local demos and manual checks.

## Author Checklist

- [ ] Directory name is lowercase and matches loader validation.
- [ ] `init()` exported and idempotent; no top‑level side effects.
- [ ] No silent catches; logs or documented fallbacks present.
- [ ] Debug logging gated by `__UTILS_DEBUG__`.
- [ ] README updated if attributes / API / events changed.
- [ ] Docs/demo updated if attributes/API/events changed.

## Structure

- Entry: `features/<name>/index.js`
- Optional when needed (keep tiny):
  - `features/<name>/core.js` for split responsibilities when `index.js` grows.
  - `features/<name>/document-hooks.js` for larger delegated listeners/observers.

## Style & Behavior

- naming: use camelCase for identifiers; filenames/directories remain lowercase per loader policy.
- spacing: keep clean vertical spacing and logical grouping for readability.
- functions: one function should do one thing well; keep hierarchy shallow and predictable.
- organization: organize files and logic to match the real flow of the problem.
- async: never use polling or timeouts when proper events or async patterns can be used.
- validation: verify inputs, assumptions, and outputs at each step.
- errors: handle errors gracefully and predictably; avoid surprising control flow.
- comments: minimize; explain why when necessary.


## Lifecycle

1. Discovered → via `data-features` on the host script.
2. Imported → dynamic `import()` resolves `index.js`.
3. Initialized → `init()` called at most once per feature per page.
4. Active → listeners/observers attached.
5. Error → failures are contained and logged.

After edits, sanity‑check quickly using local demo pages or minimal HTML.

## Events

- Use a concise namespace (e.g., `video:*`).
- Emit stable payload shapes and document them in `README.md`.
- Wrap dispatch in safe handling; event emission must not throw.

## Agent Template

```js
// features/example/index.js
const DBG = window.__UTILS_DEBUG__?.createLogger?.('example');

let initialized = false;

export function init() {
  if (initialized) return; // idempotent
  initialized = true;
  try {
    // setup listeners / observers here
  } catch (error) {
    try { DBG?.warn('init failure', error); } catch (_) {}
    // POLICY: contain failures; agent should not crash the page
  }
}

export default { init };
```

## Feature Naming Policy

All feature directory names are lowercase. The loader normalizes requested feature names and only accepts `[a-z0-9_-]+` (e.g., request `Video` → loads `video`).

## AI Execution Contract (foolproof)

MUST do these, every time:
- Begin with a 3–7 item checklist before complex work.
- Break work into the smallest effective steps; implement the simplest solution first.
- Produce complete working code unless the task explicitly asks otherwise.
- Use camelCase for all identifiers; keep filenames/directories lowercase.
- Prefer explicit code over implicit magic; each line must have purpose.
- Validate inputs, assumptions, and outputs at each step.
- Handle errors predictably; never allow silent failures.
- Use events/async patterns; attach listeners/observers instead of polling.
- After edits, verify locally (open demo in a browser).

NEVER do these:
- Do not use polling or timeouts when proper events/async are available.
- Do not use the canvas tool.
- Do not add legacy fallbacks or support deprecated/legacy platforms.
- Do not introduce unnecessary abstractions or deep hierarchies.
- Do not use UPPER_CASE identifiers unless explicitly requested.

Implementation workflow (strict):
1. Outline 3–7 sub‑tasks (short checklist).
2. Implement step 1 with the simplest working code; keep functions focused.
3. Validate inputs/assumptions/outputs; add gated logging if needed.
4. Repeat for remaining steps; keep hierarchy shallow and explicit.
5. Verify locally in a browser; address issues immediately.
6. Update docs if attributes/API/events changed.

Validation gates (exit criteria):
- `init()` is idempotent; no top‑level side effects.
- No silent `catch {}`; logging or documented fallback present.
- Identifiers camelCase; files/dirs lowercase; vertical spacing is clean.
- No polling/timeouts used where events/async exist.
- Demo flows work as documented; behavior matches README.
