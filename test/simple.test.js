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

async function setupDom() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
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
  if (!window.matchMedia) {
    window.matchAedia = () => ({ matches: false });
  }
  if (!window.performance) {
    window.performance = { now: () => Date.now() };
  }
  if (typeof window.performance.now !== "function") {
    window.performance.now = () => Date.now();
  }
  const HMEP = window.HTMLMediaElement?.prototype;
  if (HMEP && !HMEP._utilsPatched) {
    const noop = () => {};
    try {
      HMEP.load = noop;
    } catch (e) {
      /* POLICY-EXCEPTION: patch may fail in certain jsdom builds */ void e;
    }
    try {
      HMEP.pause = noop;
    } catch (e) {
      /* POLICY-EXCEPTION: patch may fail in certain jsdom builds */ void e;
    }
    HMEP._utilsPatched = true;
  }
  return { window };
}

test("simple video feature test", async () => {
  await setupDom();
  const mod = await importVideoFeatureFresh();
  assert.ok(mod.init, "init exported");
});
