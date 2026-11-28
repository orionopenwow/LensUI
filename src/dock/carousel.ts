/**
 * Window carousel for the Dock hover card (apps with 2+ windows). Pure index logic so it can be
 * unit-tested: stepping wraps, every window gets a signed offset from the current one (0 = centre,
 * -1 / +1 = the neighbours that peek in at the sides, anything further is hidden), and a window
 * that jumps more than one place in a step (the wrap) moves without animating so it never sweeps
 * across the centre.
 */

/** Wraps `i` into 0..n-1 (0 when there is nothing to show). */
export function wrapIndex(i: number, n: number): number {
  if (!Number.isFinite(i) || !Number.isFinite(n) || n <= 0) return 0;
  const k = Math.trunc(i) % Math.trunc(n);
  return k < 0 ? k + Math.trunc(n) : k;
}

/** The index after a step of `delta` (±1 from the arrows, keys and wheel). Wraps both ways. */
export function stepIndex(index: number, n: number, delta: number): number {
  return wrapIndex(index + Math.sign(delta || 0), n);
}

/** Where the carousel starts: the focused window if the app has one, else the first. */
export function initialIndex(windows: readonly { isFocused?: boolean }[]): number {
  const i = windows.findIndex((w) => w.isFocused);
  return i >= 0 ? i : 0;
}

/**
 * Signed offset of window `i` from the current one, the short way round. With two windows the
 * other one is always on the right (+1), so the same window never peeks in on both sides.
 */
export function slideOffset(i: number, index: number, n: number): number {
  if (n <= 1) return 0;
  let d = wrapIndex(i - index, n);
  if (n === 2) return d;
  if (d > n / 2) d -= n;
  return d;
}

/** True when a slide should move without animating (it jumped past the centre in one step). */
export function jumps(prevOffset: number, nextOffset: number): boolean {
  return Math.abs(prevOffset - nextOffset) > 1;
}

/** "2/3" counter text. */
export function counterText(index: number, n: number): string {
  return n > 0 ? `${wrapIndex(index, n) + 1}/${n}` : "0/0";
}

/** The current index after the window list changed (a window closed): stay on the same window
 *  when it is still there, else keep the position, clamped. */
export function reconcileIndex(prevHwnds: readonly number[], prevIndex: number, nextHwnds: readonly number[]): number {
  if (nextHwnds.length === 0) return 0;
  const current = prevHwnds[prevIndex];
  const same = current === undefined ? -1 : nextHwnds.indexOf(current);
  if (same >= 0) return same;
  return Math.min(Math.max(0, prevIndex), nextHwnds.length - 1);
}

/** Debounce for wheel steps (ms between two steps). Compared against event timestamps, no timer. */
export const WHEEL_STEP_MS = 140;

/** One wheel event → -1, 0 or +1 (vertical or horizontal wheel, whichever is larger). */
export function wheelStep(deltaX: number, deltaY: number, lastAt: number, now: number): number {
  if (now - lastAt < WHEEL_STEP_MS) return 0;
  const d = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (!Number.isFinite(d) || Math.abs(d) < 1) return 0;
  return d > 0 ? 1 : -1;
}

export type Rect = { x: number; y: number; w: number; h: number };
export type CarouselTile = Rect & { hwnd: number; clip?: Rect; opacity?: number };

/** How dim the neighbours are (matches .dwc-slide.is-side in DockWindowCarousel.css). */
export const SIDE_OPACITY = 0.55;
/** Share of the stage at each side that fades out (the stage's mask); live pictures stop there. */
const FADE = 0.12;

/**
 * Pure: the native preview tiles for the carousel at rest. The current window gets its whole
 * picture; each neighbour gets a live picture too, cut to the part of it that peeks out (between
 * the current window and the faded edge of the stage) and dimmed like the slide, so every window
 * you can see is live. Native thumbnails are drawn by the compositor: nothing is captured or
 * polled, and they are only re-sent when a rectangle changes.
 */
export function carouselTiles(
  stage: Rect,
  current: { hwnd: number; shot: Rect },
  sides: { hwnd: number; offset: number; shot: Rect }[]
): CarouselTile[] {
  const r = (n: number) => Math.round(n);
  const tile = (hwnd: number, a: Rect): CarouselTile => ({ hwnd, x: r(a.x), y: r(a.y), w: r(a.w), h: r(a.h) });
  const out: CarouselTile[] = [tile(current.hwnd, current.shot)];
  const lo = stage.x + stage.w * FADE;
  const hi = stage.x + stage.w * (1 - FADE);
  for (const s of sides) {
    if (Math.abs(s.offset) !== 1) continue;
    const left = s.offset < 0 ? Math.max(lo, s.shot.x) : Math.max(current.shot.x + current.shot.w, s.shot.x);
    const right = s.offset < 0 ? Math.min(current.shot.x, s.shot.x + s.shot.w) : Math.min(hi, s.shot.x + s.shot.w);
    const top = Math.max(stage.y, s.shot.y);
    const bottom = Math.min(stage.y + stage.h, s.shot.y + s.shot.h);
    // Less than a sliver showing: the icon is enough.
    if (right - left < 12 || bottom - top < 12) continue;
    out.push({ ...tile(s.hwnd, s.shot), clip: { x: r(left), y: r(top), w: r(right - left), h: r(bottom - top) }, opacity: SIDE_OPACITY });
  }
  return out;
}
