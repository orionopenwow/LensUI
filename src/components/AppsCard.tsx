// Settings › Apps: the catalogue, how updates work (manual by default, with an opt-in "Update apps
// automatically" that is off by default: B-122), thumbnails, the audit log and "Remove everything
// Lens installed". Mount snippet: docs/LENS_APPS.md §1.
import { useEffect, useState } from "react";
import { toast } from "../ui/toastBus";
import { auditLog, checkForNewApps, lensInstalled, loadCatalog, loadSettings, runAndWait, saveSettings } from "../apps/api";
import type { AppsSettings, Catalog } from "../apps/types";
import { DEFAULT_SETTINGS } from "../apps/types";
import "../apps/apps.css";
import "../apps/apps-settings.css";

function fmt(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(ms);
  }
}

export function AppsCard({ demo }: { demo?: { settings?: AppsSettings; installed?: string[]; audit?: Record<string, unknown>[]; catalog?: Catalog } }) {
  const [settings, setSettings] = useState<AppsSettings>(demo?.settings ?? DEFAULT_SETTINGS);
  const [mine, setMine] = useState<string[]>(demo?.installed ?? []);
  const [audit, setAudit] = useState<Record<string, unknown>[]>(demo?.audit ?? []);
  const [catalog, setCatalog] = useState<Catalog | null>(demo?.catalog ?? null);
  const [refresh, setRefresh] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (demo) return;
    loadSettings().then(setSettings);
    lensInstalled().then(setMine);
    auditLog(50).then(setAudit);
    loadCatalog().then(setCatalog);
  }, [demo]);

  const update = (patch: Partial<AppsSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };
  const nameOf = (id: string) => catalog?.apps.find((a) => a.id === id)?.name ?? id;
  const removable = mine.filter((id) => catalog?.apps.find((a) => a.id === id)?.install.method === "winget");

  return (
    <div className="cc-card la-card-settings">
      <div className="la-setting">
        <div className="la-setting-text">
          <span className="la-block-title">Apps</span>
          <span className="la-fine">
            The catalogue ships with Lens{catalog ? ` (${catalog.apps.length} apps, ${catalog.updated})` : ""}. Nothing installs without your click.
          </span>
        </div>
        <button className="la-btn" data-weight="medium" onClick={async () => setRefresh((await checkForNewApps()).message)}>
          Check for new apps
        </button>
      </div>
      {refresh && <div className="la-fine">{refresh}</div>}

      <label className="la-setting">
        <span className="la-setting-text">
          <span>Update apps automatically</span>
          <span className="la-fine">
            Off by default. Lens checks when you open Lens Apps or press Check again, and shows Update available with a one-click Update; nothing updates by itself. On: each check also
            updates the apps Lens installed through winget, from the same source, and lists them in Activity below. Apps you installed yourself always wait for you.
          </span>
        </span>
        <input type="checkbox" checked={settings.autoUpdate === true} onChange={(e) => update({ autoUpdate: e.target.checked })} />
      </label>
      <label className="la-setting">
        <span className="la-setting-text">
          <span>Live thumbnails</span>
          <span className="la-fine">Loads each project's official screenshots or demo from its own site. Off shows dithered placeholders.</span>
        </span>
        <input type="checkbox" checked={settings.liveThumbnails} onChange={(e) => update({ liveThumbnails: e.target.checked })} />
      </label>
      <label className="la-setting">
        <span className="la-setting-text">
          <span>Show free tools that aren't open source</span>
          <span className="la-fine">Obsidian, Everything and LM Studio.</span>
        </span>
        <input type="checkbox" checked={settings.showNonOpenSource} onChange={(e) => update({ showNonOpenSource: e.target.checked })} />
      </label>
      <div className="la-fine">Apps install for your Windows user where each installer puts them (usually Program Files or AppData). Lens never elevates; installers ask Windows for permission if they need it.</div>

      <div className="la-label">Activity</div>
      <div className="la-audit la-mono">
        {audit.length === 0 && <span className="la-muted">Nothing yet.</span>}
        {audit.map((e, i) => (
          <div key={i} className="la-audit-line">
            <span className="la-muted">{fmt(Number(e.atMs))}</span>
            <span>{String(e.action)}</span>
            <span>{nameOf(String(e.appId))}</span>
            <span className={e.result === "ok" ? "la-ok" : e.result === "failed" ? "la-warn-inline" : "la-muted"}>{String(e.result)}</span>
          </div>
        ))}
      </div>

      <div className="la-setting">
        <span className="la-setting-text">
          <span>Remove everything Lens installed</span>
          <span className="la-fine">{removable.length ? `${removable.map(nameOf).join(", ")}.` : "Lens hasn't installed any apps."} Apps you had before Lens are never touched.</span>
        </span>
        {!confirmRemove ? (
          <button className="la-btn" data-weight="medium" disabled={!removable.length} onClick={() => setConfirmRemove(true)}>
            Review…
          </button>
        ) : (
          <div className="la-actions">
            <button className="la-btn" data-weight="medium" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
            <button
              className="la-btn la-btn-primary la-btn-danger"
              data-weight="heavy"
              onClick={async () => {
                setConfirmRemove(false);
                // One at a time; each runs the app's own uninstaller and waits for it to finish.
                const left: string[] = [];
                for (const id of removable) if (!(await runAndWait(id, "uninstall"))) left.push(nameOf(id));
                if (left.length) toast.error(`Couldn't uninstall ${left.join(", ")}. ${left.length === 1 ? "It's" : "They're"} still installed.`);
                lensInstalled().then(setMine);
                auditLog(50).then(setAudit);
              }}
            >
              Uninstall {removable.length}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
