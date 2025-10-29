## Contributing

Thanks for contributing! This repo prioritizes KISS, tiny diffs, and pure ESM.

### Working Method (always)
- Start complex work by outlining a short checklist of 3–7 sub‑tasks.
- Break problems into the smallest steps; use the simplest effective solution.
- Provide complete working code unless told otherwise.
- Optimize for clarity, not cleverness; every line must have a purpose.
- Remove redundancy/unnecessary abstractions; prefer explicit over implicit.

### AI Execution Contract
Follow the authoritative contract in `AGENTS.md` (MUST/NEVER + workflow).

Quick summary (non‑authoritative):
- MUST: short checklist (3–7), camelCase only, explicit code, validate I/O, safe errors,
  events/async (no polling), complete working code, run lint/tests.
- NEVER: polling/timeouts when events/async exist, canvas tool, legacy fallbacks,
  deep hierarchies/unnecessary abstractions, UPPER_CASE unless requested.

### Principles
- Keep PRs small and focused; prefer multiple small PRs over one large change.
- Favor deletion and clarity over cleverness.
- Add tests for behavior; avoid relying on internal symbols.

### Prerequisites
- Node >= 18 (see `package.json#engines`).

### Install
```sh
npm install
```

### Lint & Format (Biome)
```sh
npm run lint       # report
npm run format     # check formatting
```

### Tests
```sh
npm test
```

### Commit Style
- Use clear, imperative subject lines (max ~72 chars).
- Keep body short; explain the why when non‑obvious.
- Include `POLICY-EXCEPTION:` in code + commit when intentionally deviating.

### PR Checklist
- [ ] Scope is minimal and documented in the description.
- [ ] `npm run lint` and `npm test` are green.
- [ ] Updated docs where behavior/attributes/events changed (`README.md`, `AGENTS.md`).
- [ ] No top‑level side effects; `init()` remains idempotent.
- [ ] AI Execution Contract satisfied (MUST/NEVER rules above).

### Style Conventions
- identifiers: use camelCase; avoid UPPER_CASE unless explicitly requested.
- files/dirs: lowercase per loader policy.
- spacing: keep clean vertical spacing and logical grouping.
- functions: one function does one thing; shallow, predictable hierarchy.
- organization: mirror the real flow of the problem in files and logic.
- async: never use polling/timeouts when proper events or async patterns exist.
- validation: verify inputs, assumptions, and outputs at each step.
- errors: handle gracefully and predictably; avoid surprises.
- comments: minimal; explain why when necessary.

### Using AI Assistants
- Prefer generated code that is small, explicit, and readable.
- Verify outputs: run lint/tests; remove unnecessary abstractions.
- Never accept silent catches; follow logging policy in `AGENTS.md`.
 - Stay current: when decisions depend on platform behavior, verify with authoritative sources.

### Releasing & Publishing

Lean flow: push to `main`.

- CI runs format, lint, and tests; autobump patches and publishes to npm.
- Requirements: `NPM_TOKEN` repo secret with publish permission.

### Notes
- No `package-lock.json` in repo (library package). `.npmrc` disables lockfile creation.
- Runtime is dependency‑free; dev tooling uses Biome and `jsdom` for tests.

See also: [`AGENTS.md`](AGENTS.md) for development rules.
