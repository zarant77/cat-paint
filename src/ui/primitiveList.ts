import type { AppState } from "../app/AppState.js";
import type { SceneNode } from "../document/CatPaintDocument.js";
import type { Primitive } from "../primitives/Primitive.js";
import type { AppElements } from "./elements.js";

type PrimitiveListCallbacks = {
  onSelectNode: (nodeId: string, options: { shiftKey: boolean }) => void;
  onToggleGroup: (nodeId: string) => void;
  onToggleNodeVisibility: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  onMoveNode: (nodeId: string, direction: "up" | "down") => void;
  onRenameNode: (nodeId: string, name: string) => void;
};

export function bindPrimitiveList(elements: AppElements, state: AppState, callbacks: PrimitiveListCallbacks): { render: () => void } {
  let renamingNodeId: string | null = null;

  const requestRename = (nodeId: string): void => {
    if (!hasNodeId(state.nodes, nodeId)) {
      renamingNodeId = null;
      render();
      return;
    }

    renamingNodeId = nodeId;
    render();

    window.requestAnimationFrame(() => {
      const input = findRenameInput(elements.primitiveList, nodeId);

      if (input) {
        input.focus();
        input.select();
      }
    });
  };

  const finishRename = (node: SceneNode, input: HTMLInputElement, options: { cancel: boolean }): void => {
    const nextName = input.value.trim();

    if (!options.cancel && nextName !== "" && nextName !== node.name) {
      callbacks.onRenameNode(node.id, nextName);
    }

    renamingNodeId = null;
    render();
  };

  elements.primitiveList.addEventListener("click", (event) => {
    if (getRenameInput(event.target) || getNodeName(event.target) || getNodeActionButton(event.target)) {
      event.stopPropagation();
      return;
    }

    const toggle = getGroupToggle(event.target);

    if (toggle?.dataset.nodeId) {
      event.stopPropagation();
      callbacks.onToggleGroup(toggle.dataset.nodeId);
      return;
    }

    const item = getPrimitiveListItem(event.target);

    if (!item?.dataset.nodeId) {
      return;
    }

    item.focus({ preventScroll: true });
    callbacks.onSelectNode(item.dataset.nodeId, { shiftKey: event.shiftKey });
  });

  elements.primitiveList.addEventListener("keydown", (event) => {
    if (getRenameInput(event.target)) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const item = getPrimitiveListItem(event.target);

    if (!item?.dataset.nodeId) {
      return;
    }

    event.preventDefault();

    if (event.key === "Enter") {
      requestRename(item.dataset.nodeId);
      return;
    }

    callbacks.onSelectNode(item.dataset.nodeId, { shiftKey: event.shiftKey });
  });

  const render = (): void => {
    elements.primitiveList.replaceChildren();

    if (renamingNodeId !== null && !hasNodeId(state.nodes, renamingNodeId)) {
      renamingNodeId = null;
    }

    if (state.nodes.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "primitive-list-empty";
      emptyItem.textContent = "Empty";
      elements.primitiveList.append(emptyItem);
      return;
    }

    renderNodes(elements.primitiveList, state.nodes, state, callbacks, renamingNodeId, finishRename, requestRename, 0);
  };

  render();

  return { render };
}

