import type { ToolKind } from "../primitives/Primitive.js";
import { isEditableTarget } from "../ui/isEditableTarget.js";

export type KeyboardShortcutCallbacks = {
  onSelectTool: (tool: ToolKind) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onImport: () => void;
  onShow: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onMoveLayer: (target: "back" | "backward" | "forward" | "front") => void;
};

export function bindKeyboardShortcuts(callbacks: KeyboardShortcutCallbacks): void {
  document.addEventListener("keydown", (event) => {
    if (document.querySelector("dialog[open]")) {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    const isCommand = event.metaKey || event.ctrlKey;

    if (isCommand && key === "z") {
      event.preventDefault();

      if (event.shiftKey) {
        callbacks.onRedo();
        return;
      }

      callbacks.onUndo();
      return;
    }

    if (isCommand && key === "y") {
      event.preventDefault();
      callbacks.onRedo();
      return;
    }

    if (isCommand && key === "c") {
      event.preventDefault();
      callbacks.onCopy();
      return;
    }

    if (isCommand && key === "v") {
      event.preventDefault();
      callbacks.onPaste();
      return;
    }

    if (isCommand && key === "o") {
      event.preventDefault();
      callbacks.onImport();
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      callbacks.onShow();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      callbacks.onDelete();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      callbacks.onClearSelection();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.code === "BracketLeft") {
      event.preventDefault();
      callbacks.onMoveLayer(event.shiftKey ? "back" : "backward");
      return;
    }

    if (event.code === "BracketRight") {
      event.preventDefault();
      callbacks.onMoveLayer(event.shiftKey ? "front" : "forward");
      return;
    }

    const tool = getToolShortcut(key);

    if (!tool) {
      return;
    }

    event.preventDefault();
    callbacks.onSelectTool(tool);
  });
}

function getToolShortcut(key: string): ToolKind | null {
  if (key === "1") {
    return "rect";
  }

  if (key === "2") {
    return "circle";
  }

  if (key === "3") {
    return "triangle";
  }

  return null;
}
