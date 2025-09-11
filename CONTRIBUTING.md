## Contributing

Thanks for contributing! This repo favors minimalism and pure ESM. Keep things simple, explicit, and well‑documented.

### Prerequisites
- Node >= 18 (see `package.json#engines`)

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

### Releasing & Publishing

Lean flow: push to `main`.

- The autobump action runs checks (format, lint, tests), bumps the patch version, syncs versioned constants and pinned CDN links, commits "Release vX.Y.Z [ci release]", pushes, and publishes to npm.
- Requirements: set `NPM_TOKEN` repo secret with publish permission.

### Notes
- No `package-lock.json` in repo (library package). An `.npmrc` disables lockfile creation.
- Runtime is dependency‑free; dev tooling is a single dependency (Biome) plus `jsdom` for tests.

For development rules, see [`AGENTS.md`](AGENTS.md).
