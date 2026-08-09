import assert from "node:assert/strict";
import { test } from "node:test";

import { loadDevice, loadDeviceIndex } from "../js/devices.js";

const volcaFm = { name: "Volca FM", manufacturer: "Korg", parameters: [] };
const entry = {
  file: "korg-volca-fm.json",
  name: "Volca FM",
  manufacturer: "Korg",
};

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

test("the index is read from the manifest alone", async () => {
  const requested = stubFetch({ "devices/index.json": [entry] });

  assert.deepEqual(await loadDeviceIndex(), [entry]);
  assert.deepEqual(requested, ["devices/index.json"]);
});

test("an empty manifest gives an empty index", async () => {
  stubFetch({ "devices/index.json": [] });
  assert.deepEqual(await loadDeviceIndex(), []);
});

test("a missing manifest rejects", async () => {
  stubFetch({});

  await assert.rejects(loadDeviceIndex(), /devices\/index\.json returned 404/);
});

test("a device is fetched by filename", async () => {
  const requested = stubFetch({ "devices/korg-volca-fm.json": volcaFm });

  assert.deepEqual(await loadDevice("korg-volca-fm.json"), volcaFm);
  assert.deepEqual(requested, ["devices/korg-volca-fm.json"]);
});

test("a missing device rejects", async () => {
  stubFetch({});

  await assert.rejects(
    loadDevice("gone.json"),
    /devices\/gone\.json returned 404/,
  );
});
