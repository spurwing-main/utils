import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThresholdInput, parseRootMargin, viewRatio } from '../features/video/internal-utils.js';

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

test('viewRatio', () => {
  // Mock element and window/document
  global.window = { innerWidth: 1000, innerHeight: 800 };
  global.document = { documentElement: { clientWidth: 1000, clientHeight: 800 } };
  const el = {
    getBoundingClientRect: () => ({
      top: 100, left: 100, right: 300, bottom: 300, width: 200, height: 200
    })
  };
  // Fully in viewport, no margin
  assert.equal(viewRatio(el, '0px'), 1);
  // Partially in viewport
  const el2 = {
    getBoundingClientRect: () => ({
      top: 700, left: 900, right: 1100, bottom: 900, width: 200, height: 200
    })
  };
  assert(viewRatio(el2, '0px') < 1 && viewRatio(el2, '0px') > 0);
  // Completely out of viewport
  const el3 = {
    getBoundingClientRect: () => ({
      top: 900, left: 1100, right: 1300, bottom: 1100, width: 200, height: 200
    })
  };
  assert.equal(viewRatio(el3, '0px'), 0);
  // Margin expands viewport
  const el4 = {
    getBoundingClientRect: () => ({
      top: 810, left: 1000, right: 1200, bottom: 1010, width: 200, height: 200
    })
  };
  assert(viewRatio(el4, '300px') > 0);
});