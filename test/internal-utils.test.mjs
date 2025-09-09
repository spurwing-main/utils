import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseThresholdInput, parseRootMargin, viewRatio } from '../features/video/internal-utils.js';

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  return { window };
}

test('parseThresholdInput', () => {
  assert.equal(parseThresholdInput(''), 0);
  assert.equal(parseThresholdInput('any'), 0);
  assert.equal(parseThresholdInput('half'), 0.5);
  assert.equal(parseThresholdInput('full'), 1);
  assert.equal(parseThresholdInput('0.7'), 0.7);
  assert.equal(parseThresholdInput('2'), 1);
  assert.equal(parseThresholdInput('-1'), 0);
  assert.equal(parseThresholdInput('not-a-number'), 0);
});

test('parseRootMargin', () => {
  assert.equal(parseRootMargin(''), '300px 0px');
  assert.equal(parseRootMargin('10px 20px'), '10px 20px');
  assert.equal(parseRootMargin(undefined), '300px 0px');
});

test('viewRatio', async () => {
  const { window } = setupDom();
  window.innerWidth = 1000;
  window.innerHeight = 800;
  const el = window.document.createElement('div');
  el.getBoundingClientRect = () => ({
    top: 100, left: 100, right: 300, bottom: 300, width: 200, height: 200
  });
  // Fully in viewport, no margin
  assert.equal(viewRatio(el, '0px'), 1);
  // Partially in viewport
  const el2 = window.document.createElement('div');
  el2.getBoundingClientRect = () => ({
    top: 700, left: 900, right: 1100, bottom: 900, width: 200, height: 200
  });
  assert(viewRatio(el2, '0px') < 1 && viewRatio(el2, '0px') > 0);
  // Completely out of viewport
  const el3 = window.document.createElement('div');
  el3.getBoundingClientRect = () => ({
    top: 900, left: 1100, right: 1300, bottom: 1100, width: 200, height: 200
  });
  assert.equal(viewRatio(el3, '0px'), 0);
  // Margin expands viewport
  const el4 = window.document.createElement('div');
  el4.getBoundingClientRect = () => ({
    top: 810, left: 1000, right: 1200, bottom: 1010, width: 200, height: 200
  });
  assert(viewRatio(el4, '300px') > 0);

  // Test malformed inputs and server-side rendering
  const el5 = window.document.createElement('div');
  el5.getBoundingClientRect = () => ({
    top: 100, left: 100, right: 300, bottom: 300, width: 200, height: 200
  });

  // Test edge cases that should be handled gracefully
  assert.equal(viewRatio(el5, ''), 1); // empty string → no margin, element fully visible
  assert.equal(viewRatio(el5, null), 1); // null → no margin, fully visible
  assert.equal(viewRatio(el5, undefined), 1); // undefined → no margin, fully visible
  assert.equal(viewRatio(el5, 'invalid'), 1); // invalid string handled as '0px 0px'
  assert.equal(viewRatio(el5, '10px 20px 30px'), 1); // 3-value shorthand: top=10px, right=left=20px, bottom=30px
  assert.equal(viewRatio(el5, '10px 20px 30px 40px 50px'), 1); // more than 4 values, uses first 4
  assert.equal(viewRatio(el5, '10percent'), 1); // non-px units treated as 0, fallback behavior
  assert.equal(viewRatio(el5, '10px percent 20px'), 1); // mixed valid/invalid units

  // Test SSR safety: elements without getBoundingClientRect should return 0
  const elSSR = { };
  assert.equal(viewRatio(elSSR, '0px'), 0);

  // Test division by zero protection
  const el6 = window.document.createElement('div');
  el6.getBoundingClientRect = () => ({
    top: 100, left: 100, right: 100, bottom: 100, width: 0, height: 0
  });
  assert.equal(viewRatio(el6, '0px'), 0); // zero area elements avoid division by zero
});

test('parseRootMargin enhancement', () => {
  // Test that parseRootMargin handles various inputs
  assert.equal(parseRootMargin(''), '300px 0px'); // default
  assert.equal(parseRootMargin('10px'), '10px'); // single value
  assert.equal(parseRootMargin('10px 20px'), '10px 20px'); // two values
  assert.equal(parseRootMargin('10px 20px 30px 40px'), '10px 20px 30px 40px'); // four values
  assert.equal(parseRootMargin(undefined), '300px 0px'); // undefined
  assert.equal(parseRootMargin('invalid string'), 'invalid string'); // pass through as-is for now
});