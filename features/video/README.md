# Video Feature

Attribute‑driven, lazy‑loading `<video>` with delegated controls and a small programmatic API. Designed for modern browsers and zero framework coupling.

- Declarative HTML via `data-video-*` attributes
- Auto‑attach on page load and on DOM additions (MutationObserver)
- Scroll visibility and pointer (hover) triggers
- Delegated controls with `data-video-action`/`data-video-target`
- Small API (`Video.*`) for manual control when needed
- Namespaced custom events (`video:*`) for UI hooks

> Note: This feature targets modern browsers with IntersectionObserver. There is no legacy fallback. The loader is attribute‑only; enable the feature via the host `<script data-features="video">` (there is no programmatic loader API).

---

## Quick Start

Include the loader and enable the `video` feature:

```html
<!-- CDN example (pin a version in production) -->
<script type="module"
  src="https://cdn.jsdelivr.net/npm/@tim-spw/utils@0.1.13/loader.js"
  data-features="video"
  data-debug="video"><!-- remove data-debug in prod --></script>
```

Minimal markup (loads on scroll, plays when visible, pauses when hidden):

```html
<video
  data-video-src="/videos/hero.mp4"
  data-video-load-when="scroll"
  data-video-play-when="visible"
  data-video-pause-when="hidden"
  data-video-scroll-threshold="half"
  data-video-scroll-margin="300px 0px"
  muted
></video>
```

Delegated controls (work for keyboard and pointer):

```html
<button data-video-action="toggle" data-video-target="#hero">Toggle</button>
<video id="hero" data-video-src="/videos/hero.mp4"></video>
```

Programmatic use (optional):

```js
import { init, Video } from '@tim-spw/utils/video';
init(); // idempotent

const v = document.querySelector('video[data-video-src]');
Video.attach(v);
Video.ensureLoaded(v);
Video.play(v);
```

See a comprehensive, runnable showcase in `features/video/demo.html`. For development guidelines, see [`AGENTS.md`](../../AGENTS.md).

---

## Markup: Attributes

Use these attributes on `<video>` to control when it loads/plays/pauses and how it behaves. All tokens are case‑insensitive.

- `data-video-src` (required): Primary video URL. When managed, any native `src`/`currentSrc` on the element is cleared to avoid premature network work.
- `data-video-mob-src` (optional): Alternate URL used when `matchMedia('(max-width: 812px)')` matches. The other URL acts as fallback if the first fails.
- `data-video-preload` (optional): One of `auto | metadata | none`. If `auto` is requested, it is gated as `metadata` until the first successful play, then upgraded to `auto`.
- `data-video-load-when` (optional): Space‑separated tokens controlling when to set `src` and call `load()`.
  - Tokens: `scroll` (when it first becomes visible) and/or `pointer-on` (when pointer enters scope).
- `data-video-play-when` (optional): Space‑separated tokens controlling when to play.
  - Tokens: `visible` (when visible) and/or `pointer-on` (when pointer enters scope).
- `data-video-pause-when` (optional): Space‑separated tokens controlling when to pause.
  - Tokens: `hidden` (when it becomes non‑visible) and/or `pointer-off` (when pointer leaves scope or is cancelled).
- `data-video-scroll-threshold` (optional): Visibility threshold. Values: `any` (0), `half` (0.5), `full` (1), or a number `0..1`. Default is `any`.
- `data-video-scroll-margin` (optional): IntersectionObserver `rootMargin` string. Default `300px 0px`.
- `data-video-parent-pointer` (optional): CSS selector used to bind pointer events on an ancestor container instead of the `<video>` itself. Useful for cards.
  - Ownership rule: Only the first managed descendant in the container binds pointer events; siblings ignore pointer tokens. Removing the owner releases the claim.
- `data-video-restart-when` (optional): Space‑separated tokens that control when playback should restart from the beginning (`currentTime = 0`) and immediately play again.
  - Tokens: `finished` (restart on `ended`), `pointer-on` (restart whenever pointer enters scope), `scroll` (alias of `visible`; restart when becoming visible via IntersectionObserver).
  - Combinations: tokens can be combined. Example: `finished pointer-on` loops while the pointer is over the element and, if you leave and re‑enter, it starts from the beginning again.
- `data-video-muted` (optional, presence‑based): Enforce muted at all times. Disables the “try unmuted once then retry muted” behavior for pointer plays.

Notes:
- Pointer tokens are active only in environments that match `(hover: hover) and (pointer: fine)`; on touch‑only devices they are no‑ops.
- IntersectionObserver is required for `scroll`/`visible`/`hidden` tokens.
- If you change attributes at runtime, call `Video.refresh(el)` to re‑read config. Attribute mutation is not auto‑observed.

---

## Delegated Controls

Add controls anywhere in the DOM; the feature listens at the document level.

- `data-video-action`: `play | pause | toggle`
- `data-video-target` (optional): CSS selector for the target video(s). If omitted, the nearest or descendant managed `<video>` is used.

Accessibility:
- Use `<button>` or add `role="button"` and keyboard handlers are already wired: Enter/Space trigger actions.

Examples:

```html
<!-- Target by selector -->
<button data-video-action="play" data-video-target="#v1">Play</button>
<button data-video-action="pause" data-video-target="#v1">Pause</button>

<!-- Nearest/descendant fallback (no target) -->
<div class="card">
  <button data-video-action="toggle">Toggle</button>
  <video data-video-src="/v.mp4"></video>
  </div>
```

---

## Custom Events

Listen on the `<video>` element for namespaced events. All events are non‑bubbling and have a `detail` payload.

- `video:managed`: Fired after the element is attached/managed.
  - detail: `{ trigger: 'manual' }`
