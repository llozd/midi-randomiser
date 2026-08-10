import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isUsable,
  parseCsv,
  readRows,
  slug,
  toDevice,
  toParameter,
} from "../scripts/import-devices.mjs";

const HEADER =
  "manufacturer,device,section,parameter_name,parameter_description," +
  "cc_msb,cc_lsb,cc_min_value,cc_max_value,cc_default_value," +
  "nrpn_msb,nrpn_lsb,nrpn_min_value,nrpn_max_value,nrpn_default_value," +
  "orientation,notes,usage";

/** A CSV of one device, from partial column values. */
const csv = (...rows) =>
  [
    HEADER,
    ...rows.map((values) => {
      const cells = new Array(18).fill("");
      cells[0] = values.manufacturer ?? "Acme";
      cells[1] = values.device ?? "Widget";
      cells[3] = values.parameter_name ?? "";
      cells[5] = values.cc_msb ?? "";
      cells[6] = values.cc_lsb ?? "";
      cells[7] = values.cc_min_value ?? "";
      cells[8] = values.cc_max_value ?? "";
      cells[10] = values.nrpn_msb ?? "";
      cells[11] = values.nrpn_lsb ?? "";
      cells[12] = values.nrpn_min_value ?? "";
      cells[13] = values.nrpn_max_value ?? "";
      return cells.join(",");
    }),
  ].join("\n");

test("quoted fields keep their commas", () => {
  assert.deepEqual(parseCsv('a,"b,c",d'), [["a", "b,c", "d"]]);
});

test("doubled quotes are one literal quote", () => {
  assert.deepEqual(parseCsv('a,"say ""hi""",c'), [["a", 'say "hi"', "c"]]);
});

test("a newline inside a quoted field does not end the row", () => {
  assert.deepEqual(parseCsv('a,"one\ntwo",c\nd,e,f'), [
    ["a", "one\ntwo", "c"],
    ["d", "e", "f"],
  ]);
});

test("carriage returns are dropped", () => {
  assert.deepEqual(parseCsv("a,b\r\nc,d"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("a byte order mark does not corrupt the first heading", () => {
  const [row] = readRows("﻿manufacturer,device\nKorg,Volca");
  assert.equal(row.manufacturer, "Korg");
});

test("a cc row becomes a cc parameter", () => {
  assert.deepEqual(
    toParameter({
      parameter_name: "Cutoff",
      cc_msb: "74",
      cc_min_value: "0",
      cc_max_value: "127",
    }),
    {
      name: "Cutoff",
      type: "cc",
      number: 74,
      min: 0,
      max: 127,
      enabled: true,
    },
  );
});

test("a blank cc range defaults to the full 0-127", () => {
  const parameter = toParameter({ parameter_name: "X", cc_msb: "5" });

  assert.equal(parameter.min, 0);
  assert.equal(parameter.max, 127);
});

test("a cc range above 127 is scaled down to the msb it sends", () => {
  const parameter = toParameter({
    parameter_name: "Wide",
    cc_msb: "1",
    cc_lsb: "33",
    cc_min_value: "0",
    cc_max_value: "16383",
  });

  assert.equal(parameter.max, 127);
});

test("a cc_lsb row already describing 0-127 is left alone", () => {
  const parameter = toParameter({
    parameter_name: "Coarse",
    cc_msb: "1",
    cc_lsb: "33",
    cc_min_value: "0",
    cc_max_value: "127",
  });

  assert.equal(parameter.max, 127);
});

test("an nrpn row folds msb and lsb into one 14-bit number", () => {
  const parameter = toParameter({
    parameter_name: "Pan",
    nrpn_msb: "1",
    nrpn_lsb: "3",
    nrpn_max_value: "16383",
  });

  assert.equal(parameter.type, "nrpn");
  assert.equal(parameter.number, 1 * 128 + 3);
  assert.equal(parameter.max, 16383);
});

test("a row with both cc and nrpn takes the cc", () => {
  const parameter = toParameter({
    parameter_name: "Pan",
    cc_msb: "66",
    nrpn_msb: "1",
    nrpn_lsb: "3",
  });

  assert.equal(parameter.type, "cc");
  assert.equal(parameter.number, 66);
});

test("a row with neither cc nor nrpn is not a parameter", () => {
  assert.equal(toParameter({ parameter_name: "Nothing" }), false);
});

test("an unnamed parameter falls back to its number", () => {
  assert.equal(toParameter({ cc_msb: "7" }).name, "CC 7");
  assert.equal(toParameter({ nrpn_msb: "1", nrpn_lsb: "0" }).name, "NRPN 128");
});

test("parameters outside the schema's range are not usable", () => {
  assert.equal(isUsable({ type: "cc", number: 74, min: 0, max: 127 }), true);
  assert.equal(isUsable({ type: "cc", number: 74, min: 0, max: 200 }), false);
  assert.equal(isUsable({ type: "cc", number: 74, min: 100, max: 10 }), false);
  assert.equal(
    isUsable({ type: "nrpn", number: 1024, min: 0, max: 16383 }),
    true,
  );
});

test("filenames are kebab-cased", () => {
  assert.equal(slug("Expert Sleepers"), "expert-sleepers");
  assert.equal(slug("CZ-1 MINI"), "cz-1-mini");
  assert.equal(slug("Jupiter-X (Jupiter-Xm)"), "jupiter-x-jupiter-xm");
});

test("a csv becomes a device carrying its name and manufacturer", () => {
  const { device } = toDevice(
    csv(
      {
        manufacturer: "Korg",
        device: "Volca FM",
        parameter_name: "A",
        cc_msb: "40",
      },
      {
        manufacturer: "Korg",
        device: "Volca FM",
        parameter_name: "B",
        cc_msb: "41",
      },
    ),
  );

  assert.equal(device.name, "Volca FM");
  assert.equal(device.manufacturer, "Korg");
  assert.equal(device.schemaVersion, 1);
  assert.deepEqual(
    device.parameters.map((p) => p.number),
    [40, 41],
  );
});

test("every generated parameter starts enabled", () => {
  const { device } = toDevice(csv({ parameter_name: "A", cc_msb: "1" }));
  assert.equal(device.parameters[0].enabled, true);
});

test("unrepresentable rows are dropped and counted", () => {
  const { device, dropped } = toDevice(
    csv(
      { parameter_name: "Good", cc_msb: "1" },
      {
        parameter_name: "Backwards",
        cc_msb: "2",
        cc_min_value: "100",
        cc_max_value: "10",
      },
    ),
  );

  assert.equal(device.parameters.length, 1);
  assert.equal(dropped, 1);
});

test("a device with no usable parameters is skipped", () => {
  const { device } = toDevice(csv({ parameter_name: "Nothing" }));
  assert.equal(device, null);
});

test("an empty csv is skipped", () => {
  assert.deepEqual(toDevice(""), { device: null, dropped: 0 });
});
