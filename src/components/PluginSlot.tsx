import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PluginBridge, buildPluginDocument, lockDownFrames, readThemeVars, PLUGIN_ALLOW, PLUGIN_SANDBOX } from "../plugins/host";
import type { PendingApproval, PluginInfo, PluginSlotId } from "../plugins/types";
import { PLUGINS_CHANGED_EVENT } from "../plugins/types";
import "../plugins/plugins.css";

interface SlotProps {
  slot: PluginSlotId;
}

/**
 * Renders every enabled plugin for one slot. Renders nothing (and costs nothing) when no
 * plugin is enabled for it. Mount once per slot: Top Bar left/right, Dock, Widget Drawer.
 */
export const PluginSlot: React.FC<SlotProps> = ({ slot }) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);

  const refresh = useCallback(() => {
    invoke<PluginInfo[]>("list_plugins_cmd")
      .then((list) => setPlugins((list ?? []).filter((p) => p.enabled && p.manifest?.slot === slot)))
      .catch(() => setPlugins([]));
    invoke<PendingApproval[]>("list_plugin_approvals_cmd")
      .then((p) => setPending(p ?? []))
      .catch(() => setPending([]));
  }, [slot]);

  useEffect(() => {
    refresh();
    const un = listen(PLUGINS_CHANGED_EVENT, refresh);
    return () => {
      un.then((fn) => fn());
    };
  }, [refresh]);

  if (plugins.length === 0) return null;
  lockDownFrames();

  return (
    <div className={`lens-plugin-slot lens-plugin-slot--${slot}`}>
      {plugins.map((p) => (
        <PluginFrame
          key={`${p.id}@${p.manifest!.version}`}
          info={p}
          slot={slot}
          pending={pending.filter((x) => x.pluginId === p.id)}
          onChanged={refresh}
        />
      ))}
    </div>
  );
};

interface FrameProps {
  info: PluginInfo;
  slot: PluginSlotId;
  pending: PendingApproval[];
  onChanged: () => void;
}

const PluginFrame: React.FC<FrameProps> = ({ info, slot, pending, onChanged }) => {
  const manifest = info.manifest!;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<PluginBridge | null>(null);
  const grantsRef = useRef<string[]>(info.grants);
  grantsRef.current = info.grants;
  const [html, setHtml] = useState<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<string>("read_plugin_entry_cmd", { id: manifest.id })
      .then((h) => alive && setHtml(buildPluginDocument(h ?? "", readThemeVars())))
      .catch((e) => alive && setStopped(String(e)));
    return () => {
      alive = false;
    };
  }, [manifest.id, manifest.version]);

  // Bridge, ticks and theme updates. Created once the srcdoc frame exists.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !html) return;
    const bridge = new PluginBridge(frame, {
      manifest,
      grants: () => grantsRef.current,
      onStop: (reason) => setStopped(`Stopped: ${reason}`),
      onApprovalRequested: onChanged,
    });
    bridgeRef.current = bridge;
    let tick: number | undefined;
    if (manifest.refreshIntervalMs > 0) {
      tick = window.setInterval(() => {
        if (!document.hidden) bridge.emit("tick", Date.now());
      }, manifest.refreshIntervalMs);
    }
    const unTheme = listen("lens://config-updated", () => {
      // Let useLensState apply the new tokens first, then pass them on.
      window.requestAnimationFrame(() => bridge.emit("theme", readThemeVars()));
    });
    const onLoad = () => bridge.emit("theme", readThemeVars());
    frame.addEventListener("load", onLoad);
    return () => {
      if (tick) window.clearInterval(tick);
      frame.removeEventListener("load", onLoad);
      unTheme.then((fn) => fn());
      bridge.dispose();
      bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, manifest.id, manifest.refreshIntervalMs]);

  const size = useMemo(() => {
    if (slot === "widgets") return { width: "100%", height: `${manifest.height ?? 120}px` };
    if (slot === "dock") return { width: "100%", height: "100%" };
    return { width: `${manifest.width ?? 80}px`, height: "26px" };
  }, [slot, manifest.width, manifest.height]);

  const frame = stopped ? (
    <span className="lens-plugin-stopped" role="status" aria-label={`${manifest.name}: ${stopped}`}>
      !
    </span>
  ) : html ? (
    <iframe
      ref={frameRef}
      className="lens-plugin-frame"
      aria-label={manifest.name}
      sandbox={PLUGIN_SANDBOX}
      allow={PLUGIN_ALLOW}
      referrerPolicy="no-referrer"
      srcDoc={html}
      style={size}
    />
  ) : null;

  const resolve = (grant: string, allow: boolean) =>
    invoke("resolve_plugin_approval_cmd", { id: manifest.id, grant, allow })
      .catch(() => {})
      .finally(onChanged);

  if (slot === "widgets") {
    return (
      <section className="lens-plugin-card" aria-label={manifest.name}>
        <div className="lens-plugin-card-head">
          <span>{manifest.name}</span>
        </div>
        {frame}
        {pending.slice(0, 1).map((p) => (
          <div key={p.grant} className="lens-plugin-approval">
            <span>Wants to {p.label}</span>
            <button type="button" className="cc-btn" onClick={() => resolve(p.grant, true)}>
              Allow
            </button>
            <button type="button" className="cc-btn-ghost" onClick={() => resolve(p.grant, false)}>
              Deny
            </button>
          </div>
        ))}
      </section>
    );
  }

  if (slot === "dock") {
    return (
      <div className="dock-item-wrap">
        <div className="dock-item lens-plugin-dock-tile" aria-label={manifest.name}>
          {frame}
        </div>
        {pending.length > 0 && <span className="lens-plugin-badge" aria-label="Waiting for your approval in Control Center" />}
      </div>
    );
  }

  return (
    <div className="lens-plugin-bar-item" aria-label={manifest.name}>
      {frame}
      {pending.length > 0 && <span className="lens-plugin-badge" aria-label="Waiting for your approval in Control Center" />}
    </div>
  );
};
