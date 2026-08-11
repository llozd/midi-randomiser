import { loadDevice, loadDeviceIndex } from "./devices.js";
import {
  getOutputs,
  isSupported,
  onPortsChanged,
  requestAccess,
  sendCC,
  sendCC14,
  sendNRPN,
  setChannel,
  setOutput,
} from "./midi.js";
import { randomiseParameters } from "./randomiser.js";
import { getOverrides, parameterKey, setOverrides } from "./storage.js";
import {
  onParameterEdit,
  renderParameters,
  setAllEnabled,
} from "./ui.js";

const outputSelect = document.querySelector("#midi-output");
const channelSelect = document.querySelector("#midi-channel");
const refreshButton = document.querySelector("#refresh-ports");
const statusLine = document.querySelector("#midi-status");
const manufacturerSelect = document.querySelector("#manufacturer-select");
const deviceSelect = document.querySelector("#device-select");
const randomiseButton = document.querySelector("#randomise");
const toggleAllButton = document.querySelector("#toggle-all");
const deviceStatus = document.querySelector("#device-status");

const NUMERIC_FIELDS = new Set(["min", "max"]);

let connected = false;
// Manifest entries; the device itself is fetched on selection.
let index = [];
let currentDevice = null;
let currentFile = null;
// What the device file shipped, so only real changes are stored.
let shipped = new Map();
// Bumped on every selection, so a slow fetch can't overwrite a newer one.
let selectionToken = 0;

function setStatus(message) {
  statusLine.textContent = message;
}

function setDeviceStatus(message) {
  deviceStatus.textContent = message;
}

function placeholderOption(label) {
  const option = document.createElement("option");
  option.value = "";
  option.textContent = label;
  return option;
}

function renderOutputs() {
  const outputs = getOutputs();

  if (outputs.length === 0) {
    outputSelect.replaceChildren(placeholderOption("No ports available"));
    setOutput("");
    setStatus("No MIDI output ports found. Connect a device and refresh.");
    return;
  }

  // Keep the current selection if that port is still present.
  const selected = outputSelect.value;

  outputSelect.replaceChildren(
    ...outputs.map((output) => {
      const option = document.createElement("option");
      option.value = output.id;
      option.textContent = output.name;
      return option;
    }),
  );

  if (outputs.some((output) => output.id === selected)) {
    outputSelect.value = selected;
  }

  setOutput(outputSelect.value);
  setStatus(`${outputs.length} MIDI output port(s) available.`);
}

async function connect() {
  if (!isSupported()) {
    setStatus("Web MIDI is not supported in this browser. Use Chrome or Edge.");
    outputSelect.disabled = true;
    refreshButton.disabled = true;
    return;
  }

  try {
    await requestAccess();
  } catch (error) {
    setStatus(`Could not access MIDI: ${error.message}`);
    return;
  }

  connected = true;
  onPortsChanged(renderOutputs);
  renderOutputs();
}

const deviceLabel = (entry) =>
  [entry.manufacturer, entry.name].filter(Boolean).join(" ") || "Untitled";

const modelsOf = (manufacturer) =>
  index.filter((entry) => entry.manufacturer === manufacturer);

function renderManufacturerOptions() {
  if (index.length === 0) {
    manufacturerSelect.replaceChildren(
      placeholderOption("No devices available"),
    );
    return;
  }

  // The manifest arrives sorted, so first-seen order is alphabetical.
  const manufacturers = [...new Set(index.map((entry) => entry.manufacturer))];

  manufacturerSelect.replaceChildren(
    ...manufacturers.map((manufacturer) => {
      const option = document.createElement("option");
      option.value = manufacturer;
      option.textContent = manufacturer;
      return option;
    }),
  );
}

/** Fills the model select with one manufacturer's devices. */
function renderModelOptions(manufacturer) {
  const models = modelsOf(manufacturer);

  if (models.length === 0) {
    deviceSelect.replaceChildren(placeholderOption("No devices available"));
    return;
  }

  deviceSelect.replaceChildren(
    ...models.map((entry) => {
      const option = document.createElement("option");
      // Keyed by filename, so the value survives the list being rebuilt.
      option.value = entry.file;
      option.textContent = entry.name;
      return option;
    }),
  );
}

/** Switches manufacturer and selects its first model. */
function selectManufacturer(manufacturer) {
  const [first] = modelsOf(manufacturer);

  if (!first) {
    return;
  }

  manufacturerSelect.value = manufacturer;
  renderModelOptions(manufacturer);
  return selectDevice(first.file);
}

