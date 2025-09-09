# utils

A set of browser-native utilities providing modular, attribute-driven features for the web. The primary focus is on a declarative video feature that enables efficient management and lazy-loading of HTML `<video>` elements using custom attributes and delegated controls.

- **Modular Loader:** Features are loaded dynamically via [`loader.js`](loader.js), using either the `data-features` attribute or programmatic [`bootstrap()`](loader.js) calls.
- **Attribute-Driven Video:** The video feature manages `<video>` elements declaratively, supporting lazy loading, custom controls, and event-driven behaviors through HTML attributes.
- **Idempotent Initialization:** All features must export an idempotent `init()` function, ensuring safe repeated initialization.
- **Debugging:** Enable namespaced logs via `data-debug`, `?utils-debug=*`, or `localStorage.setItem('utils:debug','*')`.

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

Query alternative:

```html
<script type="module" src="/loader.js?features=video"></script>
```

## Quick Start (Programmatic)

```html
<script type="module">
  import { bootstrap } from '/loader.js';
  // Explicit list (skips auto attribute/query detection):
  await bootstrap(['video']);
</script>
```

## CDN (jsDelivr)

Version-pinned (recommended):

```html
<script type="module"
src="https://cdn.jsdelivr.net/npm/@tim-spw/utils@0.1.3/loader.js"
data-features="video"
data-debug="loader">
</script>
```

Latest tag (auto-updating; not recommended for production stability):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@tim-spw/utils/loader.js"></script>
```

Programmatic import via CDN (including VERSION export):

```html
<script type="module">
  import { bootstrap, VERSION } from 'https://cdn.jsdelivr.net/npm/@tim-spw/utils@0.1.3/loader.js';
  console.info('[utils] version', VERSION);
  await bootstrap(['video']);
  </script>
```

Update the `@0.1.0` segment when publishing a new release; the exported `VERSION` constant mirrors [`package.json`](package.json).

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

- **Video:** [`features/video`](features/video/) — Attribute-driven lazy loading and delegated controls for `<video>` elements. See [`features/video/README.md`](features/video/README.md) for full documentation and examples.

## Contributing

For contributor guidelines, project policies, and development rules, see [`agent.md`](agent.md).

All documentation and demo HTML are up-to-date and reflect the current implementation.