import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT = fileURLToPath(
  new URL("../scripts/generate-manifest.mjs", import.meta.url),
);

const device = (name, manufacturer) =>
  JSON.stringify({ name, manufacturer, schemaVersion: 1, parameters: [] });

const DEVICE = device("X", "Y");

/** Builds a temp repo containing just a devices/ directory. */
async function fixture(files) {
  const dir = await mkdtemp(join(tmpdir(), "midi-randomiser-manifest-"));
  await mkdir(join(dir, "devices"));

  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(dir, "devices", name), contents);
  }

  return dir;
}

async function generate(dir) {
  await run("node", [SCRIPT], { cwd: dir });
  return JSON.parse(await readFile(join(dir, "devices", "index.json"), "utf8"));
}

test("entries are sorted by manufacturer, then by model", async () => {
  const dir = await fixture({
    "c.json": device("Volca FM", "Korg"),
    "a.json": device("S-1", "Roland"),
    "b.json": device("Electribe", "Korg"),
  });

  assert.deepEqual(await generate(dir), [
    { file: "b.json", name: "Electribe", manufacturer: "Korg" },
    { file: "c.json", name: "Volca FM", manufacturer: "Korg" },
    { file: "a.json", name: "S-1", manufacturer: "Roland" },
  ]);
});

test("each entry carries the device name and manufacturer", async () => {
  const dir = await fixture({
    "korg-volca-fm.json": device("Volca FM", "Korg"),
  });

  assert.deepEqual(await generate(dir), [
    { file: "korg-volca-fm.json", name: "Volca FM", manufacturer: "Korg" },
  ]);
});

test("schema.json and an existing index.json are excluded", async () => {
  const dir = await fixture({
    "schema.json": "{}",
    "index.json": '["stale.json"]',
    "korg-volca-fm.json": DEVICE,
  });

  assert.deepEqual(await generate(dir), [
    { file: "korg-volca-fm.json", name: "X", manufacturer: "Y" },
  ]);
});

test("non-json files are ignored", async () => {
  const dir = await fixture({
    "notes.md": "# not a device",
    "korg-volca-fm.json": DEVICE,
  });

  assert.deepEqual(await generate(dir), [
    { file: "korg-volca-fm.json", name: "X", manufacturer: "Y" },
  ]);
});

test("an empty devices directory produces an empty manifest", async () => {
  assert.deepEqual(await generate(await fixture({})), []);
});

test("output is prettier-formatted, so lint stays happy", async () => {
  const dir = await fixture({ "a.json": device("A", "Maker") });
  await run("node", [SCRIPT], { cwd: dir });

  const written = await readFile(join(dir, "devices", "index.json"), "utf8");
  assert.equal(
    written,
    '[{ "file": "a.json", "name": "A", "manufacturer": "Maker" }]\n',
  );
});
