// Context pack editor: pick Shelf items into a named, ordered bundle with a token budget, then
// copy it as Markdown, send it to Claude (Lens AI's consent card still applies), attach it in
// Claude Desktop / Claude Code (MCP resource lens://pack/<id>), export it, or make it the
// active context Lens Command attaches automatically.
import React, { useCallback, useEffect, useState } from "react";
import { ClipboardCopy, Download, GripVertical, Plus, Send, Trash2, X } from "lucide-react";
import {
  onPacksChanged, packActive, packAddItems, packCreate, packDelete, packExport, packGet, packList, packMarkdown,
  packRemoveItem, packResourceUri, packSetActive, packSetBudget, packSetItems,
  type PackSummary, type PackView,
} from "./contract";
import { shelfGet, shelfList, type ShelfItem } from "../shelf/contract";
import { aiAsk } from "../ai/client";
import {
  BUDGET_PRESETS, autoTrim, budgetLevel, claudeRequest, formatTokens, meterPercent, summarisePrompt, trimmedTotal,
} from "./packs";
import "./context.css";
import { fillStyle } from "../ui/motion";

interface Props {
  /** Open on this pack. */
  packId?: string;
  /** Screenshots/tests: render from data instead of the backend. */
  demo?: { packs: PackSummary[]; view: PackView; shelf: ShelfItem[] };
}

/** Asks the local model for a short summary and waits for the answer (used by auto-trim). */
async function summariseLocally(text: string, maxTokens: number): Promise<string> {
  const { listen } = await import("@tauri-apps/api/event");
  const id = await aiAsk({ prompt: summarisePrompt(maxTokens), context: { selection: text }, provider: "local", allow_tools: false });
  return new Promise((resolve, reject) => {
    let out = "";
    const stop: Array<() => void> = [];
    const done = (fn: () => void) => {
      stop.forEach((s) => s());
      fn();
    };
    listen<{ id: string; text: string }>("lens://ai/delta", (e) => {
      if (e.payload.id === id) out += e.payload.text;
    }).then((u) => stop.push(u));
    listen<{ id: string; error?: string | null }>("lens://ai/done", (e) => {
      if (e.payload.id !== id) return;
      done(() => (e.payload.error ? reject(new Error(e.payload.error)) : resolve(out)));
    }).then((u) => stop.push(u));
    setTimeout(() => done(() => reject(new Error("timed out"))), 120_000);
  });
}

