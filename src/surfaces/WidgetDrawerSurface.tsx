import React, { useEffect, useState } from "react";
import { ClipboardPane } from "../components/ClipboardPane";
import { PluginSlot } from "../components/PluginSlot";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, HardDrive, Clock, StickyNote, X, Layers, FolderOpen, Terminal, SlidersHorizontal } from "lucide-react";
import { useLensState, useRunningWindows, useSurfaceGlide } from "../hooks/useLensState";
import { WindowGroups } from "../dock/ai/WindowGroups";
import { AskPanel } from "../ai/AskPanel";
import { aiStatus, type AiContext, type AiStatus } from "../ai/surfaceApi";
import "../dock/ai/aiDock.css";
import type { SystemTelemetry } from "../types/lens";

export const WidgetDrawerSurface: React.FC = () => {
  const { config, updateConfig } = useLensState();
  // "What was I doing?" (docs/AI_SURFACES.md §3d): only while Lens Intelligence is on.
  const aiOn = !!config?.ai?.enabled;
  const runningWindows = useRunningWindows();
  const [aiInfo, setAiInfo] = useState<AiStatus | null>(null);
  const [groupAsk, setGroupAsk] = useState<{ prompt: string; context: AiContext } | null>(null);
  useEffect(() => {
    if (!aiOn) return;
    aiStatus().then(setAiInfo).catch(() => setAiInfo(null));
  }, [aiOn]);
  const glidePhase = useSurfaceGlide("widgets");
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    if (config) setNotesDraft(config.widgets.notes);
  }, [config?.widgets.notes]);

  useEffect(() => {
    const poll = () => {
      invoke<SystemTelemetry>("get_telemetry_cmd")
        .then(setTelemetry)
        .catch(() => {});
    };
    poll();
    const t1 = window.setInterval(poll, 2000);
    const t2 = window.setInterval(() => setNow(new Date()), 1000);
    const onBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus()) {
          invoke("hide_surface", { label: "widgets" }).catch(() => {});
        }
      }, 120);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") invoke("hide_surface", { label: "widgets" }).catch(() => {});
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!config) return null;

  const enabled = new Set(config.widgets.enabledWidgets);

  const saveNotes = () => {
    if (notesDraft !== config.widgets.notes) {
      updateConfig({
        ...config,
        widgets: { ...config.widgets, notes: notesDraft },
      });
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", padding: 8, display: "flex", flexDirection: "column" }}>
      <aside
        className={`lens-glass lens-glide-right ${glidePhase}`}
        style={{
          flex: 1,
          borderRadius: "var(--lens-radius)",
          boxShadow: "var(--lens-shadow-panel)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: "1px solid var(--lens-border)",
          }}
        >
          <span style={{ fontWeight: 600, letterSpacing: "0.01em" }}>Lens Widgets</span>
          <button
            type="button"
            onClick={() => invoke("hide_surface", { label: "widgets" })}
            style={{
              padding: 4,
              borderRadius: 6,
              color: "var(--lens-fg-secondary)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {enabled.has("clock") && (
            <section
              style={{
                padding: 14,
                borderRadius: 12,
                background: "rgb(var(--lens-ink) / 0.04)",
                border: "1px solid var(--lens-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--lens-fg-muted)", fontSize: 11, marginBottom: 4 }}>
                <Clock size={12} /> CLOCK
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <div style={{ color: "var(--lens-fg-secondary)", fontSize: 12 }}>
                {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
              </div>
            </section>
          )}

          {enabled.has("telemetry") && telemetry && (
            <section
              style={{
                padding: 14,
                borderRadius: 12,
                background: "rgb(var(--lens-ink) / 0.04)",
                border: "1px solid var(--lens-border)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--lens-fg-muted)", fontSize: 11 }}>
                <Cpu size={12} /> SYSTEM TELEMETRY
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>CPU</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{telemetry.cpuUsage.toFixed(0)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "rgb(var(--lens-ink) / 0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.min(100, telemetry.cpuUsage)}%`,
                      height: "100%",
                      background: "var(--lens-accent)",
                      transition: "width 400ms ease",
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <HardDrive size={12} /> Memory
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {telemetry.memUsedGb} / {telemetry.memTotalGb} GB
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "rgb(var(--lens-ink) / 0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.min(100, telemetry.memPercent)}%`,
                      height: "100%",
                      background: "var(--lens-accent)",
                      transition: "width 400ms ease",
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: 11, color: "var(--lens-fg-muted)" }}>
                Uptime: {Math.floor(telemetry.uptimeMinutes / 60)}h {telemetry.uptimeMinutes % 60}m
              </div>
            </section>
          )}

          {enabled.has("quick-actions") && (
            <section
              style={{
                padding: 12,
                borderRadius: 12,
                background: "rgb(var(--lens-ink) / 0.04)",
                border: "1px solid var(--lens-border)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "overview" })}
                style={{
                  padding: "9px 10px",
                  borderRadius: 9,
                  background: "rgb(var(--lens-ink) / 0.05)",
                  border: "1px solid var(--lens-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12,
                }}
              >
                <Layers size={14} style={{ color: "var(--lens-accent)" }} /> Sessions
              </button>
              <button
                type="button"
                onClick={() => invoke("launch_app_cmd", { path: "explorer.exe" })}
                style={{
                  padding: "9px 10px",
                  borderRadius: 9,
                  background: "rgb(var(--lens-ink) / 0.05)",
                  border: "1px solid var(--lens-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12,
                }}
              >
                <FolderOpen size={14} style={{ color: "var(--lens-accent)" }} /> Explorer
              </button>
              <button
                type="button"
                onClick={() => invoke("launch_app_cmd", { path: "wt.exe" })}
                style={{
                  padding: "9px 10px",
                  borderRadius: 9,
                  background: "rgb(var(--lens-ink) / 0.05)",
                  border: "1px solid var(--lens-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12,
                }}
              >
                <Terminal size={14} style={{ color: "var(--lens-accent)" }} /> Terminal
              </button>
              <button
                type="button"
                onClick={() => invoke("open_surface", { label: "settings" })}
                style={{
                  padding: "9px 10px",
                  borderRadius: 9,
                  background: "rgb(var(--lens-ink) / 0.05)",
                  border: "1px solid var(--lens-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12,
                }}
              >
                <SlidersHorizontal size={14} style={{ color: "var(--lens-accent)" }} /> Settings
              </button>
            </section>
          )}

          {config.func.clipboardHistory && (
            <section
              style={{
                borderRadius: 12,
                background: "rgb(var(--lens-ink) / 0.04)",
                border: "1px solid var(--lens-border)",
                height: 260,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <ClipboardPane compact />
            </section>
          )}

          {aiOn && aiInfo && (
            <section className="widget-ai-groups">
              <WindowGroups
                windows={runningWindows}
                provider={aiInfo.providers.find((p) => p.id === aiInfo.active) ?? null}
                privacy={aiInfo.privacy}
                onFocusWindow={(hwnd) => invoke("focus_window_cmd", { hwnd }).catch(() => {})}
                onAsk={(prompt, context) => setGroupAsk({ prompt, context })}
              />
              {groupAsk && (
                <AskPanel
                  key={groupAsk.prompt}
                  initialPrompt={groupAsk.prompt}
                  initialContext={groupAsk.context}
                  autoSend
                  compact
                  onClose={() => setGroupAsk(null)}
                />
              )}
            </section>
          )}

          <PluginSlot slot="widgets" />

          {enabled.has("notes") && (
            <section
              style={{
                padding: 12,
                borderRadius: 12,
                background: "rgb(var(--lens-ink) / 0.04)",
                border: "1px solid var(--lens-border)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
                minHeight: 130,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--lens-fg-muted)", fontSize: 11 }}>
                <StickyNote size={12} /> QUICK NOTES
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={saveNotes}
                placeholder="Jot something down..."
                style={{
                  flex: 1,
                  resize: "none",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--lens-fg)",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  userSelect: "text",
                }}
              />
            </section>
          )}
        </div>
      </aside>
    </div>
  );
};
