// Lens Command's way into the Magic Dashboard (owner decision: Top Bar button + Command, no new
// hotkey). `/dashboard` is offered only while magicWaves.dashboard is on; typing "dashboard" or
// "open the dashboard" opens it too. Opening goes through Rust's open_dashboard, which refuses
// while the flag is off.
import { invoke } from "@tauri-apps/api/core";

const STUBS = new WeakSet<object>();

/** True for the phrases that open the Dashboard (exact phrases only, so "dashboard settings"
 *  and questions about dashboards still go to the normal Command flow). */
export function isDashboardPhrase(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  return /^(?:open |show )?(?:the |my )?(?:magic |lens )?dashboard$/.test(t);
}

/** The `/dashboard` tile, when the Dashboard is on and no user template already uses the word. */
export function dashboardTemplates(taken: { id: string }[], on: boolean) {
  if (!on || taken.some((t) => t.id === "dashboard")) return [];
  const t = {
    id: "dashboard",
    name: "Dashboard",
    description: "Open the Magic Dashboard: inbox, feeds, today, Shelf and now playing.",
    template: "",
    provider: "local",
    input: "none",
    options: [] as string[],
    output: "action",
    builtin: true,
    enabled: true,
  };
  STUBS.add(t);
  return [t];
}

export const isDashboardStub = (t: object | null | undefined) => !!t && STUBS.has(t);

/** Opens the Dashboard; returns a line for Command if it couldn't. */
export async function openDashboard(): Promise<string | null> {
  try {
    await invoke("open_dashboard");
    return null;
  } catch (e) {
    return typeof e === "string" ? e : "The Dashboard couldn't open.";
  }
}
