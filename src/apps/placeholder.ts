// Per-app tint for thumbnail backdrops and icon tiles: a hue derived from the app id, so an app
// without screenshots still gets a calm, consistent colour behind its own icon.

/** FNV-1a hash of a string. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A hue for an app id (0–359), avoiding muddy yellow-greens. */
export function hueFor(id: string): number {
  const h = hash(id) % 300;
  return h < 60 ? h : h + 60;
}
