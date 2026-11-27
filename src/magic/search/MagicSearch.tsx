// Lens Magic Search (docs/plans/SELECTION_BAR.md §3.4): the pop-out that answers a selection.
// Window label "magicsearch" (lazy, 420 × 520, can grow into a side panel). Fast first: smart
// cards are instant, the quick answer streams in (local model when there is one, else the
// configured AI under its privacy rules, and the panel says which), web results arrive from the
// sources the backend aggregates, and matches from your own Lens data are found on this PC.
// It grows from the bar button that opened it and returns there when it closes.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BookmarkPlus, Check, Copy, CornerDownLeft, ExternalLink, FileText, Globe, Maximize2, Minimize2, NotebookPen, Pin, Replace, Search, Sparkles, X } from "lucide-react";
import { useLensState } from "../../hooks/useLensState";
import { aiStatus, useAiRequest } from "../../ai/client";
import type { AiStatus } from "../../ai/contract";
import { shelfMicroSave } from "../../context/contract";
import { ApprovalCard } from "../../approval/ApprovalCard";
import { useLocalApproval } from "../../approval/LocalApproval";
import type { ApprovalPreview } from "../../approval/model";
import { clearPose, glide } from "../../ui/motion";
import type { MagicSearchOpen, WebAnswer } from "../../types/generated";
import { barSettings } from "../selection/model";
import { press } from "../selection/press";
import {
  EVT_OPEN, answerGate, answerParts, buildRequest, copyText, localMatches, monogram, refine, sections, smartCards, sourceLine,
  type Card, type LocalItem, type ProviderPref, type Turn,
} from "./model";
import "./magicSearch.css";

const ACTION_TITLES: Record<string, string> = {
  ask: "Ask", summarize: "Summary", explain: "Explanation", define: "Definition", translate: "Translation", rewrite: "Rewrite",
  fix_grammar: "Fixed text", extract: "Extracted", context_add: "Context", send_claude: "Claude",
};

export interface MagicSearchInitial {
  open: MagicSearchOpen;
  web?: WebAnswer;
  local?: LocalItem[];
  answer?: string;
  provider?: string;
  side?: boolean;
  thread?: Turn[];
}

type Copied = "plain" | "sources" | null;

