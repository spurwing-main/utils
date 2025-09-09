# utils

A set of browser-native utilities providing modular, attribute-driven features for the web. The primary focus is on a declarative video feature that enables efficient management and lazy-loading of HTML `<video>` elements using custom attributes and delegated controls.

- **Modular Loader:** Features are loaded dynamically via [`loader.js`](loader.js) using the `data-features` attribute.
- **Attribute-Driven Video:** The video feature manages `<video>` elements declaratively, supporting lazy loading, custom controls, and event-driven behaviors through HTML attributes.
- **Idempotent Initialization:** All features must export an idempotent `init()` function, ensuring safe repeated initialization.
- **Debugging:** Enable namespaced logs via `data-debug` or `localStorage.setItem('utils:debug','*')`.

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

<!-- Package imports not required; loading is attribute-driven only. -->

## CDN (jsDelivr)

Version-pinned (recommended):

```html
<script type="module"
src="https://cdn.jsdelivr.net/npm/@tim-spw/utils@0.1.5/loader.js"
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

## Contributing

For development rules and guidance, see [`agent.md`](agent.md).
Quick commands:

- Format: `npm run format`
- Lint: `npm run lint`
- Test: `npm test`

All documentation and demo HTML are up-to-date and reflect the current implementation.
