import { getElement } from "./dom.js";

export type AppElements = {
  canvas: HTMLCanvasElement;
  primitiveList: HTMLOListElement;
  canvasSizeInput: HTMLInputElement;
  colorInput: HTMLInputElement;
  colorHexInput: HTMLInputElement;
  selectionSummary: HTMLHeadingElement;
  flipHorizontalButton: HTMLButtonElement;
  flipVerticalButton: HTMLButtonElement;
  sendToBackButton: HTMLButtonElement;
  sendBackwardButton: HTMLButtonElement;
  bringForwardButton: HTMLButtonElement;
  bringToFrontButton: HTMLButtonElement;
  copyPrimitiveButton: HTMLButtonElement;
  pastePrimitiveButton: HTMLButtonElement;
  deletePrimitiveButton: HTMLButtonElement;
  kindButtons: NodeListOf<HTMLButtonElement>;
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
  showButton: HTMLButtonElement;
  importDialog: HTMLDialogElement;
  importInput: HTMLTextAreaElement;
  importError: HTMLParagraphElement;
  importCancelButton: HTMLButtonElement;
  importConfirmButton: HTMLButtonElement;
  exportDialog: HTMLDialogElement;
  exportOutput: HTMLTextAreaElement;
  clearDialog: HTMLDialogElement;
  clearCancelButton: HTMLButtonElement;
  clearConfirmButton: HTMLButtonElement;
};

export function getAppElements(): AppElements {
  return {
    canvas: getElement<HTMLCanvasElement>("sprite-canvas"),
    primitiveList: getElement<HTMLOListElement>("primitive-list"),
    canvasSizeInput: getElement<HTMLInputElement>("canvas-size-input"),
    colorInput: getElement<HTMLInputElement>("color-input"),
    colorHexInput: getElement<HTMLInputElement>("color-hex-input"),
    selectionSummary: getElement<HTMLHeadingElement>("selection-summary"),
    flipHorizontalButton: getElement<HTMLButtonElement>("flip-horizontal-button"),
    flipVerticalButton: getElement<HTMLButtonElement>("flip-vertical-button"),
    sendToBackButton: getElement<HTMLButtonElement>("send-to-back-button"),
    sendBackwardButton: getElement<HTMLButtonElement>("send-backward-button"),
    bringForwardButton: getElement<HTMLButtonElement>("bring-forward-button"),
    bringToFrontButton: getElement<HTMLButtonElement>("bring-to-front-button"),
    copyPrimitiveButton: getElement<HTMLButtonElement>("copy-primitive-button"),
    pastePrimitiveButton: getElement<HTMLButtonElement>("paste-primitive-button"),
    deletePrimitiveButton: getElement<HTMLButtonElement>("delete-primitive-button"),
    kindButtons: document.querySelectorAll<HTMLButtonElement>("[data-kind]"),
    undoButton: getElement<HTMLButtonElement>("undo-button"),
    redoButton: getElement<HTMLButtonElement>("redo-button"),
    clearButton: getElement<HTMLButtonElement>("clear-button"),
    importButton: getElement<HTMLButtonElement>("import-button"),
    copyButton: getElement<HTMLButtonElement>("copy-button"),
    showButton: getElement<HTMLButtonElement>("show-button"),
    importDialog: getElement<HTMLDialogElement>("import-dialog"),
    importInput: getElement<HTMLTextAreaElement>("import-input"),
    importError: getElement<HTMLParagraphElement>("import-error"),
    importCancelButton: getElement<HTMLButtonElement>("import-cancel-button"),
    importConfirmButton: getElement<HTMLButtonElement>("import-confirm-button"),
    exportDialog: getElement<HTMLDialogElement>("export-dialog"),
    exportOutput: getElement<HTMLTextAreaElement>("export-output"),
    clearDialog: getElement<HTMLDialogElement>("clear-dialog"),
    clearCancelButton: getElement<HTMLButtonElement>("clear-cancel-button"),
    clearConfirmButton: getElement<HTMLButtonElement>("clear-confirm-button"),
  };
}
