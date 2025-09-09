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
  // IntersectionObserver stub with manual trigger
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
  // Stub unimplemented HTMLMediaElement methods to silence jsdom and avoid throws
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
  // Desktop pointer env for completeness
  window.matchMedia = (q) => {
    const s = String(q).toLowerCase();
    const matches = s.includes("(hover: hover)") || s.includes("(pointer: fine)");
    return { matches, media: q, addEventListener() {}, removeEventListener() {} };
  };
  return { window, IOStub };
}

function collectVideoEvents(video) {
  const names = [
    "video:managed",
    "video:loaded",
    "video:play-request",
    "video:playing",
    "video:paused",
  ];
  const log = [];
  for (const n of names) video.addEventListener(n, (e) => log.push({ name: n, detail: e.detail }));
  return log;
}

test("scroll threshold 'full' requires full visibility", async () => {
  const { window, IOStub } = await setupDom();
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/full.mp4");
  video.setAttribute("data-video-load-when", "scroll");
  video.setAttribute("data-video-play-when", "visible");
  video.setAttribute("data-video-pause-when", "hidden");
  video.setAttribute("data-video-scroll-threshold", "full");
  window.document.body.appendChild(video);

  // Stub play to resolve and emit native 'playing'
  video.play = () =>
    Promise.resolve().then(() => {
      video.dispatchEvent(new window.Event("playing"));
    });
  video.pause = () => {};
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Partial visibility should not load at threshold=full
  IOStub._simulate(video, 0.6);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(events.filter((e) => e.name === "video:loaded").length, 0, "no load at 0.6");

  // Full visibility triggers load and play
  IOStub._simulate(video, 1.0);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(events.filter((e) => e.name === "video:loaded").length, 1, "loaded at 1.0");
  assert.ok(
    events.some((e) => e.name === "video:playing"),
    "playing emitted at 1.0",
  );
});
