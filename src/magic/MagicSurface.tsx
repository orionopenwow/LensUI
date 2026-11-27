// The magic right-click window: one compact window at the cursor with what's under the pointer,
// the matching actions, window actions, an Ask box, and inline answers and approvals.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { editDesktopWidgets } from "../deskwidgets/api";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Bookmark, BookmarkPlus, Globe, Layers, Lightbulb, Maximize2, Minus, Monitor, PanelLeft, PanelRight, Palette, Pin,
  Scissors, X, ArrowUpRight, Copy, CornerDownLeft, type LucideIcon,
  LayoutGrid,
} from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import { useAiRequest } from "../ai/client";
import { INITIAL_RUN, pendingApprovals, type AiRunState, type AiToolStep } from "../ai/contract";
import { MarkdownLite } from "../ai/MarkdownLite";
import { ActionIcon } from "../context/ActionIcon";
import { shouldRun } from "./lensPanModel";
import { DEFAULT_PREFS, type MenuPrefs, type UsageCounts } from "../context/actions";
import { contextMenuGet, contextMenuRecordUse, shelfMicroSave } from "../context/contract";
import {
  DEFAULT_MAGIC, magicGetConfig, magicHide, magicLast, magicReportOpen, magicWindowAction, onMagicOpen,
  type MagicConfig, type MagicOpen, type MagicTarget,
} from "./contract";
import {
  attachedSummary, buildRequest, initialKeys, kindLabel, localKind, markdownFor, onKey, runtimeCaps, openLatency,
  rowsFor, toneOf, visibleRows, appName, type Caps, type KeyState, type Mode, type Row,
} from "./model";
import "./magic.css";
import { logFail, quiet, retryOnce } from "../failsafe/calls";

const EXTRA_ICONS: Record<string, LucideIcon> = {
  minus: Minus, maximize: Maximize2, "panel-left": PanelLeft, "panel-right": PanelRight, monitor: Monitor, layers: Layers,
  pin: Pin, palette: Palette, scissors: Scissors, "bookmark-plus": BookmarkPlus, globe: Globe, lightbulb: Lightbulb, x: X, "layout-grid": LayoutGrid,
};

function RowIcon({ name }: { name: string }) {
  const I = EXTRA_ICONS[name];
  return I ? <I size={15} strokeWidth={2} aria-hidden /> : <ActionIcon name={name} size={15} />;
}

type Result =
  | null
  | { type: "ai"; title: string }
  | { type: "note"; text: string; ok: boolean; undo?: { label: string; action: string } }
  | { type: "confirm"; row: Row; title: string; detail: string; verb: string }
  | { type: "workspace" };

/** Time for the Magic window to leave the screen before Snip freezes it. */
const SNIP_AFTER_HIDE_MS = 140;

export interface MagicInitial {
  open: MagicOpen;
  cfg?: Partial<MagicConfig>;
  mode?: Mode;
  query?: string;
  target?: number;
  result?: Result;
  run?: AiRunState;
  caps?: Caps;
  prefs?: MenuPrefs;
  /** Static render inside Settings (no backend calls, no window behaviour). */
  preview?: boolean;
  provider?: { label: string; local: boolean };
}

const UNDO: Record<string, { label: string; action: string }> = {
  minimize: { label: "Restore", action: "restore" },
  pin: { label: "Unpin", action: "unpin" },
  "monitor:next": { label: "Move back", action: "monitor:prev" },
};

function HoldButton({ label, kbd, onDone, hold }: { label: string; kbd: string; onDone: () => void; hold: boolean }) {
  const [p, setP] = useState(0);
  const t = useRef<number | null>(null);
  const start = () => {
    if (!hold) return onDone();
    const t0 = performance.now();
    const tick = () => {
      const v = Math.min(1, (performance.now() - t0) / 700);
      setP(v);
      if (v >= 1) {
        t.current = null;
        setP(0);
        onDone();
      } else t.current = requestAnimationFrame(tick);
    };
    t.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (t.current) cancelAnimationFrame(t.current);
    t.current = null;
    setP(0);
  };
  return (
    <button
      type="button"
      className="magic-btn is-primary"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => e.key === "Enter" && onDone()}
      style={{ "--hold": p } as React.CSSProperties}
    >
      <span className="magic-hold-fill" aria-hidden />
      <span>{label}</span>
      <kbd className="magic-key">{hold ? "hold" : kbd}</kbd>
    </button>
  );
}

