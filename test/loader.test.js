// ESM via package type; unified .js extension
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

/**
 * Test goals:
 * 1. Feature list normalization + dedup + lowercase (attribute-only)
 * 2. Auto load increments side effect once
 * 3. Debug gating: data-debug="loader" enables loader namespace only
 */

const ROOT = path.resolve(".");
const LOADER_PATH = path.join(ROOT, "loader.js");
const LOADER_URL = pathToFileURL(LOADER_PATH).href;
const FEATURE_ALPHA_PATH = path.join(ROOT, "features", "alpha", "index.js");
assert.ok(fs.existsSync(LOADER_PATH), "loader.js must exist");
assert.ok(fs.existsSync(FEATURE_ALPHA_PATH), "alpha feature must exist");

async function setupDom({ featuresAttr, query = "", debugAttr, loaderSrc }) {
  const url = `http://localhost/${query}`;
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // Expose globals expected by loader
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  global.localStorage = window.localStorage;
  // Create script element that mimics module host script
  const script = window.document.createElement("script");
  script.type = "module";
  // Allow cache-busting query for isolated loader instance in tests
  script.src = loaderSrc || LOADER_URL; // must match import.meta.url for hostScript fallback
  if (featuresAttr !== null) script.setAttribute("data-features", featuresAttr);
  if (debugAttr !== null) script.setAttribute("data-debug", debugAttr);
  window.document.head.appendChild(script);
  return { window, loaderSrc: script.src };
}

test("loader end-to-end basics", async (_t) => {
  const { window } = await setupDom({
    // Mixed case + duplicates to test normalization & dedup
    featuresAttr: "Alpha alpha ALPHA",
    debugAttr: "loader",
  });

  // Dynamic import executes loader side effects (attribute-only boot)
  await import(LOADER_URL);

  // Wait a microtask for any async feature init (alpha init does sync side effect)
  await new Promise((r) => setTimeout(r, 10));

  // 1. Normalization: the alpha feature should have run exactly once
  assert.equal(window.__ALPHA_INITED__, 1, "alpha feature init should run once");

  // 2. Debug gating: only loader namespace enabled
  assert.ok(window.__UTILS_DEBUG__, "__UTILS_DEBUG__ installed");
  assert.equal(window.__UTILS_DEBUG__.enabled("loader"), true, "loader namespace enabled");
  assert.equal(window.__UTILS_DEBUG__.enabled("video"), false, "video namespace disabled");
});
// No programmatic load API (simplified loader)
