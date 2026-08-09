import { loadShippedDevices } from "./devices.js";
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
import {
  appendParameter,
  onParameterEdit,
  onParameterRemove,
  renderParameters,
} from "./ui.js";

const outputSelect = document.querySelector("#midi-output");
const channelSelect = document.querySelector("#midi-channel");
const refreshButton = document.querySelector("#refresh-ports");
const statusLine = document.querySelector("#midi-status");
const deviceSelect = document.querySelector("#device-select");
const randomiseButton = document.querySelector("#randomise");
const nameInput = document.querySelector("#device-name");
const manufacturerInput = document.querySelector("#device-manufacturer");
const addParameterButton = document.querySelector("#add-parameter");
const editorStatus = document.querySelector("#editor-status");

const NUMERIC_FIELDS = new Set(["number", "min", "max"]);

let connected = false;
// Each entry is { source: "shipped" | "saved" | "draft", device }.
let entries = [];
let currentEntry = null;

function setStatus(message) {
  statusLine.textContent = message;
}

function setEditorStatus(message) {
  editorStatus.textContent = message;
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

const deviceLabel = ({ device }) =>
  [device.manufacturer, device.name].filter(Boolean).join(" ") || "Untitled";

function renderDeviceOptions() {
  if (entries.length === 0) {
    deviceSelect.replaceChildren(placeholderOption("No devices available"));
    return;
  }

  deviceSelect.replaceChildren(
    ...entries.map((entry, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = deviceLabel(entry);
      return option;
    }),
  );

  if (currentEntry) {
    deviceSelect.value = String(entries.indexOf(currentEntry));
  }
}

function selectDevice(index) {
  const entry = entries[index];

  if (!entry) {
    return;
  }

  currentEntry = entry;
  // Keeps the dropdown in step when the selection is made in code.
  deviceSelect.value = String(index);
  nameInput.value = entry.device.name;
  manufacturerInput.value = entry.device.manufacturer;
  renderParameters(entry.device.parameters);
}

function randomise() {
  if (!currentEntry) {
    return;
  }

  const picks = randomiseParameters(currentEntry.device.parameters);

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
  let shipped = [];

  try {
    shipped = await loadShippedDevices();
  } catch (error) {
    setEditorStatus("Could not load shipped devices.");
    console.error(error);
  }

  entries = shipped.map((device) => ({ source: "shipped", device }));

  if (entries.length === 0) {
    renderDeviceOptions();
    return;
  }

  renderDeviceOptions();
  selectDevice(0);
}

function newDevice() {
  const entry = {
    source: "draft",
    device: { name: "", manufacturer: "", schemaVersion: 1, parameters: [] },
  };

  entries = [...entries.filter((other) => other.source !== "draft"), entry];
  currentEntry = entry;
  renderDeviceOptions();
  selectDevice(entries.indexOf(entry));
  setEditorStatus("New device. Give it a name, add parameters, then save.");
  nameInput.focus();
}

refreshButton.addEventListener("click", () => {
  if (connected) {
    renderOutputs();
  } else {
    connect();
  }
});

deviceSelect.addEventListener("change", () => {
  selectDevice(Number(deviceSelect.value));
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
  const parameter = currentEntry?.device.parameters[index];

  if (parameter) {
    parameter[field] = NUMERIC_FIELDS.has(field) ? Number(value) : value;
  }
});

onParameterRemove((index) => {
  currentEntry?.device.parameters.splice(index, 1);
});

nameInput.addEventListener("input", () => {
  if (currentEntry) {
    currentEntry.device.name = nameInput.value;
    renderDeviceOptions();
  }
});

manufacturerInput.addEventListener("input", () => {
  if (currentEntry) {
    currentEntry.device.manufacturer = manufacturerInput.value;
    renderDeviceOptions();
  }
});

addParameterButton.addEventListener("click", () => {
  if (!currentEntry) {
    return;
  }

  const parameter = {
    name: "",
    type: "cc",
    number: 0,
    min: 0,
    max: 127,
    enabled: true,
  };

  currentEntry.device.parameters.push(parameter);
  appendParameter(parameter);
});

document.querySelector("#new-device").addEventListener("click", newDevice);

connect();
loadDevices();
