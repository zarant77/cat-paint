import { ImportError } from "../import/ImportError.js";
import { parseSpriteDocument } from "../import/parseSpriteDocument.js";
import type { CatPaintDocument } from "../document/CatPaintDocument.js";
import type { ParsedSprite } from "../import/parseSpriteC.js";
import type { AppElements } from "./elements.js";

export type ImportDialogController = {
  requestImport: () => void;
};

export function bindImportDialog(
  elements: AppElements,
  callbacks: { onImport: (sprite: ParsedSprite | CatPaintDocument) => void },
): ImportDialogController {
  const clearError = (): void => {
    elements.importError.hidden = true;
    elements.importError.textContent = "";
  };

  elements.importDialog.addEventListener("close", () => {
    elements.importDialog.returnValue = "cancel";
    clearError();
  });

  elements.importInput.addEventListener("input", clearError);

  elements.importConfirmButton.addEventListener("click", () => {
    try {
      const sprite = parseSpriteDocument(elements.importInput.value);
      callbacks.onImport(sprite);
      elements.importDialog.close("import");
    } catch (error) {
      elements.importError.textContent = error instanceof ImportError ? error.message : "Could not import sprite.";
      elements.importError.hidden = false;
    }
  });

  return {
    requestImport: () => {
      if (elements.importDialog.open) {
        return;
      }

      elements.importInput.value = "";
      clearError();
      elements.importDialog.showModal();
      elements.importInput.focus();
    },
  };
}
