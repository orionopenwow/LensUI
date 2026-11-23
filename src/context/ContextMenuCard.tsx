// Control Center card: the right-click menu everywhere (browser, Lens Browser, Explorer, Shelf,
// Dock, Lens Mini). Pick a place, drag to reorder, pin or hide, preview the menu, add your own
// prompt actions, import/export. Saved to %APPDATA%\LensUI\context-actions.json.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, Eye, EyeOff, GripVertical, Pin, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import {
  CONTEXT_LABELS, DEFAULT_PREFS, MAX_TOP, addCustom, appliesTo, exportPrefs, importPrefs, menuFor, move,
  orderedActions, removeCustom, toggleHidden, togglePin, validateCustom,
  type CustomAction, type MenuContext, type MenuPrefs, type Provider, type UsageCounts,
} from "./actions";
import { contextMenuGet, contextMenuReset, contextMenuSet } from "./contract";
import { ActionIcon } from "./ActionIcon";
import "./context.css";

/** The places the preview can show, with a sample path for file types. */
export const PLACES: { id: string; label: string; ctx: MenuContext }[] = [
  { id: "selection", label: "Selected text", ctx: { kind: "selection" } },
  { id: "page", label: "Web page", ctx: { kind: "page" } },
  { id: "youtube", label: "YouTube", ctx: { kind: "youtube" } },
  { id: "file", label: "Document", ctx: { kind: "file", path: "report.pdf" } },
  { id: "video", label: "Video file", ctx: { kind: "file", path: "talk.mp4" } },
  { id: "folder", label: "Folder", ctx: { kind: "folder" } },
  { id: "desktop", label: "Desktop", ctx: { kind: "desktop" } },
  { id: "shelf", label: "Shelf item", ctx: { kind: "shelf" } },
  { id: "clipboard", label: "Clipboard", ctx: { kind: "clipboard" } },
  { id: "notification", label: "Notification", ctx: { kind: "notification" } },
];

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "local", label: "Local" },
  { id: "default", label: "Default" },
  { id: "claude", label: "Claude" },
];

export function normalisePrefs(p: Partial<MenuPrefs> | null | undefined): MenuPrefs {
  return {
    order: Array.isArray(p?.order) ? p!.order : [],
    hidden: Array.isArray(p?.hidden) ? p!.hidden : [],
    pinned: Array.isArray(p?.pinned) ? p!.pinned : [],
    custom: Array.isArray(p?.custom) ? p!.custom : [],
    learn: p?.learn === true,
  };
}

interface Props {
  /** For screenshots and tests: start on a place / with these prefs. */
  initialPlace?: string;
  initialPrefs?: MenuPrefs;
  initialUsage?: UsageCounts;
}

