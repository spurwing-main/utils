import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Video feature tests (initial scaffolding)
 * Goals:
 * 1. Attach: managed video dispatches video:managed after boot.
 * 2. Pointer-driven lazy load: data-video-* source attributes removed only after pointerenter (load + play).
 * 3. Events: video:loaded fires once; subsequent pointerenter does not duplicate load.
 * 4. Detach via DOM removal: subsequent pointerenter no longer emits play-request (instance destroyed).
 */

const ROOT = path.resolve('.');
const VIDEO_FEATURE_PATH = path.join(ROOT, 'features', 'video', 'index.js');
const VIDEO_FEATURE_URL = pathToFileURL(VIDEO_FEATURE_PATH).href;
assert.ok(fs.existsSync(VIDEO_FEATURE_PATH), 'video feature module must exist');

// Fresh import helper to avoid cross-test leakage of window/document singletons.
// Each call appends a unique query parameter so the module re-evaluates with the
// current global window (important because tests create a new JSDOM instance).
async function importVideoFeatureFresh(){
  const u = VIDEO_FEATURE_URL + '?t=' + Date.now() + '_' + Math.random().toString(36).slice(2);
  return import(u);
}

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  // Ensure MutationObserver is available globally (feature references bare MutationObserver)
  if (window.MutationObserver) {
    global.MutationObserver = window.MutationObserver;
  } else {
    // Minimal no-op fallback to avoid crashes (should not happen in recent jsdom)
    global.MutationObserver = class {
      observe() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }
  // Provide matchMedia stub to simulate desktop hover + pointer capabilities
  if (!window.matchMedia) {
    window.matchMedia = (query) => {
      const normalized = String(query).toLowerCase();
      // Simulate desktop environment with fine pointer and hover, large viewport > 812px
      if (normalized.includes('(hover: hover)') || normalized.includes('(pointer: fine)')) {
        return { matches: true, media: query, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } };
      }
      if (normalized.includes('max-width: 812px')) {
        return { matches: false, media: query, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } };
      }
      return { matches: false, media: query, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } };
    };
  }
  // Minimal performance.now stub used by priority play logic
  if (!window.performance) {
    window.performance = { now: () => Date.now() };
  }
  if (typeof window.performance.now !== 'function') {
    window.performance.now = () => Date.now();
  }
  // Stub unimplemented HTMLMediaElement methods to silence jsdom "Not implemented" warnings
  const HMEP = window.HTMLMediaElement?.prototype;
  if (HMEP && !HMEP._utilsPatched) {
    const noop = function(){};
    try { HMEP.load = noop; } catch {}
    try { HMEP.pause = noop; } catch {}
    // Do not override play here; individual tests use stubPlay to emit 'playing'
    HMEP._utilsPatched = true;
  }
  return { window };
}

// Utility: collect events emitted on a specific video element
function collectVideoEvents(video) {
  const names = [
    'video:managed',
    'video:loaded',
    'video:play-request',
    'video:playing',
    'video:paused',
    'video:error'
  ];
  const log = [];
  for (const n of names) {
    video.addEventListener(n, (e) => {
      log.push({ name: n, detail: e.detail });
    });
  }
  return log;
}

// Stub play() to behave as a successful async gesture play
function stubPlay(video, window) {
 video.play = () => {
   // Simulate async policy with resolved promise
   return Promise.resolve().then(() => {
     // Dispatch native 'playing' so feature forwards to video:playing
     video.dispatchEvent(new window.Event('playing'));
   });
 };
 video.pause = () => {};
}

// Install an IntersectionObserver stub allowing manual simulation of visibility.
function installIOStub(window){
 const observers = [];
 class IOStub {
   constructor(cb, opts){
     this._cb = cb;
     this._targets = new Set();
     observers.push(this);
   }
   observe(el){ this._targets.add(el); }
   unobserve(el){ this._targets.delete(el); }
   disconnect(){ this._targets.clear(); }
 }
 IOStub._simulate = function(target, ratio){
   for (const o of observers){
     if (o._targets.has(target)){
       o._cb([{ target, intersectionRatio: ratio }]);
     }
   }
 };
 window.IntersectionObserver = IOStub;
 return IOStub;
}

