# utils

A set of browser-native utilities providing modular, attribute-driven features for the web. 

- **Modular Loader:** Features are loaded dynamically via [`loader.js`](loader.js) using the `data-features` attribute.
- **Idempotent Initialization:** All features must export an idempotent `init()` function, ensuring safe repeated initialization.
- **Debugging:** Enable namespaced logs via `data-debug` or `localStorage.setItem('utils:debug','*')`.

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
src="https://cdn.jsdelivr.net/npm/@tim-spw/utils@0.1.25/loader.js"
data-features="video"
data-debug="loader">
</script>
```

Latest tag (auto-updating; not recommended for production stability):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@tim-spw/utils/loader.js"
  data-features="video"></script>
```

Update the `@0.1.25` segment when publishing a new release; the exported `VERSION` constant mirrors [`package.json`](package.json).

## Publishing (CI)

Lean flow: just push to `main`.

- The autobump action bumps the patch version, syncs versioned constants and pinned CDN links, commits "Release vX.Y.Z [ci release]", pushes, and publishes to npm.
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
