export function sanitizeSpriteId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function toCSymbol(value: string): string {
  const safe = sanitizeSpriteId(value).replace(/-/g, "_");

  if (/^[0-9]/.test(safe)) {
    return `sprite_${safe}`;
  }

  return safe || "sprite";
}
