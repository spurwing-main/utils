import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Test goals:
 * 1. Feature list normalization + dedup + lowercase
 * 2. Dynamic import success path increments side effect once
 * 3. Caching: second loadFeatures call returns cached result; no second init()
 * 4. Invalid feature name rejected
 * 5. Event dispatch: utils:feature-load fired for each feature attempt
 * 6. Debug gating: data-debug="loader" enables loader namespace only
 */

const ROOT = path.resolve('.');
const LOADER_PATH = path.join(ROOT, 'loader.js');
const LOADER_URL = pathToFileURL(LOADER_PATH).href;
const FEATURE_ALPHA_PATH = path.join(ROOT, 'features', 'alpha', 'index.js');
assert.ok(fs.existsSync(LOADER_PATH), 'loader.js must exist');
assert.ok(fs.existsSync(FEATURE_ALPHA_PATH), 'alpha feature must exist');

async function setupDom({ featuresAttr, query = '' , debugAttr, loaderSrc }){
  const url = 'http://localhost/' + query;
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url,
    pretendToBeVisual: true
  });
  const { window } = dom;
  // Expose globals expected by loader
  global.window = window;
  global.document = window.document;
  global.CustomEvent = window.CustomEvent;
  global.localStorage = window.localStorage;
  // Create script element that mimics module host script
  const script = window.document.createElement('script');
  script.type = 'module';
  // Allow cache-busting query for isolated loader instance in tests
  script.src = loaderSrc || LOADER_URL; // must match import.meta.url for hostScript fallback
  if (featuresAttr !== null) script.setAttribute('data-features', featuresAttr);
  if (debugAttr !== null) script.setAttribute('data-debug', debugAttr);
  window.document.head.appendChild(script);
  // Event capture
  const events = [];
  window.addEventListener('utils:feature-load', e => {
    events.push(e.detail);
  });
  return { window, events, loaderSrc: script.src };
}

test('loader end-to-end basics', async (t) => {

  const { window, events } = await setupDom({
    // Mixed case + duplicates to test normalization & dedup
    featuresAttr: 'Alpha alpha ALPHA',
    debugAttr: 'loader'
  });

  // Dynamic import executes loader side effects (auto loadFeatures())
  const loaderMod = await import(LOADER_URL);
  assert.ok(loaderMod.loadFeatures, 'export loadFeatures() exists');
  assert.ok(loaderMod.bootstrap, 'export bootstrap() exists');

  // Wait a microtask for any async feature init (alpha init does sync side effect)
  await new Promise(r => setTimeout(r, 10));

  // 1. Normalization: the alpha feature should have run exactly once
  assert.equal(window.__ALPHA_INITED__, 1, 'alpha feature init should run once');

  // 2. Events: at least one event with ok true and name alpha
  const alphaEvents = events.filter(e => e.name === 'alpha');
  assert.ok(alphaEvents.length >= 1, 'alpha feature should dispatch at least one load event');
  assert.ok(alphaEvents.some(e => e.ok === true), 'alpha success event present');

  // 3. Debug gating: only loader namespace enabled
  assert.ok(window.__UTILS_DEBUG__, '__UTILS_DEBUG__ installed');
  assert.equal(window.__UTILS_DEBUG__.enabled('loader'), true, 'loader namespace enabled');
  assert.equal(window.__UTILS_DEBUG__.enabled('video'), false, 'video namespace disabled');

  // 4. Caching: second loadFeatures call with duplicate / mixed casing does NOT increment init
  const resSecond = await loaderMod.loadFeatures(['ALPHA', 'alpha']);
  assert.equal(window.__ALPHA_INITED__, 1, 'cached load should not re-run init');
  assert.equal(resSecond.length, 1, 'deduped result length should be 1');
  assert.equal(resSecond[0].ok, true, 'cached result ok');

  // 5. Invalid feature name
  const invalid = await loaderMod.loadFeatures(['../bad']);
  assert.equal(invalid.length, 1, 'one invalid result returned');
  assert.equal(invalid[0].ok, false, 'invalid name marked not ok');
  assert.match(String(invalid[0].error?.message || ''), /invalid feature name/i, 'error message includes invalid feature name');

  // 6. bootstrap API delegates to loadFeatures (smoke)
  const resBootstrap = await loaderMod.bootstrap(['alpha']);
  assert.equal(resBootstrap[0].ok, true, 'bootstrap returns ok for alpha');
  assert.equal(window.__ALPHA_INITED__, 1, 'bootstrap does not re-run init after cache');

  // Validate that events array includes invalid attempt as well
  assert.ok(events.some(e => e.name === '../bad' || e.name === '..%2Fbad' || e.name === '../bad'), 'invalid feature dispatched event');

});

test('loader concurrent load dedup', async () => {
  // Use a cache-busting query so we get a completely fresh loader module instance
  // (previous test's module cached its feature results against a different JSDOM window).
  const uniqueURL = LOADER_URL + '?concurrent=' + Date.now();
  const { window } = await setupDom({ featuresAttr: null, debugAttr: null, loaderSrc: uniqueURL });
  const loaderMod = await import(uniqueURL);

  // Fire several concurrent requests; all should resolve to the SAME underlying init (once).
  const CALLS = 6;
  const promises = Array.from({ length: CALLS }, () => loaderMod.loadFeatures(['alpha']));
  const allResults = await Promise.all(promises);

  // Each call returns an array with the single feature result.
  for (const res of allResults) {
    assert.equal(res.length, 1, 'each concurrent call returns single feature result');
    assert.equal(res[0].name, 'alpha', 'feature name alpha');
    assert.equal(res[0].ok, true, 'feature loaded ok');
  }

  // init must have executed exactly once across all concurrent calls.
  assert.equal(window.__ALPHA_INITED__, 1, 'alpha init should run only once under concurrency');
});