function Approval({ step, onAnswer }: { step: AiToolStep; onAnswer: (ok: boolean) => void }) {
  const args = Object.entries(step.args ?? {}).slice(0, 4);
  return (
    <div className="magic-approval" role="group" aria-label="Needs your OK">
      <div className="magic-approval-head">
        <span className="magic-dot is-warn" aria-hidden />
        <span>Needs your OK</span>
        <span className="magic-mono magic-muted">{step.tool}</span>
      </div>
      <div className="magic-approval-q">{step.summary}</div>
      {args.length ? (
        <dl className="magic-details">
          {args.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{k}</dt>
              <dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      <div className="magic-actions">
        <button type="button" className="magic-btn" onClick={() => onAnswer(false)}>
          Deny <kbd className="magic-key">Esc</kbd>
        </button>
        <HoldButton label="Approve" kbd="⏎" hold={step.risk !== "low"} onDone={() => onAnswer(true)} />
      </div>
    </div>
  );
}

export const MagicSurface: React.FC<{ initial?: MagicInitial }> = ({ initial }) => {
  const preview = !!initial?.preview;
  // Theme tokens for this window (a Settings preview simply re-applies the same theme).
  useLensState();
  const [open, setOpen] = useState<MagicOpen | null>(initial?.open ?? null);
  const [cfg, setCfg] = useState<MagicConfig>({ ...DEFAULT_MAGIC, enabled: true, ...(initial?.cfg ?? {}) });
  const [keys, setKeys] = useState<KeyState>({
    ...initialKeys((initial?.mode as Mode) ?? (cfg.defaultMode === "ask" ? "ask" : "do")),
    query: initial?.query ?? "",
    target: initial?.target ?? 0,
  });
  const [prefs, setPrefs] = useState<MenuPrefs>(initial?.prefs ?? DEFAULT_PREFS);
  const [usage, setUsage] = useState<UsageCounts>({});
  const [result, setResult] = useState<Result>(initial?.result ?? null);
  const [provider, setProvider] = useState(initial?.provider ?? { label: "Local", local: true });
  const ai = useAiRequest();
  const run: AiRunState = initial?.run ?? (result?.type === "ai" ? ai : INITIAL_RUN);
  const [deskOn, setDeskOn] = useState(false);
  const [snipOn, setSnipOn] = useState(false);
  // The preview passes its own; at runtime they are read on each open (B-70).
  const caps = useMemo(() => initial?.caps ?? runtimeCaps({ snipOn, desktopWidgets: deskOn }), [initial?.caps, snipOn, deskOn]);
  const inputRef = useRef<HTMLInputElement>(null);

  const targets = open?.targets ?? [];
  const t: MagicTarget | undefined = targets[Math.min(keys.target, Math.max(0, targets.length - 1))];
  const set = useMemo(() => (t ? rowsFor(t, cfg, prefs, usage, caps) : { top: [], more: [] }), [t, cfg, prefs, usage, caps]);
  const rows = visibleRows(set, keys);

  const hide = useCallback(() => {
    if (!preview) void retryOnce(magicHide, "Magic", "close the Magic window");
  }, [preview]);

  // Settings, right-click order and usage are read each time the window opens (cheap, local).
  const refresh = useCallback(() => {
    if (preview) return;
    magicGetConfig().then((c) => setCfg(c)).catch(quiet);
    invoke<boolean>("desktop_widgets_available").then((v) => setDeskOn(!!v)).catch(quiet);
    invoke<{ settings?: { enabled?: boolean } }>("snip_status").then((s) => setSnipOn(!!s?.settings?.enabled)).catch(quiet);
    contextMenuGet()
      .then((s) => {
        if (s?.prefs) setPrefs({ ...DEFAULT_PREFS, ...s.prefs });
        setUsage(s?.usage ?? {});
      })
      .catch(quiet);
    invoke<{ active: string; providers: { id: string; label: string; is_local: boolean }[] }>("ai_status")
      .then((s) => {
        const p = s.providers.find((x) => x.id === s.active);
        if (p) setProvider({ label: p.label, local: p.is_local });
      })
      .catch(quiet);
  }, [preview]);

  // A row already picked in a Lens menu's "Lens ›" panel (src/magic/LensPan.tsx): run it once
  // the rows for this open are known. Dropped if it doesn't turn up within two seconds.
  const pendingRun = useRef<{ id: string; seq: number; until: number } | null>(null);

  const accept = useCallback(
    (p: MagicOpen) => {
      const run = shouldRun(p, Date.now());
      pendingRun.current = run ? { id: run, seq: p.seq, until: Date.now() + 2000 } : null;
      setOpen(p);
      setResult(null);
      ai.reset();
      setKeys(initialKeys(cfg.defaultMode === "ask" ? "ask" : "do"));
      refresh();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        void magicReportOpen(openLatency(p.atMs, Date.now()), p.resolveMs).catch(quiet);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.defaultMode, refresh],
  );

  useEffect(() => {
    if (preview) return;
    let un: (() => void) | undefined;
    let alive = true;
    onMagicOpen(accept).then((u) => (alive ? (un = u) : u()));
    magicLast().then((p) => p && alive && accept(p)).catch(quiet);
    let unFocus: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload }) => {
        if (!payload) hide();
      })
      .then((u) => (alive ? (unFocus = u) : u()))
      .catch(logFail("Magic", "watch for focus leaving the window"));
    return () => {
      alive = false;
      un?.();
      unFocus?.();
    };
  }, [preview, accept, hide]);

  const note = (text: string, ok = true, undo?: { label: string; action: string }) => setResult({ type: "note", text, ok, undo });

  const runRow = async (row: Row) => {
    if (!t) return;
    if (row.action && !preview) void contextMenuRecordUse(row.action.id).catch(quiet);
    if (preview) return;
    const kind = localKind(row);
    try {
      if (kind === "window") {
        const verb = row.windowAction!;
        if (verb === "close") {
          return setResult({ type: "confirm", row, title: `Close ${appName(t)}?`, detail: "The app may ask to save first.", verb: "Close" });
        }
        if (verb === "workspace") return setResult({ type: "workspace" });
        if (verb === "desktop-widgets") {
          hide();
          const err = await editDesktopWidgets();
          return err ? note(err, false) : undefined;
        }
        if (verb === "rule") {
          await invoke("open_surface", { label: "settings" }).catch(logFail("Magic", "open Settings"));
          return note("Opened Settings › Windows & Quick to style this app.");
        }
        if (verb === "shelf") {
          await shelfMicroSave({ kind: "text", title: t.label, text: t.label, source_app: t.app });
          return note("Window title saved to the Shelf.");
        }
        if (verb === "tips") return ask(`Give me five practical tips for ${appName(t)}.`, "Tips");
        if (verb === "snip") {
          // Magic steps aside first so it is not in the picture, then Snip opens in window mode
          // with this window under the pointer: one click takes it. (There was no `snip_window`
          // command; this row could never have run.)
          hide();
          await new Promise((r) => setTimeout(r, SNIP_AFTER_HIDE_MS));
          await invoke("snip_start", { mode: "window", delay: null });
          return;
        }
        if (verb === "browser") {
          await invoke("browser_open", { url: null });
          return hide();
        }
        const msg = await magicWindowAction(t.window ?? 0, verb);
        return note(msg, true, UNDO[verb]);
      }
      if (kind === "copy") {
        await navigator.clipboard.writeText(markdownFor(t));
        return note("Copied as Markdown.");
      }
      if (kind === "shelf") {
        const r = await shelfMicroSave({
          kind: t.kind === "selection" ? "selection" : t.url ? "page" : t.path ? "file" : "text",
          text: t.text ?? t.label,
          title: t.label,
          url: t.url ?? undefined,
          path: t.path ?? undefined,
          source_app: t.app || undefined,
        });
        return note(r.duplicate ? "Already on your Shelf." : r.merged ? "Added to the same Shelf item." : "Saved to the Shelf.");
      }
      if (kind === "media") {
        if (t.path) {
          await invoke("transcribe_file", { path: t.path, options: { srt: false, translate: false, model: null, language: null } });
          return note("Transcribing… you'll find it in Lens Command.");
        }
        return note("Use “Get transcript” from the Lens browser extension for web videos.", false);
      }
      if (kind === "search") {
        // Lens Magic Search in its own pop-out (or Lens Browser's side panel when it is in front).
        await invoke("magic_search_open", { query: t.text ?? t.url ?? t.path ?? t.label, action: null });
        return hide();
      }
      if (kind === "command") {
        await invoke("show_command_cmd", { payload: { layout: "full", mode: "ask", text: t.text ?? t.url ?? t.path ?? t.label } });
        return hide();
      }
      if (row.risk === "confirm") {
        return setResult({
          type: "confirm",
          row,
          title: "Send to Claude?",
          detail: `Attaches: ${attachedSummary(t).join(", ") || "nothing"}.`,
          verb: "Send",
        });
      }
      setResult({ type: "ai", title: row.label });
      await ai.ask(buildRequest(t, { actionId: row.action?.id }));
    } catch (e) {
      note(String(e), false);
    }
  };

  useEffect(() => {
    const p = pendingRun.current;
    if (!p || !t || open?.seq !== p.seq) return;
    if (Date.now() > p.until) {
      pendingRun.current = null;
      return;
    }
    const row = [...set.top, ...set.more].find((r) => r.id === p.id);
    if (!row) return;
    pendingRun.current = null;
    void runRow(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, set, t]);

  const ask = async (question: string, title = "Ask") => {
    if (!t || preview) return;
    setResult({ type: "ai", title });
    await ai.ask(buildRequest(t, { question }));
  };

  const confirmYes = async () => {
    if (result?.type !== "confirm" || !t) return;
    const row = result.row;
    if (row.windowAction === "close") {
      try {
        note(await magicWindowAction(t.window ?? 0, "close"));
      } catch (e) {
        note(String(e), false);
      }
      return;
    }
    setResult({ type: "ai", title: row.label });
    await ai.ask(buildRequest(t, { actionId: row.action?.id }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (result?.type === "confirm") {
      if (e.key === "Escape") {
        e.preventDefault();
        setResult(null);
      } else if (e.key === "Enter" && result.row.risk !== "confirm") {
        void confirmYes();
      }
      return;
    }
    if (result?.type === "workspace" && /^[1-9]$/.test(e.key) && t?.window != null) {
      e.preventDefault();
      magicWindowAction(t.window, `workspace:${e.key}`).then((m) => note(m)).catch((x) => note(String(x), false));
      return;
    }
    if (result && e.key === "Escape") {
      e.preventDefault();
      setResult(null);
      ai.cancel();
      return;
    }
    const r = onKey(keys, e.key, set, targets.length);
    if (r.type === "none") return;
    e.preventDefault();
    if (r.type === "close") return hide();
    setKeys(r.state);
    if (r.type === "run") void runRow(r.row);
    if (r.type === "ask") void ask(r.question);
  };

  if (!open || !t) {
    return <div className="magic is-empty" data-preview={preview || undefined} />;
  }

  const pending = pendingApprovals(run);
  const streaming = run.status === "running" || run.status === "waiting";
  const tone = toneOf(t);
  const others = targets.length > 1;

  return (
    <div
      className="magic"
      data-flip-x={open.flippedX || undefined}
      data-flip-y={open.flippedY || undefined}
      data-preview={preview || undefined}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={`Lens — ${kindLabel(t.kind)}: ${t.label}`}
    >
      <header className="magic-head">
        {/* Announced when ← → or a chip changes what Magic acts on (screen readers). */}
        <div className="magic-target" aria-live="polite" aria-atomic="true">
          <span className={`magic-dot is-${tone}`} aria-hidden />
          <span className="magic-mono magic-kind">{kindLabel(t.kind).toUpperCase()}</span>
          <span className="magic-label">{t.label}</span>
          {t.detail ? <span className="magic-mono magic-muted magic-detail">{t.detail}</span> : null}
        </div>
        {others ? (
          <div className="magic-chips" role="tablist" aria-label="What to act on">
            {targets.map((x, i) => (
              <button
                key={`${x.kind}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === keys.target}
                className={`magic-chip${i === keys.target ? " is-on" : ""}`}
                onClick={() => {
                  setKeys({ ...keys, target: i, index: 0, showMore: false });
                  setResult(null);
                }}
              >
                {kindLabel(x.kind)}
              </button>
            ))}
            <span className="magic-mono magic-muted magic-chip-hint">← →</span>
          </div>
        ) : null}
      </header>

      <div className="magic-input">
        <div className="magic-mode" role="radiogroup" aria-label="Mode">
          {(["do", "ask"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={keys.mode === m}
              className={`magic-mode-btn${keys.mode === m ? " is-on" : ""}`}
              disabled={m === "ask" && !cfg.ai}
              onClick={() => setKeys({ ...keys, mode: m, index: 0 })}
            >
              {m === "do" ? "Do" : "Ask"}
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          className="magic-field"
          value={keys.query}
          placeholder={keys.mode === "ask" ? `Ask about this ${kindLabel(t.kind).toLowerCase()}…` : "Type to filter actions"}
          aria-label={keys.mode === "ask" ? "Ask" : "Filter actions"}
          spellCheck={false}
          onChange={(e) => setKeys({ ...keys, query: e.target.value, index: 0 })}
        />
        <kbd className="magic-key">Tab</kbd>
      </div>

      <div className="magic-body">
        {result === null && keys.mode === "do" ? (
          <ul className="magic-rows" role="listbox" aria-label="Actions">
            {rows.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === keys.index}>
                <button
                  type="button"
                  className={`magic-row${i === keys.index ? " is-sel" : ""}${r.group === "window" ? " is-window" : ""}`}
                  onMouseEnter={() => setKeys((k) => ({ ...k, index: i }))}
                  onClick={() => void runRow(r)}
                >
                  <span className="magic-row-icon">
                    <RowIcon name={r.icon} />
                  </span>
                  <span className="magic-row-label">{r.label}</span>
                  {r.hint ? <span className="magic-mono magic-muted magic-row-hint">{r.hint}</span> : null}
                  {i < 9 && !keys.query ? <kbd className="magic-key">{i + 1}</kbd> : null}
                </button>
              </li>
            ))}
            {!keys.showMore && !keys.query && set.more.length ? (
              <li>
                <button type="button" className="magic-row is-more" onClick={() => setKeys({ ...keys, showMore: true })}>
                  <span className="magic-row-label">More</span>
                  <span className="magic-mono magic-muted">{set.more.length}</span>
                </button>
              </li>
            ) : null}
            {!rows.length ? (
              <li className="magic-empty">
                <span>No matching action.</span>
                {cfg.ai ? <span className="magic-mono magic-muted">⏎ asks instead</span> : null}
              </li>
            ) : null}
          </ul>
        ) : null}

        {result === null && keys.mode === "ask" ? (
          <div className="magic-askhint">
            <div className="magic-muted">Lens sends only what's in the chip:</div>
            <div className="magic-mono">{attachedSummary(t).join(" · ") || "nothing but your question"}</div>
          </div>
        ) : null}

        {result?.type === "ai" ? (
          <div className="magic-result" aria-live="polite">
            <div className="magic-result-head">
              <span className="magic-mono magic-muted">
                {streaming ? "working" : run.status === "error" ? "error" : "done"} · {result.title.toLowerCase()}
              </span>
              {run.provider ? <span className="magic-mono magic-muted">{run.model ? `${run.provider} · ${run.model}` : run.provider}</span> : null}
            </div>
            <div className="magic-answer">
              {run.status === "error" ? <p className="magic-error">{run.error}</p> : <MarkdownLite text={run.text || (streaming ? "…" : "")} />}
            </div>
            {pending.map((s) => (
              <Approval key={s.call_id} step={s} onAnswer={(ok) => void ai.confirm(s.call_id, ok)} />
            ))}
            {!streaming && run.text ? (
              <div className="magic-actions">
                <button type="button" className="magic-btn" onClick={() => void navigator.clipboard?.writeText(run.text)}>
                  <Copy size={14} aria-hidden /> Copy
                </button>
                <button
                  type="button"
                  className="magic-btn"
                  onClick={() =>
                    void shelfMicroSave({ kind: "answer", title: `${result.title}: ${t.label}`, text: run.text })
                      .then(() => note("Answer saved to the Shelf."))
                      .catch((e) => note(String(e), false))
                  }
                >
                  <Bookmark size={14} aria-hidden /> Add to Shelf
                </button>
                <button
                  type="button"
                  className="magic-btn is-primary"
                  onClick={() =>
                    void invoke("show_command_cmd", { payload: { layout: "full", mode: "ask", text: keys.query } }).then(hide).catch(logFail("Magic", "open Lens Command"))
                  }
                >
                  Continue in Command <ArrowUpRight size={14} aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {result?.type === "note" ? (
          <div className={`magic-note${result.ok ? "" : " is-bad"}`} role="status">
            <span className={`magic-dot is-${result.ok ? "ok" : "warn"}`} aria-hidden />
            <span>{result.text}</span>
            {result.undo && t.window != null ? (
              <button
                type="button"
                className="magic-btn"
                onClick={() => magicWindowAction(t.window!, result.undo!.action).then((m) => note(m)).catch((e) => note(String(e), false))}
              >
                {result.undo.label}
              </button>
            ) : null}
          </div>
        ) : null}

        {result?.type === "confirm" ? (
          <div className="magic-approval" role="alertdialog" aria-label="Needs your OK">
            <div className="magic-approval-head">
              <span className="magic-dot is-warn" aria-hidden />
              <span>Needs your OK</span>
              <span className="magic-mono magic-muted">{t.app || "lens"}</span>
            </div>
            <div className="magic-approval-q">{result.title}</div>
            <div className="magic-muted">{result.detail}</div>
            <div className="magic-actions">
              <button type="button" className="magic-btn" onClick={() => setResult(null)}>
                Cancel <kbd className="magic-key">Esc</kbd>
              </button>
              <HoldButton label={result.verb} kbd="⏎" hold={result.row.risk === "confirm"} onDone={() => void confirmYes()} />
            </div>
          </div>
        ) : null}

        {result?.type === "workspace" ? (
          <div className="magic-note">
            <span>Move this window to workspace</span>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className="magic-btn"
                onClick={() => t.window != null && magicWindowAction(t.window, `workspace:${n}`).then((m) => note(m)).catch((e) => note(String(e), false))}
              >
                {n}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <footer className="magic-foot">
        <span className="magic-mono magic-muted">
          <span className={`magic-dot is-${provider.local ? "ok" : "warn"}`} aria-hidden /> {cfg.ai ? provider.label.toLowerCase() : "ai off"} ·{" "}
          {provider.local ? "stays on this PC" : "asks before sending"}
        </span>
        <button
          type="button"
          className="magic-link"
          onClick={() =>
            !preview && void invoke("show_command_cmd", { payload: { layout: "full", text: keys.query || undefined } }).then(hide).catch(logFail("Magic", "open Lens Command"))
          }
        >
          Expand to Command <ArrowUpRight size={12} aria-hidden />
        </button>
        <span className="magic-mono magic-muted magic-foot-keys">
          <CornerDownLeft size={11} aria-hidden /> run · esc close
        </span>
      </footer>
    </div>
  );
};

export default MagicSurface;
