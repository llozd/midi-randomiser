/** Renders a device's parameters into the parameter list. */

const parameterList = document.querySelector("#parameter-rows");
const parameterTemplate = document.querySelector("#parameter-row");

function createRow(parameter) {
  const row = parameterTemplate.content.firstElementChild.cloneNode(true);

  // Only the range and the checkbox are inputs. The rest describe the
  // parameter and are read straight from the device file.
  for (const cell of row.querySelectorAll("[data-field]")) {
    const value = parameter[cell.dataset.field];

    if (cell.type === "checkbox") {
      cell.checked = value;
    } else if (cell.tagName === "INPUT") {
      cell.value = value;
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
