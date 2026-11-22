import React, { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  MessageSquare,
  ExternalLink,
  Smartphone,
  Send,
  Copy,
  Check,
  AppWindow,
  Columns2,
  Globe,
} from "lucide-react";
import type { RunningWindow } from "../types/lens";

interface MessagingHubPaneProps {
  runningWindows: RunningWindow[];
}

interface ChannelDef {
  id: string;
  name: string;
  color: string;
  webUrl: string;
  launchTarget: string;
  processHints: string[];
  embeddable: boolean;
  description: string;
}

const CHANNELS: ChannelDef[] = [
  {
    id: "discord",
    name: "Discord",
    color: "#5865F2",
    webUrl: "https://discord.com/app",
    launchTarget: "https://discord.com/app",
    processHints: ["discord"],
    embeddable: false,
    description: "Voice, DMs, and servers — focuses your Discord desktop app or opens Discord Web.",
  },
  {
    id: "telegram",
    name: "Telegram",
    color: "#26A5E4",
    webUrl: "https://web.telegram.org/a/",
    launchTarget: "https://web.telegram.org/a/",
    processHints: ["telegram"],
    embeddable: true,
    description: "Fast encrypted chats — focuses Telegram Desktop or embeds Telegram Web right here.",
  },
  {
    id: "messenger",
    name: "Facebook",
    color: "#0084FF",
    webUrl: "https://www.messenger.com/",
    launchTarget: "https://www.messenger.com/",
    processHints: ["messenger", "facebook"],
    embeddable: false,
    description: "Facebook Messenger DMs and group threads.",
  },
  {
    id: "sms",
    name: "SMS",
    color: "#34D399",
    webUrl: "https://messages.google.com/web",
    launchTarget: "ms-phone:",
    processHints: ["phoneexperiencehost", "yourphone", "messages"],
    embeddable: false,
    description: "Windows Phone Link (Android/iPhone SMS) or Google Messages for Web.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    color: "#25D366",
    webUrl: "https://web.whatsapp.com/",
    launchTarget: "https://web.whatsapp.com/",
    processHints: ["whatsapp"],
    embeddable: false,
    description: "WhatsApp desktop or web chats.",
  },
  {
    id: "slack",
    name: "Slack",
    color: "#E01E5A",
    webUrl: "https://app.slack.com/client",
    launchTarget: "https://app.slack.com/client",
    processHints: ["slack"],
    embeddable: false,
    description: "Workspace channels and direct messages.",
  },
];

