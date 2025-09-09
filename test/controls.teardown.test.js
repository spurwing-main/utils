// ESM via package type; unified .js extension
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { setupControlListeners } from "../features/video/internal/controls.js";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  return { window };
}

test("setupControlListeners teardown removes handlers", () => {
  const { window } = setupDom();
  const INSTANCES = new WeakMap();

  // Create managed video and a button next to it
  const video = window.document.createElement("video");
  window.document.body.appendChild(video);
  INSTANCES.set(video, true);
  const btn = window.document.createElement("button");
  btn.setAttribute("data-video-action", "play");
  window.document.body.appendChild(btn);

  let playCalls = 0;
  const Video = { play: () => playCalls++, pause: () => {}, toggle: () => {} };

  const teardown = setupControlListeners(Video, INSTANCES);

  // Click should trigger play once
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(playCalls, 1, "play called before teardown");

  // Remove listeners and click again; playCalls should not increase
  teardown?.();
  btn.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(playCalls, 1, "play not called after teardown");
});
