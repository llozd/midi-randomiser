import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

let store = {};

globalThis.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => {
    store[key] = String(value);
  },
};

const { getOverrides, getTheme, parameterKey, setOverrides, setTheme } =
  await import("../js/storage.js");

const KEY = "midi-randomiser.overrides";
const narrowed = { enabled: false, min: 20, max: 90 };

beforeEach(() => {
  store = {};
});

test("a key identifies a parameter by type, number and name", () => {
  assert.equal(
    parameterKey({ type: "cc", number: 74, name: "Cutoff" }),
    "cc:74:Cutoff",
  );
});

test("parameters sharing a number are told apart by name", () => {
  const one = parameterKey({ type: "cc", number: 8, name: "Track 1 level" });
  const two = parameterKey({ type: "cc", number: 8, name: "Track 2 level" });

  assert.notEqual(one, two);
});

test("overrides round-trip for a device", () => {
  setOverrides("korg-volca-fm.json", { "cc:74:Cutoff": narrowed });

  assert.deepEqual(getOverrides("korg-volca-fm.json"), {
    "cc:74:Cutoff": narrowed,
  });
});

test("devices keep their own overrides", () => {
  setOverrides("a.json", { "cc:1:A": narrowed });
  setOverrides("b.json", { "cc:2:B": narrowed });

  assert.deepEqual(Object.keys(getOverrides("a.json")), ["cc:1:A"]);
  assert.deepEqual(Object.keys(getOverrides("b.json")), ["cc:2:B"]);
});

test("a device with nothing overridden is dropped from storage", () => {
  setOverrides("a.json", { "cc:1:A": narrowed });
  setOverrides("a.json", {});

  assert.deepEqual(getOverrides("a.json"), {});
  assert.equal(store[KEY], "{}");
});

test("an unknown device has no overrides", () => {
  assert.deepEqual(getOverrides("never-seen.json"), {});
});

test("corrupt storage is ignored rather than thrown", () => {
  store[KEY] = "not json {";

  assert.deepEqual(getOverrides("a.json"), {});
});

test("storage holding the wrong shape is ignored", () => {
  store[KEY] = '"a string"';
  assert.deepEqual(getOverrides("a.json"), {});

  store[KEY] = '{"a.json": 42}';
  assert.deepEqual(getOverrides("a.json"), {});
});

test("writing over corrupt storage recovers", () => {
  store[KEY] = "not json {";
  setOverrides("a.json", { "cc:1:A": narrowed });

  assert.deepEqual(getOverrides("a.json"), { "cc:1:A": narrowed });
});

test("no stored theme leaves the system preference in charge", () => {
  assert.equal(getTheme(), null);
});

test("a chosen theme round-trips", () => {
  setTheme("light");
  assert.equal(getTheme(), "light");

  setTheme("dark");
  assert.equal(getTheme(), "dark");
});

test("a nonsense stored theme is ignored", () => {
  store["midi-randomiser.theme"] = "chartreuse";
  assert.equal(getTheme(), null);
});