export const MessagingHubPane: React.FC<MessagingHubPaneProps> = ({ runningWindows }) => {
  const [activeId, setActiveId] = useState<string>("telegram");
  const [showEmbed, setShowEmbed] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [customBridgeUrl, setCustomBridgeUrl] = useState<string>("");

  const activeChannel = CHANNELS.find((c) => c.id === activeId) ?? CHANNELS[0];

  const commsWindows = useMemo(() => {
    const allHints = CHANNELS.flatMap((c) => c.processHints);
    return runningWindows.filter((w) => {
      const p = w.processName.toLowerCase();
      const t = w.title.toLowerCase();
      return allHints.some((h) => p.includes(h) || t.includes(h));
    });
  }, [runningWindows]);

  const activeWindows = useMemo(() => {
    return runningWindows.filter((w) => {
      const p = w.processName.toLowerCase();
      const t = w.title.toLowerCase();
      return activeChannel.processHints.some((h) => p.includes(h) || t.includes(h));
    });
  }, [runningWindows, activeChannel]);

  const copyDraft = () => {
    if (!draft.trim()) return;
    navigator.clipboard?.writeText(draft).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const openOrFocusChannel = (ch: ChannelDef) => {
    const existing = runningWindows.find((w) => {
      const p = w.processName.toLowerCase();
      const t = w.title.toLowerCase();
      return ch.processHints.some((h) => p.includes(h) || t.includes(h));
    });
    if (existing) {
      invoke("focus_window_cmd", { hwnd: existing.hwnd }).catch(() => {});
    } else if (ch.id === "sms") {
      invoke("open_windows_setting_cmd", { uri: "ms-phone:" }).catch(() => {
        invoke("launch_app_cmd", { path: ch.webUrl }).catch(() => {});
      });
    } else {
      invoke("launch_app_cmd", { path: ch.launchTarget }).catch(() => {});
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Channel Selector Pill Strip */}
      <div className="cc-card" style={{ gap: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <MessageSquare size={15} color="#38BDF8" />
            <span>Unified Messaging Hub</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgb(56 189 248 / 0.14)",
                color: "#7DD3FC",
              }}
            >
              {commsWindows.length} active
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="cc-chip"
              style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => invoke("tile_windows_cmd", { layout: "split" }).catch(() => {})}
            >
              <Columns2 size={12} color="#38BDF8" />
              <span>Tile Chats</span>
            </button>
            <button
              type="button"
              className="cc-chip"
              style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() =>
                invoke("open_windows_setting_cmd", { uri: "ms-phone:" }).catch(() => {})
              }
            >
              <Smartphone size={12} color="#34D399" />
              <span>Phone Link SMS</span>
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6 }}>
          {CHANNELS.map((ch) => {
            const isAct = activeId === ch.id;
            const liveCount = runningWindows.filter((w) => {
              const p = w.processName.toLowerCase();
              const t = w.title.toLowerCase();
              return ch.processHints.some((h) => p.includes(h) || t.includes(h));
            }).length;
            return (
              <button
                key={ch.id}
                type="button"
                className={`cc-chip ${isAct ? "active" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "7px 6px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  position: "relative",
                }}
                onClick={() => {
                  setActiveId(ch.id);
                  setShowEmbed(false);
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isAct ? "#09090b" : ch.color,
                    flexShrink: 0,
                  }}
                />
                <span>{ch.name}</span>
                {liveCount > 0 && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: "0 4px",
                      borderRadius: 999,
                      background: isAct ? "rgb(9 9 11 / 0.18)" : "rgb(var(--lens-ink) / 0.12)",
                    }}
                  >
                    {liveCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Channel Stage */}
      <div className="cc-card" style={{ gap: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "var(--lens-fg)" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: activeChannel.color }} />
              <span>{activeChannel.name}</span>
              {activeWindows.length > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "#34D399" }}>
                  ● Running ({activeWindows.length})
                </span>
              )}
            </div>
            <div className="cc-desc">{activeChannel.description}</div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="cc-btn"
              style={{ padding: "5px 11px", fontSize: 11.5 }}
              onClick={() => openOrFocusChannel(activeChannel)}
            >
              {activeWindows.length > 0 ? "Focus App" : `Open ${activeChannel.name}`}
            </button>
            <button
              type="button"
              className="cc-chip"
              style={{ padding: "5px 9px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => invoke("launch_app_cmd", { path: activeChannel.webUrl }).catch(() => {})}
            >
              <Globe size={12} />
              <span>Web ↗</span>
            </button>
            {activeChannel.embeddable && (
              <button
                type="button"
                className={`cc-chip ${showEmbed ? "active" : ""}`}
                style={{ padding: "5px 9px", fontSize: 11.5 }}
                onClick={() => setShowEmbed((s) => !s)}
              >
                {showEmbed ? "Hide Embed" : "Inline View"}
              </button>
            )}
          </div>
        </div>

        {/* Embedded Web View (when toggled on Telegram or custom unified bridge like Beeper/Element) */}
        {(showEmbed || customBridgeUrl.trim().startsWith("http")) && (
          <div
            style={{
              width: "100%",
              height: 250,
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid rgb(var(--lens-ink) / 0.12)",
              background: "#08080b",
            }}
          >
            <iframe
              src={customBridgeUrl.trim().startsWith("http") ? customBridgeUrl.trim() : activeChannel.webUrl}
              title={activeChannel.name}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </div>
        )}

        {/* Live Active Messaging Windows across ALL platforms */}
        {commsWindows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--lens-fg-secondary)" }}>
              Live Messaging Windows
            </div>
            {commsWindows.slice(0, 6).map((w) => (
              <div
                key={w.hwnd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "6px 10px",
                  borderRadius: 9,
                  background: w.isFocused ? "rgb(56 189 248 / 0.1)" : "rgb(var(--lens-ink) / 0.03)",
                  border: "1px solid var(--lens-border)",
                }}
              >
                {w.iconDataUrl ? (
                  <img src={w.iconDataUrl} alt="" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
                ) : (
                  <AppWindow size={16} color="#38BDF8" style={{ flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--lens-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {w.title || w.processName}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--lens-fg-muted)" }}>{w.processName}</div>
                </div>
                <button
                  type="button"
                  className="cc-chip"
                  style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
                  onClick={() => invoke("focus_window_cmd", { hwnd: w.hwnd }).catch(() => {})}
                >
                  <ExternalLink size={11} />
                  <span>Jump</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Reply Draft + Unified Bridge URL (Beeper / Matrix / Local SMS Bridge) */}
      <div className="cc-card" style={{ gap: 8, padding: "11px 14px" }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <input
            className="cc-input"
            style={{ flex: 1, fontSize: 12, padding: "6px 10px" }}
            placeholder={`Quick draft for ${activeChannel.name} (Copy & jump to chat)...`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                copyDraft();
                openOrFocusChannel(activeChannel);
              }
            }}
          />
          <button
            type="button"
            className="cc-chip"
            style={{ padding: "6px 10px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={copyDraft}
          >
            {copied ? <Check size={12} color="#34D399" /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            className="cc-btn"
            style={{ padding: "6px 11px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => {
              copyDraft();
              openOrFocusChannel(activeChannel);
            }}
          >
            <Send size={12} />
            <span>Send in {activeChannel.name}</span>
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--lens-fg-muted)", whiteSpace: "nowrap" }}>
            Custom Bridge URL:
          </span>
          <input
            className="cc-input"
            style={{ flex: 1, fontSize: 11, padding: "4px 8px" }}
            placeholder="Optional: embed a local Matrix / Beeper / web chat bridge URL (http://...)"
            value={customBridgeUrl}
            onChange={(e) => setCustomBridgeUrl(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
