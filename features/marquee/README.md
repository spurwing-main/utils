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

- Child content still needs its own no-wrap styling so the repeated unit measures consistently:

```css
[data-marquee] > * {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
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
- **Non-Interactive**: Marquee content is strictly non-interactive (`pointer-events: none`). Links and buttons inside will not be clickable.
- **Dynamic Content**: Text edits and most child mutations inside the managed marquee are detected automatically. Call `Marquee.rescan()` when you want to force a full rebuild, or after unusual DOM moves that bypass normal in-place edits.
- Reduced motion: users with `prefers-reduced-motion: reduce` see a static, non‑animated variant.

## Required Styles

The feature owns the host track sizing and animation. You should treat the `data-marquee` element as a constrained viewport, not as a layout container.

- The host should live in a container with a real width. Typical block/grid/flex items are fine.
- The repeated children should be single-line units: use `white-space: nowrap`.
- If the children contain icons and text, use `inline-flex` plus an explicit `gap`.
- Avoid letting child content wrap, or the measured unit width will change and the loop will feel unstable.

Example:

```html
<div class="ticker" data-marquee data-speed="120">
  <span class="ticker-item">Fast • Reliable • Delightful</span>
  <span class="ticker-item">Fast • Reliable • Delightful</span>
</div>
```

```css
.ticker-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 1rem;
  white-space: nowrap;
}
```

## API

```ts
export function init(): void;                 // idempotent boot
export const Marquee: {
  rescan(): void;                             // rebuild and remeasure based on current DOM
  readonly size: number;                      // managed instance count
};
```

## Patterns and Tips

- Prefer plain text or decorative icons; avoid focusable elements inside the marquee.
- To change settings dynamically, update data attributes on the element, then call `Marquee.rescan()`.
- In-place text updates and most child edits are auto-detected; `Marquee.rescan()` is mainly for explicit rebuilds.
- The feature constrains the host width and builds the inner track itself; style the repeated children, not the generated `.marquee-inner`.

## Demo

Open `features/marquee/demo.html` in a local web server (it imports the loader relatively). Use `?utils-debug=marquee` to enable debug logs.
