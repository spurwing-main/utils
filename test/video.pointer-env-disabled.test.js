// ESM via package type; unified .js extension
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(".");
const VIDEO_FEATURE_PATH = path.join(ROOT, "features", "video", "index.js");
assert.ok(fs.existsSync(VIDEO_FEATURE_PATH), "video feature module must exist");
const VIDEO_FEATURE_URL = pathToFileURL(VIDEO_FEATURE_PATH).href;

async function importVideoFeatureFresh() {
  const u = `${VIDEO_FEATURE_URL}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return import(u);
}

async function setupDomNoPointer() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  // Ensure MutationObserver exists
  if (window.MutationObserver) {
    global.MutationObserver = window.MutationObserver;
  } else {
    global.MutationObserver = class {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
  // matchMedia stub with no hover/pointer fine support
  window.matchMedia = (q) => {
    const s = String(q).toLowerCase();
    if (s.includes("(hover: hover)") || s.includes("(pointer: fine)")) {
      return { matches: false, media: q, addEventListener() {}, removeEventListener() {} };
    }
    return { matches: false, media: q, addEventListener() {}, removeEventListener() {} };
  };
  // Stub unimplemented HTMLMediaElement methods to avoid jsdom throws
  const HMEP = window.HTMLMediaElement?.prototype;
  if (HMEP && !HMEP._utilsPatched) {
    const noop = () => {};
    try {
      HMEP.load = noop;
    } catch {}
    try {
      HMEP.pause = noop;
    } catch {}
    HMEP._utilsPatched = true;
  }
  return { window };
}

function collectVideoEvents(video) {
  const names = ["video:loaded", "video:play-request"];
  const log = [];
  for (const n of names) video.addEventListener(n, (e) => log.push({ name: n, detail: e.detail }));
  return log;
}

test("pointer-trigger tokens no-op when environment lacks hover/pointer", async () => {
  const { window } = await setupDomNoPointer();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/pointer.mp4");
  video.setAttribute("data-video-load-when", "pointer-on");
  video.setAttribute("data-video-play-when", "pointer-on");
  window.document.body.appendChild(video);

  // Stub play but it should not be called
  let playCalled = 0;
  video.play = () => {
    playCalled++;
    return Promise.resolve();
  };
  video.pause = () => {};
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 5));

  // Fire pointerenter on the video; environment should ignore pointer tokens
  video.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(events.filter((e) => e.name === "video:loaded").length, 0, "no load event");
  assert.equal(events.filter((e) => e.name === "video:play-request").length, 0, "no play-request");
  assert.equal(playCalled, 0, "no play attempts made");
});
