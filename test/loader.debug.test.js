// ESM via package type; unified .js extension
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(".");
const LOADER_PATH = path.join(ROOT, "loader.js");
assert.ok(fs.existsSync(LOADER_PATH), "loader.js must exist");
const LOADER_URL_BASE = pathToFileURL(LOADER_PATH).href;

async function setupDom({ featuresAttr, debugAttr, useUnique = true }) {
  const url = "http://localhost/";
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
  // Use a unique query to ensure fresh module evaluation in each test
  const unique = useUnique ? `?t=${Date.now()}_${Math.random().toString(36).slice(2)}` : "";
  script.src = LOADER_URL_BASE + unique;
  if (featuresAttr !== null && typeof featuresAttr !== "undefined") {
    script.setAttribute("data-features", featuresAttr);
  }
  if (debugAttr !== null && typeof debugAttr !== "undefined") {
    script.setAttribute("data-debug", debugAttr);
  }
  window.document.head.appendChild(script);
  return { window, loaderUrl: script.src };
}

test("debug via localStorage: enable specific namespaces", async () => {
  const { window, loaderUrl } = await setupDom({ featuresAttr: "alpha", debugAttr: null });
  // Enable via localStorage only (no data-debug attribute present)
  window.localStorage.setItem("utils:debug", "video,other");

  await import(loaderUrl);
  assert.ok(window.__UTILS_DEBUG__, "debugger installed from localStorage");
  assert.equal(window.__UTILS_DEBUG__.enabled("video"), true, "video namespace enabled");
  assert.equal(window.__UTILS_DEBUG__.enabled("loader"), false, "loader namespace not enabled");
});

test("debug via attribute '*': enable all namespaces + invalid feature warning", async () => {
  const { window, loaderUrl } = await setupDom({
    // include an invalid feature name to ensure it is ignored by validation
    featuresAttr: "alpha, invalid$name",
    debugAttr: "*",
  });

  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  try {
    await import(loaderUrl);
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    console.warn = origWarn;
  }

  // '*' enables all namespaces
  assert.ok(window.__UTILS_DEBUG__, "debugger installed from attribute");
  assert.equal(window.__UTILS_DEBUG__.enabled("loader"), true, "loader enabled");
  assert.equal(window.__UTILS_DEBUG__.enabled("video"), true, "video enabled");

  // Invalid feature name should produce a warning (validation in loader)
  assert.ok(
    warns.some((msg) => msg.includes("invalid feature name")),
    "invalid feature name warning logged",
  );
});