function renderNodes(
  list: HTMLOListElement,
  nodes: readonly SceneNode[],
  state: AppState,
  callbacks: PrimitiveListCallbacks,
  renamingNodeId: string | null,
  finishRename: (node: SceneNode, input: HTMLInputElement, options: { cancel: boolean }) => void,
  requestRename: (nodeId: string) => void,
  depth: number,
): void {
  const selectedIds = new Set(state.selectedNodeIds);
  const collapsedIds = new Set(state.collapsedGroupIds);

  nodes.forEach((node, index) => {
    const item = document.createElement("li");
    const isSelected = selectedIds.has(node.id);

    item.className = `primitive-list-item is-${node.type}`;
    item.dataset.nodeId = node.id;
    item.tabIndex = 0;
    item.role = "option";
    item.ariaSelected = String(isSelected);
    item.title = formatNodeTitle(node);
    item.style.setProperty("--node-depth", String(depth));

    if (isSelected) {
      item.classList.add("is-selected");
    }

    if (!node.visible) {
      item.classList.add("is-hidden-node");
    }

    if (node.locked) {
      item.classList.add("is-locked-node");
    }

    const toggle = document.createElement("button");
    const isCollapsed = node.type === "group" && collapsedIds.has(node.id);

    toggle.className = "primitive-list-toggle";
    toggle.type = "button";
    toggle.title = node.type === "group" ? (isCollapsed ? "Expand group" : "Collapse group") : "";
    toggle.ariaLabel = node.type === "group" ? (isCollapsed ? "Expand group" : "Collapse group") : "No children";
    toggle.disabled = node.type !== "group";
    toggle.dataset.nodeId = node.id;
    toggle.textContent = node.type === "group" ? (isCollapsed ? "▸" : "▾") : "";

    const visibilityButton = createIconButton({
      className: "primitive-list-visibility-button",
      label: node.visible ? `Hide ${node.name}` : `Show ${node.name}`,
      title: node.visible ? "Hide" : "Show",
      text: node.visible ? "◉" : "○",
      onClick: () => callbacks.onToggleNodeVisibility(node.id),
    });
    const lockButton = createIconButton({
      className: "primitive-list-lock-button",
      label: node.locked ? `Unlock ${node.name}` : `Lock ${node.name}`,
      title: node.locked ? "Unlock" : "Lock",
      text: node.locked ? "◆" : "◇",
      onClick: () => callbacks.onToggleNodeLocked(node.id),
    });
    const kind = createNodeMarker(node);
    const name =
      renamingNodeId === node.id
        ? createRenameInput(node, finishRename)
        : createNodeName(node, requestRename, callbacks.onSelectNode);
    const renameButton = createRenameButton(node, requestRename);
    const moveUpButton = createIconButton({
      className: "primitive-list-move-button",
      label: `Move ${node.name} up`,
      title: "Move up",
      text: "↑",
      disabled: index === 0,
      onClick: () => callbacks.onMoveNode(node.id, "up"),
    });
    const moveDownButton = createIconButton({
      className: "primitive-list-move-button",
      label: `Move ${node.name} down`,
      title: "Move down",
      text: "↓",
      disabled: index === nodes.length - 1,
      onClick: () => callbacks.onMoveNode(node.id, "down"),
    });

    item.append(toggle, visibilityButton, lockButton, kind, name, renameButton, moveUpButton, moveDownButton);
    list.append(item);

    if (node.type === "group" && !collapsedIds.has(node.id)) {
      renderNodes(list, node.children, state, callbacks, renamingNodeId, finishRename, requestRename, depth + 1);
    }
  });
}

function createIconButton(input: {
  className: string;
  label: string;
  title: string;
  text: string;
  disabled?: boolean;
  onClick: () => void;
}): HTMLButtonElement {
  const button = document.createElement("button");

  button.className = `primitive-list-action-button ${input.className}`;
  button.type = "button";
  button.title = input.title;
  button.ariaLabel = input.label;
  button.textContent = input.text;
  button.disabled = input.disabled ?? false;

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    input.onClick();
  });

  return button;
}

function createNodeMarker(node: SceneNode): HTMLElement {
  const marker = document.createElement("span");

  if (node.type === "group") {
    marker.className = "primitive-list-kind primitive-list-group-marker";
    marker.textContent = "▣";
    marker.title = "Group";
    return marker;
  }

  const alpha = Math.max(0.35, clampAlpha(node.command.alpha) / 255);

  marker.className = `primitive-list-kind primitive-list-shape-marker is-${node.command.kind}`;
  marker.title = `${node.command.kind}, ${formatPrimitiveColor(node.command)}`;
  marker.style.opacity = String(alpha);

  if (node.command.kind === "triangle") {
    marker.style.borderBottomColor = node.command.color;
  } else {
    marker.style.backgroundColor = node.command.color;
  }

  return marker;
}

