/**
 * Turns a diff of the MIDI Guide dataset into a release.
 *
 * Reads `git diff --name-status` on stdin, bumps the version in package.json,
 * adds a CHANGELOG.md entry, and writes the release notes to the path given as
 * the first argument. Run by .github/workflows/sync-devices.yml.
 *
 * Adding a device is a minor bump; editing or removing one is a patch.
 */

import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REPO = "https://github.com/llozd/midi-randomiser";
const NAMED_LIMIT = 10;

/** "Roland/S-1.csv" is the Roland S-1. Renames report their new path. */
export function deviceName(path) {
  return path
    .replace(/\.csv$/, "")
    .split("/")
    .join(" ");
}

/** Groups `git diff --name-status` output by what happened to each device. */
export function readChanges(diff) {
  const changes = { added: [], changed: [], removed: [] };

  for (const line of diff.split("\n")) {
    const [status, ...paths] = line.split("\t");
    const path = paths.at(-1);

    if (!path || !path.endsWith(".csv") || path.endsWith(".triggers.csv")) {
      continue;
    }

    // Renames arrive as R<similarity>, and count as an added device.
    if (status.startsWith("R") || status === "A") {
      changes.added.push(deviceName(path));
    } else if (status === "M") {
      changes.changed.push(deviceName(path));
    } else if (status === "D") {
      changes.removed.push(deviceName(path));
    }
  }

  for (const list of Object.values(changes)) {
    list.sort();
  }

  return changes;
}

export const isEmpty = ({ added, changed, removed }) =>
  added.length + changed.length + removed.length === 0;

/** A new device earns a minor bump. Edits and removals are a patch. */
export function nextVersion(current, changes) {
  const [major, minor, patch] = current.split(".").map(Number);

  return changes.added.length > 0
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;
}

/** Long lists are capped, since a big sync can touch hundreds of devices. */
function section(heading, devices, limit) {
  if (devices.length === 0) {
    return [];
  }

  const named = devices.slice(0, limit);
  const rest = devices.length - named.length;
  const lines = named.map((device) => `- ${device}`);

  if (rest > 0) {
    lines.push(`- and ${rest} other${rest === 1 ? "" : "s"}`);
  }

  return [`### ${heading}`, "", ...lines, ""];
}

export function entryBody(changes, limit = NAMED_LIMIT) {
  return [
    ...section("Added", changes.added, limit),
    ...section("Changed", changes.changed, limit),
    ...section("Removed", changes.removed, limit),
  ].join("\n");
}

export function changelogEntry(version, date, changes, limit = NAMED_LIMIT) {
  return `## [${version}] - ${date}\n\n${entryBody(changes, limit)}`;
}

/** Inserts the entry under Unreleased and repoints the compare links. */
export function updateChangelog(changelog, version, previous, entry) {
  return changelog
    .replace("## [Unreleased]\n", `## [Unreleased]\n\n${entry.trimEnd()}\n`)
    .replace(
      `[Unreleased]: ${REPO}/compare/v${previous}...HEAD`,
      `[Unreleased]: ${REPO}/compare/v${version}...HEAD\n` +
        `[${version}]: ${REPO}/compare/v${previous}...v${version}`,
    );
}

async function main(notesPath, diff) {
  const changes = readChanges(diff);

  if (isEmpty(changes)) {
    console.log("No device changes, nothing to release.");
    return;
  }

  const packagePath = "package.json";
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  const previous = manifest.version;
  const version = nextVersion(previous, changes);
  const date = new Date().toISOString().slice(0, 10);

  manifest.version = version;
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);

  const changelog = await readFile("CHANGELOG.md", "utf8");
  const entry = changelogEntry(version, date, changes);
  await writeFile(
    "CHANGELOG.md",
    updateChangelog(changelog, version, previous, entry),
  );

  // The release notes name every device, where the changelog caps the lists.
  await writeFile(notesPath, entryBody(changes, Infinity));

  console.log(version);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv[2], readFileSync(0, "utf8"));
}