export function MagicSearch({ initial }: { initial?: MagicSearchInitial } = {}) {
  const { config } = useLensState();
  const bar = useMemo(() => barSettings(config), [config]);
  const preview = !!initial;
  const [open, setOpen] = useState<MagicSearchOpen | null>(initial?.open ?? null);
  const [query, setQuery] = useState(initial?.open.query ?? "");
  const [web, setWeb] = useState<WebAnswer | null>(initial?.web ?? null);
  const [webBusy, setWebBusy] = useState(false);
  const [local, setLocal] = useState<LocalItem[]>(initial?.local ?? []);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [consented, setConsented] = useState(false);
  const [thread, setThread] = useState<Turn[]>(initial?.thread ?? []);
  const [follow, setFollow] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [side, setSide] = useState(!!initial?.side);
  const [copied, setCopied] = useState<Copied>(null);
  const [note, setNote] = useState("");
  const [replacing, setReplacing] = useState(false);
  const ai = useAiRequest();
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const root = useRef<HTMLDivElement>(null);
  const asked = useRef<string>("");

  const answer = initial?.answer ?? ai.text;
  const providerName = initial?.provider ?? ai.provider ?? "";
  const pref = ((bar.providers.magic_search as ProviderPref | undefined) ?? "default") as ProviderPref;
  const gate = answerGate(preview ? { providers: [{ id: "local", kind: "local", label: initial?.provider ?? "Ollama", available: true, model: "", is_local: true, needs_key: false, has_key: false }], active: "local", privacy: "local_only" } as AiStatus : status, pref, consented);
  const results = web?.results ?? [];
  const cards: Card[] = useMemo(() => (open?.action ? [] : smartCards(query)), [query, open?.action]);
  const action = open?.action ?? null;

  // ---- opening ---------------------------------------------------------------------------------
  const accept = useCallback((o: MagicSearchOpen) => {
    setOpen(o);
    setQuery(o.query);
    setWeb(null);
    setLocal([]);
    setThread([]);
    setFollow("");
    setOnlyMine(false);
    setCopied(null);
    setNote("");
    setConsented(false);
    asked.current = "";
    aiRef.current.reset();
    // Grow from the bar button that opened it (FLIP, transform only).
    const el = root.current;
    const g = o.origin;
    clearPose(el);
    if (el && g && g.w > 0 && g.h > 0) {
      const r = el.getBoundingClientRect();
      glide(el, { x: g.x, y: g.y, scaleX: g.w / Math.max(1, r.width), scaleY: g.h / Math.max(1, r.height), opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1 }, { duration: "base", ease: "out", origin: "top left" });
    } else if (el) {
      glide(el, { y: o.above ? 6 : -6, opacity: 0 }, { y: 0, opacity: 1 }, { duration: "base", ease: "out" });
    }
  }, []);

  useEffect(() => {
    if (preview) return;
    let alive = true;
    const un = listen<MagicSearchOpen>(EVT_OPEN, (e) => accept(e.payload));
    invoke<MagicSearchOpen | null>("magic_search_last").then((o) => alive && o && accept(o)).catch(() => {});
    aiStatus().then((s) => alive && setStatus(s)).catch(() => {});
    return () => {
      alive = false;
      un.then((u) => u()).catch(() => {});
    };
  }, [preview, accept]);

  // Entrance for parity scenes.
  useLayoutEffect(() => {
    if (preview && root.current) glide(root.current, { y: -6, opacity: 0 }, { y: 0, opacity: 1 }, { duration: "base", ease: "out" });
  }, [preview]);

  // ---- results ---------------------------------------------------------------------------------
  useEffect(() => {
    if (preview || !open || action) return;
    let alive = true;
    if (bar.webResults) {
      setWebBusy(true);
      invoke<WebAnswer>("magic_search_web", { query })
        .then((w) => alive && setWeb(w))
        .catch(() => alive && setWeb({ results: [], sources: [], engineUrl: "", engineName: "", stub: false }))
        .finally(() => alive && setWebBusy(false));
    }
    if (bar.localResults) void findLocal(query).then((l) => alive && setLocal(l));
    return () => {
      alive = false;
    };
  }, [open?.seq, query, preview, action, bar.webResults, bar.localResults]);

  // The quick answer: starts once web results are in (they are its sources), or at once for an action.
  useEffect(() => {
    if (preview || !open || onlyMine) return;
    if (gate.gate !== "ok") return;
    const key = `${open.seq}:${query}`;
    if (asked.current === key) return;
    if (!action && bar.webResults && webBusy) return;
    asked.current = key;
    void aiRef.current.ask(buildRequest({ query, action, results, provider: gate.provider }));
  }, [open?.seq, query, webBusy, gate.gate, onlyMine, preview]);

  // ---- closing ---------------------------------------------------------------------------------
  const close = useCallback(() => {
    if (preview) return;
    const el = root.current;
    const g = open?.origin;
    const done = () => void invoke("magic_search_hide").catch(() => {});
    if (el && g && g.w > 0) {
      const r = el.getBoundingClientRect();
      const h = glide(el, { x: 0, y: 0, scale: 1, opacity: 1 }, { x: g.x, y: g.y, scaleX: g.w / Math.max(1, r.width), scaleY: g.h / Math.max(1, r.height), opacity: 0 }, { duration: "exit", ease: "exit", origin: "top left", hold: true });
      void h.finished.then(done, done);
    } else done();
    aiRef.current.cancel();
  }, [open, preview]);

  useEffect(() => {
    if (preview) return;
    let un: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload }) => {
        if (!payload && !pinned && !replacing) close();
      })
      .then((u) => (un = u))
      .catch(() => {});
    return () => un?.();
  }, [pinned, replacing, close, preview]);

  // ---- actions ---------------------------------------------------------------------------------
  const copy = async (withSources: boolean) => {
    const text = copyText(answer, results, withSources);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(withSources ? "sources" : "plain");
    } catch {
      setNote("Couldn't copy.");
    }
  };

  const save = async (asNote: boolean) => {
    if (preview) return;
    try {
      const r = await shelfMicroSave({ kind: "answer", title: query.slice(0, 120), text: copyText(answer, results, true), note: asNote ? "note" : undefined });
      setNote(r.duplicate ? "Already on your Shelf." : asNote ? "Saved as a note." : "Saved to the Shelf.");
    } catch (e) {
      setNote(String(e));
    }
  };

  const openUrl = (url: string) => {
    if (preview || !url) return;
    void invoke("browser_open", { url }).catch(() => {});
  };

  const askFollowUp = () => {
    const f = follow.trim();
    if (!f || preview) return;
    const t = [...thread, ...(answer ? [{ q: thread.length ? thread[thread.length - 1].q : query, a: answer }] : [])];
    setThread([...thread, { q: f, a: "" }]);
    setFollow("");
    void ai.ask(buildRequest({ query, action: null, results, thread: t, followUp: f, provider: gate.provider }));
  };

  const toggleSide = () => {
    const next = !side;
    setSide(next);
    if (!preview) void invoke("magic_search_layout", { side: next }).catch(() => {});
  };

  // Replace the selection: only in editable text, and only after the one approval card.
  const replacePreview: ApprovalPreview | null = replacing
    ? {
        question: `Replace the selection in ${(open?.app.split(/[\\/]/).pop() ?? "the app").replace(/\.exe$/i, "")} with this answer?`,
        verb: "Replace",
        kind: "element",
        details: [
          { label: "New text", value: copyText(answer, results, false).slice(0, 400) },
          { label: "Clipboard", value: "Holds the answer afterwards" },
        ],
        reversible: true,
        risk: "confirm",
        capabilities: ["edit_text"],
        tone: "neutral",
        denyLabel: "Keep it",
      } as ApprovalPreview
    : null;
  const doReplace = () => {
    setReplacing(false);
    void invoke<string>("magic_search_replace", { text: copyText(answer, results, false) }).catch((e) => setNote(String(e)));
  };
  const settle = useLocalApproval({
    reference: replacing && open ? `magicsearch-replace-${open.seq}` : null,
    tool: "replace_selection",
    text: "Replace the selection with the answer",
    source: "Magic Search",
    preview: replacePreview,
    onApprove: doReplace,
    onDeny: () => setReplacing(false),
  });

  // Esc closes from anywhere in the window (the approval card handles its own Esc first).
  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !replacing && !e.defaultPrevented) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, replacing, close]);

  if (!open) return null;
  const secs = sections({ answerable: gate.gate !== "no-provider" || !!answer, cards: cards.length, web, webOn: bar.webResults && !action, local: local.length, onlyMine });
  const title = action ? ACTION_TITLES[action] ?? "Answer" : "Magic Search";
  const parts = answerParts(answer, results.length);
  const running = ai.status === "running" || ai.status === "waiting";

  return (
    <div
      ref={root}
      className={`msearch${side ? " is-side" : ""}`}
      role="dialog"
      aria-label={title}
    >
      <header className="ms-head">
        <span className="ms-mark" aria-hidden>
          <Sparkles size={14} strokeWidth={2.4} />
        </span>
        <span className="ms-title">{title}</span>
        <div className="ms-head-actions">
          <button type="button" className={`ms-icon${pinned ? " is-on" : ""}`} aria-label={pinned ? "Unpin" : "Pin, so it stays open"} aria-pressed={pinned} {...press("medium")} onClick={() => setPinned((p) => !p)}>
            <Pin size={14} strokeWidth={2.4} />
          </button>
          <button type="button" className="ms-icon" aria-label={side ? "Back to a pop-out" : "Open as a side panel"} {...press("medium")} onClick={toggleSide}>
            {side ? <Minimize2 size={14} strokeWidth={2.4} /> : <Maximize2 size={14} strokeWidth={2.4} />}
          </button>
          <button type="button" className="ms-icon ms-close" aria-label="Close" {...press("medium")} onClick={close}>
            <X size={14} strokeWidth={2.6} />
          </button>
        </div>
      </header>

      <form
        className="ms-query"
        onSubmit={(e) => {
          e.preventDefault();
          const q = refine(query, "");
          if (q && open) setOpen({ ...open, seq: open.seq + 1000, query: q });
        }}
      >
        <Search size={14} strokeWidth={2.4} aria-hidden />
        <input className="ms-query-input" aria-label="Search for" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        <button type="button" className={`ms-chip${onlyMine ? " is-on" : ""}`} aria-pressed={onlyMine} {...press("light")} onClick={() => setOnlyMine((v) => !v)}>
          Only my files
        </button>
      </form>

      <div className="ms-body">
        {secs.includes("answer") ? (
          <section className="ms-answer" aria-label="Quick answer" aria-busy={running}>
            <div className="ms-provider">{gate.gate === "ok" && providerName ? (gate.cloud ? `Answered by ${providerName} (cloud). The selection was sent to it.` : `Answered by ${providerName} on this PC.`) : gate.line}</div>
            {gate.gate === "consent" ? (
              <div className="ms-consent">
                <span>Send the selection to {gate.provider?.label ?? "the AI"} for a quick answer?</span>
                <button type="button" className="ms-btn is-primary" {...press("heavy")} onClick={() => setConsented(true)}>
                  Send
                </button>
              </div>
            ) : null}
            {answer ? (
              <p className="ms-answer-text">
                {parts.map((p, i) =>
                  p.t === "text" ? (
                    <React.Fragment key={i}>{p.v}</React.Fragment>
                  ) : (
                    <button key={i} type="button" className="ms-cite" aria-label={`Source ${p.n}: ${results[p.n - 1]?.title ?? ""}`} {...press("light")} onClick={() => openUrl(results[p.n - 1]?.url ?? "")}>
                      {p.n}
                    </button>
                  ),
                )}
              </p>
            ) : running || (gate.gate === "ok" && webBusy) ? (
              <div className="ms-skeleton" aria-hidden>
                <span />
                <span />
                <span />
              </div>
            ) : ai.error ? (
              <p className="ms-error">{ai.error}</p>
            ) : null}
            {answer ? (
              <div className="ms-actions">
                <button type="button" className="ms-btn" {...press("medium")} onClick={() => void copy(false)}>
                  {copied === "plain" ? <Check size={13} /> : <Copy size={13} />} Copy
                </button>
                <button type="button" className="ms-btn" {...press("medium")} onClick={() => void copy(true)} disabled={!results.length}>
                  {copied === "sources" ? <Check size={13} /> : <Copy size={13} />} With sources
                </button>
                <button type="button" className="ms-btn" {...press("medium")} onClick={() => void save(false)}>
                  <BookmarkPlus size={13} /> Shelf
                </button>
                <button type="button" className="ms-btn" {...press("medium")} onClick={() => void save(true)}>
                  <NotebookPen size={13} /> Note
                </button>
                {open.editable ? (
                  <button type="button" className="ms-btn" {...press("heavy")} onClick={() => setReplacing(true)}>
                    <Replace size={13} /> Replace selection
                  </button>
                ) : null}
              </div>
            ) : null}
            {replacing && replacePreview ? (
              <ApprovalCard
                request={{ id: `magicsearch-replace-${open.seq}`, origin: "app", reference: `magicsearch-replace-${open.seq}`, source: "Magic Search", createdMs: open.atMs, preview: replacePreview }}
                compact
                onApprove={async () => {
                  settle(true);
                  doReplace();
                  return true;
                }}
                onDeny={() => {
                  settle(false, "Kept the selection.");
                  setReplacing(false);
                }}
              />
            ) : null}
            {thread.length ? (
              <ol className="ms-thread" aria-label="Follow-up questions">
                {thread.map((t, i) => (
                  <li key={i} className="ms-turn">
                    <span className="ms-turn-q">{t.q}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}

        {secs.includes("cards") ? (
          <section className="ms-cards" aria-label="Quick facts">
            {cards.map((c, i) => (
              <div key={i} className="ms-card">
                {c.type === "maths" ? (
                  <>
                    <span className="ms-card-k">Maths</span>
                    <span className="ms-card-v">{c.expr} = <b>{c.result}</b></span>
                  </>
                ) : c.type === "convert" ? (
                  <>
                    <span className="ms-card-k">Conversion</span>
                    <span className="ms-card-v">{c.from} ≈ <b>{c.to}</b></span>
                  </>
                ) : c.type === "define" ? (
                  <>
                    <span className="ms-card-k">Definition</span>
                    <button type="button" className="ms-link" {...press("light")} onClick={() => !preview && void invoke("magic_search_open", { query: c.word, action: "define" })}>Define “{c.word}”</button>
                  </>
                ) : c.type === "translate" ? (
                  <>
                    <span className="ms-card-k">{c.script} text</span>
                    <button type="button" className="ms-link" {...press("light")} onClick={() => !preview && void invoke("magic_search_open", { query, action: "translate" })}>Translate</button>
                  </>
                ) : (
                  <>
                    <span className="ms-card-k">{c.language} code</span>
                    <button type="button" className="ms-link" {...press("light")} onClick={() => !preview && void invoke("magic_search_open", { query, action: "explain" })}>Explain this code</button>
                  </>
                )}
              </div>
            ))}
          </section>
        ) : null}

        {secs.includes("web") ? (
          <section className="ms-web" aria-label="Web results" aria-busy={webBusy}>
            <div className="ms-sec-head">
              <span>Web</span>
              {web?.engineUrl ? (
                <button type="button" className="ms-link" {...press("light")} onClick={() => openUrl(web.engineUrl)}>
                  Open in Lens Browser <ExternalLink size={11} />
                </button>
              ) : null}
            </div>
            {webBusy && !results.length ? (
              <div className="ms-skeleton is-rows" aria-hidden>
                <span />
                <span />
              </div>
            ) : null}
            <ol className="ms-list">
              {results.map((r, i) => (
                <li key={r.url} className="ms-result">
                  <button type="button" className="ms-row" {...press("light")} onClick={() => openUrl(r.url)} draggable onDragStart={(e) => e.dataTransfer.setData("text/uri-list", r.url)}>
                    <span className="ms-mono" aria-hidden>{monogram(r.site)}</span>
                    <span className="ms-row-main">
                      <span className="ms-row-title">
                        <span className="ms-row-n">{i + 1}</span> {r.title}
                      </span>
                      <span className="ms-row-site">{sourceLine(r)}</span>
                      {r.snippet ? <span className="ms-row-snip">{r.snippet}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {web && !webBusy && !results.length ? <p className="ms-empty">No web results{web.engineName ? ` from ${web.engineName}` : ""}.</p> : null}
          </section>
        ) : null}

        {secs.includes("local") ? (
          <section className="ms-local" aria-label="From your files">
            <div className="ms-sec-head">
              <span>From your Lens</span>
              <span className="ms-dim">on this PC only</span>
            </div>
            <ol className="ms-list">
              {local.map((l) => (
                <li key={`${l.kind}:${l.id}`} className="ms-result">
                  <button type="button" className="ms-row" {...press("light")} onClick={() => l.target && openUrl(l.target.startsWith("http") ? l.target : "")}>
                    <span className="ms-mono is-local" aria-hidden>
                      {l.kind === "file" ? <FileText size={12} /> : l.kind === "note" ? <NotebookPen size={12} /> : l.kind === "clip" ? <Copy size={12} /> : <BookmarkPlus size={12} />}
                    </span>
                    <span className="ms-row-main">
                      <span className="ms-row-title">{l.title}</span>
                      <span className="ms-row-snip">{l.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {!local.length ? <p className="ms-empty">Nothing in your Shelf, clipboard history, notes or recent files matches.</p> : null}
          </section>
        ) : null}
      </div>

      <footer className="ms-foot">
        {note ? <span className="ms-note" role="status">{note}</span> : null}
        <form
          className="ms-follow"
          onSubmit={(e) => {
            e.preventDefault();
            askFollowUp();
          }}
        >
          <input className="ms-follow-input" aria-label="Ask a follow-up" placeholder="Ask a follow-up" value={follow} onChange={(e) => setFollow(e.target.value)} disabled={gate.gate !== "ok"} />
          <button type="submit" className="ms-icon" aria-label="Ask" {...press("medium")} disabled={!follow.trim() || gate.gate !== "ok"}>
            <CornerDownLeft size={14} strokeWidth={2.4} />
          </button>
        </form>
        <div className="ms-sources" aria-label="Sources used">
          <Globe size={11} aria-hidden />
          {web?.sources.length
            ? web.sources.map((s) => (
                <span key={s.id} className={`ms-src${s.ok ? "" : " is-bad"}`}>
                  {s.label}
                  {s.ok ? ` (${s.count})` : ` — ${s.error ?? "no answer"}`}
                </span>
              ))
            : <span className="ms-src">{bar.webResults ? "No web sources yet" : "Web results are off"}</span>}
          {web?.stub ? <span className="ms-src">test data</span> : null}
        </div>
      </footer>
    </div>
  );
}

/** Your own Lens data, searched here (Shelf, clipboard history, notes, recent files). */
async function findLocal(query: string): Promise<LocalItem[]> {
  const items: LocalItem[] = [];
  const shelf = await invoke<{ id: string; kind: string; title: string; text: string; url?: string | null; tags?: string[] }[]>("shelf_list", { shelf: null }).catch(() => []);
  for (const s of shelf ?? []) items.push({ kind: s.tags?.includes("note") ? "note" : "shelf", id: s.id, title: s.title || s.text.slice(0, 60), detail: s.text.slice(0, 160), target: s.url ?? undefined });
  const clips = await invoke<{ id: number; preview: string; title?: string | null }[]>("clip_list", { query, kind: null }).catch(() => []);
  for (const c of clips ?? []) items.push({ kind: "clip", id: String(c.id), title: c.title || c.preview.slice(0, 60), detail: c.preview.slice(0, 160) });
  const files = await invoke<{ name: string; path: string }[]>("search_files_cmd", { query: query.slice(0, 80), limit: 6 }).catch(() => []);
  for (const f of files ?? []) items.push({ kind: "file", id: f.path, title: f.name, detail: f.path, target: f.path });
  return localMatches(query, items, 3);
}

export default MagicSearch;
