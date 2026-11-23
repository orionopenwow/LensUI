import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type * as Gen from "../types/generated";
import { ApprovalCard } from "../approval/ApprovalCard";
import { usePendingApprovals } from "../approval/api";
import { fallbackPreview, type ApprovalRequest } from "../approval/model";

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

/** The shared-card request for an inbox entry, used until (or without) its queue record. Pure. */
export function requestForEntry(e: Gen.InboxEntry): ApprovalRequest {
  const r = e.request;
  const origin = ORIGIN_LABEL[r.origin] ?? "Another app";
  const transcribe = r.action === "transcribe";
  const what = transcribe ? "Transcribe this" : `Send this to Lens AI (${(ACTION_LABEL[r.action] ?? r.action).toLowerCase()})`;
  return {
    id: `bridge-${e.id}`,
    origin: "bridge",
    source: origin,
    reference: e.id,
    wantsClipboard: !!r.useClipboard,
    createdMs: e.createdMs,
    preview: {
      ...fallbackPreview(what, origin, "low"),
      reason: `${origin} asked for this. Nothing is sent until you say so.`,
      verb: transcribe ? "Transcribe" : "Send",
      denyLabel: "Decline",
      details: contextChips(r).map((c, i) => ({ label: i === 0 ? "Includes" : "", value: c })),
      reversible: true,
      noUndoLine: true,
      source: { client: "bridge", kind: "bridge", label: origin },
    },
  };
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

  // One approval card: each waiting request is also in the shared queue (the pill and the
  // approval window show it); this list draws the same card from that record.
  const { requests } = usePendingApprovals();
  const pending = items.filter((i) => i.state === "pending");
  const recent = items.filter((i) => i.state !== "pending").slice(0, 6);
  if (items.length === 0) return null;

  return (
    <div className="cc-card">
      <div className="cc-label">From your browser and files</div>
      {pending.map((e) => {
        const request = requests.find((q) => q.origin === "bridge" && q.reference === e.id) ?? requestForEntry(e);
        return (
          <div key={e.id} aria-busy={busy === e.id}>
          <ApprovalCard
            request={request}
            compact
            onApprove={async () => {
              await confirm(e);
              return true;
            }}
            onDeny={() => {
              void decline(e);
            }}
          />
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
