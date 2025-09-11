// Ensure pointer-only path does not emit legacy fallback warnings
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(".");
const VIDEO_FEATURE_PATH = path.join(ROOT, "features", "video", "index.js");
const VIDEO_FEATURE_URL = pathToFileURL(VIDEO_FEATURE_PATH).href;
assert.ok(fs.existsSync(VIDEO_FEATURE_PATH), "video feature module must exist");

async function importVideoFeatureFresh() {
  const u = `${VIDEO_FEATURE_URL}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return import(u);
}

async function setupDomWithDebug() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  if (window.MutationObserver) global.MutationObserver = window.MutationObserver;
  // Desktop-like environment for pointer triggers
  window.matchMedia = (q) => ({
    matches: /(hover: hover|pointer: fine)/.test(String(q)),
    media: q,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
  // Install a debug logger that surfaces video warnings via console.warn
  window.__UTILS_DEBUG__ = {
    enabled(ns) {
      return ns === "video"; // enable only video namespace
    },
    createLogger(_ns) {
      return {
        debug: (...a) => console.info(...a),
        info: (...a) => console.info(...a),
        warn: (...a) => console.warn(...a),
        error: (...a) => console.error(...a),
        time: () => {},
        timeEnd: () => {},
      };
    },
  };
  // Media element play/pause stubs
  const HMEP = window.HTMLMediaElement?.prototype;
  if (HMEP && !HMEP._utilsPatched) {
    const noop = () => {};
    HMEP.load = noop;
    HMEP.pause = noop;
    HMEP._utilsPatched = true;
  }
  return { window };
}

test("no legacy VIEW_FALLBACK warnings on pointer-only load", async () => {
  const { window } = await setupDomWithDebug();
  // Capture warnings and errors
  const warns = [];
  const errs = [];
  const origWarn = console.warn;
  const origErr = console.error;
  console.warn = (...a) => warns.push(a.join(" "));
  console.error = (...a) => errs.push(a.join(" "));
  try {
    // Pointer-only managed video
    const v = window.document.createElement("video");
    v.setAttribute("data-video-src", "https://example.com/pointer.mp4");
    v.setAttribute("data-video-load-when", "pointer-on");
    v.setAttribute("data-video-play-when", "pointer-on");
    v.setAttribute("data-video-pause-when", "pointer-off");
    window.document.body.appendChild(v);

    // Stub a successful play()
    v.play = () => Promise.resolve().then(() => v.dispatchEvent(new window.Event("playing")));
    v.pause = () => {};

    const mod = await importVideoFeatureFresh();
    mod.init();
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

    // Trigger pointer enter to cause load path
    v.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    console.warn = origWarn;
    console.error = origErr;
  }
  // Assert no warnings/errors mentioning legacy fallback removal or undefined .remove
  const joined = warns.concat(errs).join("\n");
  assert.equal(joined.includes("VIEW_FALLBACK"), false, "no VIEW_FALLBACK warnings");
  assert.equal(joined.includes("remove failed"), false, "no remove failed logs");
});
