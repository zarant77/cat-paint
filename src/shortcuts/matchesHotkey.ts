export function matchesHotkey(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const wantsShift = parts.includes("shift");
  const wantsMod = parts.includes("mod");
  const wantsAlt = parts.includes("alt");
  const isMod = event.metaKey || event.ctrlKey;

  if (event.shiftKey !== wantsShift) {
    return false;
  }

  if (isMod !== wantsMod) {
    return false;
  }

  if (event.altKey !== wantsAlt) {
    return false;
  }

  return normalizeKey(event) === key;
}

function normalizeKey(event: KeyboardEvent): string {
  if (event.code === "BracketLeft") {
    return "[";
  }

  if (event.code === "BracketRight") {
    return "]";
  }

  if (event.key === " ") {
    return "space";
  }

  return event.key.toLowerCase();
}
