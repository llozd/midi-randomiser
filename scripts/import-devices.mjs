/**
 * Converts the MIDI Guide CSV dataset into the device JSON the app loads.
 *
 * Source: https://github.com/pencilresearch/midi (CC BY-SA 4.0). One CSV per
 * device becomes one JSON file in devices/generated/, plus the index the app
 * discovers them through. Nothing here is committed - it is rebuilt on every
 * deploy, and locally with `npm run devices`.
 *
 * Pass a path to an existing clone to convert that instead of fetching one.
 */

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { format } from "prettier";

const run = promisify(execFile);

const UPSTREAM = "https://github.com/pencilresearch/midi.git";
const CLONE_DIR = ".midi-guide";
const OUT_DIR = join("devices", "generated");

const CC_MAX = 127;
const NRPN_MAX = 16383;

/**
 * Minimal RFC 4180 reader. The dataset has quoted fields containing commas,
 * escaped quotes and, in one file, newlines, so it can't be split on lines.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Reads a CSV into objects keyed by its header row. */
export function readRows(text) {
  // Some files carry a byte order mark, which would corrupt the first heading.
  const [header, ...rest] = parseCsv(text.replace(/^\uFEFF/, ""));

  if (!header) {
    return [];
  }

  return rest.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name, (cells[i] ?? "").trim()])),
  );
}

const integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * One row becomes at most one parameter. Rows documenting both a CC and an
 * NRPN take the CC: it is a single message rather than a four-message
 * sequence, and any device listing both accepts both.
 *
 * cc_lsb is ignored, so 14-bit CCs are imported as their 7-bit MSB. The app's
 * schema has no way to express a CC pair.
 */
export function toParameter(row) {
  const label = row.parameter_name;

  if (row.cc_msb) {
    const number = integer(row.cc_msb, null);

    if (number === null) {
      return false;
    }

    const min = integer(row.cc_min_value, 0);
    const max = integer(row.cc_max_value, CC_MAX);

    // A CC value can't exceed 127, so a wider range must describe a 14-bit
    // pair. Only the MSB is sent, so that range scales down with it. Rows
    // that pair a cc_lsb with a 0-127 range already describe the MSB.
    const scale = max > CC_MAX ? 128 : 1;

    return {
      name: label || `CC ${number}`,
      type: "cc",
      number,
      min: Math.floor(min / scale),
      max: Math.floor(max / scale),
      enabled: true,
    };
  }

  if (row.nrpn_msb) {
    const msb = integer(row.nrpn_msb, null);

    if (msb === null) {
      return false;
    }

    const number = msb * 128 + integer(row.nrpn_lsb, 0);

    return {
      name: label || `NRPN ${number}`,
      type: "nrpn",
      number,
      min: integer(row.nrpn_min_value, 0),
      max: integer(row.nrpn_max_value, NRPN_MAX),
      enabled: true,
    };
  }

  return false;
}

/** True when a parameter is expressible in devices/schema.json. */
export function isUsable({ type, number, min, max }) {
  const ceiling = type === "cc" ? CC_MAX : NRPN_MAX;

  return (
    number >= 0 &&
    number <= ceiling &&
    min >= 0 &&
    max <= ceiling &&
    min <= max
  );
}

export const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Converts one CSV's text into a device, or null if nothing survives. Returns
 * the count of rows dropped as unrepresentable so the run can report them.
 */
export function toDevice(text) {
  const rows = readRows(text);

  if (rows.length === 0) {
    return { device: null, dropped: 0 };
  }

  const candidates = rows.map(toParameter).filter(Boolean);
  const parameters = candidates.filter(isUsable);
  const dropped = candidates.length - parameters.length;

  if (parameters.length === 0) {
    return { device: null, dropped };
  }

  const { manufacturer, device } = rows[0];

  return {
    device: { name: device, manufacturer, schemaVersion: 1, parameters },
    dropped,
  };
}

async function cloneUpstream() {
  await rm(CLONE_DIR, { recursive: true, force: true });
  console.log(`Cloning ${UPSTREAM}...`);
  await run("git", ["clone", "--depth", "1", "--quiet", UPSTREAM, CLONE_DIR]);
  return CLONE_DIR;
}

/** Every device CSV in the dataset. Note triggers are not CC data. */
async function deviceFiles(source) {
  const found = [];

  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const files = await readdir(join(source, entry.name));

    for (const file of files) {
      if (file.endsWith(".csv") && !file.endsWith(".triggers.csv")) {
        found.push(join(source, entry.name, file));
      }
    }
  }

  return found.sort();
}

const writeJson = async (path, value) =>
  writeFile(path, await format(JSON.stringify(value), { parser: "json" }));

const source = process.argv[2] ?? (await cloneUpstream());

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const index = [];
let skippedDevices = 0;
let droppedParameters = 0;

for (const path of await deviceFiles(source)) {
  const { device, dropped } = toDevice(await readFile(path, "utf8"));
  droppedParameters += dropped;

  if (!device) {
    console.warn(`No usable parameters in ${path}`);
    skippedDevices += 1;
    continue;
  }

  const file = `${slug(device.manufacturer)}-${slug(device.name)}.json`;

  await writeJson(join(OUT_DIR, file), device);
  index.push({ file, name: device.name, manufacturer: device.manufacturer });
}

// Sorted the way the picker reads it: manufacturer first, then model.
index.sort(
  (a, b) =>
    a.manufacturer.localeCompare(b.manufacturer) || a.name.localeCompare(b.name),
);

await writeJson(join(OUT_DIR, "index.json"), index);

console.log(
  [
    `Wrote ${index.length} device(s) to ${OUT_DIR}.`,
    skippedDevices > 0 && `Skipped ${skippedDevices} device(s).`,
    droppedParameters > 0 &&
      `Dropped ${droppedParameters} parameter(s) the schema can't express.`,
  ]
    .filter(Boolean)
    .join(" "),
);