- `video:loaded`: Fired once when the feature selects a URL and calls `load()`.
  - detail: `{ trigger: 'visible' | 'pointer-on' | 'manual', url: string }`
- `video:play-request`: Emitted right before attempting `play()`.
  - detail: `{ trigger: 'visible' | 'pointer-on' | 'manual' }`
- `video:playing`: Forwarded from native `playing` (first time after each request that reaches the state).
  - detail: `{ trigger: '...' }` (matches the last request trigger)
- `video:paused`: Emitted after `pause()`.
  - detail: `{ trigger: 'hidden' | 'pointer-off' | 'manual' }`
- `video:error`: Emitted for configuration or media errors.
  - detail: `{ trigger: 'manual', reason: 'missing-src' | 'invalid-url' | 'media-error' | 'no-alternate', url: string | null }`

Example hook:

```js
const v = document.querySelector('video');
v.addEventListener('video:loaded', (e) => console.log('loaded', e.detail.url));
v.addEventListener('video:playing', (e) => console.log('playing', e.detail.trigger));
v.addEventListener('video:paused',  (e) => console.log('paused',  e.detail.trigger));
```

---

## Public API (`Video`)

Import from `@tim-spw/utils/video` or use it from modules loaded by the loader.

- `Video.attach(el: HTMLVideoElement) => Instance | null`
  - Starts managing the element (ignores if missing `data-video-src`). Emits `video:managed`.
  - If already managed, destroys the previous instance first.
- `Video.detach(el: HTMLVideoElement)`
  - Tears down observers/listeners and releases any container claim.
- `Video.refresh(el: HTMLVideoElement)`
  - Re‑reads attributes and re‑applies behavior. Preserves loaded state.
- `Video.reloadSources(el: HTMLVideoElement)`
  - Re‑applies the chosen `src` and calls `load()` again.
- `Video.ensureLoaded(el: HTMLVideoElement)`
  - If not yet loaded, select URL (mobile vs primary), set `src`, and call `load()`. Emits `video:error` with `missing-src` when no URL is available.
- `Video.play(el)`, `Video.pause(el)`, `Video.toggle(el)`
  - Manual transport controls. `play()` sets `playsinline` and handles autoplay policy with muted fallback as described below.
- `Video.attachAll(root?: ParentNode) => Instance[]`
  - Attach all matching `<video data-video-src>` elements inside `root` (or the document).

Initialization:

```js
import { init } from '@tim-spw/utils/video';
init(); // sets up auto-attach, mutation observer, and delegated controls
```

---

## Behavior Details

- Source selection: Chooses `data-video-mob-src` when `matchMedia('(max-width: 812px)')` matches; otherwise `data-video-src`. On media error, retries the alternate once if available.
- Native `src` ignored: When managed, any existing `src`/`currentSrc` is cleared to avoid loading before triggers.
- Autoplay policy: For non‑gesture plays (e.g., visibility), the video is forced muted. For pointer plays, it tries unmuted once; on rejection, it retries muted. With `data-video-muted`, it always stays muted and does not attempt unmuted.
- `playsinline`: Added automatically on play to avoid full‑screen takeover on mobile.
- Visibility rules: `visible`/`hidden` use IntersectionObserver with your configured `threshold` and `rootMargin`.
  - Pause wins over play in the same frame unless a high‑priority pointer‑on occurred in the last ~120ms.
  - If paused because it became hidden, becoming visible resumes if allowed; pointer‑off pauses are not auto‑resumed by visibility alone.
  - Pointer scope: Bind on `data-video-parent-pointer` container if provided; otherwise on the `<video>` itself. Only the first managed descendant in a container binds pointer events.
- Environment gating: Pointer triggers are disabled on devices without hover/fine pointer. Visibility triggers require IntersectionObserver.
- Attribute changes: Changing `data-video-*` after attach does not auto‑reconfigure. Call `Video.refresh(el)`.
- DOM lifecycle: Removing a managed `<video>` detaches it automatically via MutationObserver.

---

## Recipes

- Card hover play/pause with restart:

```html
<article class="card">
  <video
    data-video-src="/trailers/teaser.mp4"
    data-video-load-when="pointer-on"
    data-video-play-when="pointer-on"
    data-video-pause-when="pointer-off"
    data-video-restart-when="finished pointer-on"
  ></video>
</article>
```

- Scroll‑into‑view autoload + play:

```html
<video
  data-video-src="/clips/loop.mp4"
  data-video-load-when="scroll"
  data-video-play-when="visible"
  data-video-pause-when="hidden"
  data-video-scroll-threshold="half"
  data-video-scroll-margin="300px 0px"
  data-video-restart-when="scroll"
  muted
></video>
```

- Centralized controls for a specific video:

```html
<button data-video-action="play" data-video-target="#promo">Play</button>
<button data-video-action="pause" data-video-target="#promo">Pause</button>
<video id="promo" data-video-src="/promo.mp4"></video>
```

---

## Debugging & Troubleshooting

- Enable logs: `localStorage.setItem('utils:debug','video')` and reload, or add `data-debug="video"` to the loader `<script>`.
- Nothing happens on scroll: Ensure the browser supports IntersectionObserver; check `data-video-load-when`/`data-video-play-when` tokens and thresholds.
- Nothing happens on hover: On touch‑only devices, pointer tokens are disabled by design. Use visibility or manual controls instead.
- Media fails to load: Listen for `video:error` to inspect `reason` and `url`. Provide both primary and mobile sources to allow one alternate retry.
- Config changes not applied: Call `Video.refresh(el)` after changing attributes.

---

## Compatibility

- Modern evergreen browsers (IntersectionObserver required)
- ESM only; include via `<script type="module">` or import in your bundler.

---

## License

MIT — see repository root.
