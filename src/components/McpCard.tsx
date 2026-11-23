import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LensConfig } from "../types/lens";
import { executeNaturalLanguagePlan, parseNaturalLanguageActions } from "../utils/nlActionRouter";
import type * as Gen from "../types/generated";

/** Mirrors win_mcp.rs (serde camelCase). */
export type McpConfig = Gen.McpConfig;

interface McpStatus {
  running: boolean;
  port: number;
  connections: number;
  command: string;
  args: string[];
  claudeDesktopSnippet: string;
  endpointFile: string;
}

interface PendingAction {
  id: string;
  kind: "nl" | "tool" | string;
  tool: string;
  text: string;
  client: string;
  createdMs: number;
  status: string;
  result: string;
}

interface AuditEntry {
  ts: number;
  client: string;
  tool: string;
  outcome: string;
  ok: boolean;
  args: string;
}

type ConfigWithMcp = LensConfig & { mcp?: Partial<McpConfig> };

export function readMcp(config: LensConfig): McpConfig {
  const m: Partial<McpConfig> = (config as ConfigWithMcp).mcp ?? {};
  return { enabled: !!m.enabled, confirmAll: !!m.confirmAll };
}

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const timeAgo = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Control Center card: let AI apps (Claude Desktop and other MCP clients) control Lens UI.
 * Off by default. Requests that need approval show here with Approve / Decline.
 */
export const McpCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const mcp = readMcp(config);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    invoke<McpStatus>("get_mcp_status_cmd").then(setStatus).catch(() => setStatus(null));
    invoke<PendingAction[]>("list_mcp_actions_cmd").then((a) => setActions(Array.isArray(a) ? a : [])).catch(() => setActions([]));
    invoke<AuditEntry[]>("get_mcp_audit_cmd", { limit: 12 }).then((a) => setAudit(Array.isArray(a) ? a : [])).catch(() => setAudit([]));
  }, []);

  useEffect(() => {
    refresh();
    const un = listen("lens://mcp-changed", refresh);
    const t = window.setInterval(refresh, 5000);
    return () => {
      window.clearInterval(t);
      un.then((f) => f());
    };
  }, [refresh]);

  const setMcp = (patch: Partial<McpConfig>) =>
    onUpdateConfig({ ...config, mcp: { ...mcp, ...patch } } as LensConfig);

  const approve = async (a: PendingAction) => {
    setBusyId(a.id);
    setNote(null);
    try {
      const res = await invoke<PendingAction>("approve_mcp_action_cmd", { id: a.id });
      if (res.kind === "nl" && res.status === "approved") {
        // Natural-language requests run through the same router as Dock search.
        const plan = parseNaturalLanguageActions(res.text);
        if (plan.length === 0) {
          await invoke("complete_mcp_action_cmd", {
            id: a.id,
            ok: false,
            message: "Lens couldn't match this request to any action it knows.",
          });
        } else {
          const results = await executeNaturalLanguagePlan(res.text, plan, config, onUpdateConfig, "mcp");
          await invoke("complete_mcp_action_cmd", { id: a.id, ok: true, message: results.join(" · ") });
        }
      }
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const decline = async (a: PendingAction) => {
    setBusyId(a.id);
    try {
      await invoke("decline_mcp_action_cmd", { id: a.id });
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const pending = actions.filter((a) => a.status === "pending");
  const finished = actions.filter((a) => a.status !== "pending").slice(0, 5);

  const toggle = (on: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`cc-toggle ${on ? "on" : ""}`}
      onClick={onClick}
    />
  );

  return (
    <div className="cc-card">
      <div className="cc-label">AI Apps (MCP)</div>
      <div className="cc-desc">
        Lets AI apps such as Claude Desktop see your open windows and change volume, brightness, night light,
        theme, tiling and workspaces. Plain-language requests always wait for your approval here. AI apps can't
        run commands, open files, or close apps through Lens.
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Allow AI apps to connect</div>
          <div className="cc-desc">
            {status?.running
              ? `On · ${status.connections} app${status.connections === 1 ? "" : "s"} connected`
              : "Off"}
          </div>
        </div>
        {toggle(mcp.enabled, "Allow AI apps to connect", () => setMcp({ enabled: !mcp.enabled }))}
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Ask me before every change</div>
          <div className="cc-desc">Volume, brightness, theme and tiling requests also wait for approval.</div>
        </div>
        {toggle(mcp.confirmAll, "Ask me before every change", () => setMcp({ confirmAll: !mcp.confirmAll }))}
      </div>

      {pending.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="cc-label">Waiting for you</div>
          {pending.map((a) => (
            <div key={a.id} className="cc-row" style={{ alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div className="cc-label" style={{ overflowWrap: "anywhere" }}>
                  {a.text}
                </div>
                <div className="cc-desc">
                  {a.client || "AI app"} · {timeAgo(a.createdMs)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button type="button" className="cc-btn" disabled={busyId === a.id} onClick={() => approve(a)}>
                  Approve
                </button>
                <button
                  type="button"
                  className="cc-btn-ghost"
                  disabled={busyId === a.id}
                  onClick={() => decline(a)}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {status && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="cc-label">Connect Claude Desktop</div>
          <div className="cc-desc">
            Add this to claude_desktop_config.json (Claude Desktop › Settings › Developer › Edit Config), then
            restart Claude Desktop.
          </div>
          <pre
            style={{
              margin: 0,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgb(var(--lens-ink) / 0.05)",
              border: "1px solid var(--lens-border)",
              fontFamily: "var(--font-mono, Consolas, monospace)",
              fontSize: 11.5,
              color: "var(--lens-fg-secondary)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              userSelect: "text",
            }}
          >
            {status.claudeDesktopSnippet}
          </pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="cc-btn-ghost"
              onClick={async () => setNote((await copyText(status.claudeDesktopSnippet)) ? "Copied." : "Couldn't copy.")}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {(finished.length > 0 || audit.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="cc-label">Recent activity</div>
          {finished.map((a) => (
            <div key={a.id} className="cc-desc" style={{ overflowWrap: "anywhere" }}>
              {a.text} — {a.status}
              {a.result ? ` (${a.result})` : ""}
            </div>
          ))}
          {audit.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="cc-desc" style={{ overflowWrap: "anywhere" }}>
              {timeAgo(e.ts)} · {e.client || "AI app"} · {e.tool}
              {e.args ? ` (${e.args})` : ""} · {e.ok ? e.outcome : `${e.outcome}, failed`}
            </div>
          ))}
        </div>
      )}

      {note && <div className="cc-desc">{note}</div>}
    </div>
  );
};