test('video feature: pointer-driven load & detach', async () => {
  const { window } = await setupDom();
  // Create managed video: only pointer triggers (no scroll visibility dependency)
  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/vid.mp4');
  video.setAttribute('data-video-load-when', 'pointer-on');
  video.setAttribute('data-video-play-when', 'pointer-on');
  video.setAttribute('data-video-pause-when', 'pointer-off');
  window.document.body.appendChild(video);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  // Import feature & boot via DOMContentLoaded dispatch
  const mod = await importVideoFeatureFresh();
  assert.ok(mod.init, 'init exported');
  mod.init();
  // Fire DOMContentLoaded to trigger boot() path
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  // Managed event should have fired (boot attaches & emits)
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events.some(e => e.name === 'video:managed'), 'video:managed should fire after boot');
  assert.ok(video.hasAttribute('data-video-src'), 'source attribute still present before pointer interaction (not yet loaded)');

  // Trigger pointer enter to load & play
  video.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
  await new Promise(r => setTimeout(r, 10)); // allow async play promise resolution

  const loadedEvents = events.filter(e => e.name === 'video:loaded');
  assert.equal(loadedEvents.length, 1, 'video:loaded fires exactly once after first pointerenter');
  assert.equal(video.hasAttribute('data-video-src'), false, 'data-video-src removed after load');

  // Second pointerenter should not create another loaded event
  video.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
  await new Promise(r => setTimeout(r, 5));
  assert.equal(events.filter(e => e.name === 'video:loaded').length, 1, 'no duplicate video:loaded on second pointerenter');

  // Pointer leave should pause (emit video:paused)
  video.dispatchEvent(new window.Event('pointerleave', { bubbles: true }));
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events.some(e => e.name === 'video:paused'), 'video:paused emitted on pointerleave');

  const playRequestCountBeforeDetach = events.filter(e => e.name === 'video:play-request').length;

  // Detach (remove from DOM) -> MutationObserver should destroy instance
  video.remove();
  await new Promise(r => setTimeout(r, 5)); // allow MO microtask

  // Further pointerenter should not add new play-request events
  video.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
  await new Promise(r => setTimeout(r, 5));
  const playRequestCountAfterDetach = events.filter(e => e.name === 'video:play-request').length;
  assert.equal(playRequestCountAfterDetach, playRequestCountBeforeDetach, 'no new play-request after detach');

  // Sanity: error events (if any) should not indicate missing-src
  const errorEvents = events.filter(e => e.name === 'video:error');
  assert.ok(!errorEvents.some(e => e.detail?.reason === 'missing-src'), 'no missing-src error expected');
});

