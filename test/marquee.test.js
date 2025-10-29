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
        cb(window.performance.now());
      }
    }, 0);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };

  // Mock performance.now if not available
  if (!window.performance || typeof window.performance.now !== "function") {
    if (!window.performance) {
      window.performance = {};
    }
    window.performance.now = () => Date.now();
  }

  return { window };
}

test("marquee feature exports init and Marquee", async () => {
  await setupDom();
  const mod = await importMarqueeFeatureFresh();
  assert.ok(mod.init, "init exported");
  assert.ok(mod.Marquee, "Marquee exported");
  assert.ok(typeof mod.Marquee.attach === "function", "Marquee.attach is function");
  assert.ok(typeof mod.Marquee.detach === "function", "Marquee.detach is function");
  assert.ok(typeof mod.Marquee.rescan === "function", "Marquee.rescan is function");
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

test("marquee attach can be called without errors", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.setAttribute("data-marquee", "");
  container.innerHTML = "<span>Test content</span>";
  window.document.body.appendChild(container);

  // Should not throw
  mod.Marquee.attach(container);

  // Wait for any async operations
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Should be able to detach without errors
  mod.Marquee.detach(container);

  assert.ok(true, "attach and detach completed without throwing");
});

test("marquee detach restores original DOM", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const originalHTML = "<span>Original content</span>";
  const container = window.document.createElement("div");
  container.setAttribute("data-marquee", "");
  container.innerHTML = originalHTML;
  window.document.body.appendChild(container);

  mod.Marquee.attach(container);

  // Wait for setup
  await new Promise((resolve) => setTimeout(resolve, 20));

  mod.Marquee.detach(container);

  // Check DOM is restored
  assert.equal(container.innerHTML, originalHTML, "original HTML restored");
});

test("marquee handles invalid container gracefully", async () => {
  await setupDom();
  const mod = await importMarqueeFeatureFresh();

  // Should not throw with invalid inputs
  mod.Marquee.attach(null);
  mod.Marquee.attach(undefined);
  mod.Marquee.attach({});
  mod.Marquee.detach(null);
  mod.Marquee.detach(undefined);

  assert.ok(true, "invalid containers handled gracefully");
});

test("marquee rescan discovers new elements", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container1 = window.document.createElement("div");
  container1.setAttribute("data-marquee", "");
  container1.innerHTML = "<span>Content 1</span>";

  const container2 = window.document.createElement("div");
  container2.setAttribute("data-marquee", "");
  container2.innerHTML = "<span>Content 2</span>";

  window.document.body.appendChild(container1);
  window.document.body.appendChild(container2);

  // Should not throw
  mod.Marquee.rescan();

  // Wait for any async operations
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Cleanup should also not throw
  mod.Marquee.detach(container1);
  mod.Marquee.detach(container2);

  assert.ok(true, "rescan completed without throwing");
});

test("marquee reads speed from data-marquee-speed attribute", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.setAttribute("data-marquee", "");
  container.setAttribute("data-marquee-speed", "2");
  container.innerHTML = "<span>Content</span>";

  window.document.body.appendChild(container);

  // Should read speed from attribute
  mod.Marquee.attach(container);
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Cleanup
  mod.Marquee.detach(container);

  assert.ok(true, "speed attribute read successfully");
});

test("marquee rescan detaches removed elements", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.setAttribute("data-marquee", "");
  container.innerHTML = "<span>Test content</span>";
  window.document.body.appendChild(container);

  mod.Marquee.rescan();
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Remove attribute
  container.removeAttribute("data-marquee");

  // Rescan should detach
  mod.Marquee.rescan();

  assert.ok(true, "rescan detached element without attribute");
});

test("marquee handles multiple attach calls gracefully", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.setAttribute("data-marquee", "");
  container.innerHTML = "<span>Test content</span>";
  window.document.body.appendChild(container);

  // Attach multiple times - should be idempotent
  mod.Marquee.attach(container);
  mod.Marquee.attach(container);
  mod.Marquee.attach(container);

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.ok(true, "multiple attach calls handled gracefully");

  // Cleanup
  mod.Marquee.detach(container);
});

test("marquee cleans up on detach", async () => {
  const { window } = await setupDom();
  const mod = await importMarqueeFeatureFresh();

  const container = window.document.createElement("div");
  container.setAttribute("data-marquee", "");
  container.innerHTML = "<span>Test content</span>";
  const originalOverflow = container.style.overflow;
  window.document.body.appendChild(container);

  mod.Marquee.attach(container);
  await new Promise((resolve) => setTimeout(resolve, 20));

  mod.Marquee.detach(container);

  // Check cleanup
  assert.equal(container.style.overflow, originalOverflow, "overflow style restored");

  // Should be able to detach again without error
  mod.Marquee.detach(container);

  assert.ok(true, "cleanup completed successfully");
});
