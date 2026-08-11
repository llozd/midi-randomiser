/** Web MIDI access, output-port enumeration, and sending CC and NRPN. */

import { cc14Messages, ccMessage, nrpnMessages } from "./messages.js";

let access = null;
let outputId = null;
let channel = 1;

export const isSupported = () =>
  typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

export async function requestAccess() {
  if (!isSupported()) {
    throw new Error("Web MIDI is not supported in this browser.");
  }

  access = await navigator.requestMIDIAccess();
  return access;
}

export function getOutputs() {
  return access ? [...access.outputs.values()] : [];
}

/** Fires when a port is connected or disconnected. */
export function onPortsChanged(listener) {
  access?.addEventListener("statechange", listener);
}

export function setOutput(id) {
  outputId = id;
}

export function setChannel(value) {
  channel = value;
}

function send(messages) {
  const output = outputId ? access?.outputs.get(outputId) : null;

  if (!output) {
    throw new Error("No MIDI output selected.");
  }

  for (const message of messages) {
    output.send(message);
  }
}

export function sendCC(number, value) {
  send([ccMessage(channel, number, value)]);
}

export function sendCC14(number, lsbNumber, value) {
  send(cc14Messages(channel, number, lsbNumber, value));
}

export function sendNRPN(number, value) {
  send(nrpnMessages(channel, number, value));
}
