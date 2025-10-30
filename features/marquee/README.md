# Marquee Feature

A standalone, minimal module for creating smooth, endless scrolling animations using declarative attributes.

## Overview

The marquee feature is a tiny, standalone module whose only job is to make marked containers scroll their content smoothly and endlessly. It uses `data-marquee` attributes for configuration and automatically discovers elements on initialization.

## Features

- **Attribute-Based**: Uses `data-marquee` and `data-marquee-speed` attributes for configuration
- **Automatic Discovery**: `init()` and `rescan()` automatically find and manage elements
- **Scoped Rescans**: `rescan(root)` only touches marquees inside the provided root (or the whole document by default)
- **Natural Container Height**: Uses CSS Grid to automatically size container to content height - no explicit heights needed
- **Consistent Speed**: Speed is expressed in pixels per frame at 60fps, giving identical motion for equal values
- **Attribute-Aware**: Speed updates react immediately; removing `data-marquee` detaches the instance automatically
- **Seamless Looping**: Content is cloned and animated with transforms for smooth, jump-free scrolling
- **Motion Preferences**: Honors `prefers-reduced-motion`; animation stops immediately when reduction is requested
- **Adaptive**: Uses `ResizeObserver` to react to meaningful width changes (and only dramatic height shifts) without timers
- **Clean Cleanup**: Restores the exact DOM nodes (including event listeners) and releases all resources when detached
- **Accessible by Design**: Cloned nodes are hidden from assistive tech, stripped of duplicate IDs, and prevented from stealing focus

## Usage

### Basic Setup

```html
<script type="module" src="/loader.js" data-features="marquee"></script>

<!-- Basic marquee with default speed (1px per frame at 60fps) -->
<div data-marquee>
  <span>Your content here</span>
  <span>More content</span>
</div>

<!-- Faster marquee with custom speed (2px per frame at 60fps) -->
<div data-marquee data-marquee-speed="2">
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
container.setAttribute('data-marquee-speed', '1.5');
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

Manually attach marquee to a specific element. Reads speed from `data-marquee-speed` attribute.

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

Sets the animation speed in pixels per frame at 60fps. Higher values = faster scrolling.

- Default: `1` (1 pixel per frame)
- Valid range: Any positive number
- Speed is consistent across all marquees - same value means same visual speed

```html
<!-- Slow -->
<div data-marquee data-marquee-speed="0.5">Slow content</div>

<!-- Normal -->
<div data-marquee data-marquee-speed="1">Normal content</div>

<!-- Fast -->
<div data-marquee data-marquee-speed="3">Fast content</div>
```

## Speed Calculation

Speed is measured in pixels per frame at 60fps:
- `speed="1"` → moves 1 pixel per frame → 60 pixels per second
- `speed="2"` → moves 2 pixels per frame → 120 pixels per second
- `speed="0.5"` → moves 0.5 pixels per frame → 30 pixels per second

All marquees with the same speed value will scroll at the same visual speed, regardless of content size.

## Lifecycle

1. **Init**: `init()` is called (automatically by loader or manually)
2. **Discovery**: Scans for `[data-marquee]` elements
3. **Attachment**: Creates animation instance for each element
4. **Animation**: Smoothly scrolls content using requestAnimationFrame
5. **Rescan**: Call `rescan()` when adding/removing elements
6. **Detachment**: Removes animation and restores original DOM

## How It Works

1. **Preparation**: When attached:
   - Saves the original DOM state and display style
   - Wraps content in a CSS Grid container for natural height
   - Sets container to `display: grid` with `grid-template-columns: 1fr`
   - Positions wrapper using `grid-area: 1/1` (overlays in same grid cell)
   - Clones the content to create a seamless loop
   - Sanitizes clones (removes duplicate IDs, hides from assistive tech, disables focus)
   - Measures content width for proper looping

2. **Animation**: Uses `requestAnimationFrame` to:
   - Update position smoothly at 60fps using CSS transforms
   - Reset position when one loop completes
   - Create the illusion of endless scrolling

3. **Adaptation**: Uses `ResizeObserver` to:
   - Detect meaningful width changes in the container or wrapper
   - Ignore minor jitter while still reacting to dramatic height shifts
   - Recalculate content measurements and adjust clones as needed

4. **Cleanup**: When detached:
   - Cancels animation frame
   - Restores original nodes (so existing event listeners remain intact)
   - Restores original display and overflow styles
   - Removes grid styling
   - Disconnects observers
   - Releases all resources

## Browser Compatibility

Modern evergreen browsers only. The marquee requires:

- CSS Grid (`display: grid`, `grid-area`)
- `ResizeObserver`
- `requestAnimationFrame`
- `matchMedia('(prefers-reduced-motion)')`

There are no legacy fallbacks.

## Demo

See [demo.html](demo.html) for a working example.

## License

See main repository README for license information.
