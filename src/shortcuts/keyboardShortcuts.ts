import type { ToolKind } from "../primitives/Primitive.js";
import { isEditableTarget } from "../ui/isEditableTarget.js";
import { HOTKEYS } from "./hotkeys.js";
import { matchesHotkey } from "./matchesHotkey.js";

export type KeyboardShortcutCallbacks = {
  onSelectTool: (tool: ToolKind) => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
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

    if (matchesHotkey(event, HOTKEYS.actions.undo)) {
      event.preventDefault();
      callbacks.onUndo();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.redo) || matchesHotkey(event, HOTKEYS.actions.redoAlt)) {
      event.preventDefault();
      callbacks.onRedo();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.copy)) {
      event.preventDefault();
      callbacks.onCopy();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.paste)) {
      event.preventDefault();
      callbacks.onPaste();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.import)) {
      event.preventDefault();
      callbacks.onImport();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.showExport)) {
      event.preventDefault();
      callbacks.onShow();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.delete) || matchesHotkey(event, HOTKEYS.actions.backspaceDelete)) {
      event.preventDefault();
      callbacks.onDelete();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.cancel)) {
      event.preventDefault();
      callbacks.onClearSelection();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.flipHorizontal)) {
      event.preventDefault();
      callbacks.onFlipHorizontal();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.flipVertical)) {
      event.preventDefault();
      callbacks.onFlipVertical();
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.sendToBack)) {
      event.preventDefault();
      callbacks.onMoveLayer("back");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.sendBackward)) {
      event.preventDefault();
      callbacks.onMoveLayer("backward");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.bringToFront)) {
      event.preventDefault();
      callbacks.onMoveLayer("front");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.bringForward)) {
      event.preventDefault();
      callbacks.onMoveLayer("forward");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.moveLayerUp)) {
      event.preventDefault();
      callbacks.onMoveLayer("backward");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.actions.moveLayerDown)) {
      event.preventDefault();
      callbacks.onMoveLayer("forward");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.tools.rect)) {
      event.preventDefault();
      callbacks.onSelectTool("rect");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.tools.circle)) {
      event.preventDefault();
      callbacks.onSelectTool("circle");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.tools.triangle)) {
      event.preventDefault();
      callbacks.onSelectTool("triangle");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.tools.fill)) {
      event.preventDefault();
      callbacks.onSelectTool("fill");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.tools.eyedropper)) {
      event.preventDefault();
      callbacks.onSelectTool("eyedropper");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.tools.rotate)) {
      event.preventDefault();
      callbacks.onSelectTool("rotate");
      return;
    }

    if (matchesHotkey(event, HOTKEYS.tools.scale)) {
      event.preventDefault();
      callbacks.onSelectTool("scale");
    }
  });
}
