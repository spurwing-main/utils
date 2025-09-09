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

async function setupDom(matchMobile) {
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
  // matchMedia stub controlling mobile breakpoint
  window.matchMedia = (q) => {
    const s = String(q).toLowerCase();
    if (s.includes("max-width: 812px")) {
      return { matches: !!matchMobile, media: q, addEventListener() {}, removeEventListener() {} };
    }
    // enable pointer env heuristics by default
    if (s.includes("(hover: hover)") || s.includes("(pointer: fine)")) {
      return { matches: true, media: q, addEventListener() {}, removeEventListener() {} };
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
  const names = ["video:loaded"];
  const log = [];
  for (const n of names) video.addEventListener(n, (e) => log.push({ name: n, detail: e.detail }));
  return log;
}

test("_pickSrc chooses mobile source when max-width matches", async () => {
  const { window } = await setupDom(true);
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/desktop.mp4");
  video.setAttribute("data-video-mob-src", "https://m.example.com/mobile.mp4");
  window.document.body.appendChild(video);

  // Stub play to resolve
  video.play = () =>
    Promise.resolve().then(() => {
      video.dispatchEvent(new window.Event("playing"));
    });
  video.pause = () => {};
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Attach and ensure load
  const { Video } = await import("../features/video/index.js");
  Video.attach(video);
  Video.ensureLoaded(video);
  await new Promise((r) => setTimeout(r, 10));

  const loaded = events.find((e) => e.name === "video:loaded");
  assert.ok(loaded, "loaded event present");
  assert.equal(
    loaded.detail?.url,
    "https://m.example.com/mobile.mp4",
    "mobile URL selected when max-width matches",
  );
});

test("_pickSrc chooses primary source when not mobile", async () => {
  const { window } = await setupDom(false);
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/desktop.mp4");
  video.setAttribute("data-video-mob-src", "https://m.example.com/mobile.mp4");
  window.document.body.appendChild(video);

  // Stub play to resolve
  video.play = () =>
    Promise.resolve().then(() => {
      video.dispatchEvent(new window.Event("playing"));
    });
  video.pause = () => {};
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  const { Video } = await import("../features/video/index.js");
  Video.attach(video);
  Video.ensureLoaded(video);
  await new Promise((r) => setTimeout(r, 10));

  const loaded = events.find((e) => e.name === "video:loaded");
  assert.ok(loaded, "loaded event present");
  assert.equal(loaded.detail?.url, "https://example.com/desktop.mp4", "primary URL selected");
});
