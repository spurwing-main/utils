# Video Feature – Attribute‑Driven, Modular, Loader‑Friendly

A modular, attribute‑driven utility for managing `<video>` elements with minimal JavaScript and zero unintended network requests. Designed for modern browsers, it attaches observers and listeners only when needed, and tears them down promptly. The feature is loaded via a loader and initialized with an idempotent `init()` function—safe to call multiple times.

## Key Features

- **Attribute-driven:** Configure video behavior declaratively via `data-video-*` attributes.
- **Modular:** Import as a feature module; APIs are exposed for advanced use.
- **Loader-based:** Use `init()` for idempotent, safe initialization.
- **Network-efficient:** No media requests before explicit triggers.
- **Desktop pointer semantics:** Pointer-based triggers only apply on desktop (no hover emulation on touch).
- **Robust fallback:** Uses `IntersectionObserver` when available, otherwise falls back to a stable `requestAnimationFrame` loop.

---

## Quick Start

1. Add `data-video-src` (required) and optional attributes to your `<video>` element.
2. Use `data-video-*-when` tokens to control load/play/pause triggers.
3. Optionally scope pointer triggers with `data-video-parent-pointer`.
4. Use delegated controls with `data-video-action` on any element.

```html
<video
  data-video-src="/media/hero.mp4"
  data-video-mob-src="/media/hero-mobile.mp4"
  data-video-preload="metadata"
  data-video-load-when="scroll"
  data-video-play-when="visible"
  data-video-pause-when="hidden"
  data-video-scroll-threshold="half"
  data-video-scroll-margin="300px 0px"
  muted
></video>
```

Initialize via your loader (recommended), or directly:

```js
import video from './features/video/index.js';
video.init();
// Or: import { Video } and call Video.attachAll(document)
// import { Video } from './features/video/index.js';
// Video.attachAll(document);
// Optional: window.__UTILS_DEBUG__ = { createLogger: (ns) => console }; // enable logs
```

Demo: Open [`features/video/demo.html`](features/video/demo.html:1) to interactively test all combinations.

---

## Attribute Reference

| Attribute                      | Type / Values                        | Description                                                                                  |
|---------------------------------|--------------------------------------|----------------------------------------------------------------------------------------------|
| `data-video-src`                | URL (required)                       | Primary media URL.                                                                           |
| `data-video-mob-src`            | URL (optional)                       | Alternate URL for mobile (`(max-width: 812px)`).                                             |
| `data-video-preload`            | `none` \| `metadata` \| `auto`       | Preload mode. `auto` upgrades after first play. Default: `metadata`.                         |
| `data-video-load-when`          | `scroll` \| `pointer-on`             | Triggers for loading video. Only `pointer-on` is valid for pointer state.                    |
| `data-video-play-when`          | `visible` \| `pointer-on`            | Triggers for playing video. Only `pointer-on` is valid for pointer state.                    |
| `data-video-pause-when`         | `hidden` \| `pointer-off`            | Triggers for pausing video. Only `pointer-off` is valid for pointer state.                   |
| `data-video-parent-pointer`     | CSS selector (optional)              | Scope pointer triggers to a parent container.                                                |
| `data-video-scroll-threshold`   | `0..1` \| `any` \| `half` \| `full`  | Visibility threshold for scroll triggers. Default: `0`.                                      |
| `data-video-scroll-margin`      | CSS margin string                    | Margin for intersection detection. Default: `300px 0px`.                                     |

---

## API Reference

### Main Exports

```js
import video, { Video, Instance, init, constants, utils, EVENTS } from './features/video/index.js';
```

- **`init()`**: Idempotent initialization. Sets up discovery, MutationObserver, and delegated controls.
- **`Video`**: Static utility object for attaching/detaching/controlling managed videos.
  - `Video.attach(el)`
  - `Video.detach(el)`
  - `Video.attachAll(root = document)`
  - `Video.refresh(el)`
  - `Video.reloadSources(el)`
  - `Video.ensureLoaded(el)`
  - `Video.play(el)`
  - `Video.pause(el)`
  - `Video.toggle(el)`
- **`Instance`**: Class representing a managed video instance (advanced use).
- **`constants`**: Attribute and event name constants.
- **`utils`**: Internal utility functions (advanced use).
- **`EVENTS`**: Event name constants.

---

## Custom Events

Emitted on the `<video>` element:

