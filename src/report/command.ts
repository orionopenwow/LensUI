/**
 * Lens Command's `/report` ("report a bug") and `/update` ("restart to update"). A user template
 * that already uses either word wins. Settings does the work; Command only opens it, except
 * `/update` with an update ready, which restarts into it.
 */
import { invoke } from "@tauri-apps/api/core";
import { openSettingsAt } from "../update/useLensUpdate";
import { viewOf, type UpdateStatus } from "../update/model";

const STUBS = new WeakSet<object>();

const stub = (id: string, name: string, description: string) => {
  const t = {
    id,
    name,
    description,
    template: "",
    provider: "local",
    input: "none",
    options: [] as string[],
    output: "action",
    builtin: true,
    enabled: true,
  };
  STUBS.add(t);
  return t;
};

export function lensAppTemplates(taken: { id: string }[]) {
  const out = [];
  if (!taken.some((t) => t.id === "report")) out.push(stub("report", "Report a problem", "Tell us what went wrong. You see the whole report before it's shared."));
  if (!taken.some((t) => t.id === "update")) out.push(stub("update", "Update Lens", "Check for a Lens update, or restart into one that's ready."));
  return out;
}

export const isLensAppStub = (t: object | null | undefined) => !!t && STUBS.has(t);

/** Runs `/report` or `/update`; returns a line for Command to show. */
export async function runLensAppSlash(id: string): Promise<string> {
  if (id === "report") {
    await openSettingsAt("about#report");
    return "Opening Report a problem…";
  }
  const status = await invoke<UpdateStatus>("get_update_state_cmd").catch(() => null);
  if (status && viewOf(status).action === "restart") {
    await invoke("restart_to_update_cmd");
    return `Restarting into Lens ${status.newVersion ?? ""}…`;
  }
  await openSettingsAt("about#updates");
  await invoke("check_for_update_cmd").catch(() => {});
  return "Checking for updates…";
}
