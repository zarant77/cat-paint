import type { AppState } from "../app/AppState.js";
import type { PrimitiveKind, ToolKind } from "../primitives/Primitive.js";
import type { AppElements } from "./elements.js";
import { sanitizeSpriteId } from "../utils/naming.js";

export type ToolbarCallbacks = {
  onSelectTool: (tool: ToolKind) => void;
  onResizeCanvas: (value: string) => void;
  onValidateCanvasSize: (value: string) => boolean;
  onApplyColor: (value: string) => void;
  onValidateColor: (value: string) => boolean;
  onScaleSelected: (factor: number) => void;
  onRotateSelected: (degrees: number) => void;
  onMoveSelectedLayer: (target: "back" | "backward" | "forward" | "front") => void;
  onCopyPrimitive: () => void;
  onPastePrimitive: () => void;
  onDeletePrimitive: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onImport: () => void;
  onCopy: () => Promise<void>;
  onShow: () => void;
  onUpdateExport: () => void;
};

export function bindToolbar(elements: AppElements, state: AppState, callbacks: ToolbarCallbacks): void {
  elements.spriteIdInput.addEventListener("input", () => {
    state.spriteId = sanitizeSpriteId(elements.spriteIdInput.value);
    callbacks.onUpdateExport();
  });

  const commitCanvasSize = (): void => {
    callbacks.onResizeCanvas(elements.canvasSizeInput.value);
  };

  elements.canvasSizeInput.addEventListener("input", () => {
    elements.canvasSizeInput.classList.toggle("is-invalid", !callbacks.onValidateCanvasSize(elements.canvasSizeInput.value));
  });
  elements.canvasSizeInput.addEventListener("blur", commitCanvasSize);
  elements.canvasSizeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitCanvasSize();
    }
  });

  const commitColor = (): void => {
    callbacks.onApplyColor(elements.colorHexInput.value);
  };

  elements.colorInput.addEventListener("input", () => {
    callbacks.onApplyColor(elements.colorInput.value);
  });

  elements.colorHexInput.addEventListener("input", () => {
    elements.colorHexInput.classList.toggle("is-invalid", !callbacks.onValidateColor(elements.colorHexInput.value));
  });
  elements.colorHexInput.addEventListener("blur", commitColor);
  elements.colorHexInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitColor();
    }
  });

  elements.kindButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.kind;

      if (!isToolKind(kind)) {
        return;
      }

      callbacks.onSelectTool(kind);
    });
  });

  const commitScale = (): void => {
    const scalePercent = Number(elements.scaleInput.value);

    if (!Number.isFinite(scalePercent) || scalePercent <= 0) {
      elements.scaleInput.classList.add("is-invalid");
      return;
    }

    elements.scaleInput.classList.remove("is-invalid");
    callbacks.onScaleSelected(scalePercent / 100);
    elements.scaleInput.value = "100";
  };

  elements.scaleInput.addEventListener("blur", commitScale);
  elements.scaleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitScale();
    }
  });
  elements.rotationInput.addEventListener("change", () => {
    callbacks.onRotateSelected(Number(elements.rotationInput.value));
  });
  elements.sendToBackButton.addEventListener("click", () => {
    callbacks.onMoveSelectedLayer("back");
  });
  elements.sendBackwardButton.addEventListener("click", () => {
    callbacks.onMoveSelectedLayer("backward");
  });
  elements.bringForwardButton.addEventListener("click", () => {
    callbacks.onMoveSelectedLayer("forward");
  });
  elements.bringToFrontButton.addEventListener("click", () => {
    callbacks.onMoveSelectedLayer("front");
  });
  elements.copyPrimitiveButton.addEventListener("click", callbacks.onCopyPrimitive);
  elements.pastePrimitiveButton.addEventListener("click", callbacks.onPastePrimitive);
  elements.deletePrimitiveButton.addEventListener("click", callbacks.onDeletePrimitive);
  elements.undoButton.addEventListener("click", callbacks.onUndo);
  elements.redoButton.addEventListener("click", callbacks.onRedo);
  elements.clearButton.addEventListener("click", callbacks.onClear);
  elements.importButton.addEventListener("click", callbacks.onImport);
  elements.copyButton.addEventListener("click", () => {
    void callbacks.onCopy();
  });
  elements.showButton.addEventListener("click", callbacks.onShow);
}

function isPrimitiveKind(value: string | undefined): value is PrimitiveKind {
  return value === "rect" || value === "circle" || value === "triangle";
}

function isToolKind(value: string | undefined): value is ToolKind {
  return isPrimitiveKind(value);
}
