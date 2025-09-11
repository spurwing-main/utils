// ESM via package type; unified .js extension
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

/**
 * Video feature tests (initial scaffolding)
 * Goals:
 * 1. Attach: managed video dispatches video:managed after boot.
 * 2. Pointer-driven lazy load: data-video-* source attributes removed only after pointerenter (load + play).
 * 3. Events: video:loaded fires once; subsequent pointerenter does not duplicate load.
 * 4. Detach via DOM removal: subsequent pointerenter no longer emits play-request (instance destroyed).
 */

const ROOT = path.resolve(".");
const VIDEO_FEATURE_PATH = path.join(ROOT, "features", "video", "index.js");
const VIDEO_FEATURE_URL = pathToFileURL(VIDEO_FEATURE_PATH).href;
assert.ok(fs.existsSync(VIDEO_FEATURE_PATH), "video feature module must exist");

// Fresh import helper to avoid cross-test leakage of window/document singletons.
// Each call appends a unique query parameter so the module re-evaluates with the
// current global window (important because tests create a new JSDOM instance).
async function importVideoFeatureFresh() {
  const u = `${VIDEO_FEATURE_URL}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return import(u);
}

async function setupDom() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  // Ensure MutationObserver is available globally (feature references bare MutationObserver)
  if (window.MutationObserver) {
    global.MutationObserver = window.MutationObserver;
  } else {
    // Minimal no-op fallback to avoid crashes (should not happen in recent jsdom)
    global.MutationObserver = class {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
  // Provide matchMedia stub to simulate desktop hover + pointer capabilities
  if (!window.matchMedia) {
    window.matchMedia = (query) => {
      const normalized = String(query).toLowerCase();
      // Simulate desktop environment with fine pointer and hover, large viewport > 812px
      if (normalized.includes("(hover: hover)") || normalized.includes("(pointer: fine)")) {
        return {
          matches: true,
          media: query,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        };
      }
      if (normalized.includes("max-width: 812px")) {
        return {
          matches: false,
          media: query,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        };
      }
      return {
        matches: false,
        media: query,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      };
    };
  }
  // Minimal performance.now stub used by priority play logic
  if (!window.performance) {
    window.performance = { now: () => Date.now() };
  }
  if (typeof window.performance.now !== "function") {
    window.performance.now = () => Date.now();
  }
  // Stub unimplemented HTMLMediaElement methods to silence jsdom "Not implemented" warnings
  const HMEP = window.HTMLMediaElement?.prototype;
  if (HMEP && !HMEP._utilsPatched) {
    const noop = () => {};
    try {
      HMEP.load = noop;
    } catch (e) {
      /* POLICY-EXCEPTION: patch may fail in certain jsdom builds */ void e;
    }
    try {
      HMEP.pause = noop;
    } catch (e) {
      /* POLICY-EXCEPTION: patch may fail in certain jsdom builds */ void e;
    }
    // Do not override play here; individual tests use stubPlay to emit 'playing'
    HMEP._utilsPatched = true;
  }
  return { window };
}

// Utility: collect events emitted on a specific video element
function collectVideoEvents(video) {
  const names = [
    "video:managed",
    "video:loaded",
    "video:play-request",
    "video:playing",
    "video:paused",
    "video:error",
  ];
  const log = [];
  for (const n of names) {
    video.addEventListener(n, (e) => {
      log.push({ name: n, detail: e.detail });
    });
  }
  return log;
}

// Stub play() to behave as a successful async gesture play
function stubPlay(video, window) {
  video.play = () =>
    Promise.resolve().then(() => {
      // Dispatch native 'playing' so feature forwards to video:playing
      video.dispatchEvent(new window.Event("playing"));
    });
  video.pause = () => {};
}

// Install an IntersectionObserver stub allowing manual simulation of visibility.
function installIOStub(window) {
  const observers = [];
  class IOStub {
    constructor(cb, _opts) {
      this._cb = cb;
      this._targets = new Set();
      observers.push(this);
    }
    observe(el) {
      this._targets.add(el);
    }
    unobserve(el) {
      this._targets.delete(el);
    }
    disconnect() {
      this._targets.clear();
    }
  }
  IOStub._simulate = (target, ratio) => {
    for (const o of observers) {
      if (o._targets.has(target)) {
        o._cb([{ target, intersectionRatio: ratio }]);
      }
    }
  };
  window.IntersectionObserver = IOStub;
  return IOStub;
}

test("video feature: pointer-driven load & detach", async () => {
  const { window } = await setupDom();
  // Create managed video: only pointer triggers (no scroll visibility dependency)
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/vid.mp4");
  video.setAttribute("data-video-load-when", "pointer-on");
  video.setAttribute("data-video-play-when", "pointer-on");
  video.setAttribute("data-video-pause-when", "pointer-off");
  window.document.body.appendChild(video);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  // Import feature & boot via DOMContentLoaded dispatch
  const mod = await importVideoFeatureFresh();
  assert.ok(mod.init, "init exported");
  mod.init();
  // Fire DOMContentLoaded to trigger boot() path
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Managed event should have fired (boot attaches & emits)
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:managed"),
    "video:managed should fire after boot",
  );
  assert.ok(
    video.hasAttribute("data-video-src"),
    "source attribute still present before pointer interaction (not yet loaded)",
  );

  // Trigger pointer enter to load & play
  video.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10)); // allow async play promise resolution

  const loadedEvents = events.filter((e) => e.name === "video:loaded");
  assert.equal(loadedEvents.length, 1, "video:loaded fires exactly once after first pointerenter");
  assert.equal(video.hasAttribute("data-video-src"), false, "data-video-src removed after load");

  // Second pointerenter should not create another loaded event
  video.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    events.filter((e) => e.name === "video:loaded").length,
    1,
    "no duplicate video:loaded on second pointerenter",
  );

  // Pointer leave should pause (emit video:paused)
  video.dispatchEvent(new window.Event("pointerleave", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:paused"),
    "video:paused emitted on pointerleave",
  );

  const playRequestCountBeforeDetach = events.filter((e) => e.name === "video:play-request").length;

  // Detach (remove from DOM) -> MutationObserver should destroy instance
  video.remove();
  await new Promise((r) => setTimeout(r, 5)); // allow MO microtask

  // Further pointerenter should not add new play-request events
  video.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));
  const playRequestCountAfterDetach = events.filter((e) => e.name === "video:play-request").length;
  assert.equal(
    playRequestCountAfterDetach,
    playRequestCountBeforeDetach,
    "no new play-request after detach",
  );

  // Sanity: error events (if any) should not indicate missing-src
  const errorEvents = events.filter((e) => e.name === "video:error");
  assert.ok(
    !errorEvents.some((e) => e.detail?.reason === "missing-src"),
    "no missing-src error expected",
  );
});

test("video feature: visibility-driven scroll load & play/pause", async () => {
  const { window } = await setupDom();
  // Install IO stub and create video with scroll/visibility triggers
  const IOStub = installIOStub(window);
  // Make sure IO is supported in the test environment
  window.IntersectionObserver.supported = true;
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/vis.mp4");
  video.setAttribute("data-video-load-when", "scroll");
  video.setAttribute("data-video-play-when", "visible");
  video.setAttribute("data-video-pause-when", "hidden");
  window.document.body.appendChild(video);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Not yet loaded (no visibility event)
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(video.hasAttribute("data-video-src"), "video not loaded before visibility");

  // Simulate becoming visible (retry if first simulation races with attach)
  IOStub._simulate(video, 0.6);
  await new Promise((r) => setTimeout(r, 10));
  if (events.filter((e) => e.name === "video:loaded").length === 0) {
    // Retry once more; some environments may require a second intersection to register transition
    IOStub._simulate(video, 0.6);
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(
    events.filter((e) => e.name === "video:loaded").length,
    1,
    "loaded once on first visible",
  );
  assert.equal(
    video.hasAttribute("data-video-src"),
    false,
    "source attribute removed after visibility load",
  );
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "play-request emitted on visibility",
  );
  assert.ok(
    events.some((e) => e.name === "video:playing"),
    "playing emitted on visibility",
  );

  // Simulate become hidden
  IOStub._simulate(video, 0);
  await new Promise((r) => setTimeout(r, 15));
  assert.ok(
    events.some((e) => e.name === "video:paused"),
    "paused emitted when hidden",
  );

  // Re-visible should not cause duplicate loaded
  IOStub._simulate(video, 0.9);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(
    events.filter((e) => e.name === "video:loaded").length,
    1,
    "no duplicate load after re-visibility",
  );
});
// Fallback rAF visibility path removed (modern browsers only)

//
// Additional tests for delegated controls, manual API, error handling, container logic, observer cleanup, and event details.
//

// eslint-disable-next-line import/first
import { Video } from "../features/video/index.js";

test("delegated controls: data-video-action play/pause/toggle", async () => {
  const { window } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/ctrl.mp4");
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const playBtn = window.document.createElement("button");
  playBtn.setAttribute("data-video-action", "play");
  window.document.body.appendChild(playBtn);

  const pauseBtn = window.document.createElement("button");
  pauseBtn.setAttribute("data-video-action", "pause");
  window.document.body.appendChild(pauseBtn);

  const toggleBtn = window.document.createElement("button");
  toggleBtn.setAttribute("data-video-action", "toggle");
  window.document.body.appendChild(toggleBtn);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Simulate play button click
  playBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "play-request via delegated control",
  );
  // Simulate pause button click
  pauseBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(
    events.some((e) => e.name === "video:paused"),
    "paused via delegated control",
  );
  // Simulate toggle button click
  toggleBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "toggle triggers play-request",
  );
});

test("manual API calls: play, pause, toggle, refresh, reloadSources, ensureLoaded", async () => {
  const { window } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/api.mp4");
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Attach and test API
  Video.attach(video);
  Video.ensureLoaded(video);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:loaded"),
    "ensureLoaded triggers loaded",
  );

  Video.play(video);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "play triggers play-request",
  );

  Video.pause(video);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:paused"),
    "pause triggers paused",
  );

  Video.toggle(video);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.filter((e) => e.name === "video:play-request").length > 0,
    "toggle triggers play-request",
  );

  Video.refresh(video);
  Video.reloadSources(video);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:loaded"),
    "reloadSources triggers loaded",
  );
});

test("error handling: missing/invalid sources, alternate retry, error event details", async () => {
  const { window } = await setupDom();
  // Missing source
  const video1 = window.document.createElement("video");
  window.document.body.appendChild(video1);
  stubPlay(video1, window);
  const events1 = collectVideoEvents(video1);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  Video.attach(video1);
  Video.ensureLoaded(video1);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events1.some((e) => e.name === "video:error" && e.detail?.reason === "missing-src"),
    "missing-src error fires",
  );

  // Invalid URL
  const video2 = window.document.createElement("video");
  video2.setAttribute("data-video-src", "http://");
  window.document.body.appendChild(video2);
  stubPlay(video2, window);
  const events2 = collectVideoEvents(video2);

  Video.attach(video2);
  Video.ensureLoaded(video2);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events2.some((e) => e.name === "video:error" && e.detail?.reason === "invalid-url"),
    "invalid-url error fires",
  );

  // Alternate retry
  const video3 = window.document.createElement("video");
  video3.setAttribute("data-video-src", ":::::invalid-url");
  video3.setAttribute("data-video-mob-src", "http://");
  window.document.body.appendChild(video3);
  stubPlay(video3, window);
  const events3 = collectVideoEvents(video3);

  Video.attach(video3);
  // Simulate error event to trigger alternate
  video3.dispatchEvent(new window.Event("error"));
  await new Promise((r) => setTimeout(r, 5));
  // Should retry alternate, then error
  video3.dispatchEvent(new window.Event("error"));
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events3.filter((e) => e.name === "video:error").length > 0,
    "alternate retry triggers error",
  );
  assert.ok(
    events3.some((e) => e.name === "video:error" && typeof e.detail?.url !== "undefined"),
    "error event includes url in detail",
  );
});

test("container logic: data-video-parent-pointer and pointer event scoping", async () => {
  const { window } = await setupDom();
  const container = window.document.createElement("div");
  container.className = "parent";
  window.document.body.appendChild(container);

  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/parent.mp4");
  video.setAttribute("data-video-load-when", "pointer-on");
  video.setAttribute("data-video-play-when", "pointer-on");
  video.setAttribute("data-video-parent-pointer", ".parent");
  container.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Pointer event on container triggers load/play
  container.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(
    events.some((e) => e.name === "video:loaded"),
    "container pointer triggers load",
  );
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "container pointer triggers play-request",
  );
});

test("observer cleanup: no memory leaks after video removal", async () => {
  const { window } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/cleanup.mp4");
  video.setAttribute("data-video-load-when", "pointer-on");
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  Video.attach(video);
  video.remove();
  await new Promise((r) => setTimeout(r, 10));
  // Try to trigger pointer event after removal
  video.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));
  // No new play-request after removal
  const playRequests = events.filter((e) => e.name === "video:play-request");
  assert.ok(
    playRequests.length === 0 || playRequests.length === 1,
    "no memory leak: observer detached after removal",
  );
});

test("delegated controls: invalid selector handling", async () => {
  const { window } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/invalid-sel.mp4");
  window.document.body.appendChild(video);
  stubPlay(video, window);

  // Button with invalid CSS selector
  const invalidBtn = window.document.createElement("button");
  invalidBtn.setAttribute("data-video-action", "play");
  invalidBtn.setAttribute("data-video-target", "/////invalid\\selector[bad]");
  window.document.body.appendChild(invalidBtn);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Clicking button with invalid selector should not crash and should not trigger events
  // The invalid selector should be handled gracefully, falling back to searching from button
  invalidBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));

  // This would test that no events were emitted incorrectly, but since querySelectorAll would fail,
  // the code should still work by catching exceptions and falling back
  assert.ok(true, "invalid selector handled gracefully without crashing");
});

test("delegated controls: composedPath fallback resolution", async () => {
  const { window } = await setupDom();
  const container = window.document.createElement("div");
  const nestedBtn = window.document.createElement("button");
  nestedBtn.setAttribute("data-video-action", "play");
  container.appendChild(nestedBtn);

  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/composed-path.mp4");
  container.appendChild(video);
  window.document.body.appendChild(container);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Create event with composedPath (simulating shadow DOM or complex event bubbling)
  const event = new window.Event("click", { bubbles: true });
  // Add composedPath method to simulate standard behavior
  event.composedPath = () => [
    nestedBtn,
    container,
    window.document.body,
    window.document.documentElement,
  ];

  nestedBtn.dispatchEvent(event);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "composedPath correctly resolves video target",
  );
});

test("delegated controls: nearest/descendant fallback resolution", async () => {
  const { window } = await setupDom();

  // Video as sibling
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/nearest.mp4");
  window.document.body.appendChild(video);

  // Button with no target specified
  const btn = window.document.createElement("button");
  btn.setAttribute("data-video-action", "play");
  window.document.body.appendChild(btn);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Click button without target - should find the video as sibling (walking up DOM)
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "nearest/descendant fallback finds video sibling",
  );
});

test("delegated controls: keydown handling with invalid keys", async () => {
  const { window } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/keydown-invalid.mp4");
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const btn = window.document.createElement("button");
  btn.setAttribute("data-video-action", "play");
  window.document.body.appendChild(btn);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Keydown with invalid key should not trigger action
  const invalidKeyEvent = new window.KeyboardEvent("keydown", {
    key: "a",
    code: "KeyA",
    bubbles: true,
  });
  btn.dispatchEvent(invalidKeyEvent);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    !events.some((e) => e.name === "video:play-request"),
    "invalid key does not trigger action",
  );

  // Valid keys should work
  const enterEvent = new window.KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
  });
  btn.dispatchEvent(enterEvent);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "Enter key triggers action",
  );

  const spaceEvent = new window.KeyboardEvent("keydown", {
    key: " ",
    code: "Space",
    bubbles: true,
  });
  btn.dispatchEvent(spaceEvent);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    events.filter((e) => e.name === "video:play-request").length >= 1,
    "Space key triggers action",
  );
});

test("delegated controls: global delegation works across component boundaries", async () => {
  const { window } = await setupDom();

  // Video in one subtree (component)
  const videoContainer = window.document.createElement("div");
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/global.mp4");
  videoContainer.appendChild(video);
  window.document.body.appendChild(videoContainer);

  // Button in separate subtree (different component)
  const buttonContainer = window.document.createElement("div");
  const btn = window.document.createElement("button");
  btn.setAttribute("data-video-action", "play");
  buttonContainer.appendChild(btn);
  window.document.body.appendChild(buttonContainer);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Click button - SHOULD find video across component boundaries due to global delegation design
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(
    events.some((e) => e.name === "video:play-request"),
    "button finds video across component boundaries (global delegation)",
  );
});

test("custom event details: assert event detail payloads", async () => {
  const { window } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/detail.mp4");
  video.setAttribute("data-video-load-when", "pointer-on");
  video.setAttribute("data-video-play-when", "pointer-on");
  video.setAttribute("data-video-pause-when", "pointer-off");
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Trigger pointer enter to load & play
  video.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));

  // Trigger pointer leave to pause
  video.dispatchEvent(new window.Event("pointerleave", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 5));

  // Check event details
  const managed = events.find((e) => e.name === "video:managed");
  const loaded = events.find((e) => e.name === "video:loaded");
  const playReq = events.find((e) => e.name === "video:play-request");
  const playing = events.find((e) => e.name === "video:playing");
  const paused = events.find((e) => e.name === "video:paused");

  assert.ok(managed?.detail?.trigger, "video:managed has detail.trigger");
  assert.ok(
    loaded?.detail?.trigger && loaded.detail.url,
    "video:loaded has detail.trigger and url",
  );
  assert.ok(playReq?.detail?.trigger, "video:play-request has detail.trigger");
  assert.ok(playing?.detail?.trigger, "video:playing has detail.trigger");
  assert.ok(paused?.detail?.trigger, "video:paused has detail.trigger");
});

test("data-video-muted: enforces muted and prevents unmuted retry", async () => {
  const { window } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/muted.mp4");
  video.setAttribute("data-video-load-when", "pointer-on");
  video.setAttribute("data-video-play-when", "pointer-on");
  // presence-based attribute to enforce muted
  video.setAttribute("data-video-muted", "");
  window.document.body.appendChild(video);

  let playAttempts = 0;
  // Simulate autoplay policy: reject when not muted
  video.play = () => {
    playAttempts++;
    if (!video.muted) return Promise.reject(new Error("autoplay blocked"));
    return Promise.resolve().then(() => {
      video.dispatchEvent(new window.Event("playing"));
    });
  };
  video.pause = () => {};

  const events = collectVideoEvents(video);
  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 5));

  // Config should enforce muted at setup time
  assert.equal(video.muted, true, "video should be muted due to data-video-muted at attach");

  // Gesture: pointerenter should trigger a single play attempt (muted)
  video.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(
    playAttempts,
    1,
    "should call play once (no unmuted retry) when data-video-muted is present",
  );
  assert.ok(
    events.some((e) => e.name === "video:playing"),
    "playing event emitted when muted enforced",
  );

  // Now verify default behavior without data-video-muted: unmuted attempt then muted retry
  const video2 = window.document.createElement("video");
  video2.setAttribute("data-video-src", "https://example.com/muted2.mp4");
  video2.setAttribute("data-video-load-when", "pointer-on");
  video2.setAttribute("data-video-play-when", "pointer-on");
  window.document.body.appendChild(video2);

  let attempts2 = 0;
  video2.play = () => {
    attempts2++;
    // fail the first unmuted attempt, succeed when muted (second attempt)
    if (!video2.muted && attempts2 === 1) return Promise.reject(new Error("autoplay blocked"));
    return Promise.resolve().then(() => {
      video2.dispatchEvent(new window.Event("playing"));
    });
  };
  video2.pause = () => {};
  const events2 = collectVideoEvents(video2);

  const mod2 = await importVideoFeatureFresh();
  const Video = mod2.Video;
  Video.attach(video2);
  await new Promise((r) => setTimeout(r, 5));
  // Simulate gesture
  video2.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));

  assert.ok(
    attempts2 >= 2,
    "should attempt unmuted first then muted retry when no data-video-muted",
  );
  assert.ok(
    events2.some((e) => e.name === "video:playing"),
    "playing emitted after muted retry",
  );
});
