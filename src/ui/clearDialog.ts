import type { AppElements } from "./elements.js";

export type ClearDialogController = {
  requestClear: () => void;
};

export function bindClearDialog(elements: AppElements, callbacks: { onConfirm: () => void }): ClearDialogController {
  elements.clearDialog.addEventListener("close", () => {
    elements.clearDialog.returnValue = "cancel";
  });

  elements.clearDialog.addEventListener("keydown", (event) => {
    if (event.key === " " && event.target === elements.clearConfirmButton) {
      event.preventDefault();
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    elements.clearDialog.close("cancel");
  });

  elements.clearConfirmButton.addEventListener("click", () => {
    callbacks.onConfirm();
    elements.clearDialog.close("clear");
  });

  return {
    requestClear: () => {
      if (elements.clearDialog.open) {
        return;
      }

      elements.clearDialog.showModal();
      elements.clearCancelButton.focus();
    },
  };
}
