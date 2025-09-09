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
  // Provide minimal matchMedia for pointer env
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  return { window };
}

test("MutationObserver auto-attaches on node addition", async () => {
  const { window } = await setupDom();
  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Create video AFTER boot so only MO can attach it
  const video = window.document.createElement("video");
  video.setAttribute("data-video-src", "https://example.com/new.mp4");
  window.document.body.appendChild(video);

  let managed = 0;
  video.addEventListener("video:managed", () => managed++);

  await new Promise((r) => setTimeout(r, 15));
  assert.equal(managed, 1, "video:managed fired after node addition");
});
