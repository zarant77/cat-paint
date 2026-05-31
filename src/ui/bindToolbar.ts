import type { ToolKind } from "../primitives/Primitive.js";
import { HOTKEYS } from "../shortcuts/hotkeys.js";
import { getShortcutLabel, tooltip } from "../shortcuts/shortcutLabel.js";
import type { AppElements } from "./elements.js";

export type ToolbarCallbacks = {
  onSelectTool: (tool: ToolKind) => void;
  onResizeCanvas: (value: string) => void;
  onValidateCanvasSize: (value: string) => boolean;
  onApplyColor: (value: string) => void;
  onValidateColor: (value: string) => boolean;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onMoveSelectedLayer: (target: "back" | "backward" | "forward" | "front") => void;
  onGroup: () => void;
  onUngroup: () => void;
  onCopyPrimitive: () => void;
  onPastePrimitive: () => void;
  onDeletePrimitive: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onImport: () => void;
  onShow: () => void;
  onUpdateExport: () => void;
};

export function bindToolbar(elements: AppElements, callbacks: ToolbarCallbacks): void {
  applyTooltips(elements);

  const commitCanvasSize = (): void => {
    callbacks.onResizeCanvas(elements.canvasSizeInput.value);
  };

  elements.canvasSizeInput.addEventListener("input", () => {
    const isValid = callbacks.onValidateCanvasSize(elements.canvasSizeInput.value);
    elements.canvasSizeInput.classList.toggle("is-invalid", !isValid);
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
    const isValid = callbacks.onValidateColor(elements.colorHexInput.value);
    elements.colorHexInput.classList.toggle("is-invalid", !isValid);
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

  elements.flipHorizontalButton.addEventListener("click", callbacks.onFlipHorizontal);
  elements.flipVerticalButton.addEventListener("click", callbacks.onFlipVertical);

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

  elements.groupButton.addEventListener("click", callbacks.onGroup);
  elements.ungroupButton.addEventListener("click", callbacks.onUngroup);
  elements.copyPrimitiveButton.addEventListener("click", callbacks.onCopyPrimitive);
  elements.pastePrimitiveButton.addEventListener("click", callbacks.onPastePrimitive);
  elements.deletePrimitiveButton.addEventListener("click", callbacks.onDeletePrimitive);
  elements.undoButton.addEventListener("click", callbacks.onUndo);
  elements.redoButton.addEventListener("click", callbacks.onRedo);
  elements.clearButton.addEventListener("click", callbacks.onClear);
  elements.importButton.addEventListener("click", callbacks.onImport);
  elements.showButton.addEventListener("click", callbacks.onShow);
}

function isToolKind(value: string | undefined): value is NonNullable<ToolKind> {
  return (
    value === "rect" ||
    value === "circle" ||
    value === "triangle" ||
    value === "fill" ||
    value === "eyedropper" ||
    value === "rotate" ||
    value === "scale"
  );
}

function applyTooltips(elements: AppElements): void {
  setButtonTooltip(elements.kindButtons[0], "Add rectangle", HOTKEYS.tools.rect);
  setButtonTooltip(elements.kindButtons[1], "Add circle", HOTKEYS.tools.circle);
  setButtonTooltip(elements.kindButtons[2], "Add triangle", HOTKEYS.tools.triangle);
  setButtonTooltip(elements.kindButtons[3], "Fill primitive", HOTKEYS.tools.fill);
  setButtonTooltip(elements.kindButtons[4], "Pick color", HOTKEYS.tools.eyedropper);
  setButtonTooltip(elements.kindButtons[5], "Rotate selection", HOTKEYS.tools.rotate);
  setButtonTooltip(elements.kindButtons[6], "Scale selection", HOTKEYS.tools.scale);
  setButtonTooltip(elements.flipHorizontalButton, "Flip horizontal", HOTKEYS.actions.flipHorizontal);
  setButtonTooltip(elements.flipVerticalButton, "Flip vertical", HOTKEYS.actions.flipVertical);
  setButtonTooltip(elements.sendToBackButton, "Send to back", HOTKEYS.actions.sendToBack);
  setButtonTooltip(elements.sendBackwardButton, "Send backward", HOTKEYS.actions.sendBackward);
  setButtonTooltip(elements.bringForwardButton, "Bring forward", HOTKEYS.actions.bringForward);
  setButtonTooltip(elements.bringToFrontButton, "Bring to front", HOTKEYS.actions.bringToFront);
  elements.groupButton.title = "Group selected nodes";
  elements.ungroupButton.title = "Ungroup selected group";
  setButtonTooltip(elements.copyPrimitiveButton, "Copy selected primitives", HOTKEYS.actions.copy);
  setButtonTooltip(elements.pastePrimitiveButton, "Paste primitives", HOTKEYS.actions.paste);
  elements.deletePrimitiveButton.title = `Delete selected primitives - ${getShortcutLabel(
    HOTKEYS.actions.delete,
  )} / ${getShortcutLabel(HOTKEYS.actions.backspaceDelete)}`;
  setButtonTooltip(elements.undoButton, "Undo", HOTKEYS.actions.undo);
  elements.redoButton.title = `Redo - ${getShortcutLabel(HOTKEYS.actions.redo)} / ${getShortcutLabel(
    HOTKEYS.actions.redoAlt,
  )}`;
  elements.clearButton.title = "Clear sprite";
  setButtonTooltip(elements.importButton, "Import sprite", HOTKEYS.actions.import);
  setButtonTooltip(elements.showButton, "Export sprite", HOTKEYS.actions.showExport);
}

function setButtonTooltip(button: HTMLButtonElement | undefined, label: string, shortcut: string): void {
  if (!button) {
    return;
  }

  button.title = tooltip(label, shortcut);
}
