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
let devices = [];
let currentDevice = null;

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

const deviceLabel = (device) =>
  [device.manufacturer, device.name].filter(Boolean).join(" ") || "Untitled";

function renderDeviceOptions() {
  if (devices.length === 0) {
    deviceSelect.replaceChildren(placeholderOption("No devices available"));
    return;
  }

  deviceSelect.replaceChildren(
    ...devices.map((device, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = deviceLabel(device);
      return option;
    }),
  );
}

function selectDevice(index) {
  const device = devices[index];

  if (!device) {
    return;
  }

  currentDevice = device;
  // Keeps the dropdown in step when the selection is made in code.
  deviceSelect.value = String(index);
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
    devices = await loadShippedDevices();
  } catch (error) {
    setDeviceStatus("Could not load devices.");
    console.error(error);
  }

  if (devices.length === 0) {
    renderDeviceOptions();
    return;
  }

  renderDeviceOptions();
  selectDevice(0);
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
  const parameter = currentDevice?.parameters[index];

  if (parameter) {
    parameter[field] = NUMERIC_FIELDS.has(field) ? Number(value) : value;
  }
});

connect();
loadDevices();
