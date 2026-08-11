import assert from "node:assert/strict";
import { test } from "node:test";

import { cc14Messages, ccMessage, nrpnMessages } from "../js/messages.js";

test("cc message uses the channel nibble", () => {
  assert.deepEqual(ccMessage(1, 74, 64), [0xb0, 74, 64]);
  assert.deepEqual(ccMessage(3, 74, 64), [0xb2, 74, 64]);
  assert.deepEqual(ccMessage(16, 74, 64), [0xbf, 74, 64]);
});

test("cc value is clamped to 0-127", () => {
  assert.equal(ccMessage(1, 74, 200)[2], 127);
  assert.equal(ccMessage(1, 74, -5)[2], 0);
});

test("cc14 splits the value across its two cc numbers", () => {
  const [coarse, fine] = cc14Messages(1, 7, 39, 12063);

  assert.deepEqual(coarse, [0xb0, 7, 94]);
  assert.deepEqual(fine, [0xb0, 39, 31]);
  // The two 7-bit halves must reconstruct the original value.
  assert.equal((coarse[2] << 7) | fine[2], 12063);
});

test("cc14 sends exactly two messages, both on the channel", () => {
  const messages = cc14Messages(3, 1, 33, 500);

  assert.equal(messages.length, 2);
  for (const message of messages) {
    assert.equal(message[0], 0xb2);
  }
});

test("cc14 value is clamped to 14 bits", () => {
  const [coarse, fine] = cc14Messages(1, 7, 39, 99999);

  assert.equal((coarse[2] << 7) | fine[2], 16383);
});

test("nrpn splits the parameter number across cc 99 and 98", () => {
  const [msb, lsb] = nrpnMessages(1, 1024, 0);

  assert.deepEqual(msb, [0xb0, 99, 8]);
  assert.deepEqual(lsb, [0xb0, 98, 0]);
});

test("nrpn splits the value across cc 6 and 38", () => {
  const messages = nrpnMessages(1, 0, 12063);
  const [, , dataMsb, dataLsb] = messages;

  assert.deepEqual(dataMsb, [0xb0, 6, 94]);
  assert.deepEqual(dataLsb, [0xb0, 38, 31]);
  // The two 7-bit halves must reconstruct the original value.
  assert.equal((dataMsb[2] << 7) | dataLsb[2], 12063);
});

test("nrpn nulls the parameter number afterwards", () => {
  const messages = nrpnMessages(1, 1024, 100);

  assert.equal(messages.length, 6);
  assert.deepEqual(messages[4], [0xb0, 101, 127]);
  assert.deepEqual(messages[5], [0xb0, 100, 127]);
});

test("nrpn value is clamped to 14 bits", () => {
  const [, , dataMsb, dataLsb] = nrpnMessages(1, 0, 99999);

  assert.equal((dataMsb[2] << 7) | dataLsb[2], 16383);
});

test("nrpn carries the channel on every message", () => {
  for (const message of nrpnMessages(3, 1024, 100)) {
    assert.equal(message[0], 0xb2);
  }
});
