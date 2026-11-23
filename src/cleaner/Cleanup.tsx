import React, { useEffect, useRef } from "react";
import { ChevronDown, ExternalLink, FolderOpen, PartyPopper, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { COPY, ageLabel, checkState, fmtSize, headline, isWhole, ordered, selectedBytes, type FlowEvent, type FlowState } from "./model";
import type { CleanerCategory } from "./types";
import { CatIcon, Check3, CountSize, Key, SafetyBadge } from "./ui";

function shortPath(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts.length > 4 ? `${parts.slice(0, 2).join("\\")}\\…\\${parts.slice(-2).join("\\")}` : p;
}

const Row: React.FC<{
  c: CleanerCategory;
  s: FlowState;
  dispatch: (e: FlowEvent) => void;
  focused: boolean;
  onFocus: () => void;
  onReveal: (p: string) => void;
  onOpen: (uri: string) => void;
  index: number;
}> = ({ c, s, dispatch, focused, onFocus, onReveal, onOpen, index }) => {
  const open = s.expanded === c.id;
  const state = checkState(s, c);
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    // Move focus only when the keyboard moved it (never on first render).
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (focused && ref.current && document.activeElement !== ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: false });
  }, [focused]);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [open]);
  const picked = new Set(s.picks[c.id] ?? []);
  const panelId = `cl-panel-${c.id}`;
  return (
    <div className={`cl-cat is-${c.safety.toLowerCase()}${open ? " is-open" : ""}${state !== "unchecked" ? " is-on" : ""}`} style={{ ["--i" as string]: index }}>
      <div
        ref={ref}
        className="cl-cat-head"
        role="button"
        tabIndex={focused ? 0 : -1}
        aria-expanded={open}
        aria-controls={panelId}
        onFocus={onFocus}
        onClick={() => dispatch({ type: "expand", id: c.id })}
      >
        <Check3 state={state} label={`Clean ${c.title}`} onToggle={() => dispatch({ type: "toggle", id: c.id })} />
        <CatIcon name={c.icon} />
        <span className="cl-cat-text">
          <span className="cl-cat-title">
            {c.title} <SafetyBadge safety={c.safety} />
          </span>
          <span className="cl-cat-desc">{c.description}</span>
        </span>
        <span className="cl-cat-size cl-num">
          {c.partial && c.size === 0 ? "Needs admin" : fmtSize(c.size)}
          {c.partial && c.size > 0 ? "+" : ""}
        </span>
        <ChevronDown className="cl-chev" size={16} aria-hidden />
      </div>
      {open && (
        <div className="cl-cat-body" id={panelId}>
          <p className="cl-cost">
            <span className="cl-meta">WHAT IT COSTS</span> {c.cost}
          </p>
          {c.method === "elevated" && <p className="cl-meta">Runs Windows' own cleanup tool. Windows asks for permission first.</p>}
          {c.method === "openSettings" && c.action && (
            <button type="button" className="cl-btn is-ghost is-sm" onClick={() => onOpen(c.action!)}>
              <ExternalLink size={13} aria-hidden /> Open Windows' page
            </button>
          )}
          {c.items.length > 0 && (
            <ul className="cl-items" aria-label={`${c.title} items`}>
              {c.items.slice(0, isWhole(c) ? 8 : 60).map((it) => (
                <li key={it.path} className="cl-item">
                  {!isWhole(c) && <Check3 state={picked.has(it.path) ? "checked" : "unchecked"} label={`Pick ${it.path}`} onToggle={() => dispatch({ type: "pick", category: c.id, path: it.path })} />}
                  <span className="cl-item-path cl-mono" title={undefined}>
                    {it.note ? <span className="cl-item-note">{it.note}</span> : null}
                    {shortPath(it.path)}
                  </span>
                  <span className="cl-item-age cl-meta">{it.ageDays > 0 ? ageLabel(it.ageDays) : ""}</span>
                  <span className="cl-num cl-item-size">{fmtSize(it.size)}</span>
                  {it.link ? (
                    <button type="button" className="cl-icon-btn" aria-label={`Uninstall in Steam: ${it.note ?? it.path}`} onClick={() => onOpen(it.link!)}>
                      <ExternalLink size={13} />
                    </button>
                  ) : (
                    <button type="button" className="cl-icon-btn" aria-label={`Show ${it.path} in File Explorer`} onClick={() => onReveal(it.path)}>
                      <FolderOpen size={13} />
                    </button>
                  )}
                </li>
              ))}
              {isWhole(c) && c.count > 8 && <li className="cl-item is-more cl-meta">…and {(c.count - 8).toLocaleString()} more. The preview lists every file.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export const Cleanup: React.FC<{
  s: FlowState;
  dispatch: (e: FlowEvent) => void;
  busy: boolean;
  onClean: () => void;
  onSmart: () => void;
  onRescan: () => void;
  onReveal: (p: string) => void;
  onOpen: (uri: string) => void;
}> = ({ s, dispatch, busy, onClean, onSmart, onRescan, onReveal, onOpen }) => {
  const r = s.report!;
  const h = headline(r);
  const cats = ordered(r);
  const [focus, setFocus] = React.useState(0);
  const sel = selectedBytes(s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocus((f) => Math.max(0, Math.min(cats.length - 1, f + (e.key === "ArrowDown" ? 1 : -1))));
      } else if (e.key === " " && cats[focus]) {
        e.preventDefault();
        dispatch({ type: "toggle", id: cats[focus].id });
      } else if (e.key === "ArrowRight" && cats[focus] && s.expanded !== cats[focus].id) {
        dispatch({ type: "expand", id: cats[focus].id });
      } else if (e.key === "ArrowLeft" && s.expanded) {
        dispatch({ type: "expand", id: s.expanded });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cats, focus, dispatch, s.expanded]);

  if (h.empty) {
    return (
      <section className="cl-empty" aria-labelledby="cl-empty-title">
        <span className="cl-empty-icon" aria-hidden>
          <PartyPopper size={28} strokeWidth={2.2} />
        </span>
        <h1 id="cl-empty-title" className="cl-h2">
          {COPY.emptyTitle}
        </h1>
        <p className="cl-sub">{COPY.emptySub}</p>
        <button type="button" className="cl-btn is-ghost" onClick={onRescan}>
          <RotateCw size={14} aria-hidden /> Scan again
        </button>
      </section>
    );
  }

  return (
    <section className="cl-cleanup" aria-labelledby="cl-found">
      <header className="cl-found">
        <div>
          <h1 id="cl-found" className="cl-h2">
            We found <CountSize bytes={h.safe} className="cl-strong" /> safe to clean
          </h1>
          {h.review > 0 && <p className="cl-sub">{COPY.reviewLine(fmtSize(h.review))}</p>}
        </div>
        <button type="button" className="cl-btn is-smart" onClick={onSmart} disabled={busy} aria-describedby="cl-smart-desc">
          <Sparkles size={15} aria-hidden /> Smart Clean <Key>Ctrl</Key>
          <Key>Enter</Key>
        </button>
        <span id="cl-smart-desc" className="cl-sr">
          Cleans only safe items. Shows you exactly what it will do first.
        </span>
      </header>

      <div className="cl-cats" role="list" aria-label="Things you can clean">
        {cats.map((c, i) => (
          <div role="listitem" key={c.id}>
            <Row c={c} s={s} dispatch={dispatch} focused={focus === i} onFocus={() => setFocus(i)} onReveal={onReveal} onOpen={onOpen} index={i} />
          </div>
        ))}
      </div>

      <footer className="cl-bar-sticky">
        <span className="cl-sel">
          <span className="cl-meta">SELECTED TO CLEAN</span>
          <CountSize bytes={sel} className="cl-strong cl-sel-num" duration={420} />
        </span>
        <span className="cl-hints cl-meta" aria-hidden>
          <Key>Space</Key> toggle <Key>Ctrl</Key>
          <Key>A</Key> all safe
        </span>
        <button type="button" className="cl-btn is-ghost" onClick={onRescan} disabled={busy}>
          <RotateCw size={14} aria-hidden /> Scan again
        </button>
        <button type="button" className="cl-btn is-primary" onClick={onClean} disabled={busy || sel === 0}>
          <Trash2 size={15} aria-hidden /> Clean up {fmtSize(sel)} <Key>Enter</Key>
        </button>
      </footer>
    </section>
  );
};
