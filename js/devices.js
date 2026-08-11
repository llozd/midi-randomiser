// Static hosts can't list a directory, so a manifest lists what's available.

const DEVICES_PATH = "devices/generated/";

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
