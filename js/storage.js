/**
 * Remembers the changes you make to a device's parameters, so enabling a few
 * and narrowing their ranges survives a reload.
 *
 * Only parameters that differ from the device file are stored, keyed by what
 * identifies them rather than by position, so an upstream change that adds or
 * reorders parameters doesn't move everyone's settings onto the wrong rows.
 */

const KEY = "midi-randomiser.overrides";

/**
 * Type, number and name together. Number alone collides on devices that reuse
 * a CC per track, and adding the range would break the moment you edit it.
 */
export const parameterKey = ({ type, number, name }) =>
  `${type}:${number}:${name}`;

function readAll() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

export function getOverrides(file) {
  const stored = readAll()[file];
  return stored && typeof stored === "object" ? stored : {};
}

export function setOverrides(file, overrides) {
  const all = readAll();

  if (Object.keys(overrides).length === 0) {
    delete all[file];
  } else {
    all[file] = overrides;
  }

  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (error) {
    console.error(error);
  }
}
