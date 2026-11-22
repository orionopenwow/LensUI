import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type * as Gen from "../types/generated";

/**
 * Control Center › Connections: the browser extension bridge, lens:// links, the Explorer
 * right-click menu, and "Connect to Claude". Every change previews first and needs a second
 * click; everything is removable from here.
 */

const BROWSERS: { id: string; label: string }[] = [
  { id: "chrome", label: "Chrome" },
  { id: "edge", label: "Edge" },
  { id: "brave", label: "Brave" },
  { id: "firefox", label: "Firefox" },
];

const pre: React.CSSProperties = {
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
  maxHeight: 220,
  overflow: "auto",
};

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

function planText(r: Gen.RegistryReport): string {
  const keys = r.plan.roots.map((k) => `HKCU\\${k}`);
  return [...r.files.map((f) => `file  ${f}`), ...keys.map((k) => `key   ${k}`)].join("\n");
}

export const ConnectionsCard: React.FC = () => {
  const [status, setStatus] = useState<Gen.BridgeStatus | null>(null);
  const [picked, setPicked] = useState<string[]>(["chrome", "edge"]);
  const [extraIds, setExtraIds] = useState("");
  const [preview, setPreview] = useState<{ kind: string; report: Gen.RegistryReport } | null>(null);
  const [claude, setClaude] = useState<Gen.ClaudeConfigPreview | null>(null);
  const [claudeCode, setClaudeCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    invoke<Gen.BridgeStatus>("bridge_status").then(setStatus).catch(() => setStatus(null));
    invoke<string>("claude_code_command").then(setClaudeCode).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const ids = () => extraIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  const previewInstall = (kind: "browser" | "links" | "explorer") =>
    run(async () => {
      const report =
        kind === "browser"
          ? await invoke<Gen.RegistryReport>("bridge_install", { browsers: picked, extraExtensionIds: ids(), confirm: false })
          : kind === "links"
            ? await invoke<Gen.RegistryReport>("url_scheme_install", { confirm: false })
            : await invoke<Gen.RegistryReport>("explorer_verbs_install", { confirm: false });
      setPreview({ kind, report });
    });

  const confirmInstall = () =>
    run(async () => {
      if (!preview) return;
      const r =
        preview.kind === "browser"
          ? await invoke<Gen.RegistryReport>("bridge_install", { browsers: picked, extraExtensionIds: ids(), confirm: true })
          : preview.kind === "links"
            ? await invoke<Gen.RegistryReport>("url_scheme_install", { confirm: true })
            : await invoke<Gen.RegistryReport>("explorer_verbs_install", { confirm: true });
      setPreview(null);
      setNote(r.message);
    });

  const uninstall = (cmd: string) =>
    run(async () => {
      const r = await invoke<Gen.RegistryReport>(cmd);
      setNote(r.message);
    });

  const claudePreview = (install: boolean) =>
    run(async () => {
      setClaude(await invoke<Gen.ClaudeConfigPreview>(install ? "mcp_install_claude_desktop" : "mcp_uninstall_claude_desktop", { confirmHash: null }));
    });

  const claudeConfirm = (install: boolean) =>
    run(async () => {
      if (!claude) return;
      const r = await invoke<Gen.ClaudeConfigPreview>(install ? "mcp_install_claude_desktop" : "mcp_uninstall_claude_desktop", { confirmHash: claude.hash });
      setClaude(null);
      setNote(r.message + (r.backupPath ? ` Backup: ${r.backupPath}` : ""));
    });

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setNote("Copied.");
    } catch {
      setNote("Couldn't copy.");
    }
  };

  const hostInstalled = (b: string) => status?.hosts.find((h) => h.browser === b)?.installed;
  const anyHost = status?.hosts.some((h) => h.installed);
  const claudeInstalling = claude?.message.startsWith("Review the change") ?? false;

  return (
    <div className="cc-card">
      <div className="cc-label">Connections</div>
      <div className="cc-desc">
        Bring pages, files and videos into Lens from your browser, File Explorer and scripts, and give Claude access to Lens.
        Everything stays on this PC until you confirm a request in Lens.
      </div>

      {status?.windowsOnly && <div className="cc-desc">These connections need Windows.</div>}

      {/* Browser extension */}
      <div style={col}>
        <div className="cc-label">Browser extension</div>
        <div className="cc-desc">
          Adds a <b>Lens</b> right-click menu and side panel to your browser.{" "}
          {anyHost ? "Bridge installed for: " + status!.hosts.filter((h) => h.installed).map((h) => h.browser).join(", ") + "." : "Not installed yet."}
        </div>
        <div style={row} role="group" aria-label="Browsers">
          {BROWSERS.map((b) => {
            const on = picked.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                className={on ? "cc-btn" : "cc-btn-ghost"}
                aria-pressed={on}
                onClick={() => setPicked(on ? picked.filter((x) => x !== b.id) : [...picked, b.id])}
              >
                {b.label}
                {hostInstalled(b.id) ? " ✓" : ""}
              </button>
            );
          })}
        </div>
        <input
          className="cc-input"
          placeholder="Extra extension ids (optional, for store builds)"
          aria-label="Extra extension ids"
          value={extraIds}
          onChange={(e) => setExtraIds(e.target.value)}
        />
        <div style={row}>
          <button type="button" className="cc-btn" disabled={busy || picked.length === 0} onClick={() => previewInstall("browser")}>
            {anyHost ? "Update bridge…" : "Install bridge…"}
          </button>
          {anyHost && (
            <button type="button" className="cc-btn-ghost" disabled={busy} onClick={() => uninstall("bridge_uninstall")}>
              Remove
            </button>
          )}
        </div>
        <div className="cc-desc">
          Then load the extension: run <code>bun run ext:build</code>, open <code>chrome://extensions</code> (or{" "}
          <code>edge://extensions</code>), turn on Developer mode, choose <b>Load unpacked</b> and pick{" "}
          <code>extensions/browser/dist/chrome</code>. Firefox: <code>about:debugging</code> › Load Temporary Add-on ›{" "}
          <code>dist/firefox/manifest.json</code>.
        </div>
      </div>

      {/* lens:// and Explorer */}
      <div className="cc-row">
        <div>
          <div className="cc-label">lens:// links</div>
          <div className="cc-desc">Lets the bookmarklet and scripts open Lens. {status?.urlSchemeInstalled ? "On." : "Off."}</div>
        </div>
        {status?.urlSchemeInstalled ? (
          <button type="button" className="cc-btn-ghost" disabled={busy} onClick={() => uninstall("url_scheme_uninstall")}>Remove</button>
        ) : (
          <button type="button" className="cc-btn" disabled={busy} onClick={() => previewInstall("links")}>Add…</button>
        )}
      </div>
      <div className="cc-row">
        <div>
          <div className="cc-label">File Explorer right-click</div>
          <div className="cc-desc">
            “Lens ›” on files and folders: Ask, Summarise, Add to Shelf, Copy path into context; “Transcribe with Lens” on audio and video.
            On Windows 11 it's under “Show more options”. {status?.explorerVerbsInstalled ? "On." : "Off."}
          </div>
        </div>
        {status?.explorerVerbsInstalled ? (
          <button type="button" className="cc-btn-ghost" disabled={busy} onClick={() => uninstall("explorer_verbs_uninstall")}>Remove</button>
        ) : (
          <button type="button" className="cc-btn" disabled={busy} onClick={() => previewInstall("explorer")}>Add…</button>
        )}
      </div>

      {preview && (
        <div style={col}>
          <div className="cc-label">Lens will write</div>
          <pre style={pre}>{planText(preview.report)}</pre>
          <div className="cc-desc">{preview.report.message}</div>
          <div style={row}>
            <button type="button" className="cc-btn" disabled={busy} onClick={confirmInstall}>Confirm</button>
            <button type="button" className="cc-btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Claude */}
      <div style={col}>
        <div className="cc-label">Connect to Claude</div>
        <div className="cc-desc">
          Adds Lens to Claude Desktop's tools (a backup of Claude's config is kept), or use the Claude Code command below. Turn on
          “Allow AI apps to connect” in AI Apps too.
        </div>
        <div style={row}>
          <button type="button" className="cc-btn" disabled={busy} onClick={() => claudePreview(true)}>Connect Claude Desktop…</button>
          <button type="button" className="cc-btn-ghost" disabled={busy} onClick={() => claudePreview(false)}>Disconnect…</button>
        </div>
        {claude && (
          <div style={col}>
            <div className="cc-desc">{claude.message}</div>
            <div className="cc-desc">{claude.path}</div>
            {claude.changed && <pre style={pre}>{claude.diff}</pre>}
            <div style={row}>
              {claude.changed && (
                <button type="button" className="cc-btn" disabled={busy} onClick={() => claudeConfirm(claudeInstalling)}>
                  Confirm
                </button>
              )}
              <button type="button" className="cc-btn-ghost" onClick={() => setClaude(null)}>Close</button>
            </div>
          </div>
        )}
        {claudeCode && (
          <>
            <div className="cc-desc">Claude Code:</div>
            <pre style={pre}>{claudeCode}</pre>
            <div style={row}>
              <button type="button" className="cc-btn-ghost" onClick={() => copy(claudeCode)}>Copy</button>
            </div>
          </>
        )}
      </div>

      {note && <div className="cc-desc" role="status">{note}</div>}
    </div>
  );
};
