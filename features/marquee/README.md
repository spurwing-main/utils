# Marquee Feature

A standalone, minimal module for creating smooth, endless scrolling animations using declarative attributes.

## Overview

The marquee feature is a tiny, standalone module whose only job is to make marked containers scroll their content smoothly and endlessly. It uses `data-marquee` attributes for configuration and automatically discovers elements on initialization.

## Features

- **Attribute-Based**: Uses `data-marquee` and `data-marquee-speed` attributes for configuration
- **Automatic Discovery**: `init()` and `rescan()` automatically find and manage elements
- **Consistent Speed**: Speed is in pixels per frame at 60fps - same speed value means same visual speed
- **Seamless Looping**: Content is cloned and animated with transform for smooth, jump-free scrolling
- **Motion Preferences**: Honors `prefers-reduced-motion` to avoid animations for users who don't want them
- **Adaptive**: Uses ResizeObserver to adjust when container sizes change
- **Clean Cleanup**: Restores the exact DOM nodes (including event listeners) and releases all resources when detached
- **No Dependencies**: No globals, no framework ties, no styling opinions
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

## API

### `Marquee.rescan(root)`

Scans the document (or provided root element) for elements with `data-marquee` attribute and syncs state:
- Attaches new elements that have the attribute
- Detaches elements that no longer have the attribute

**Parameters:**
- `root` (Document|Element, optional): Root element to scan from. Defaults to `document`.

**Example:**
```javascript
// Scan entire document
Marquee.rescan();

// Scan specific container
Marquee.rescan(document.getElementById('my-container'));
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
   - Saves the original DOM state
   - Wraps content in a positioning container
   - Clones the content to create a seamless loop
   - Sanitizes clones (removes duplicate IDs, hides from assistive tech, disables focus)
   - Measures content width for proper looping

2. **Animation**: Uses `requestAnimationFrame` to:
   - Update position smoothly at 60fps
   - Reset position when one loop completes
   - Create the illusion of endless scrolling

3. **Adaptation**: Uses `ResizeObserver` to:
   - Detect container size changes
   - Recalculate content measurements
   - Adjust clones as needed

4. **Cleanup**: When detached:
   - Cancels animation frame
   - Restores original nodes (so existing event listeners remain intact)
   - Restores original styles
   - Disconnects observers
   - Releases all resources

## Browser Compatibility

- Modern browsers with `requestAnimationFrame` support
- Optional `ResizeObserver` for adaptive sizing (degrades gracefully)
- Respects `prefers-reduced-motion` media query

## Demo

See [demo.html](demo.html) for a working example.

## License

See main repository README for license information.