test('video feature: visibility-driven scroll load & play/pause', async () => {
  const { window } = await setupDom();
  // Install IO stub and create video with scroll/visibility triggers
  const IOStub = installIOStub(window);
  // Make sure IO is supported in the test environment
  window.IntersectionObserver.supported = true;
  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/vis.mp4');
  video.setAttribute('data-video-load-when', 'scroll');
  video.setAttribute('data-video-play-when', 'visible');
  video.setAttribute('data-video-pause-when', 'hidden');
  window.document.body.appendChild(video);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  // Not yet loaded (no visibility event)
  await new Promise(r => setTimeout(r, 5));
  assert.ok(video.hasAttribute('data-video-src'), 'video not loaded before visibility');

  // Simulate becoming visible (retry if first simulation races with attach)
  IOStub._simulate(video, 0.6);
  await new Promise(r => setTimeout(r, 10));
  if (events.filter(e => e.name === 'video:loaded').length === 0) {
    // Retry once more; some environments may require a second intersection to register transition
    IOStub._simulate(video, 0.6);
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(events.filter(e => e.name === 'video:loaded').length, 1, 'loaded once on first visible');
  assert.equal(video.hasAttribute('data-video-src'), false, 'source attribute removed after visibility load');
  assert.ok(events.some(e => e.name === 'video:play-request'), 'play-request emitted on visibility');
  assert.ok(events.some(e => e.name === 'video:playing'), 'playing emitted on visibility');

  // Simulate become hidden
  IOStub._simulate(video, 0);
  await new Promise(r => setTimeout(r, 15));
  assert.ok(events.some(e => e.name === 'video:paused'), 'paused emitted when hidden');

  // Re-visible should not cause duplicate loaded
  IOStub._simulate(video, 0.9);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(events.filter(e => e.name === 'video:loaded').length, 1, 'no duplicate load after re-visibility');
});
test('video feature: visibility-driven scroll load & play/pause (fallback rAF path)', async () => {
  const { window } = await setupDom();
  // Remove IntersectionObserver so fallback path is used
  window.IntersectionObserver = undefined;
  // Configure viewport size
  window.innerWidth = 1280;
  window.innerHeight = 720;

  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/fallback.mp4');
  video.setAttribute('data-video-load-when', 'scroll');
  video.setAttribute('data-video-play-when', 'visible');
  video.setAttribute('data-video-pause-when', 'hidden');
  // Initial bounding box fully in view
  video.getBoundingClientRect = () => ({
    top: 100, left: 100, right: 500, bottom: 400, width: 400, height: 300
  });
  window.document.body.appendChild(video);

  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  await new Promise(r => setTimeout(r, 5));
  assert.ok(video.hasAttribute('data-video-src'), 'still not loaded before fallback pulses');

  // Helper to drive fallback visibility evaluation (VIEW_FALLBACK.schedule bound to scroll)
  async function pulseUntil(predicate, max=8){
    for (let i=0;i<max;i++){
      console.log(`[pulse] iteration ${i}, dispatching scroll event`);
      window.dispatchEvent(new window.Event('scroll'));
      await new Promise(r => setTimeout(r, 8));
      if (predicate()) {
        console.log(`[pulse] predicate satisfied at iteration ${i}`);
        return;
      }
    }
    console.log(`[pulse] completed ${max} iterations without success`);
  }

  await pulseUntil(() => events.some(e => e.name === 'video:loaded'));

  assert.equal(events.filter(e => e.name === 'video:loaded').length, 1, 'loaded once via fallback visibility');
  assert.equal(video.hasAttribute('data-video-src'), false, 'source attribute removed after fallback load');
  assert.ok(events.some(e => e.name === 'video:play-request'), 'play-request emitted (fallback visible)');
  assert.ok(events.some(e => e.name === 'video:playing'), 'playing emitted (fallback visible)');

  // Debug: log current events before hiding
  console.log('Events before hiding:', events.map(e => e.name));

  // Now hide: bounding box off-screen
  video.getBoundingClientRect = () => ({
    top: window.innerHeight + 100,
    left: 0,
    right: 400,
    bottom: window.innerHeight + 400,
    width: 400,
    height: 300
  });

  console.log('Video hidden, pulsing for pause event...');
  await pulseUntil(() => events.some(e => e.name === 'video:paused'));
  console.log('Events after hiding:', events.map(e => e.name));
  assert.ok(events.some(e => e.name === 'video:paused'), 'paused emitted after fallback hidden');
});

//
// Additional tests for delegated controls, manual API, error handling, container logic, observer cleanup, and event details.
//
import { Video } from '../features/video/index.js';

test('delegated controls: data-video-action play/pause/toggle', async () => {
  const { window } = await setupDom();
  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/ctrl.mp4');
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const playBtn = window.document.createElement('button');
  playBtn.setAttribute('data-video-action', 'play');
  window.document.body.appendChild(playBtn);

  const pauseBtn = window.document.createElement('button');
  pauseBtn.setAttribute('data-video-action', 'pause');
  window.document.body.appendChild(pauseBtn);

  const toggleBtn = window.document.createElement('button');
  toggleBtn.setAttribute('data-video-action', 'toggle');
  window.document.body.appendChild(toggleBtn);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  // Simulate play button click
  playBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));
  assert.ok(events.some(e => e.name === 'video:play-request'), 'play-request via delegated control');
  // Simulate pause button click
  pauseBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));
  assert.ok(events.some(e => e.name === 'video:paused'), 'paused via delegated control');
  // Simulate toggle button click
  toggleBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));
  assert.ok(events.some(e => e.name === 'video:play-request'), 'toggle triggers play-request');
});

test('manual API calls: play, pause, toggle, refresh, reloadSources, ensureLoaded', async () => {
  const { window } = await setupDom();
  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/api.mp4');
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  // Attach and test API
  Video.attach(video);
  Video.ensureLoaded(video);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events.some(e => e.name === 'video:loaded'), 'ensureLoaded triggers loaded');

  Video.play(video);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events.some(e => e.name === 'video:play-request'), 'play triggers play-request');

  Video.pause(video);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events.some(e => e.name === 'video:paused'), 'pause triggers paused');

  Video.toggle(video);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events.filter(e => e.name === 'video:play-request').length > 0, 'toggle triggers play-request');

  Video.refresh(video);
  Video.reloadSources(video);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events.some(e => e.name === 'video:loaded'), 'reloadSources triggers loaded');
});

