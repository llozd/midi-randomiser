import assert from "node:assert/strict";
import { test } from "node:test";

import { loadShippedDevices } from "../js/devices.js";

const volcaFm = { name: "Volca FM", manufacturer: "Korg", parameters: [] };

/** Serves the given path -> body map, 404s anything else. */
function stubFetch(bodies) {
  const requested = [];

  globalThis.fetch = (path) => {
    requested.push(path);

    return Promise.resolve(
      path in bodies
        ? { ok: true, status: 200, json: () => Promise.resolve(bodies[path]) }
        : { ok: false, status: 404, json: () => Promise.reject(new Error()) },
    );
  };

  return requested;
}

test("devices are loaded from the paths listed in the manifest", async () => {
  const requested = stubFetch({
    "devices/index.json": ["korg-volca-fm.json"],
    "devices/korg-volca-fm.json": volcaFm,
  });

  const devices = await loadShippedDevices();

  assert.deepEqual(devices, [volcaFm]);
  assert.deepEqual(requested, [
    "devices/index.json",
    "devices/korg-volca-fm.json",
  ]);
});

test("an empty manifest loads nothing", async () => {
  stubFetch({ "devices/index.json": [] });
  assert.deepEqual(await loadShippedDevices(), []);
});

test("a missing manifest rejects", async () => {
  stubFetch({});

  await assert.rejects(
    loadShippedDevices(),
    /devices\/index\.json returned 404/,
  );
});

test("a device listed but missing rejects", async () => {
  stubFetch({ "devices/index.json": ["gone.json"] });

  await assert.rejects(
    loadShippedDevices(),
    /devices\/gone\.json returned 404/,
  );
});