function createNodeName(
  node: SceneNode,
  requestRename: (nodeId: string) => void,
  selectNode: (nodeId: string, options: { shiftKey: boolean }) => void,
): HTMLSpanElement {
  const name = document.createElement("span");

  name.className = "primitive-list-name";
  name.title = "Double-click or press Enter to rename";
  name.textContent = node.name;

  name.addEventListener("mousedown", (event) => {
    event.stopPropagation();
    focusClosestRow(event.currentTarget);

    if (event.detail >= 2) {
      event.preventDefault();
      requestRename(node.id);
    }
  });

  name.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  name.addEventListener("click", (event) => {
    event.stopPropagation();
    focusClosestRow(event.currentTarget);

    if (event.detail >= 2) {
      requestRename(node.id);
      return;
    }

    selectNode(node.id, { shiftKey: event.shiftKey });
    window.requestAnimationFrame(() => {
      findLayerRow(name.ownerDocument, node.id)?.focus({ preventScroll: true });
    });
  });

  name.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestRename(node.id);
  });

  return name;
}

function createRenameButton(node: SceneNode, requestRename: (nodeId: string) => void): HTMLButtonElement {
  const button = document.createElement("button");

  button.className = "primitive-list-rename-button";
  button.type = "button";
  button.title = "Rename";
  button.ariaLabel = `Rename ${node.name}`;
  button.dataset.nodeId = node.id;
  button.textContent = "✎";

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestRename(node.id);
  });

  return button;
}

function createRenameInput(
  node: SceneNode,
  finishRename: (node: SceneNode, input: HTMLInputElement, options: { cancel: boolean }) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  let didFinish = false;

  input.className = "primitive-list-name-input";
  input.dataset.nodeId = node.id;
  input.type = "text";
  input.value = node.name;
  input.spellcheck = false;
  input.ariaLabel = `Rename ${node.name}`;
  input.title = "Enter to save. Escape to cancel.";

  const finishOnce = (options: { cancel: boolean }): void => {
    if (didFinish) {
      return;
    }

    didFinish = true;
    finishRename(node, input, options);
  };

  input.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  input.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  input.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  input.addEventListener("dblclick", (event) => {
    event.stopPropagation();
  });

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      finishOnce({ cancel: false });
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishOnce({ cancel: true });
    }
  });

  input.addEventListener("blur", () => {
    finishOnce({ cancel: false });
  });

  return input;
}

function getPrimitiveListItem(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>(".primitive-list-item");
}

function getGroupToggle(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLButtonElement>(".primitive-list-toggle");
}

function getNodeActionButton(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLButtonElement>(".primitive-list-action-button, .primitive-list-rename-button");
}

function getNodeName(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>(".primitive-list-name");
}

function getRenameInput(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLInputElement>(".primitive-list-name-input");
}

function findRenameInput(list: HTMLOListElement, nodeId: string): HTMLInputElement | null {
  return (
    Array.from(list.querySelectorAll<HTMLInputElement>(".primitive-list-name-input")).find((candidate) => {
      return candidate.dataset.nodeId === nodeId;
    }) ?? null
  );
}

function findLayerRow(document: Document, nodeId: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(".primitive-list-item")).find((candidate) => {
      return candidate.dataset.nodeId === nodeId;
    }) ?? null
  );
}

function hasNodeId(nodes: readonly SceneNode[], nodeId: string): boolean {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return true;
    }

    if (node.type === "group" && hasNodeId(node.children, nodeId)) {
      return true;
    }
  }

  return false;
}

function focusClosestRow(target: EventTarget | null): void {
  if (!(target instanceof Element)) {
    return;
  }

  const row = target.closest<HTMLElement>(".primitive-list-item");

  row?.focus({ preventScroll: true });
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

function formatNodeTitle(node: SceneNode): string {
  if (node.type === "group") {
    return `${node.name}: ${node.children.length} nodes`;
  }

  return `${node.name}: ${node.command.kind}, ${formatPrimitiveColor(node.command)}, ${formatPrimitiveSize(node.command)}`;
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) {
    return 255;
  }

  return Math.max(0, Math.min(255, Math.round(alpha)));
}
