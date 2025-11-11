# Marquee Feature

Attribute‑driven, compositor‑friendly marquee for horizontally scrolling, repeated content. Designed for zero top‑level side effects via `init()`, and honors `prefers-reduced-motion`.

## Quick Start

- Via loader (recommended):

```html
<script type="module" src="/path/to/loader.js" data-features="marquee" data-debug="marquee"></script>
```

- Markup: add `data-marquee` to a container. Children form one “unit” that will be duplicated to fill space.

```html
<div data-marquee>
  <span>Fast • Reliable • Delightful</span>
  <span>Fast • Reliable • Delightful</span>
</div>
```

- Programmatic (optional):

```js
import { init, Marquee } from "@tim-spw/utils/marquee";
init();              // idempotent; also auto-runs via loader
Marquee.rescan();    // attach/detach based on current DOM
```

## Attributes

- `data-marquee` — enable feature on the element.
- `data-direction="left|right"` — scroll direction (default: `left`).
- `data-speed="number"` — speed in px/s (default: `100`).
- `data-pause-on-hover` — pause animation on hover (presence boolean).

Notes:
- Content unit = element’s immediate children at first init; they are duplicated to ensure at least 2× container width.
- For best a11y, keep marquee content non‑interactive and concise. Duplicated interactive controls can confuse screen readers.
- Reduced motion: users with `prefers-reduced-motion: reduce` see a static, non‑animated variant.

## API

```ts
export function init(): void;                 // idempotent boot
export const Marquee: {
  rescan(root?: Document | Element): void;    // attach/detach based on DOM
  readonly size: number;                      // managed instance count
};
```

## Patterns and Tips

- Prefer plain text or decorative icons; avoid focusable elements inside the marquee.
- To change settings dynamically, update data attributes on the element, then call `Marquee.rescan()`.
- Ensure the container has room: the feature sets `display:flex; overflow:hidden` and builds an inner track.

## Demo

Open `features/marquee/demo.html` in a local web server (it imports the loader relatively). Use `?utils-debug=marquee` to enable debug logs.
