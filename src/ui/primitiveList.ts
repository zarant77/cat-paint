import type { AppState } from "../app/AppState.js";
import type { Primitive, PrimitiveKind } from "../primitives/Primitive.js";
import type { AppElements } from "./elements.js";

type PrimitiveListCallbacks = {
  onSelectPrimitive: (index: number, options: { shiftKey: boolean }) => void;
};

const KIND_ICONS: Record<PrimitiveKind, string> = {
  rect: "■",
  circle: "●",
  triangle: "▲",
};

export function bindPrimitiveList(elements: AppElements, state: AppState, callbacks: PrimitiveListCallbacks): { render: () => void } {
  elements.primitiveList.addEventListener("click", (event) => {
    const item = getPrimitiveListItem(event.target);

    if (!item) {
      return;
    }

    const index = Number(item.dataset.index);

    if (!Number.isInteger(index)) {
      return;
    }

    callbacks.onSelectPrimitive(index, { shiftKey: event.shiftKey });
  });

  elements.primitiveList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const item = getPrimitiveListItem(event.target);

    if (!item) {
      return;
    }

    const index = Number(item.dataset.index);

    if (!Number.isInteger(index)) {
      return;
    }

    event.preventDefault();
    callbacks.onSelectPrimitive(index, { shiftKey: event.shiftKey });
  });

  const render = (): void => {
    elements.primitiveList.replaceChildren();

    if (state.primitives.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "primitive-list-empty";
      emptyItem.textContent = "Empty";
      elements.primitiveList.append(emptyItem);
      return;
    }

    const selectedIndexes = new Set(state.selectedPrimitiveIndexes);

    state.primitives.forEach((primitive, index) => {
      const item = document.createElement("li");
      const isSelected = selectedIndexes.has(index);

      item.className = "primitive-list-item";
      item.dataset.index = String(index);
      item.tabIndex = 0;
      item.role = "option";
      item.ariaSelected = String(isSelected);
      item.title = formatPrimitiveTitle(primitive, index);

      if (isSelected) {
        item.classList.add("is-selected");
      }

      const number = document.createElement("span");
      number.className = "primitive-list-index";
      number.textContent = `${index + 1}.`;

      const kind = document.createElement("span");
      kind.className = "primitive-list-kind";
      kind.textContent = KIND_ICONS[primitive.kind];

      const color = document.createElement("span");
      color.className = "primitive-list-color";
      color.title = formatPrimitiveColor(primitive);
      color.style.backgroundColor = primitive.color;
      color.style.opacity = String(clampAlpha(primitive.alpha) / 255);

      const size = document.createElement("span");
      size.className = "primitive-list-size";
      size.textContent = formatPrimitiveSize(primitive);

      item.append(number, kind, color, size);
      elements.primitiveList.append(item);
    });
  };

  render();

  return { render };
}

function getPrimitiveListItem(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const item = target.closest<HTMLElement>(".primitive-list-item");

  if (!item) {
    return null;
  }

  return item;
}

function formatPrimitiveSize(primitive: Primitive): string {
  if (primitive.kind === "circle") {
    return String(Math.round(primitive.w));
  }

  return `${Math.round(primitive.w)}x${Math.round(primitive.h)}`;
}

function formatPrimitiveColor(primitive: Primitive): string {
  const alphaHex = clampAlpha(primitive.alpha).toString(16).padStart(2, "0");

  return `${primitive.color}${alphaHex}`;
}

function formatPrimitiveTitle(primitive: Primitive, index: number): string {
  return `Primitive ${index + 1}: ${primitive.kind}, ${formatPrimitiveColor(primitive)}, ${formatPrimitiveSize(primitive)}`;
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) {
    return 255;
  }

  return Math.max(0, Math.min(255, Math.round(alpha)));
}
