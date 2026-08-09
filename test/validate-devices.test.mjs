import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT = fileURLToPath(
  new URL("../scripts/validate-devices.mjs", import.meta.url),
);
const SCHEMA = fileURLToPath(
  new URL("../devices/schema.json", import.meta.url),
);

const parameter = (overrides) => ({
  name: "Cutoff",
  type: "cc",
  number: 74,
  min: 0,
  max: 127,
  enabled: true,
  ...overrides,
});

const device = (parameters) => ({
  name: "Test",
  manufacturer: "Acme",
  schemaVersion: 1,
  parameters,
});

const entryFor = (file, device) => ({
  file,
  name: device.name,
  manufacturer: device.manufacturer,
});

/** Temp repo with the real schema, the given device files, and a manifest. */
async function fixture(devices, manifest) {
  const dir = await mkdtemp(join(tmpdir(), "midi-randomiser-validate-"));
  await mkdir(join(dir, "devices"));
  await copyFile(SCHEMA, join(dir, "devices", "schema.json"));

  for (const [name, contents] of Object.entries(devices)) {
    await writeFile(join(dir, "devices", name), JSON.stringify(contents));
  }

  const entries =
    manifest ??
    Object.entries(devices).map(([file, device]) => entryFor(file, device));

  await writeFile(join(dir, "devices", "index.json"), JSON.stringify(entries));
  return dir;
}

/** Resolves to null when validation passed, or the reported errors. */
async function validate(dir) {
  try {
    await run("node", [SCRIPT], { cwd: dir });
    return null;
  } catch (error) {
    return error.stderr;
  }
}

test("a valid device passes", async () => {
  const dir = await fixture({ "test.json": device([parameter()]) });
  assert.equal(await validate(dir), null);
});

test("a cc number above 127 fails", async () => {
  const dir = await fixture({
    "test.json": device([parameter({ number: 200 })]),
  });

  assert.match(await validate(dir), /number must be <= 127/);
});

test("an nrpn number above 127 is allowed", async () => {
  const dir = await fixture({
    "test.json": device([
      parameter({ type: "nrpn", number: 1024, max: 16383 }),
    ]),
  });

  assert.equal(await validate(dir), null);
});

test("min above max fails", async () => {
  const dir = await fixture({
    "test.json": device([parameter({ min: 100, max: 10 })]),
  });

  assert.match(await validate(dir), /min 100 above max 10/);
});

test("an unknown property fails", async () => {
  const dir = await fixture({
    "test.json": device([parameter({ colour: "red" })]),
  });

  assert.match(await validate(dir), /additional properties/i);
});

test("a device file missing from the manifest fails", async () => {
  const dir = await fixture({ "test.json": device([parameter()]) }, []);

  assert.match(await validate(dir), /test\.json is not listed in index\.json/);
});

test("a manifest entry with no file fails", async () => {
  const dir = await fixture({}, [
    { file: "gone.json", name: "Gone", manufacturer: "Acme" },
  ]);

  assert.match(await validate(dir), /lists gone\.json, which does not exist/);
});

test("a manifest whose name is out of date fails", async () => {
  const dir = await fixture({ "test.json": device([parameter()]) }, [
    { file: "test.json", name: "Stale", manufacturer: "Acme" },
  ]);

  assert.match(
    await validate(dir),
    /index\.json name\/manufacturer is out of date/,
  );
});
