/**
 * Rebuilds devices/index.json from the files in devices/. Static hosts can't
 * list a directory, so the app discovers devices through this manifest.
 *
 * Each entry carries the device's name and manufacturer as well as its
 * filename, so the picker can be built without fetching every device file.
 *
 * Run `npm run manifest` after adding or removing a device file. `npm run lint`
 * fails if the manifest and the directory disagree.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";

const DEVICES_DIR = "devices";
const MANIFEST = join(DEVICES_DIR, "index.json");
const NOT_DEVICES = new Set(["schema.json", "index.json"]);

const files = (await readdir(DEVICES_DIR)).filter(
  (file) => file.endsWith(".json") && !NOT_DEVICES.has(file),
);

const entries = await Promise.all(
  files.map(async (file) => {
    const device = JSON.parse(await readFile(join(DEVICES_DIR, file), "utf8"));
    return { file, name: device.name, manufacturer: device.manufacturer };
  }),
);

// Sorted the way the picker reads it: manufacturer first, then model.
entries.sort(
  (a, b) =>
    a.manufacturer.localeCompare(b.manufacturer) ||
    a.name.localeCompare(b.name),
);

// Formatted through prettier so the result matches what `npm run lint` expects.
await writeFile(
  MANIFEST,
  await format(JSON.stringify(entries), { parser: "json" }),
);

console.log(`Wrote ${MANIFEST} with ${entries.length} device file(s).`);