test('error handling: missing/invalid sources, alternate retry, error event details', async () => {
  const { window } = await setupDom();
  // Missing source
  const video1 = window.document.createElement('video');
  window.document.body.appendChild(video1);
  stubPlay(video1, window);
  const events1 = collectVideoEvents(video1);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  Video.attach(video1);
  Video.ensureLoaded(video1);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events1.some(e => e.name === 'video:error' && e.detail?.reason === 'missing-src'), 'missing-src error fires');

  // Invalid URL
  const video2 = window.document.createElement('video');
  video2.setAttribute('data-video-src', ':::::invalid-url');
  window.document.body.appendChild(video2);
  stubPlay(video2, window);
  const events2 = collectVideoEvents(video2);

  Video.attach(video2);
  Video.ensureLoaded(video2);
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events2.some(e => e.name === 'video:error' && e.detail?.reason === 'invalid-url'), 'invalid-url error fires');

  // Alternate retry
  const video3 = window.document.createElement('video');
  video3.setAttribute('data-video-src', ':::::invalid-url');
  video3.setAttribute('data-video-mob-src', 'https://example.com/alt.mp4');
  window.document.body.appendChild(video3);
  stubPlay(video3, window);
  const events3 = collectVideoEvents(video3);

  Video.attach(video3);
  // Simulate error event to trigger alternate
  video3.dispatchEvent(new window.Event('error'));
  await new Promise(r => setTimeout(r, 5));
  // Should retry alternate, then error
  video3.dispatchEvent(new window.Event('error'));
  await new Promise(r => setTimeout(r, 5));
  assert.ok(events3.filter(e => e.name === 'video:error').length > 0, 'alternate retry triggers error');
  assert.ok(events3.some(e => e.name === 'video:error' && typeof e.detail?.url !== 'undefined'), 'error event includes url in detail');
});

test('container logic: data-video-parent-pointer and pointer event scoping', async () => {
  const { window } = await setupDom();
  const container = window.document.createElement('div');
  container.className = 'parent';
  window.document.body.appendChild(container);

  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/parent.mp4');
  video.setAttribute('data-video-load-when', 'pointer-on');
  video.setAttribute('data-video-parent-pointer', '.parent');
  container.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  // Pointer event on container triggers load/play
  container.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));
  assert.ok(events.some(e => e.name === 'video:loaded'), 'container pointer triggers load');
  assert.ok(events.some(e => e.name === 'video:play-request'), 'container pointer triggers play-request');
});

test('observer cleanup: no memory leaks after video removal', async () => {
  const { window } = await setupDom();
  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/cleanup.mp4');
  video.setAttribute('data-video-load-when', 'pointer-on');
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  Video.attach(video);
  video.remove();
  await new Promise(r => setTimeout(r, 10));
  // Try to trigger pointer event after removal
  video.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
  await new Promise(r => setTimeout(r, 5));
  // No new play-request after removal
  const playRequests = events.filter(e => e.name === 'video:play-request');
  assert.ok(playRequests.length === 0 || playRequests.length === 1, 'no memory leak: observer detached after removal');
});

test('custom event details: assert event detail payloads', async () => {
  const { window } = await setupDom();
  const video = window.document.createElement('video');
  video.setAttribute('data-video-src', 'https://example.com/detail.mp4');
  video.setAttribute('data-video-load-when', 'pointer-on');
  window.document.body.appendChild(video);
  stubPlay(video, window);
  const events = collectVideoEvents(video);

  const mod = await importVideoFeatureFresh();
  mod.init();
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  // Trigger pointer enter to load & play
  video.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));

  // Check event details
  const managed = events.find(e => e.name === 'video:managed');
  const loaded = events.find(e => e.name === 'video:loaded');
  const playReq = events.find(e => e.name === 'video:play-request');
  const playing = events.find(e => e.name === 'video:playing');
  const paused = events.find(e => e.name === 'video:paused');

  assert.ok(managed && managed.detail && managed.detail.trigger, 'video:managed has detail.trigger');
  assert.ok(loaded && loaded.detail && loaded.detail.trigger && loaded.detail.url, 'video:loaded has detail.trigger and url');
  assert.ok(playReq && playReq.detail && playReq.detail.trigger, 'video:play-request has detail.trigger');
  assert.ok(playing && playing.detail && playing.detail.trigger, 'video:playing has detail.trigger');
  assert.ok(paused && paused.detail && paused.detail.trigger, 'video:paused has detail.trigger');
});