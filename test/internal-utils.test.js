// ESM via package type; unified .js extension
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseThresholdInput, parseRootMargin } from "../features/video/internal/internal-utils.js";

test("parseThresholdInput", () => {
  assert.equal(parseThresholdInput(""), 0);
  assert.equal(parseThresholdInput("any"), 0);
  assert.equal(parseThresholdInput("half"), 0.5);
  assert.equal(parseThresholdInput("full"), 1);
  assert.equal(parseThresholdInput("0.7"), 0.7);
  assert.equal(parseThresholdInput("2"), 1);
  assert.equal(parseThresholdInput("-1"), 0);
  assert.equal(parseThresholdInput("not-a-number"), 0);
});

test("parseRootMargin", () => {
  assert.equal(parseRootMargin(""), "300px 0px");
  assert.equal(parseRootMargin("10px 20px"), "10px 20px");
  assert.equal(parseRootMargin(undefined), "300px 0px");
  // Test that parseRootMargin handles various inputs
  assert.equal(parseRootMargin(""), "300px 0px"); // default
  assert.equal(parseRootMargin("10px"), "10px"); // single value
  assert.equal(parseRootMargin("10px 20px"), "10px 20px"); // two values
  assert.equal(parseRootMargin("10px 20px 30px 40px"), "10px 20px 30px 40px"); // four values
  assert.equal(parseRootMargin(undefined), "300px 0px"); // undefined
  assert.equal(parseRootMargin("invalid string"), "invalid string"); // pass through as-is for now
});
