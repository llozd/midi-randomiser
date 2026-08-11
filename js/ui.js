/** Renders a device's parameters into the parameter list. */

const parameterList = document.querySelector("#parameter-rows");
const parameterTemplate = document.querySelector("#parameter-row");

/** A 14-bit CC spans two numbers, so it shows both. */
const numberLabel = ({ type, number, lsbNumber }) =>
  type === "cc14" ? `${number} + ${lsbNumber}` : String(number);

function createRow(parameter) {
  const row = parameterTemplate.content.firstElementChild.cloneNode(true);

  // Only the range and checkbox are inputs; the rest are read-only cells.
  for (const cell of row.querySelectorAll("[data-field]")) {
    const value = parameter[cell.dataset.field];

    if (cell.type === "checkbox") {
      cell.checked = value;
    } else if (cell.tagName === "INPUT") {
      cell.value = value;
    } else if (cell.dataset.field === "number") {
      cell.textContent = numberLabel(parameter);
    } else {
      cell.textContent = value;
    }
  }

  return row;
}

export function renderParameters(parameters) {
  parameterList.replaceChildren(...parameters.map(createRow));
}

const rowIndex = (element) =>
  [...parameterList.children].indexOf(element.closest(".parameter"));

/** Reports edits to the parameter rows as (index, field, value). */
export function onParameterEdit(handler) {
  parameterList.addEventListener("input", (event) => {
    const input = event.target;
    const field = input.dataset.field;

    if (!field) {
      return;
    }

    handler(
      rowIndex(input),
      field,
      input.type === "checkbox" ? input.checked : input.value,
    );
  });
}