export const ContextMenuCard: React.FC<Props> = ({ initialPlace = "selection", initialPrefs, initialUsage }) => {
  const [prefs, setPrefs] = useState<MenuPrefs>(initialPrefs ?? DEFAULT_PREFS);
  const [usage, setUsage] = useState<UsageCounts>(initialUsage ?? {});
  const [place, setPlace] = useState(initialPlace);
  const [drag, setDrag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<CustomAction, "id"> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialPrefs) return;
    contextMenuGet()
      .then((s) => {
        setPrefs(normalisePrefs(s?.prefs));
        setUsage(s?.usage ?? {});
      })
      .catch(() => {});
  }, [initialPrefs]);

  const save = (next: MenuPrefs) => {
    setPrefs(next);
    setError(null);
    contextMenuSet(next).catch((e) => setError(String(e)));
  };

  const ctx = (PLACES.find((p) => p.id === place) ?? PLACES[0]).ctx;
  const all = useMemo(() => orderedActions(prefs, usage), [prefs, usage]);
  const here = all.filter((a) => appliesTo(a, ctx));
  const menu = menuFor(ctx, prefs, usage);

  const onDrop = (targetId: string) => {
    if (!drag || drag === targetId) return;
    const ids = orderedActions({ ...prefs, pinned: [], learn: false }).map((a) => a.id);
    save(move(prefs, drag, ids.indexOf(targetId)));
    setDrag(null);
  };

  const exportFile = () => {
    const blob = new Blob([exportPrefs(prefs)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lens-right-click-menu.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { prefs: next, skipped } = importPrefs(await f.text());
      save(next);
      setNote(skipped.length ? `Imported. Skipped ${skipped.length} custom action${skipped.length === 1 ? "" : "s"} that didn't check out.` : "Imported.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const draftProblems = draft ? validateCustom(draft) : [];

  return (
    <div className="cc-card rc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Right-click menu</div>
          <div className="cc-desc">
            One menu everywhere: your browser, Lens Browser, File Explorer, the Shelf, the Dock and Lens Mini. The first {MAX_TOP} show
            right away; the rest sit under More. Anything sent to Claude asks first.
          </div>
        </div>
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Learn from use</div>
          <div className="cc-desc">Float the actions you use most to the top. Counts stay on this PC; turning this off forgets them.</div>
        </div>
        <button type="button" role="switch" aria-checked={prefs.learn} aria-label="Learn from use"
          className={`cc-toggle ${prefs.learn ? "on" : ""}`} onClick={() => save({ ...prefs, learn: !prefs.learn })} />
      </div>

      <div className="rc-places" role="tablist" aria-label="Where you right-click">
        {PLACES.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={place === p.id}
            className={`cc-chip ${place === p.id ? "active" : ""}`} onClick={() => setPlace(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="rc-split">
        <ul className="rc-list" aria-label={`Actions for ${CONTEXT_LABELS[ctx.kind] ?? ctx.kind}`}>
          {here.map((a) => {
            const pinned = prefs.pinned.includes(a.id);
            const hidden = prefs.hidden.includes(a.id);
            return (
              <li key={a.id}
                className={`rc-row ${hidden ? "is-hidden" : ""} ${drag === a.id ? "is-dragging" : ""}`}
                draggable={!pinned}
                onDragStart={() => setDrag(a.id)}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(a.id)}>
                <span className="rc-grip" aria-hidden><GripVertical size={14} /></span>
                <span className="rc-icon"><ActionIcon name={a.icon} /></span>
                <span className="rc-name">
                  {a.label}
                  {a.custom && <span className="rc-badge">Custom</span>}
                  {a.provider === "claude" && <span className="rc-badge">Claude</span>}
                  {a.provider === "local" && <span className="rc-badge is-quiet">Local</span>}
                </span>
                <button type="button" className={`rc-iconbtn ${pinned ? "is-on" : ""}`} aria-pressed={pinned}
                  aria-label={pinned ? `Unpin ${a.label}` : `Pin ${a.label} to the top`} onClick={() => save(togglePin(prefs, a.id))}>
                  <Pin size={14} />
                </button>
                <button type="button" className="rc-iconbtn" aria-pressed={hidden}
                  aria-label={hidden ? `Show ${a.label}` : `Hide ${a.label}`} onClick={() => save(toggleHidden(prefs, a.id))}>
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                {a.custom ? (
                  <button type="button" className="rc-iconbtn" aria-label={`Delete ${a.label}`} onClick={() => save(removeCustom(prefs, a.id))}>
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span className="rc-iconbtn is-slot" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>

        <div className="rc-preview" aria-label="Menu preview">
          <div className="rc-preview-head">Preview · {(PLACES.find((p) => p.id === place) ?? PLACES[0]).label}</div>
          <div className="rc-menu" role="menu">
            <div className="rc-menu-title">Lens</div>
            {menu.top.map((a) => (
              <div key={a.id} className="rc-menu-item" role="menuitem">
                <ActionIcon name={a.icon} size={14} />
                <span>{a.label}</span>
                {a.variants && <ChevronRight size={12} className="rc-menu-chev" />}
              </div>
            ))}
            {menu.more.length > 0 && (
              <div className="rc-menu-item is-more" role="menuitem">
                <span>More</span>
                <span className="rc-menu-count">{menu.more.length}</span>
                <ChevronRight size={12} className="rc-menu-chev" />
              </div>
            )}
            {!menu.top.length && <div className="rc-menu-empty">Nothing here. Show an action on the left.</div>}
          </div>
        </div>
      </div>

      {draft ? (
        <div className="rc-custom">
          <div className="cc-label">New action</div>
          <input className="cc-input" placeholder="Name, e.g. Explain like a lawyer" value={draft.label} aria-label="Name"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <textarea className="cc-input rc-prompt" rows={3} aria-label="Prompt" value={draft.prompt}
            placeholder="Prompt. Use {selection}, {page}, {clipboard}, {shelf}, {title}, {url}, {lang}."
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
          <div className="rc-places" aria-label="Where it appears">
            {["selection", "page", "youtube", "clipboard", "shelf", "notification", "file:text", "file:document"].map((c) => {
              const on = draft.contexts.includes(c);
              const label = c.startsWith("file:") ? (c === "file:text" ? "Text files" : "Documents") : CONTEXT_LABELS[c];
              return (
                <button key={c} type="button" aria-pressed={on} className={`cc-chip ${on ? "active" : ""}`}
                  onClick={() => setDraft({ ...draft, contexts: on ? draft.contexts.filter((x) => x !== c) : [...draft.contexts, c] })}>
                  {label}
                </button>
              );
            })}
          </div>
          <div className="cc-row">
            <div className="rc-seg" role="radiogroup" aria-label="Engine">
              {PROVIDERS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={draft.provider === p.id}
                  className={`cc-chip ${draft.provider === p.id ? "active" : ""}`} onClick={() => setDraft({ ...draft, provider: p.id })}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="rc-actions">
              <button type="button" className="cc-btn" onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className="cc-btn cc-btn-primary" disabled={draftProblems.length > 0}
                onClick={() => {
                  try {
                    save(addCustom(prefs, draft));
                    setDraft(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}>
                Add action
              </button>
            </div>
          </div>
          {draftProblems.length > 0 && (draft.label || draft.prompt) && <div className="rc-hint">{draftProblems[0]}</div>}
        </div>
      ) : null}

      <div className="rc-footer">
        <button type="button" className="cc-btn" onClick={() => setDraft({ label: "", prompt: "", contexts: [ctx.kind === "file" ? "file:text" : ctx.kind], provider: "local" })}>
          <Plus size={14} /> New action
        </button>
        <span className="rc-spacer" />
        <button type="button" className="cc-btn" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Import
        </button>
        <button type="button" className="cc-btn" onClick={exportFile}>
          <Download size={14} /> Export
        </button>
        <button type="button" className="cc-btn"
          onClick={() => contextMenuReset().then(() => { setPrefs(DEFAULT_PREFS); setUsage({}); setNote("Back to the default menu."); }).catch((e) => setError(String(e)))}>
          <RotateCcw size={14} /> Reset
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
      </div>
      {(error || note) && <div className={`rc-hint ${error ? "is-error" : ""}`}>{error ?? note}</div>}
      <div className="cc-desc">File Explorer picks up hidden actions the next time you install its menu (Connections → File Explorer).</div>
    </div>
  );
};
