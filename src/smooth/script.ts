// The smoothness check's script (docs/SMOOTHNESS.md, R1): the 30 interactions people do all day.
// Each is measured from its first step until it has settled. Steps either call a backend command
// (the same ones the UI calls) or ask the probe in one surface to act on its page.
import type { DomAct } from "./act";

export type Step =
  | { do: "invoke"; cmd: string; args?: Record<string, unknown> }
  | { do: "dom"; act: DomAct }
  | { do: "wait"; ms: number }
  /** Changes the theme preset through the normal config save, or puts the original back. */
  | { do: "theme"; preset: string | "restore" };

export interface Interaction {
  id: string;
  label: string;
  /** Run before measuring starts (put the UI in the starting state). */
  setup?: Step[];
  steps: Step[];
  /** Time to let the animation finish before the measurement ends. */
  settleMs: number;
  /** Run after measuring (leave things as they were). */
  cleanup?: Step[];
}

const inv = (cmd: string, args?: Record<string, unknown>): Step => ({ do: "invoke", cmd, args });
const dom = (surface: string, kind: DomAct["kind"], selector?: string, more: Partial<DomAct> = {}): Step => ({ do: "dom", act: { surface, kind, selector, ...more } });
const wait = (ms: number): Step => ({ do: "wait", ms });

const qsOpen = (tab: string) => inv("open_quicksettings_tab_cmd", { tab, section: tab });
const hide = (label: string) => inv("hide_surface", { label });
const DOCK_ITEM = ".dock-item-wrap:not(.dock-search-slot):not(.dock-launcher-slot) .dock-item";

export const SMOOTH_SCRIPT: Interaction[] = [
  { id: "qs-open", label: "Quick Settings opens", steps: [qsOpen("quick")], settleMs: 700 },
  { id: "qs-section", label: "Quick Settings: switch section", steps: [qsOpen("audio")], settleMs: 600 },
  { id: "qs-close", label: "Quick Settings closes", steps: [hide("quicksettings")], settleMs: 600 },
  { id: "calendar-open", label: "Calendar flyout opens", steps: [qsOpen("calendar")], settleMs: 700 },
  { id: "calendar-close", label: "Calendar flyout closes", steps: [hide("quicksettings")], settleMs: 600 },
  { id: "notifs-open", label: "Notification Center opens", steps: [qsOpen("notifications")], settleMs: 700 },
  { id: "notifs-close", label: "Notification Center closes", steps: [hide("quicksettings")], settleMs: 600 },
  {
    id: "toast-in",
    label: "Notification toast slides in",
    steps: [inv("push_notification_cmd", { title: "Smoothness check", body: "This toast is part of the test.", appName: "Lens", category: "system" })],
    settleMs: 900,
  },
  { id: "toast-out", label: "Notification toast leaves", steps: [dom("notifications", "click", "[aria-label='Dismiss notification']")], settleMs: 800 },
  { id: "widgets-open", label: "Widget drawer opens", steps: [inv("open_surface", { label: "widgets" })], settleMs: 700 },
  { id: "widgets-close", label: "Widget drawer closes", steps: [hide("widgets")], settleMs: 600 },
  { id: "dock-sweep", label: "Dock: pointer sweep (magnify)", steps: [dom("dock", "sweep", ".dock-pill, .dock-row", { ms: 1400 })], settleMs: 1700 },
  { id: "dock-hover-card", label: "Dock: hover card appears", steps: [dom("dock", "hover", `${DOCK_ITEM}.is-running, ${DOCK_ITEM}`)], settleMs: 800 },
  { id: "dock-hover-card-out", label: "Dock: hover card leaves", steps: [dom("dock", "unhover", `${DOCK_ITEM}.is-running, ${DOCK_ITEM}`)], settleMs: 600 },
  { id: "dock-menu", label: "Dock: right-click menu opens", steps: [dom("dock", "context", DOCK_ITEM)], settleMs: 600 },
  { id: "dock-menu-close", label: "Dock: right-click menu closes", steps: [dom("dock", "key", undefined, { key: "Escape" })], settleMs: 500 },
  { id: "dock-search-open", label: "Dock search expands", steps: [dom("dock", "click", ".dock-search-mag-btn")], settleMs: 900 },
  { id: "dock-search-close", label: "Dock search collapses", steps: [dom("dock", "key", undefined, { key: "Escape" })], settleMs: 800 },
  { id: "topbar-search-open", label: "Top Bar search opens", steps: [inv("sync_topbar_search_cmd", { query: "", open: true })], settleMs: 800 },
  { id: "topbar-search-close", label: "Top Bar search closes", steps: [inv("sync_topbar_search_cmd", { query: "", open: false })], settleMs: 700 },
  { id: "settings-open", label: "Settings opens from the Dock", steps: [inv("open_surface", { label: "settings" })], settleMs: 900 },
  { id: "settings-page", label: "Settings: switch page", steps: [dom("settings", "click", ".cc-nav-btn[data-page]", { nth: 2 }), wait(450), dom("settings", "click", ".cc-nav-btn[data-page]", { nth: 1 })], settleMs: 600 },
  { id: "settings-scroll", label: "Settings: scroll a page", steps: [dom("settings", "scroll", ".cc-content, .sh-content", { ms: 900 })], settleMs: 1100 },
  { id: "settings-more", label: "Settings: More options expands", steps: [dom("settings", "click", ".ss-more-btn")], settleMs: 700, cleanup: [dom("settings", "click", ".ss-more-btn"), wait(400)] },
  { id: "settings-mode", label: "Settings: Simple / Advanced switch", steps: [dom("settings", "click", ".ss-pill-btn:not(.on)")], settleMs: 700, cleanup: [dom("settings", "click", ".ss-pill-btn:not(.on)"), wait(500)] },
  { id: "theme-switch", label: "Theme switch", setup: [wait(200)], steps: [{ do: "theme", preset: "graphite" }], settleMs: 1200, cleanup: [{ do: "theme", preset: "restore" }, wait(900)] },
  { id: "settings-close", label: "Settings closes", steps: [hide("settings")], settleMs: 700 },
  { id: "command-open", label: "Lens Command opens", steps: [inv("show_command_cmd", { payload: { layout: "full", mode: "do", text: "" } })], settleMs: 900 },
  { id: "command-close", label: "Lens Command closes", steps: [dom("command", "key", undefined, { key: "Escape" })], settleMs: 700, cleanup: [hide("command")] },
  { id: "launcher", label: "Launcher opens and closes", steps: [inv("toggle_surface", { label: "launcher" }), wait(700), inv("toggle_surface", { label: "launcher" })], settleMs: 700 },
];

export const SCRIPT_LABELS: Record<string, string> = Object.fromEntries(SMOOTH_SCRIPT.map((i) => [i.id, i.label]));

/** Rough run time of the whole script in seconds (shown before starting). */
export function scriptSeconds(script: Interaction[] = SMOOTH_SCRIPT): number {
  const ms = (steps: Step[] = []) => steps.reduce((n, s) => n + (s.do === "wait" ? s.ms : 120), 0);
  return Math.round(script.reduce((n, i) => n + ms(i.setup) + ms(i.steps) + i.settleMs + ms(i.cleanup) + 350, 0) / 1000);
}
