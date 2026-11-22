/** Pure helpers for the Overview's workspace strip (unit-tested in src/__tests__/productivity.test.ts). */

/**
 * Keyboard move target for the selected window, or null when the key isn't a move key.
 * Shift+Left/Right: previous/next workspace (no wrap). Shift+1–9: that workspace.
 * `code` is KeyboardEvent.code, so Shift+digit works on every layout.
 */
export function moveTargetFor(key: string, code: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowLeft") return current > 0 ? current - 1 : null;
  if (key === "ArrowRight") return current < count - 1 ? current + 1 : null;
  const m = /^Digit([1-9])$/.exec(code);
  if (m) {
    const i = Number(m[1]) - 1;
    return i < count && i !== current ? i : null;
  }
  return null;
}

/** Windows per workspace. Windows Lens hasn't placed yet count toward `wsOf`'s answer. */
export function workspaceCounts(hwnds: number[], wsOf: (hwnd: number) => number, count: number): number[] {
  const out = new Array<number>(Math.max(0, count)).fill(0);
  for (const h of hwnds) {
    const i = wsOf(h);
    if (i >= 0 && i < out.length) out[i] += 1;
  }
  return out;
}
