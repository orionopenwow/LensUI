// "Show me": open the right surface, then ask every mounted CoachMarkLayer to find and highlight
// the target. Finding works by stable `data-guide-id` anchors first and falls back to the visible
// label text, so settings work even before the anchors snippet is applied.
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { GuideTarget } from "./types";

export const GUIDE_EVENTS = {
  /** Payload: HighlightRequest. Every surface with a CoachMarkLayer listens. */
  highlight: "lens://guide/highlight",
  /** Payload: string event name (e.g. "palette-opened"), used by lesson checks. */
  event: "lens://guide/event",
  /** Payload: { query?: string; lesson?: string } — opens the Guide panel. */
  open: "lens://guide/open",
} as const;

export interface HighlightRequest {
  target: GuideTarget;
  /** Short tooltip text, e.g. the setting's description. */
  note?: string;
  title?: string;
  ts: number;
}

/** Tauri window labels for each surface. Settings is the Control Center window. */
const SURFACE_WINDOW: Record<string, string | undefined> = {
  settings: "settings",
  command: "command",
  mini: "command",
  palette: "palette",
  guide: "settings",
};

export async function showMe(target: GuideTarget, note?: string, title?: string): Promise<void> {
  const win = SURFACE_WINDOW[target.surface];
  try {
    if (win) await invoke("open_surface", { label: win });
  } catch {
    /* surface may already be open or not exist in this build: highlight anyway */
  }
  if (target.surface === "settings" && target.tab) {
    await emit("lens://settings-tab", target.tab).catch(() => {});
  }
  const req: HighlightRequest = { target, note, title, ts: Date.now() };
  await emit(GUIDE_EVENTS.highlight, req).catch(() => {});
  // Same-window fallback (parity harness, or the Guide panel living inside Settings).
  window.dispatchEvent(new CustomEvent(GUIDE_EVENTS.highlight, { detail: req }));
}

/** Tell lesson checks that something happened ("palette-opened", "command-intent", …). */
export function guideEvent(name: string): void {
  void emit(GUIDE_EVENTS.event, name).catch(() => {});
  window.dispatchEvent(new CustomEvent(GUIDE_EVENTS.event, { detail: name }));
}

const LABEL_SELECTORS = [
  ".cc-label",
  ".cc-section-title",
  ".tux-field-label",
  ".tux-slider-label",
  ".tux-block-head",
  ".tux-h2",
  ".tux-section-title",
  ".ai-card-title",
  ".cs-head",
  ".cc-nav-btn",
].join(",");

const CONTAINER = ".cc-row, .cc-card, .tux-section, .tux-block, section, .cc-nav-btn";

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Open a collapsed Customise section so its contents exist in the DOM. Returns true if clicked. */
export function openSection(root: ParentNode, sectionId: string | undefined): boolean {
  if (!sectionId) return false;
  const head = root.querySelector<HTMLElement>(`[data-cc-section="${CSS.escape(sectionId)}"]`);
  if (head && head.getAttribute("aria-expanded") === "false") {
    head.click();
    return true;
  }
  return false;
}

/** Find the element to highlight for a target, or null if it isn't on this surface. */
export function findTarget(root: ParentNode, target: GuideTarget): HTMLElement | null {
  if (target.anchor) {
    const a = root.querySelector<HTMLElement>(`[data-guide-id="${CSS.escape(target.anchor)}"]`);
    if (a) return a;
  }
  if (target.surface !== "settings") return null;
  if (target.label) {
    const want = norm(target.label);
    const labels = [...root.querySelectorAll<HTMLElement>(LABEL_SELECTORS)];
    const exact = labels.find((el) => norm(el.textContent) === want);
    const partial = exact ?? labels.find((el) => norm(el.textContent).includes(want));
    if (partial) {
      if (partial.matches(".cc-nav-btn")) return partial;
      return (partial.closest(CONTAINER) as HTMLElement | null) ?? partial;
    }
    const aria = root.querySelector<HTMLElement>(`[aria-label="${CSS.escape(target.label)}"]`);
    if (aria) return (aria.closest(CONTAINER) as HTMLElement | null) ?? aria;
  }
  if (target.tab) {
    const nav = root.querySelector<HTMLElement>(`[data-guide-id="settings.nav.${CSS.escape(target.tab)}"]`);
    if (nav) return nav;
  }
  return null;
}

/** Open the Guide (in the Settings window's drawer), optionally with a question or a lesson. */
export async function openGuide(payload: { query?: string; lesson?: string } = {}): Promise<void> {
  try {
    await invoke("open_surface", { label: "settings" });
  } catch {
    /* already open, or running in the harness */
  }
  await emit(GUIDE_EVENTS.open, payload).catch(() => {});
  window.dispatchEvent(new CustomEvent(GUIDE_EVENTS.open, { detail: payload }));
}