export const PackEditor: React.FC<Props> = ({ packId, demo }) => {
  const [packs, setPacks] = useState<PackSummary[]>(demo?.packs ?? []);
  const [id, setId] = useState<string | undefined>(packId ?? demo?.view.pack.id);
  const [view, setView] = useState<PackView | null>(demo?.view ?? null);
  const [shelf, setShelf] = useState<ShelfItem[]>(demo?.shelf ?? []);
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (demo) return;
    const list = await packList().catch(() => [] as PackSummary[]);
    setPacks(list);
    const cur = id && list.some((p) => p.id === id) ? id : list[0]?.id;
    setId(cur);
    setView(cur ? await packGet(cur).catch(() => null) : null);
    setShelf(await shelfList().catch(() => [] as ShelfItem[]));
  }, [id, demo]);

  useEffect(() => {
    refresh();
    if (demo) return;
    const un = onPacksChanged(() => refresh());
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, [refresh, demo]);

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
    }
  };

  /** Markdown, with local summaries for over-budget items when auto-trim is on. */
  const markdown = async () => {
    if (!view) return "";
    const rep = view.pack.auto_trim && view.trim_plan.length
      ? await autoTrim(view.trim_plan, async (iid) => (await shelfGet(iid)).text, summariseLocally)
      : undefined;
    return packMarkdown(view.pack.id, rep);
  };

  const level = view ? budgetLevel(trimmedTotal(view), view.pack.budget_tokens) : "ok";
  const notIn = shelf.filter((s) => !view?.pack.item_ids.includes(s.id));

  return (
    <div className="cc-card rc-card rc-pack">
      <div className="cc-row">
        <div>
          <div className="cc-label">Context packs</div>
          <div className="cc-desc">Bundle Shelf items for Claude. Copy them, send them, or attach them in Claude Desktop.</div>
        </div>
      </div>

      <div className="rc-places" role="tablist" aria-label="Packs">
        {packs.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === id} className={`cc-chip ${p.id === id ? "active" : ""}`}
            onClick={() => { setId(p.id); if (!demo) packGet(p.id).then(setView).catch(() => {}); }}>
            {p.name}
            {p.active && <span className="rc-dot" aria-label="active" />}
          </button>
        ))}
        <form className="rc-new" onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          run("Pack created.", async () => {
            const p = await packCreate(newName.trim());
            setNewName("");
            setId(p.id);
          });
        }}>
          <input className="cc-input" placeholder="New pack" aria-label="New pack name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </form>
      </div>

      {view ? (
        <>
          <div className="rc-meter-row">
            <div className={`rc-meter is-${level}`} role="meter" aria-valuemin={0} aria-valuemax={view.pack.budget_tokens}
              aria-valuenow={trimmedTotal(view)} aria-label="Token budget">
              <span style={fillStyle(meterPercent(trimmedTotal(view), view.pack.budget_tokens) / 100)} />
            </div>
            <span className="rc-meter-text">
              {formatTokens(trimmedTotal(view))} / {formatTokens(view.pack.budget_tokens)} tok
              {view.trim_plan.length > 0 && !view.pack.auto_trim && ` · ${formatTokens(view.total_tokens - view.pack.budget_tokens)} over`}
            </span>
          </div>

          <div className="cc-row">
            <div className="rc-seg" role="radiogroup" aria-label="Budget">
              {BUDGET_PRESETS.slice(0, 6).map((b) => (
                <button key={b} type="button" role="radio" aria-checked={view.pack.budget_tokens === b}
                  className={`cc-chip ${view.pack.budget_tokens === b ? "active" : ""}`}
                  onClick={() => !demo && packSetBudget(view.pack.id, b, view.pack.auto_trim).catch(() => {})}>
                  {formatTokens(b)}
                </button>
              ))}
            </div>
          </div>
          <div className="cc-row">
            <div>
              <div className="cc-label">Auto-trim</div>
              <div className="cc-desc">Summarise the largest items with your local model so the pack fits.</div>
            </div>
            <button type="button" role="switch" aria-checked={view.pack.auto_trim} aria-label="Auto-trim"
              className={`cc-toggle ${view.pack.auto_trim ? "on" : ""}`}
              onClick={() => !demo && packSetBudget(view.pack.id, view.pack.budget_tokens, !view.pack.auto_trim).catch(() => {})} />
          </div>

          <ol className="rc-list rc-pack-items" aria-label="Items in this pack">
            {view.items.map((it) => {
              const trim = view.trim_plan.find((t) => t.id === it.id);
              return (
                <li key={it.id} className={`rc-row ${it.missing ? "is-hidden" : ""} ${drag === it.id ? "is-dragging" : ""}`} draggable
                  onDragStart={() => setDrag(it.id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!drag || drag === it.id || demo) return;
                    const ids = view.pack.item_ids.filter((x) => x !== drag);
                    ids.splice(ids.indexOf(it.id), 0, drag);
                    packSetItems(view.pack.id, ids).catch(() => {});
                  }}>
                  <span className="rc-grip" aria-hidden><GripVertical size={14} /></span>
                  <span className="rc-name">
                    {it.title}
                    <span className="rc-sub">{subtitle(it)}</span>
                  </span>
                  {it.local_only && <span className="rc-badge">Stays on this PC</span>}
                  <span className={`rc-tok ${trim ? "is-trim" : ""}`}>
                    {trim ? `${formatTokens(trim.from_tokens)} → ${formatTokens(trim.to_tokens)}` : formatTokens(it.approx_tokens)}
                  </span>
                  <button type="button" className="rc-iconbtn" aria-label={`Remove ${it.title} from the pack`}
                    onClick={() => !demo && packRemoveItem(view.pack.id, it.id).catch(() => {})}>
                    <X size={14} />
                  </button>
                </li>
              );
            })}
            {!view.items.length && <li className="rc-menu-empty">Empty. Add items from your Shelf.</li>}
          </ol>

          {picking ? (
            <div className="rc-pick">
              {notIn.slice(0, 30).map((s) => (
                <button key={s.id} type="button" className="rc-pick-item"
                  onClick={() => !demo && packAddItems(view.pack.id, [s.id]).catch(() => {})}>
                  <Plus size={12} /> <span>{s.title}</span> <span className="rc-tok">{formatTokens(s.approx_tokens)}</span>
                </button>
              ))}
              {!notIn.length && <div className="rc-menu-empty">Everything on your Shelf is already in this pack.</div>}
            </div>
          ) : null}

          <div className="rc-footer">
            <button type="button" className="cc-btn" onClick={() => setPicking(!picking)}>
              <Plus size={14} /> {picking ? "Done" : "Add from Shelf"}
            </button>
            <span className="rc-spacer" />
            <button type="button" className="cc-btn" disabled={busy}
              onClick={() => run("Copied as Markdown.", async () => navigator.clipboard.writeText(await markdown()))}>
              <ClipboardCopy size={14} /> Copy
            </button>
            <button type="button" className="cc-btn" disabled={busy}
              onClick={() => run("Copied. In Claude Desktop, attach it from Lens ▸ " + packResourceUri(view.pack.id) + ".", async () =>
                navigator.clipboard.writeText(await markdown()))}>
              Open in Claude Desktop
            </button>
            <button type="button" className="cc-btn cc-btn-primary" disabled={busy || view.local_only}
              onClick={() => run("Sent to Claude. Answer it in Lens Command.", async () => aiAsk(claudeRequest(view.pack.name, await markdown())))}>
              <Send size={14} /> Send to Claude
            </button>
          </div>

          <div className="rc-footer">
            <button type="button" className={`cc-chip ${view.active ? "active" : ""}`} aria-pressed={view.active}
              onClick={() => !demo && packSetActive(view.active ? null : view.pack.id).then(() => packActive()).catch(() => {})}>
              {view.active ? "Active context in Lens Command" : "Use as active context"}
            </button>
            <span className="rc-spacer" />
            <button type="button" className="cc-btn" onClick={() => run("Exported.", async () => downloadText(`${view.pack.name}.md`, await packExport(view.pack.id, "md")))}>
              <Download size={14} /> .md
            </button>
            <button type="button" className="cc-btn" onClick={() => run("Exported.", async () => downloadText(`${view.pack.name}.json`, await packExport(view.pack.id, "json")))}>
              <Download size={14} /> .json
            </button>
            <button type="button" className="cc-btn" aria-label="Delete pack"
              onClick={() => { if (!demo && window.confirm(`Delete the pack “${view.pack.name}”? Its Shelf items stay.`)) packDelete(view.pack.id).catch(() => {}); }}>
              <Trash2 size={14} />
            </button>
          </div>
          {view.local_only && <div className="rc-hint">This pack holds items that stay on this PC, so it can't be sent to Claude.</div>}
          {status && <div className="rc-hint">{status}</div>}
        </>
      ) : (
        <div className="rc-menu-empty">No packs yet. Name one above, then add Shelf items.</div>
      )}
    </div>
  );
};

/** Where an item came from: the site, or the folder a file is in. */
export function subtitle(it: { url?: string | null; path?: string | null; kind: string }): string {
  if (it.url) {
    try {
      return new URL(it.url).hostname.replace(/^www\./, "");
    } catch {
      return it.kind;
    }
  }
  if (it.path) {
    const parts = it.path.split(/[\\/]/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 2] : it.kind;
  }
  return it.kind;
}

function downloadText(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name.replace(/[\\/:*?"<>|]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
