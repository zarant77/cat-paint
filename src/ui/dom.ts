export function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Element not found: #${id}`);
  }

  return element as T;
}

export function getCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }

  return context;
}
