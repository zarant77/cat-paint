export function getShortcutLabel(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => {
      if (part === "mod") {
        return "Ctrl/Cmd";
      }

      if (part === "shift") {
        return "Shift";
      }

      if (part === "escape") {
        return "Esc";
      }

      if (part === "delete") {
        return "Delete";
      }

      if (part === "backspace") {
        return "Backspace";
      }

      if (part === "space") {
        return "Space";
      }

      return part.toUpperCase();
    })
    .join("+");
}

export function tooltip(label: string, shortcut: string): string {
  return `${label} - ${getShortcutLabel(shortcut)}`;
}
