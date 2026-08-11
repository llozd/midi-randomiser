import assert from "node:assert/strict";
import { test } from "node:test";

import {
  changelogEntry,
  deviceName,
  entryBody,
  isEmpty,
  nextVersion,
  readChanges,
  updateChangelog,
} from "../scripts/release.mjs";

const diff = [
  "A\tRoland/S-1.csv",
  "M\tKORG/volca fm.csv",
  "D\tMoog/Sirin.csv",
  "R097\tElektron/Old.csv\tElektron/Digitakt II.csv",
].join("\n");

test("a csv path names the device", () => {
  assert.equal(deviceName("Roland/S-1.csv"), "Roland S-1");
  assert.equal(deviceName("KORG/volca fm.csv"), "KORG volca fm");
});

test("changes are grouped by what happened", () => {
  assert.deepEqual(readChanges(diff), {
    added: ["Elektron Digitakt II", "Roland S-1"],
    changed: ["KORG volca fm"],
    removed: ["Moog Sirin"],
  });
});

test("trigger files and non-csv paths are ignored", () => {
  const changes = readChanges(
    ["A\tKORG/drumlogue.triggers.csv", "M\tREADME.md", "A\tRoland/S-1.csv"].join(
      "\n",
    ),
  );

  assert.deepEqual(changes.added, ["Roland S-1"]);
  assert.equal(changes.changed.length, 0);
});

test("an empty diff changes nothing", () => {
  assert.equal(isEmpty(readChanges("")), true);
  assert.equal(isEmpty(readChanges(diff)), false);
});

test("a new device is a minor bump", () => {
  assert.equal(nextVersion("1.0.0", readChanges("A\tRoland/S-1.csv")), "1.1.0");
  assert.equal(nextVersion("1.4.2", readChanges("A\tRoland/S-1.csv")), "1.5.0");
});

test("edits and removals are a patch bump", () => {
  assert.equal(nextVersion("1.2.3", readChanges("M\tRoland/S-1.csv")), "1.2.4");
  assert.equal(nextVersion("1.2.3", readChanges("D\tRoland/S-1.csv")), "1.2.4");
});

test("the entry lists devices under their own headings", () => {
  const body = entryBody(readChanges(diff));

  assert.match(body, /### Added\n\n- Elektron Digitakt II\n- Roland S-1/);
  assert.match(body, /### Changed\n\n- KORG volca fm/);
  assert.match(body, /### Removed\n\n- Moog Sirin/);
});

test("headings with nothing under them are left out", () => {
  const body = entryBody(readChanges("M\tRoland/S-1.csv"));

  assert.doesNotMatch(body, /### Added/);
  assert.match(body, /### Changed/);
});

test("long lists are capped with a count of the rest", () => {
  const many = Array.from(
    { length: 14 },
    (_, i) => `A\tMaker/Device ${String(i).padStart(2, "0")}.csv`,
  ).join("\n");

  const body = entryBody(readChanges(many), 10);

  assert.equal(body.match(/^- /gm).length, 11);
  assert.match(body, /- and 4 others/);
});

test("one device over the cap reads in the singular", () => {
  const many = Array.from(
    { length: 11 },
    (_, i) => `A\tMaker/Device ${String(i).padStart(2, "0")}.csv`,
  ).join("\n");

  assert.match(entryBody(readChanges(many), 10), /- and 1 other$/m);
});

test("the entry carries the version and date", () => {
  const entry = changelogEntry("1.1.0", "2026-08-11", readChanges(diff));

  assert.match(entry, /^## \[1\.1\.0\] - 2026-08-11/);
});

const CHANGELOG = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-08-11

### Added

- Everything.

[Unreleased]: https://github.com/llozd/midi-randomiser/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/llozd/midi-randomiser/compare/v0.1.0...v1.0.0
`;

test("the entry is inserted under Unreleased", () => {
  const entry = changelogEntry("1.1.0", "2026-08-11", readChanges(diff));
  const updated = updateChangelog(CHANGELOG, "1.1.0", "1.0.0", entry);

  assert.match(updated, /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-08-11/);
  // The previous release survives below the new one.
  assert.match(updated, /## \[1\.1\.0\][\s\S]*## \[1\.0\.0\]/);
});

test("the compare links are repointed at the new version", () => {
  const entry = changelogEntry("1.1.0", "2026-08-11", readChanges(diff));
  const updated = updateChangelog(CHANGELOG, "1.1.0", "1.0.0", entry);

  assert.match(updated, /\[Unreleased\]: \S+\/compare\/v1\.1\.0\.\.\.HEAD/);
  assert.match(updated, /\[1\.1\.0\]: \S+\/compare\/v1\.0\.0\.\.\.v1\.1\.0/);
  assert.match(updated, /\[1\.0\.0\]: \S+\/compare\/v0\.1\.0\.\.\.v1\.0\.0/);
});
