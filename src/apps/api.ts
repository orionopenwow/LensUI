// Failure-tolerant wrappers over the Lens Apps commands (src-tauri/src/commands/apps.rs).
// Every system-changing call is made only from a confirmation the user clicked.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import bundled from "../../catalog/apps/catalog.json";
import type { AppShow, AppsSettings, Catalog, InstalledInfo, PreparedRelease, ProgressEvent, RecipeStepView } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { validateCatalog } from "./validate";
import { oops, quiet } from "../ui/oops";

export const PROGRESS_EVENT = "lens://apps/progress";
export const INTEGRATIONS_EVENT = "lens://apps/integrations";

/** The catalogue from the backend, falling back to the copy bundled into the frontend. */
export async function loadCatalog(): Promise<Catalog> {
  try {
    const c = await invoke<Catalog>("apps_catalog");
    if (c?.apps?.length && validateCatalog(c).length === 0) return c;
  } catch {
    /* fall through */
  }
  return bundled as unknown as Catalog;
}

export async function checkForNewApps(): Promise<{ ok: boolean; message: string }> {
  try {
    await invoke("apps_catalog_refresh");
    return { ok: true, message: "Catalogue updated." };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

export async function installedApps(): Promise<Record<string, InstalledInfo>> {
  try {
    return (await invoke<Record<string, InstalledInfo>>("apps_installed")) ?? {};
  } catch {
    return {};
  }
}

/** What's installed, and why the answer is empty when winget couldn't be asked. */
export async function installedState(): Promise<{ apps: Record<string, InstalledInfo>; error: string | null }> {
  try {
    return { apps: (await invoke<Record<string, InstalledInfo>>("apps_installed")) ?? {}, error: null };
  } catch (e) {
    return { apps: {}, error: String(e) };
  }
}

export const lensInstalled = () => invoke<string[]>("apps_lens_installed").catch(() => [] as string[]);
export const showApp = (appId: string) => invoke<AppShow>("apps_show", { appId });
export const runApp = (appId: string, op: "install" | "upgrade" | "uninstall") => invoke<string>("apps_run", { appId, op });
// Tidying up after a cancel the person already sees: nothing to tell them if it fails.
export const cancelJob = (jobId: string) => invoke("apps_cancel", { jobId }).catch(quiet);
export const prepareRelease = (appId: string) => invoke<PreparedRelease>("apps_release_prepare", { appId });
export const runRelease = (token: string) => invoke("apps_release_run", { token });
export const discardRelease = (token: string) => invoke("apps_release_discard", { token }).catch(quiet);
export const openApp = (appId: string) => invoke("apps_open", { appId });
export const openLink = (appId: string, url: string) => invoke("apps_open_link", { appId, url });
export const revealApp = (appId: string) => invoke("apps_reveal", { appId });
/** Removes a portable app Lens keeps in its own apps folder (no Windows uninstaller involved). */
export const removePortable = (appId: string) => invoke("apps_portable_remove", { appId });
export const recipePreview = (appId: string) => invoke<RecipeStepView[]>("apps_recipe_preview", { appId });
export const applyRecipe = (appId: string, chosen: number[]) => invoke("apps_recipe_apply", { appId, chosen });
export const revertRecipe = (appId: string) => invoke("apps_recipe_revert", { appId });
export const auditLog = (limit = 100) => invoke<Record<string, unknown>[]>("apps_audit", { limit }).catch(() => []);

export async function loadSettings(): Promise<AppsSettings> {
  try {
    return { ...DEFAULT_SETTINGS, ...(await invoke<AppsSettings>("apps_settings_get")) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export const saveSettings = (settings: AppsSettings) => invoke("apps_settings_set", { settings }).catch(oops("save that setting"));

export function onProgress(cb: (e: ProgressEvent) => void): Promise<UnlistenFn> {
  return listen<ProgressEvent>(PROGRESS_EVENT, (e) => cb(e.payload)).catch(() => () => {});
}

/** Starts a job and resolves when it finishes (true if it succeeded). Used for sequential batches. */
export async function runAndWait(appId: string, op: "install" | "upgrade" | "uninstall"): Promise<boolean> {
  let unlisten: UnlistenFn | undefined;
  try {
    let jobId: string | null = null;
    const buffered: ProgressEvent[] = [];
    const done = new Promise<boolean>((resolve) => {
      const check = (e: ProgressEvent) => {
        if (e.jobId === jobId && (e.stage === "done" || e.stage === "failed")) resolve(e.stage === "done");
      };
      onProgress((e) => (jobId ? check(e) : buffered.push(e))).then((u) => {
        unlisten = u;
      });
      runApp(appId, op).then(
        (id) => {
          jobId = id;
          buffered.forEach(check);
        },
        () => resolve(false),
      );
    });
    return await done;
  } finally {
    unlisten?.();
  }
}
