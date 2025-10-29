# utils

A set of browser-native utilities providing modular, attribute-driven features for the web. 

- **Modular Loader:** Features are loaded dynamically via [`loader.js`](loader.js) using the `data-features` attribute.
- **Idempotent Initialization:** All features must export an idempotent `init()` function, ensuring safe repeated initialization.
- **Debugging:** Enable namespaced logs via `data-debug` or `localStorage.setItem('utils:debug','*')`.

## Compatibility and Scope

- **Attribute‑only loader:** The loader has no programmatic API (no `loadFeatures()` / `bootstrap()`). Enable features declaratively via the script tag’s `data-features` attribute.
- **Modern browsers only:** Visibility‑driven behavior requires `IntersectionObserver`. There is no legacy fallback path; pointer‑driven interactions still work in environments with `(hover: hover) and (pointer: fine)`.
- **Validation & safety:** Feature names are normalized to lowercase and validated (`^[a-z0-9_-]+$`) before import.

## Key APIs

- `init()`: Idempotent initialization function exported by each feature.
- `Video` object: Main interface for the video feature.
- `Instance` class: Manages individual video elements.
- Utility functions: Shared helpers for feature logic.
- Attribute constants: Standardized attribute names for declarative usage.
- Event names: Namespaced events (e.g., `video:*`) for feature communication.

## Quick Start (Declarative)

```html
<script type="module" src="/loader.js"
  data-features="video"
  data-debug="loader">
</script>
```

Programmatic bootstrapping is not required; features load via attributes only.

Note: The loader intentionally exposes no public programmatic API. Use attributes to opt‑in to features.

<!-- Package imports not required; loading is attribute-driven only. -->

## CDN (jsDelivr)

Version-pinned (recommended):

```html
<script type="module"
src="https://cdn.jsdelivr.net/npm/@tim-spw/utils@0.1.7/loader.js"
data-features="video"
data-debug="loader">
</script>
```

Latest tag (auto-updating; not recommended for production stability):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@tim-spw/utils/loader.js"
  data-features="video"></script>
```

Update the `@0.1.0` segment when publishing a new release; the exported `VERSION` constant mirrors [`package.json`](package.json).

## Publishing (CI)

Lean flow: just push to `main`.

- The autobump action runs checks (format, lint, tests), bumps the patch version, syncs versioned constants and pinned CDN links, commits "Release vX.Y.Z [ci release]", pushes, and publishes to npm.
- Requirements: set `NPM_TOKEN` repo secret with publish permission.

## Debugging

Enable all namespaces:

```js
localStorage.setItem('utils:debug','*');
// reload page
```

Enable specific namespaces (comma separated):

```html
<script type="module" src="/loader.js" data-debug="loader,video"></script>
```

## Features

- **Video:** Attribute-driven lazy loading and delegated controls for `<video>` elements. See this README for usage examples.
- **Marquee:** Standalone smooth scrolling animation module for creating seamless, endlessly looping content. Uses `data-marquee` attributes for configuration.

### Marquee Usage

The marquee feature provides automatic discovery of marquee elements via attributes:

```html
<script type="module" src="/loader.js" data-features="marquee"></script>

<!-- Basic marquee with default speed (1px per frame at 60fps) -->
<div data-marquee>
  <span>Your content here</span>
  <span>More content</span>
</div>

<!-- Custom speed marquee (3px per frame at 60fps) -->
<div data-marquee data-marquee-speed="3">
  <span>Fast content</span>
</div>

<script type="module">
  import { Marquee } from './features/marquee/index.js';
  
  // Rescan to discover dynamically added elements
  Marquee.rescan();
</script>
```

**Key Features:**
- Attribute-based configuration with `data-marquee` and `data-marquee-speed`
- Automatic discovery via `init()` and `rescan()`
- Consistent pixel-based speed across all marquees
- Seamless looping without visible jumps
- Respects `prefers-reduced-motion` user preference
- Adaptive to container size changes
- Clean DOM restoration on detach
- No globals, no framework dependencies, no styling opinions

## Contributing

For development rules and guidance, see [`AGENTS.md`](AGENTS.md).
Quick commands:

- Format: `npm run format`
- Lint: `npm run lint`
- Test: `npm test`

All documentation and demo HTML are up-to-date and reflect the current implementation.