| Event             | Payload                                    | Description                                  |
|-------------------|--------------------------------------------|----------------------------------------------|
| `video:managed`   | `{ trigger }`                              | Video is now managed.                        |
| `video:loaded`    | `{ trigger, url }`                         | Source loaded.                               |
| `video:play-request` | `{ trigger }`                           | Play requested.                              |
| `video:playing`   | `{ trigger }`                              | Playback started.                            |
| `video:paused`    | `{ trigger }`                              | Playback paused.                             |
| `video:error`     | `{ trigger, reason, url }`                 | Error occurred.                              |

- `trigger ∈ { 'visible','pointer-on','hidden','pointer-off','manual' }`
- `reason ∈ { 'media-error','no-alternate','invalid-url','missing-src' }`

---

## Controls (Delegated)

Any element can control videos using `data-video-action` and optional `data-video-target`. If no target is provided, the controller acts on the nearest/first managed `<video>` found via composedPath/DOM search.

- `data-video-action`: `play` \| `pause` \| `toggle`
- `data-video-target`: CSS selector (optional)

Add `role="button"` and `tabindex="0"` for keyboard accessibility.

```html
<div class="hero" data-video-parent-pointer=".hero">
  <video
    data-video-src="/media/hero.mp4"
    data-video-load-when="scroll"
    data-video-play-when="visible"
    data-video-pause-when="hidden"
  ></video>
  <button data-video-action="toggle">Play/Pause</button>
</div>
```

---

## Recipes

**1. Lazy load + autoplay when visible, pause when hidden**
- `data-video-load-when="scroll"`
- `data-video-play-when="visible"`
- `data-video-pause-when="hidden"`

**2. Pointer-on to load/play, pointer-off to pause (desktop only)**
- `data-video-load-when="pointer-on"`
- `data-video-play-when="pointer-on"`
- `data-video-pause-when="pointer-off"`
- Optional: `data-video-parent-pointer=".card"`

**3. Preload metadata, play when visible**
- `data-video-preload="metadata"`
- `data-video-load-when="scroll"`
- `data-video-play-when="visible"`

**4. Manual only (use delegated controls)**
- No `data-video-*-when` attributes
- Add controls: `<button data-video-action="toggle">`

**5. Defer loading until pointer intent**
- `data-video-load-when="pointer-on"`
- `data-video-play-when="pointer-on"` or use a control button

**6. Require full visibility before autoplay**
- `data-video-scroll-threshold="full"`
- `data-video-load-when="scroll"`
- `data-video-play-when="visible"`
- `data-video-pause-when="hidden"`

**7. Mixed visible + pointer override**
- `data-video-load-when="scroll pointer-on"`
- `data-video-play-when="visible pointer-on"`
- `data-video-pause-when="hidden pointer-off"`

---

## Visibility & Network Semantics

- **Visibility:** Uses `IntersectionObserver` with threshold/margin, or a stable rAF fallback.
- **Network:** No media request before a configured trigger. Native `src`/`currentSrc` is neutralized at attach time.
- **Preload:** `preload="auto"` acts as `metadata` until first play, then upgrades to `auto`.
- **Source selection:** On first load, caches both URLs and removes attributes. Retries with alternate if primary fails.

---

## Pointer Behavior (Desktop Only)

- Pointer triggers apply only on devices matching `(hover: hover) and (pointer: fine)`.
- `pointer-on` play requests can override a same-frame `hidden` pause within a short window.
- `pointer-off` pauses on `pointerleave`/`pointercancel`. If paused by pointer-off, visibility alone will not resume playback.

---

## Debugging

Enable logs by providing a debug object:

```js
window.__UTILS_DEBUG__ = { createLogger: (ns) => console };
```

---

## Edge Cases & Guarantees

- Native `src` is ignored/neutralized until a trigger.
- `full` threshold: Only plays/loads when fully within threshold area.
- Retry: If primary fails, retries with mobile (if available); emits `video:error` if both fail.
- Pointer leave: Both `pointercancel` and `pointerleave` pause when `pointer-off` is set.
- Hidden pause resumes only if paused due to hidden; pointer-off pauses do not resume from visibility alone.
- Container owner is released on detach, allowing reassignment.
- Controls are composedPath-aware, fallback to nearest/first managed descendant.
- rAF fallback mirrors IO threshold/margin and uses two-tick stability to prevent flapping.

---

## Notes

- A `<video>` is managed if and only if it has `data-video-src`.
- After first load, `data-video-src`/`data-video-mob-src` are removed and URLs cached for retries.
- Ownership for `data-video-parent-pointer` is established at attach time by the first managed descendant and persists until that video detaches. DOM reordering does not reassign ownership.
- IO is torn down after load if not needed.
