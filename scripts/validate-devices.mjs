/**
 * Validates the generated device files against devices/schema.json, and checks
 * that the manifest and the directory agree. Run as part of `npm run lint`,
 * and in the build before anything is deployed.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";

const DEVICES_DIR = join("devices", "generated");
const SCHEMA = join("devices", "schema.json");
const NOT_DEVICES = new Set(["index.json"]);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const errors = [];

const schema = await readJson(SCHEMA);

let manifest;
let present;

try {
  manifest = await readJson(join(DEVICES_DIR, "index.json"));
  present = (await readdir(DEVICES_DIR)).filter(
    (file) => file.endsWith(".json") && !NOT_DEVICES.has(file),
  );
} catch {
  console.error(
    `No devices in ${DEVICES_DIR}. Run \`npm run devices\` to generate them.`,
  );
  process.exit(1);
}

const listed = manifest.map((entry) => entry.file);

for (const file of present) {
  if (!listed.includes(file)) {
    errors.push(`${file} is not listed in index.json`);
  }
}

for (const file of listed) {
  if (!present.includes(file)) {
    errors.push(`index.json lists ${file}, which does not exist`);
  }
}

const validate = new Ajv({ allErrors: true }).compile(schema);

for (const entry of manifest.filter((item) => present.includes(item.file))) {
  const { file } = entry;
  const device = await readJson(join(DEVICES_DIR, file));

  if (!validate(device)) {
    for (const error of validate.errors) {
      errors.push(`${file}: ${error.instancePath || "/"} ${error.message}`);
    }
    continue;
  }

  // The manifest duplicates these two fields so the picker can be built
  // without fetching every device, so they have to stay in step.
  if (
    entry.name !== device.name ||
    entry.manufacturer !== device.manufacturer
  ) {
    errors.push(`${file}: index.json name/manufacturer is out of date`);
  }

  // Ranges are checked here rather than in the schema, which can't compare two
  // sibling properties.
  for (const [index, parameter] of device.parameters.entries()) {
    if (parameter.min > parameter.max) {
      errors.push(
        `${file}: parameters[${index}] "${parameter.name}" has min ${parameter.min} above max ${parameter.max}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Device validation failed:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}

console.log(`Validated ${manifest.length} device file(s).`);
