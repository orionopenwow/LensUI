/**
 * Window-count marks under Dock icons (every style): one short dash for one window, three small
 * dots for two or more. The attention (urgent) and focused looks are separate classes on the same
 * mark, so they combine with either shape.
 */
export type WindowMark = "none" | "dash" | "dots";

/** The mark for an app with `count` open windows. Bad input (NaN, negative) counts as none. */
export function windowMark(count: number): WindowMark {
  if (!Number.isFinite(count) || count < 1) return "none";
  return count === 1 ? "dash" : "dots";
}

/** Extra class for the `.dock-indicator` element ("" for a dash, so today's look is unchanged). */
export function windowMarkClass(count: number): string {
  return windowMark(count) === "dots" ? "is-multi" : "";
}

/** Spoken form for screen readers, e.g. ", 3 windows". Empty for none or one. */
export function windowMarkLabel(count: number): string {
  return windowMark(count) === "dots" ? `, ${Math.floor(count)} windows` : "";
}