/** Overlays saved changes and remembers what the file shipped with. */
function applyOverrides(device, overrides) {
  shipped = new Map();

  for (const parameter of device.parameters) {
    const key = parameterKey(parameter);
    const { enabled, min, max } = parameter;
    shipped.set(key, { enabled, min, max });

    const saved = overrides[key];

    if (!saved) {
      continue;
    }

    if (typeof saved.enabled === "boolean") {
      parameter.enabled = saved.enabled;
    }

    if (Number.isInteger(saved.min)) {
      parameter.min = saved.min;
    }

    if (Number.isInteger(saved.max)) {
      parameter.max = saved.max;
    }
  }
}

function persistOverrides() {
  if (!currentDevice) {
    return;
  }

  const overrides = {};

  for (const parameter of currentDevice.parameters) {
    const key = parameterKey(parameter);
    const base = shipped.get(key);
    const { enabled, min, max } = parameter;

    if (base.enabled !== enabled || base.min !== min || base.max !== max) {
      overrides[key] = { enabled, min, max };
    }
  }

  setOverrides(currentFile, overrides);
}

/** The button both reports and flips the state, so its label follows it. */
function updateToggleAll() {
  const parameters = currentDevice?.parameters ?? [];
  const allOn = parameters.length > 0 && parameters.every((p) => p.enabled);

  toggleAllButton.disabled = parameters.length === 0;
  toggleAllButton.textContent = allOn ? "Disable all" : "Enable all";
}

function toggleAll() {
  if (!currentDevice) {
    return;
  }

  const enabled = !currentDevice.parameters.every((p) => p.enabled);

  for (const parameter of currentDevice.parameters) {
    parameter.enabled = enabled;
  }

  setAllEnabled(enabled);
  updateToggleAll();
  persistOverrides();
}

async function selectDevice(file) {
  const entry = index.find((item) => item.file === file);

  if (!entry) {
    return;
  }

  // Keeps the dropdowns in step when the selection is made in code.
  deviceSelect.value = file;

  const token = ++selectionToken;
  currentDevice = null;
  currentFile = null;
  renderParameters([]);
  updateToggleAll();
  setDeviceStatus(`Loading ${deviceLabel(entry)}...`);

  let device;

  try {
    device = await loadDevice(file);
  } catch (error) {
    console.error(error);

    if (token === selectionToken) {
      setDeviceStatus(`Could not load ${deviceLabel(entry)}.`);
    }

    return;
  }

  // A newer selection landed while this one was in flight.
  if (token !== selectionToken) {
    return;
  }

  applyOverrides(device, getOverrides(file));
  currentDevice = device;
  currentFile = file;
  setDeviceStatus("");
  renderParameters(device.parameters);
  updateToggleAll();
}

function randomise() {
  if (!currentDevice) {
    return;
  }

  const picks = randomiseParameters(currentDevice.parameters);

  if (picks.length === 0) {
    setStatus("No parameters are enabled.");
    return;
  }

  try {
    for (const { parameter, value } of picks) {
      if (parameter.type === "nrpn") {
        sendNRPN(parameter.number, value);
      } else if (parameter.type === "cc14") {
        sendCC14(parameter.number, parameter.lsbNumber, value);
      } else {
        sendCC(parameter.number, value);
      }
    }
  } catch (error) {
    setStatus(error.message);
    return;
  }

  setStatus(`Randomised ${picks.length} parameter(s).`);
}

async function loadDevices() {
  try {
    index = await loadDeviceIndex();
  } catch (error) {
    setDeviceStatus("Could not load the device list.");
    console.error(error);
  }

  renderManufacturerOptions();

  if (index.length > 0) {
    await selectManufacturer(index[0].manufacturer);
  }
}

refreshButton.addEventListener("click", () => {
  if (connected) {
    renderOutputs();
  } else {
    connect();
  }
});

manufacturerSelect.addEventListener("change", () => {
  selectManufacturer(manufacturerSelect.value);
});

deviceSelect.addEventListener("change", () => {
  selectDevice(deviceSelect.value);
});

outputSelect.addEventListener("change", () => {
  setOutput(outputSelect.value);
});

channelSelect.addEventListener("change", () => {
  setChannel(Number(channelSelect.value));
});

randomiseButton.addEventListener("click", randomise);
toggleAllButton.addEventListener("click", toggleAll);

// Keeps Randomise using what's on screen, not what the file shipped with.
onParameterEdit((index, field, value) => {
  const parameter = currentDevice?.parameters[index];

  if (parameter) {
    parameter[field] = NUMERIC_FIELDS.has(field) ? Number(value) : value;
  }

  if (field === "enabled") {
    updateToggleAll();
  }

  persistOverrides();
});

connect();
loadDevices();
