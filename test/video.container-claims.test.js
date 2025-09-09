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

async function setupDom() {
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
  // Desktop hover/pointer env
  window.matchMedia = (q) => {
    const s = String(q).toLowerCase();
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

function collectEvents(video) {
  const names = ["video:loaded", "video:play-request"];
  const log = [];
  for (const n of names) video.addEventListener(n, (e) => log.push({ name: n, detail: e.detail }));
  return log;
}

test("container pointer claim: only first managed descendant responds", async () => {
  const { window } = await setupDom();
  const container = window.document.createElement("div");
  container.className = "parent";
  window.document.body.appendChild(container);

  const v1 = window.document.createElement("video");
  v1.setAttribute("data-video-src", "https://example.com/one.mp4");
  v1.setAttribute("data-video-load-when", "pointer-on");
  v1.setAttribute("data-video-play-when", "pointer-on");
  v1.setAttribute("data-video-parent-pointer", ".parent");
  container.appendChild(v1);

  const v2 = window.document.createElement("video");
  v2.setAttribute("data-video-src", "https://example.com/two.mp4");
  v2.setAttribute("data-video-load-when", "pointer-on");
  v2.setAttribute("data-video-play-when", "pointer-on");
  v2.setAttribute("data-video-parent-pointer", ".parent");
  container.appendChild(v2);

  // Stub play for both
  const stubPlay = (video) => {
    video.play = () =>
      Promise.resolve().then(() => video.dispatchEvent(new window.Event("playing")));
    video.pause = () => {};
  };
  stubPlay(v1);
  stubPlay(v2);
  const e1 = collectEvents(v1);
  const e2 = collectEvents(v2);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Trigger pointerenter on container
  container.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 15));

  // Only the first managed descendant responds
  assert.ok(
    e1.some((e) => e.name === "video:loaded"),
    "first video loads on container pointer",
  );
  assert.ok(
    e1.some((e) => e.name === "video:play-request"),
    "first video play-requested",
  );
  assert.equal(
    e2.some((e) => e.name === "video:loaded"),
    false,
    "second video does not load",
  );
  assert.equal(
    e2.some((e) => e.name === "video:play-request"),
    false,
    "second video no play-request",
  );
});
