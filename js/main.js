import { loadDevice, loadDeviceIndex } from "./devices.js";
import {
  getOutputs,
  isSupported,
  onPortsChanged,
  requestAccess,
  sendCC,
  sendNRPN,
  setChannel,
  setOutput,
} from "./midi.js";
import { randomiseParameters } from "./randomiser.js";
import { onParameterEdit, renderParameters } from "./ui.js";

const outputSelect = document.querySelector("#midi-output");
const channelSelect = document.querySelector("#midi-channel");
const refreshButton = document.querySelector("#refresh-ports");
const statusLine = document.querySelector("#midi-status");
const deviceSelect = document.querySelector("#device-select");
const randomiseButton = document.querySelector("#randomise");
const deviceStatus = document.querySelector("#device-status");

const NUMERIC_FIELDS = new Set(["number", "min", "max"]);

let connected = false;
// Manifest entries: { file, name, manufacturer }. The device itself is only
// fetched on selection.
let index = [];
let currentDevice = null;
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

function renderDeviceOptions() {
  if (index.length === 0) {
    deviceSelect.replaceChildren(placeholderOption("No devices available"));
    return;
  }

  deviceSelect.replaceChildren(
    ...index.map((entry) => {
      const option = document.createElement("option");
      // Keyed by filename rather than position, so the value survives the
      // list being rebuilt.
      option.value = entry.file;
      option.textContent = deviceLabel(entry);
      return option;
    }),
  );
}

async function selectDevice(file) {
  const entry = index.find((item) => item.file === file);

  if (!entry) {
    return;
  }

  // Keeps the dropdown in step when the selection is made in code.
  deviceSelect.value = file;

  const token = ++selectionToken;
  currentDevice = null;
  renderParameters([]);
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

  currentDevice = device;
  setDeviceStatus("");
  renderParameters(device.parameters);
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

  renderDeviceOptions();

  if (index.length > 0) {
    await selectDevice(index[0].file);
  }
}

refreshButton.addEventListener("click", () => {
  if (connected) {
    renderOutputs();
  } else {
    connect();
  }
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

// Keep the parameter objects in step with the inputs, so Randomise uses what
// is on screen rather than what the device file shipped with.
onParameterEdit((index, field, value) => {
  const parameter = currentDevice?.parameters[index];

  if (parameter) {
    parameter[field] = NUMERIC_FIELDS.has(field) ? Number(value) : value;
  }
});

connect();
loadDevices();
