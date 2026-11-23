/**
 * Islands dock geometry (pure): splits a full-width bar into separate rounded islands —
 * left (launcher + workspaces), centre (apps), right (tray + clock) — plus optional centre chips
 * (media, weather). Empty sections are dropped. Used by the Islands Dock, its previews and tests.
 */

export type IslandId = "left" | "apps" | "chips" | "right";

export interface IslandInput {
  /** Screen (work-area) width in px. */
  width: number;
  edge?: "bottom" | "top";
  /** Bar height in px. */
  height?: number;
  /** Outer margin from the screen edge and sides. */
  margin?: number;
  /** Natural content widths; 0 or undefined = section hidden. */
  left?: number;
  apps?: number;
  chips?: number;
  right?: number;
}

export interface IslandRect {
  id: IslandId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IslandLayout {
  islands: IslandRect[];
  /** Height reserved at the screen edge (bar + margins). */
  reserved: number;
  /** True when apps had to shrink to fit (search/voice morph stays inside this width). */
  appsCompressed: boolean;
}

const GAP = 12;

export function islandsLayout(input: IslandInput): IslandLayout {
  const width = Math.max(320, Math.round(input.width));
  const h = Math.round(input.height ?? 48);
  const m = Math.round(input.margin ?? 8);
  // Islands sit inside a strip of `reserved` px at the chosen edge; y is within that strip,
  // so the geometry is identical for top and bottom bars.
  const reserved = h + m * 2;
  const top = m; // y within the reserved strip
  const want = (v?: number) => (v && v > 0 ? Math.round(v) : 0);
  const L = want(input.left);
  const R = want(input.right);
  const C = want(input.chips);
  let A = want(input.apps);

  const islands: IslandRect[] = [];
  if (L) islands.push({ id: "left", x: m, y: top, w: L, h });
  if (R) islands.push({ id: "right", x: width - m - R, y: top, w: R, h });

  const leftEdge = m + (L ? L + GAP : 0);
  const rightEdge = width - m - (R ? R + GAP : 0);
  const free = Math.max(0, rightEdge - leftEdge);
  // Chips are optional: they only show when the apps island still fits at its natural width.
  const chipsW = C && A + C + GAP <= free ? C : 0;
  const appsRoom = Math.max(0, free - (chipsW ? chipsW + GAP : 0));
  let appsCompressed = false;
  if (A > appsRoom) {
    A = appsRoom;
    appsCompressed = true;
  }
  if (A) {
    // Centre the apps island on the screen when there is room, otherwise inside the free span.
    const centred = Math.round((width - A) / 2);
    const minX = leftEdge;
    const maxX = rightEdge - A - (chipsW ? chipsW + GAP : 0);
    const x = Math.min(Math.max(centred, minX), Math.max(minX, maxX));
    islands.push({ id: "apps", x, y: top, w: A, h });
    if (chipsW) islands.push({ id: "chips", x: x + A + GAP, y: top, w: chipsW, h });
  } else if (chipsW) {
    islands.push({ id: "chips", x: Math.round((width - chipsW) / 2), y: top, w: chipsW, h });
  }
  islands.sort((a, b) => a.x - b.x);
  return { islands, reserved, appsCompressed };
}

/** True when no two islands overlap and all sit inside [0, width]. */
export function islandsValid(layout: IslandLayout, width: number): boolean {
  const s = [...layout.islands].sort((a, b) => a.x - b.x);
  for (let i = 0; i < s.length; i++) {
    if (s[i].x < 0 || s[i].x + s[i].w > width || s[i].w <= 0) return false;
    if (i > 0 && s[i - 1].x + s[i - 1].w > s[i].x) return false;
  }
  return true;
}
