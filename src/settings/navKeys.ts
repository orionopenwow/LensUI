// Keyboard rules for the Settings sidebar (roving ↑/↓/Home/End) and for the page heading that
// takes focus after a page is picked there. Pure apart from focusing; tested in
// settingsQuickWins.test.ts.

/** Where ↑/↓/Home/End move from position `i` in a list of `n` (wrapping), or null for other keys. */
export function stepIndex(i: number, n: number, key: string): number | null {
  if (n <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  if (key === "ArrowDown") return i < 0 ? 0 : (i + 1) % n;
  if (key === "ArrowUp") return i < 0 ? n - 1 : (i - 1 + n) % n;
  return null;
}

const NAV_ITEMS = ".sh-nav .cc-nav-btn[data-page]";

/**
 * After a page opens from the sidebar, focus is on its heading. ↑/↓ there go back to the sidebar
 * and move one entry from the open page, so walking the list with the arrows and Enter keeps
 * working; Tab goes on into the page, and Home/End/Page keys still scroll it. Returns whether the
 * key was used.
 */
export function stepSidebarFromHeading(key: string, root: ParentNode = document): boolean {
  if (key !== "ArrowUp" && key !== "ArrowDown") return false;
  const items = Array.from(root.querySelectorAll<HTMLButtonElement>(NAV_ITEMS));
  const at = items.findIndex((b) => b.getAttribute("aria-current") === "page");
  const next = stepIndex(at, items.length, key);
  if (next === null) return false;
  items[next]?.focus();
  return true;
}
