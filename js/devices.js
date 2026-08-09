/**
 * Loads the devices shipped in the repo. Static hosts can't list a directory,
 * so the files are discovered through the devices/index.json manifest.
 *
 * The manifest carries enough to build the picker, and a device file is only
 * fetched once that device is selected.
 */

const DEVICES_PATH = "devices/";

async function fetchJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return response.json();
}

/** Resolves to [{ file, name, manufacturer }]. */
export function loadDeviceIndex() {
  return fetchJson(`${DEVICES_PATH}index.json`);
}

export function loadDevice(file) {
  return fetchJson(DEVICES_PATH + file);
}
