// Converts the MIDI Guide dataset (CC BY-SA 4.0) into the app's device JSON.

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { format } from "prettier";

const run = promisify(execFile);

const UPSTREAM = "https://github.com/pencilresearch/midi.git";
const CLONE_DIR = ".midi-guide";
const OUT_DIR = join("devices", "generated");

const CC_MAX = 127;
const NRPN_MAX = 16383;

/** Minimal RFC 4180 reader: quoted commas, quotes, embedded newlines. */
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
    Object.fromEntries(
      header.map((name, i) => [name, (cells[i] ?? "").trim()]),
    ),
  );
}

const integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/** One row becomes at most one parameter, preferring the CC over the NRPN. */
export function toParameter(row) {
  const label = row.parameter_name;

  if (row.cc_msb) {
    const number = integer(row.cc_msb, null);

    if (number === null) {
      return false;
    }

    // A cc_lsb pairs two CC numbers into one 14-bit value.
    const lsbNumber = row.cc_lsb ? integer(row.cc_lsb, null) : null;

    if (lsbNumber !== null) {
      return {
        name: label || `CC ${number}`,
        type: "cc14",
        number,
        lsbNumber,
        min: integer(row.cc_min_value, 0),
        max: integer(row.cc_max_value, NRPN_MAX),
        enabled: true,
      };
    }

    return {
      name: label || `CC ${number}`,
      type: "cc",
      number,
      min: integer(row.cc_min_value, 0),
      max: integer(row.cc_max_value, CC_MAX),
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
export function isUsable({ type, number, lsbNumber, min, max }) {
  const numberCeiling = type === "nrpn" ? NRPN_MAX : CC_MAX;
  const valueCeiling = type === "cc" ? CC_MAX : NRPN_MAX;

  if (type === "cc14" && !(lsbNumber >= 0 && lsbNumber <= CC_MAX)) {
    return false;
  }

  return (
    number >= 0 &&
    number <= numberCeiling &&
    min >= 0 &&
    max <= valueCeiling &&
    min <= max
  );
}

export const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Converts one CSV into a device, with counts of what it couldn't import. */
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

async function main(source) {
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
      a.manufacturer.localeCompare(b.manufacturer) ||
      a.name.localeCompare(b.name),
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
}

// Only convert when run as a command. The tests import the functions above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv[2] ?? (await cloneUpstream()));
}
