import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { installFromFolder, installFromZip } from "../plugins/install";
import type { PendingApproval, PluginInfo } from "../plugins/types";
import { PERMISSION_INFO, PLUGINS_CHANGED_EVENT, SLOT_LABELS } from "../plugins/types";
import "../plugins/plugins.css";

/** Control Center card: install, enable, inspect and remove plugins; answer approvals. */
export const PluginManagerCard: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    invoke<PluginInfo[]>("list_plugins_cmd").then((l) => setPlugins(l ?? [])).catch(() => setPlugins([]));
    invoke<PendingApproval[]>("list_plugin_approvals_cmd").then((p) => setPending(p ?? [])).catch(() => setPending([]));
  }, []);

  useEffect(() => {
    refresh();
    const un = listen(PLUGINS_CHANGED_EVENT, refresh);
    return () => {
      un.then((fn) => fn());
    };
  }, [refresh]);

  // webkitdirectory is not in React's attribute types.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      setStatus(label);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const onFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = "";
    if (!list || list.length === 0) return;
    void run("Installed. Turn it on below when you're ready.", () => installFromFolder(list));
  };

  const onZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void run("Installed. Turn it on below when you're ready.", () => installFromZip(file));
  };

  return (
    <div className="cc-card">
      <div className="cc-label">Plugins</div>
      <div className="cc-desc">
        Small widgets for the Top Bar, Dock and Widget Drawer. Each runs in a sealed sandbox with no internet,
        files or system access, and can only use the permissions listed under it.
      </div>

      <div className="lens-pm-actions">
        <button type="button" className="cc-btn" disabled={busy} onClick={() => folderInput.current?.click()}>
          Install from folder
        </button>
        <button type="button" className="cc-btn-ghost" disabled={busy} onClick={() => zipInput.current?.click()}>
          Install from .zip
        </button>
        <button type="button" className="cc-btn-ghost" onClick={() => invoke("open_plugins_folder_cmd").catch(() => {})}>
          Open plugins folder
        </button>
        <input ref={folderInput} type="file" multiple className="lens-visually-hidden" onChange={onFolder} aria-label="Choose a plugin folder" />
        <input ref={zipInput} type="file" accept=".zip" className="lens-visually-hidden" onChange={onZip} aria-label="Choose a plugin .zip file" />
      </div>

      {pending.length > 0 && (
        <div className="lens-pm-list">
          {pending.map((p) => {
            const name = plugins.find((x) => x.id === p.pluginId)?.manifest?.name ?? p.pluginId;
            return (
              <div key={`${p.pluginId}|${p.grant}`} className="cc-row">
                <div>
                  <div className="cc-label">{name} wants to {p.label}</div>
                  <div className="cc-desc">Allow once to let it do this from now on. You can reset approvals anytime.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="cc-btn"
                    onClick={() => void run("Approved.", () => invoke("resolve_plugin_approval_cmd", { id: p.pluginId, grant: p.grant, allow: true }))}
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    className="cc-btn-ghost"
                    onClick={() => void run("Denied.", () => invoke("resolve_plugin_approval_cmd", { id: p.pluginId, grant: p.grant, allow: false }))}
                  >
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="lens-pm-list">
        {plugins.length === 0 && <div className="cc-desc">No plugins installed.</div>}
        {plugins.map((p) => {
          const m = p.manifest;
          return (
            <div key={p.id} className="lens-pm-item">
              <div className="lens-pm-head">
                <div className="lens-pm-title">
                  <span className="lens-pm-name">{m?.name ?? p.id}</span>
                  <span className="lens-pm-meta">
                    {m
                      ? `${SLOT_LABELS[m.slot]} · v${m.version}${m.author ? ` · ${m.author}` : ""}`
                      : "Can't be loaded"}
                  </span>
                </div>
                {m && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.enabled}
                    aria-label={`${p.enabled ? "Turn off" : "Turn on"} ${m.name}`}
                    className={`cc-toggle ${p.enabled ? "on" : ""}`}
                    onClick={() =>
                      void run(p.enabled ? `${m.name} turned off.` : `${m.name} turned on.`, () =>
                        invoke("set_plugin_enabled_cmd", { id: p.id, enabled: !p.enabled })
                      )
                    }
                  />
                )}
              </div>
              {m?.description && <div className="cc-desc">{m.description}</div>}
              {p.error && <div className="lens-pm-error">{p.error}</div>}
              {m && (
                <div className="lens-pm-perms" aria-label="Permissions">
                  {m.permissions.length === 0 ? (
                    <span className="lens-pm-perm">No permissions</span>
                  ) : (
                    m.permissions.map((perm) => {
                      // An unknown permission (e.g. from a hand-edited state file) must not crash the card.
                      const info = PERMISSION_INFO[perm] ?? {
                        label: String(perm),
                        detail: "Unknown permission",
                        sensitive: true,
                      };
                      return (
                        <span
                          key={perm}
                          className={`lens-pm-perm ${info.sensitive ? "is-sensitive" : ""}`}
                          aria-label={`${info.label}: ${info.detail}`}
                        >
                          {info.label}
                        </span>
                      );
                    })
                  )}
                </div>
              )}
              <div className="lens-pm-actions">
                {p.grants.length > 0 && (
                  <button
                    type="button"
                    className="cc-btn-ghost"
                    onClick={() => void run("Approvals reset.", () => invoke("revoke_plugin_grants_cmd", { id: p.id }))}
                  >
                    Reset {p.grants.length} approval{p.grants.length === 1 ? "" : "s"}
                  </button>
                )}
                {confirmRemove === p.id ? (
                  <>
                    <button
                      type="button"
                      className="cc-btn"
                      onClick={() => {
                        setConfirmRemove(null);
                        void run(`${m?.name ?? p.id} removed.`, () => invoke("remove_plugin_cmd", { id: p.id }));
                      }}
                    >
                      Remove for good
                    </button>
                    <button type="button" className="cc-btn-ghost" onClick={() => setConfirmRemove(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="cc-btn-ghost" onClick={() => setConfirmRemove(p.id)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {status && (
        <div className="lens-pm-status" role="status">
          {status}
        </div>
      )}
    </div>
  );
};
