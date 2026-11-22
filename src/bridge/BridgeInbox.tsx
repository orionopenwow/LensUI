import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type * as Gen from "../types/generated";

/**
 * Requests that arrived from the browser, Explorer, lens:// links or scripts and wait for the
 * user. Until the Command surface / Ask panel (ai-core) renders `lens://bridge/request` itself,
 * this card is where they are confirmed. Context chips show exactly what would be sent.
 */

const ACTION_LABEL: Record<string, string> = {
  ask: "Ask",
  summarize: "Summarise",
  explain: "Explain simply",
  translate: "Translate",
  rewrite: "Rewrite",
  fix_grammar: "Fix grammar",
  extract: "Extract",
  compare: "Compare with Shelf item",
  transcribe: "Transcribe",
  shelf_add: "Add to Shelf",
  context_add: "Add to context",
  command_open: "Open Command",
};

const ORIGIN_LABEL: Record<string, string> = {
  browser: "Browser",
  url_link: "Link",
  explorer: "File Explorer",
  cli: "Script",
};

export function contextChips(r: Gen.BridgeRequest): string[] {
  const chips: string[] = [];
  if (r.selection) chips.push(`Selection · ${r.selection.length.toLocaleString()} chars`);
  if (r.pageText) chips.push(`Page · ${Math.max(1, Math.round(r.pageText.length / 1024))} KB`);
  if (r.url) {
    try {
      chips.push(new URL(r.url).hostname);
    } catch {
      chips.push("Page link");
    }
  }
  if (r.linkUrl) chips.push("Link");
  if (r.imageUrl) chips.push("Image");
  if (r.mediaUrl) chips.push("Video link");
  if (r.path) chips.push(r.path.split(/[\\/]/).pop() || "File");
  if (r.useClipboard) chips.push("Clipboard");
  if (r.question) chips.push(`“${r.question.slice(0, 60)}”`);
  return chips;
}

export const BridgeInbox: React.FC = () => {
  const [items, setItems] = useState<Gen.InboxEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    invoke<Gen.InboxEntry[]>("bridge_inbox").then((x) => setItems([...x].reverse())).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    refresh();
    const a = listen("lens://bridge/request", refresh);
    const b = listen("lens://bridge/update", refresh);
    return () => {
      a.then((f) => f());
      b.then((f) => f());
    };
  }, [refresh]);

  const confirm = async (e: Gen.InboxEntry) => {
    setBusy(e.id);
    setNote(null);
    try {
      let clipboard: string | null = null;
      if (e.request.useClipboard) {
        clipboard = await navigator.clipboard.readText().catch(() => null);
        if (!clipboard) setNote("Couldn't read the clipboard; sending without it.");
      }
      await invoke("bridge_confirm", { id: e.id, clipboard });
    } catch (err) {
      setNote(String(err));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const decline = async (e: Gen.InboxEntry) => {
    setBusy(e.id);
    try {
      await invoke("bridge_decline", { id: e.id });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const pending = items.filter((i) => i.state === "pending");
  const recent = items.filter((i) => i.state !== "pending").slice(0, 6);
  if (items.length === 0) return null;

  return (
    <div className="cc-card">
      <div className="cc-label">From your browser and files</div>
      {pending.map((e) => {
        const r = e.request;
        const title = [ACTION_LABEL[r.action] ?? r.action, r.variant?.replace("_", " "), r.targetLang].filter(Boolean).join(" · ");
        return (
          <div key={e.id} className="cc-row" style={{ alignItems: "flex-start", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div className="cc-label">{title}</div>
              <div className="cc-desc" style={{ overflowWrap: "anywhere" }}>
                {ORIGIN_LABEL[r.origin] ?? r.origin}
                {r.title ? ` · ${r.title}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {contextChips(r).map((c) => (
                  <span key={c} className="cc-chip">{c}</span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button type="button" className="cc-btn" disabled={busy === e.id} onClick={() => confirm(e)}>
                {r.action === "transcribe" ? "Transcribe" : "Send"}
              </button>
              <button type="button" className="cc-btn-ghost" disabled={busy === e.id} onClick={() => decline(e)}>
                Decline
              </button>
            </div>
          </div>
        );
      })}
      {recent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {recent.map((e) => (
            <div key={e.id} className="cc-desc" style={{ overflowWrap: "anywhere" }}>
              {ACTION_LABEL[e.request.action] ?? e.request.action} · {ORIGIN_LABEL[e.request.origin] ?? e.request.origin} · {e.state}
              {e.engine ? ` · ${e.engine === "claude" ? "Claude" : e.engine === "local" ? "Local" : e.engine}` : ""}
              {e.error ? ` — ${e.error}` : ""}
            </div>
          ))}
        </div>
      )}
      {note && <div className="cc-desc" role="status">{note}</div>}
    </div>
  );
};
