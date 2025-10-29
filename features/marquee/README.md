# Marquee Feature

A standalone, minimal module for creating smooth, endless scrolling animations.

## Overview

The marquee feature is a tiny, standalone module whose only job is to make marked containers scroll their content smoothly and endlessly. It doesn't know about your app, routes, or modals; it just animates when asked and restores things when told to stop.

## Features

- **Minimal API**: Simple `start()` and `stop()` methods for controlling animations
- **Seamless Looping**: Content is cloned and animated with transform for smooth, jump-free scrolling
- **Motion Preferences**: Honors `prefers-reduced-motion` to avoid animations for users who don't want them
- **Adaptive**: Uses ResizeObserver to adjust when container sizes change
- **Clean Cleanup**: Restores DOM to original state and releases all resources when stopped
- **No Dependencies**: No globals, no framework ties, no styling opinions

## Usage

### Via Loader

```html
<script type="module" src="/loader.js" data-features="marquee"></script>

<div id="my-marquee">
  <span>Your content here</span>
  <span>More content</span>
</div>

<script type="module">
  import { Marquee } from './features/marquee/index.js';
  
  // Start animation
  const container = document.getElementById('my-marquee');
  Marquee.start(container, { speed: 1 });
  
  // Stop animation when done
  Marquee.stop(container);
</script>
```

### Direct Import

```javascript
import { Marquee } from '@tim-spw/utils/marquee';

// Start on a single element
Marquee.start(container, { speed: 1 });

// Start on all matching elements
Marquee.startAll('.marquee-container', { speed: 2 });

// Stop animations
Marquee.stop(container);
Marquee.stopAll('.marquee-container');
```

## API

### `Marquee.start(container, options)`

Starts marquee animation on a container element.

**Parameters:**
- `container` (HTMLElement): The container element to animate
- `options` (Object, optional):
  - `speed` (Number): Animation speed in pixels per frame at 60fps. Default: 1

**Example:**
```javascript
Marquee.start(document.getElementById('marquee'), { speed: 2 });
```

### `Marquee.stop(container)`

Stops marquee animation on a container element and restores the original DOM.

**Parameters:**
- `container` (HTMLElement): The container element to stop

**Example:**
```javascript
Marquee.stop(document.getElementById('marquee'));
```

### `Marquee.startAll(selector, options)`

Starts marquee on all elements matching a selector.

**Parameters:**
- `selector` (String|HTMLElement|NodeList): CSS selector, element, or NodeList
- `options` (Object, optional): Same as `start()`

**Example:**
```javascript
Marquee.startAll('.marquee', { speed: 1.5 });
```

### `Marquee.stopAll(selector)`

Stops marquee on all elements matching a selector.

**Parameters:**
- `selector` (String|HTMLElement|NodeList): CSS selector, element, or NodeList

**Example:**
```javascript
Marquee.stopAll('.marquee');
```

## How It Works

1. **Preparation**: When started, the marquee feature:
   - Saves the original DOM state
   - Wraps content in a positioning container
   - Clones the content to create a seamless loop
   - Measures content width for proper looping

2. **Animation**: Uses `requestAnimationFrame` to:
   - Update position smoothly at 60fps
   - Reset position when one loop completes
   - Create the illusion of endless scrolling

3. **Adaptation**: Uses `ResizeObserver` to:
   - Detect container size changes
   - Recalculate content measurements
   - Adjust clones as needed

4. **Cleanup**: When stopped:
   - Cancels animation frame
   - Restores original HTML
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
