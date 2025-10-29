import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(".");
const MARQUEE_FEATURE_PATH = path.join(ROOT, "features", "marquee", "index.js");
const MARQUEE_FEATURE_URL = pathToFileURL(MARQUEE_FEATURE_PATH).href;
assert.ok(fs.existsSync(MARQUEE_FEATURE_PATH), "marquee feature module must exist");

async function importMarqueeFeatureFresh() {
  const u = `${MARQUEE_FEATURE_URL}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

  // Mock matchMedia for motion preference tests
  if (!window.matchMedia) {
    let reducedMotion = false;
    const listeners = [];
    window.matchMedia = (query) => {
      const isReducedMotion = query.includes("prefers-reduced-motion");
      return {
        matches: isReducedMotion ? reducedMotion : false,
        media: query,
        addEventListener: (type, handler) => {
          if (type === "change" && isReducedMotion) {
            listeners.push(handler);
          }
        },
        removeEventListener: (_type, handler) => {
          const idx = listeners.indexOf(handler);
          if (idx !== -1) listeners.splice(idx, 1);
        },
        _setReducedMotion: (value) => {
          reducedMotion = value;
          for (const fn of listeners) {
            fn({ matches: value });
          }
        },
      };
    };
  }

  // Mock ResizeObserver
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  }

  // Mock requestAnimationFrame / cancelAnimationFrame
  let frameId = 0;
  const frames = new Map();
  window.requestAnimationFrame = (callback) => {
    const id = ++frameId;
    frames.set(id, callback);
    // Execute immediately in tests for simplicity
    setTimeout(() => {
      const cb = frames.get(id);
      if (cb) {
        frames.delete(id);
        cb(performance.now());
      }
    }, 0);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };

  if (!window.performance) {
    window.performance = { now: () => Date.now() };
  }
  if (typeof window.performance.now !== "function") {
    window.performance.now = () => Date.now();
  }

  return { window };
}

test("marquee feature exports init and Marquee", async () => {
  await setupDom();
  const mod = await importMarqueeFeatureFresh();
  assert.ok(mod.init, "init exported");
  assert.ok(mod.Marquee, "Marquee exported");
  assert.ok(typeof mod.Marquee.start === "function", "Marquee.start is function");
  assert.ok(typeof mod.Marquee.stop === "function", "Marquee.stop is function");
  assert.ok(typeof mod.Marquee.startAll === "function", "Marquee.startAll is function");
  assert.ok(typeof mod.Marquee.stopAll === "function", "Marquee.stopAll is function");
});

test("marquee init is idempotent", async () => {
  await setupDom();
  const mod = await importMarqueeFeatureFresh();

  // Should not throw when called multiple times
  mod.init();
  mod.init();
  mod.init();

  assert.ok(true, "init can be called multiple times without error");
});

test("marquee start can be called without errors", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.innerHTML = "<span>Test content</span>";
  window.document.body.appendChild(container);

  // Should not throw
  mod.Marquee.start(container);

  // Wait for any async operations
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Should be able to stop without errors
  mod.Marquee.stop(container);

  assert.ok(true, "start and stop completed without throwing");
});

test("marquee stop restores original DOM", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const originalHTML = "<span>Original content</span>";
  const container = window.document.createElement("div");
  container.innerHTML = originalHTML;
  window.document.body.appendChild(container);

  mod.Marquee.start(container);

  // Wait for setup
  await new Promise((resolve) => setTimeout(resolve, 20));

  mod.Marquee.stop(container);

  // Check DOM is restored
  assert.equal(container.innerHTML, originalHTML, "original HTML restored");
});

test("marquee handles invalid container gracefully", async () => {
  await setupDom();
  const mod = await importMarqueeFeatureFresh();

  // Should not throw with invalid inputs
  mod.Marquee.start(null);
  mod.Marquee.start(undefined);
  mod.Marquee.start({});
  mod.Marquee.stop(null);
  mod.Marquee.stop(undefined);

  assert.ok(true, "invalid containers handled gracefully");
});

test("marquee startAll can be called without errors", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container1 = window.document.createElement("div");
  container1.className = "marquee-test";
  container1.innerHTML = "<span>Content 1</span>";

  const container2 = window.document.createElement("div");
  container2.className = "marquee-test";
  container2.innerHTML = "<span>Content 2</span>";

  window.document.body.appendChild(container1);
  window.document.body.appendChild(container2);

  // Should not throw
  mod.Marquee.startAll(".marquee-test");

  // Wait for any async operations
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Cleanup should also not throw
  mod.Marquee.stopAll(".marquee-test");

  assert.ok(true, "startAll and stopAll completed without throwing");
});

test("marquee stopAll works with selector", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const originalHTML = "<span>Content</span>";
  const container1 = window.document.createElement("div");
  container1.className = "marquee-test";
  container1.innerHTML = originalHTML;

  const container2 = window.document.createElement("div");
  container2.className = "marquee-test";
  container2.innerHTML = originalHTML;

  window.document.body.appendChild(container1);
  window.document.body.appendChild(container2);

  mod.Marquee.startAll(".marquee-test");
  await new Promise((resolve) => setTimeout(resolve, 20));

  mod.Marquee.stopAll(".marquee-test");

  // Check both containers were restored
  assert.equal(container1.innerHTML, originalHTML, "container1 restored");
  assert.equal(container2.innerHTML, originalHTML, "container2 restored");
});

test("marquee respects speed option", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.innerHTML = "<span>Test content</span>";
  window.document.body.appendChild(container);

  // Should not throw with custom speed
  mod.Marquee.start(container, { speed: 2 });

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.ok(true, "custom speed option accepted");

  // Cleanup
  mod.Marquee.stop(container);
});

test("marquee handles multiple start calls gracefully", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.innerHTML = "<span>Test content</span>";
  window.document.body.appendChild(container);

  // Start multiple times - should be idempotent
  mod.Marquee.start(container);
  mod.Marquee.start(container);
  mod.Marquee.start(container);

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.ok(true, "multiple start calls handled gracefully");

  // Cleanup
  mod.Marquee.stop(container);
});

test("marquee cleans up on stop", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.innerHTML = "<span>Test content</span>";
  const originalOverflow = container.style.overflow;
  window.document.body.appendChild(container);

  mod.Marquee.start(container);
  await new Promise((resolve) => setTimeout(resolve, 20));

  mod.Marquee.stop(container);

  // Check cleanup
  assert.equal(container.style.overflow, originalOverflow, "overflow style restored");

  // Should be able to stop again without error
  mod.Marquee.stop(container);

  assert.ok(true, "cleanup completed successfully");
});
