import assert from "node:assert/strict";
import { test } from "node:test";

import { randomiseParameters } from "../js/randomiser.js";

const parameter = (overrides) => ({
  name: "Cutoff",
  type: "cc",
  number: 74,
  min: 0,
  max: 127,
  enabled: true,
  ...overrides,
});

test("only enabled parameters are randomised", () => {
  const picks = randomiseParameters([
    parameter({ name: "On" }),
    parameter({ name: "Off", enabled: false }),
  ]);

  assert.equal(picks.length, 1);
  assert.equal(picks[0].parameter.name, "On");
});

test("values stay within the parameter's range", () => {
  const parameters = [parameter({ min: 10, max: 20 })];

  // Random, so this is worth running many times rather than once.
  for (let i = 0; i < 500; i += 1) {
    const [{ value }] = randomiseParameters(parameters);
    assert.ok(value >= 10 && value <= 20, `${value} outside 10-20`);
  }
});

test("both bounds are reachable", () => {
  const parameters = [parameter({ min: 0, max: 1 })];
  const seen = new Set();

  for (let i = 0; i < 500; i += 1) {
    seen.add(randomiseParameters(parameters)[0].value);
  }

  assert.deepEqual([...seen].sort(), [0, 1]);
});

test("a max at or below min collapses to min", () => {
  assert.equal(
    randomiseParameters([parameter({ min: 5, max: 5 })])[0].value,
    5,
  );
  assert.equal(
    randomiseParameters([parameter({ min: 9, max: 2 })])[0].value,
    9,
  );
});

test("no enabled parameters yields nothing", () => {
  assert.deepEqual(randomiseParameters([parameter({ enabled: false })]), []);
  assert.deepEqual(randomiseParameters([]), []);
});
