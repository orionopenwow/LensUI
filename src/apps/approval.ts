// Lens Apps → the shared approval card. The popover next to the pill stays where it is; the same
// confirmation is also put in the shared queue (pill, approval window) with this card. Pure.
import type { ApprovalPreview } from "../approval/model";
import type { PopoverMode } from "./ActionPill";
import type { CatalogApp, PreparedRelease } from "./types";

const VERB: Record<PopoverMode, string> = { get: "Get", update: "Update", uninstall: "Uninstall", run: "Run installer" };

/** Stable id for one open confirmation (one per app and action). */
export function approvalReference(appId: string, mode: PopoverMode): string {
  return `app:${appId}:${mode}`;
}

export function approvalText(app: Pick<CatalogApp, "name"> & { install?: CatalogApp["install"] }, mode: PopoverMode): string {
  const portable = !!(app.install as { portable?: boolean } | undefined)?.portable;
  if (mode === "run") return portable ? `Keep ${app.name} in Lens's apps folder` : `Run the installer for ${app.name}`;
  return `${VERB[mode]} ${app.name}`;
}

/** The card for a Lens Apps confirmation. `target` is the app that is actually installed
 *  (a suite's manager when the app installs through one). */
export function appApprovalPreview(target: CatalogApp, mode: PopoverMode, prepared?: PreparedRelease | null): ApprovalPreview {
  const details: { label: string; value: string }[] = [];
  const install = target.install as { method: string; wingetId?: string; repo?: string };
  if (mode === "run" && prepared) {
    details.push({ label: "File", value: prepared.fileName });
    details.push({ label: "Checksum", value: prepared.checksum === "verified" ? "matches published SHA-256" : "none published" });
    details.push({
      label: "Signature",
      value: prepared.signatureStatus === "Valid" ? `signed · ${prepared.publisher ?? "trusted"}` : prepared.signatureStatus === "NotSigned" ? "not signed" : String(prepared.signatureStatus),
    });
  } else if (install.method === "winget" && install.wingetId) {
    details.push({ label: "Source", value: `winget · ${install.wingetId}` });
  } else if (install.method === "githubRelease" && install.repo) {
    details.push({ label: "Source", value: `github.com/${install.repo}` });
  }
  if (target.license) details.push({ label: "Licence", value: target.license });
  const unsigned = mode === "run" && !!prepared && prepared.signatureStatus !== "Valid";
  return {
    question: `${approvalText(target, mode)}?`,
    reason:
      mode === "uninstall"
        ? (target.install as { portable?: boolean }).portable
          ? "Deletes the copy Lens keeps in its apps folder."
          : "Runs the app's own uninstaller."
        : mode === "run"
          ? (target.install as { portable?: boolean }).portable
            ? "Downloaded from its GitHub release and checked. Lens keeps it in its own apps folder; nothing runs until you open it."
            : "Downloaded from its GitHub release and checked. Nothing runs until you say so."
          : "Installs from the source below after it is checked.",
    verb: mode === "run" && (target.install as { portable?: boolean }).portable ? "Keep it" : VERB[mode],
    denyLabel: "Cancel",
    kind: "none",
    details,
    // Installing can be undone by uninstalling; an uninstall or a run can't be taken back here.
    reversible: mode === "get" || mode === "update",
    noUndoLine: true,
    risk: unsigned || mode === "uninstall" ? "confirm" : "low",
    holdToConfirm: unsigned,
    capabilities: [],
    source: { client: "lens-apps", kind: "internal", label: "Lens Apps" },
    tone: unsigned || mode === "uninstall" ? "danger" : "trusted",
  };
}
