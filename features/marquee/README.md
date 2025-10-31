# Marquee Feature

A standalone module for creating smooth, endless scrolling marquees using the Web Animations API (WAAPI). It uses compositor‑friendly transforms, pixel‑quantized step easing, and modern Web APIs targeting evergreen browsers.

## Overview

The marquee feature makes marked containers scroll their content smoothly and endlessly. It discovers elements automatically on initialization.

## Features

- **Attribute‑based**: `data-marquee` with optional `data-marquee-direction`, `data-marquee-speed`, and `data-marquee-pause-on-hover`
- **Automatic discovery**: `init()` and `rescan()` automatically find and manage elements
- **Scoped rescans**: `rescan(root)` only touches marquees inside the provided root
- **WAAPI animation**: Compositor‑only `transform: translateX` with `steps()` easing for pixel‑accurate motion
- **Consistent speed**: Expressed in pixels per second (px/s)
- **Attribute‑aware**: Speed/direction/hover updates react immediately; removing the attribute detaches the instance automatically
- **Seamless looping**: Content is duplicated to ensure a jump‑free, continuous scroll
- **Motion preferences**: Honors `prefers-reduced-motion`; animation stops immediately when reduction is requested
- **Adaptive**: Uses `ResizeObserver` and `MutationObserver` to react to size/attribute changes
- **Clean cleanup**: Restores the exact DOM nodes (including event listeners) and releases all resources when detached

## Usage

### Basic Setup

```html
<script type="module" src="/loader.js" data-features="marquee"></script>

<!-- Basic marquee (children inherit gap from container) -->
<div data-marquee style="gap: 1.5rem;">
  <span>Your content here</span>
  <span>More content</span>
</div>

<!-- Faster marquee with custom speed (px/s) -->
<div data-marquee data-marquee-speed="180" style="gap: 2rem;">
  <span>Fast content</span>
  <span>Fast content 2</span>
</div>
```

### Dynamic Elements

```javascript
import { Marquee } from '@tim-spw/utils/marquee';

// Add a new marquee element dynamically
const container = document.createElement('div');
container.setAttribute('data-marquee', '');
container.setAttribute('data-marquee-speed', '150');
container.innerHTML = '<span>New content</span>';
document.body.appendChild(container);

// Rescan to discover and attach new marquees
Marquee.rescan();
```

### Attribute Updates

Changing marquee attributes on an attached element is instant:

- Updating `data-marquee-speed` recalculates measurements and motion without rescanning.
- Removing `data-marquee` automatically detaches and restores the original DOM.
- Re-adding `data-marquee` lets `Marquee.rescan()` or `Marquee.attach()` re-enable the marquee.

## API

### `Marquee.rescan(root)`

Synchronises marquee instances with the DOM. The scan is limited to the supplied root (defaults to `document`).

- Attaches new elements inside the root that have the `data-marquee` attribute
- Detaches tracked elements that lost the attribute or were removed from the DOM (within the root scope)

**Parameters:**
- `root` (Document|Element, optional): Area of the DOM to update. Use `document` to rescan everything.

**Example:**
```javascript
// Scan entire document
Marquee.rescan();

// Scan a specific container without touching marquees elsewhere
const section = document.getElementById('my-container');
Marquee.rescan(section);
```

### `Marquee.attach(element)`

Manually attach marquee to a specific element. Reads configuration from attributes (e.g., `data-marquee-speed`).

**Parameters:**
- `element` (HTMLElement): The element to attach marquee to

**Note:** Prefer using `rescan()` for automatic management.

### `Marquee.detach(element)`

Manually detach marquee from a specific element and restore original DOM.

**Parameters:**
- `element` (HTMLElement): The element to detach marquee from

**Note:** Prefer using `rescan()` for automatic management.

## Attributes

### `data-marquee`

Marks an element as a marquee container. The presence of this attribute (value doesn't matter) enables marquee behavior.

```html
<div data-marquee>Content</div>
```

### `data-marquee-speed`

Sets the animation speed in pixels per second. Higher values = faster scrolling.

- Default: `100` (100 px/s)
- Valid range: Any positive number
- Consistent across marquees: same value → same visual speed

```html
<!-- Slow -->
<div data-marquee data-marquee-speed="60">Slow content</div>

<!-- Normal -->
<div data-marquee data-marquee-speed="100">Normal content</div>

<!-- Fast -->
<div data-marquee data-marquee-speed="240">Fast content</div>
```

### `data-marquee-direction`

Sets the scroll direction.

- Values: `left` (default) or `right`

### `data-marquee-pause-on-hover`

Pauses the animation while hovering the marquee container (attribute presence enables it).


## Speed Calculation

Speed is measured in pixels per second:
- `speed="60"` → 60 px/s
- `speed="120"` → 120 px/s
- `speed="240"` → 240 px/s

Marquees with the same `data-marquee-speed` value scroll at the same pixel-per-second rate regardless of content size, so they appear in sync even if their content widths differ.

## Gap Handling

- Set `gap` (or `column-gap`/`row-gap`) directly on the marquee container.
- The runtime sets `gap: inherit` on internal wrappers so your chosen spacing is applied consistently to all repeated content cycles.

Example:

```html
<div data-marquee style="gap: 24px">
  <span>Item A</span>
  <span>Item B</span>
  <span>Item C</span>
</div>
```

## Lifecycle

1. **Init**: `init()` is called (automatically by loader or manually)
2. **Discovery**: Scans for `[data-marquee]` elements
3. **Attachment**: Builds internal structure and animation instance for each element
4. **Animation**: Smoothly scrolls content using WAAPI (`inner.animate` with `transform: translateX` and `steps()` easing)
5. **Rescan**: Call `rescan()` when adding/removing elements
6. **Detachment**: Cancels animation and restores original DOM

## How It Works

1. **Preparation**: When attached:
   - Saves original nodes and wraps them inside an `inner` container split into two halves: `halfA` and `halfB`
   - `halfA` contains the original unit plus clean clones until width exceeds the container
   - `halfB` mirrors `halfA` so translation by exactly one half yields a seamless loop
   - Clones are marked `aria-hidden` and `inert`; internal wrappers inherit `gap` from the container

2. **Animation**: Creates a WAAPI animation on the `inner` element that translates by one half-width using `steps(px, end)` for pixel-accurate motion. Iterates indefinitely.

3. **Adaptation**: Uses `ResizeObserver`, `MutationObserver`, font readiness, and image load/error events to re‑measure and adjust clones and animation timing.

4. **Cleanup**: When detached:
   - Cancels the WAAPI animation
   - Restores original nodes (existing event listeners remain intact)
   - Disconnects observers and releases all resources

## Browser Compatibility

Modern evergreen browsers only. The marquee requires:

- `ResizeObserver`
- `matchMedia('(prefers-reduced-motion)')`

There are no legacy fallbacks.

## Demo

See [demo.html](demo.html) for a working example.

## License

See main repository README for license information.
