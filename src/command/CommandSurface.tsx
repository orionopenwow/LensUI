// Lens Command — one input, one thread, for AI, actions, the Shelf and clipboard history.
// Layout: a single calm column (input + context strip + body + hints) with an optional Shelf drawer.
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AppWindow, Archive, ArrowUp, ClipboardList, Command as CommandIcon, CornerDownLeft, File as FileIcon, Globe, Lock,
  PanelRight, Sparkles, TextSelect, X, Zap,
} from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import type { RunningWindow } from "../types/lens";
import {
  aiAsk, aiCancel, aiConfirmTool, aiIntent, aiRunIntent, aiStatus, useAiEvents, type AiStatus, type Intent,
} from "./ai";
import {
  MODE_LABEL, MODES, cycleMode, destinationOf, mentionAtCaret, mentionSuggestions, parseMentions, parseSlash,
  slashSuggestions, type CommandTemplate, type Mode, type MentionSource,
} from "./parse";
import { buildRequest, resolveProvider } from "./request";
import { useCommandSettings } from "./settings";
import { newKey, threadReducer, type BridgeRequest, type ContextChip, type ThreadItem } from "./thread";
import { ThreadCard, type CardHandlers } from "./cards/Cards";
import { SafetyFlagBanners } from "../agentsafe/SafetyFlags";
import { ShelfDrawer, useShelf, KIND_ICON } from "./ShelfDrawer";
import { ClipList, useClips } from "./ClipList";
import { MiniView } from "./mini/MiniView";
import { SPECIAL_PROMPTS, categorize, tilesFor, type AppCategory } from "./contextProviders";
import {
  clipCopy, clipDelete, clipGetText, clipPaste, clipPasteText, clipPin, clipSetSettings, clipToShelf,
  DEFAULT_CLIP_SETTINGS, sourceAppName, type ClipKind, type ClipView,
} from "../clip/contract";
import { DEFAULT_SHELF, approxTokens, formatTokens, shelfAdd, shelfAsContext, type ShelfItem } from "../shelf/contract";
import { answersInText, runDo } from "./doMode";
import { isNewOpen, pendingOpen } from "./openSeq";
import { whereItLives } from "./teach";
import { openSettingsAt } from "../update/useLensUpdate";
import "./Command.css";
import { coreAppTemplates, isCoreAppStub, runCoreAppSlash } from "../coreapps/registry";
import { backdropTemplate, isBackdropStub, runBackdropSlash } from "../studio/backdrop/command";
import { isWallpaperStub, parseWallpaperSlash, runWallpaperSlash, wallpaperTemplate } from "../wallpapers/command";
import { isLensAppStub, lensAppTemplates, runLensAppSlash } from "../report/command";
import { dashboardTemplates, isDashboardPhrase, isDashboardStub, openDashboard } from "../dashboard/command";

const MODE_ICON: Record<Mode, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  ask: Sparkles,
  do: Zap,
  shelf: Archive,
  clipboard: ClipboardList,
  actions: CommandIcon,
};

const PLACEHOLDER: Record<Mode, string> = {
  ask: "Ask anything — / for commands, @ to add context",
  do: "Tell Lens what to do — “dark mode”, “tile left”, “focus 25 min”",
  shelf: "Search the Shelf",
  clipboard: "Search clipboard history",
  actions: "Find a command",
};

const SOURCE_ICON: Record<ContextChip["source"], React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  selection: TextSelect,
  clipboard: ClipboardList,
  clip: ClipboardList,
  window: AppWindow,
  shelf: Archive,
  page: Globe,
  file: FileIcon,
};

const STARTERS = ["summarise", "explain", "translate", "rewrite", "fix", "todo"];

function textChip(source: ContextChip["source"], label: string, value: string, extra: Partial<ContextChip> = {}): ContextChip {
  const tokens = approxTokens(value);
  return {
    key: `${source}-${extra.ids?.join(",") ?? label}`,
    source,
    label,
    detail: extra.detail ?? `${value.length.toLocaleString()} chars · ${formatTokens(tokens)}`,
    chars: value.length,
    tokens,
    localOnly: false,
    value,
    ...extra,
  };
}

/** Starting state, for tests and the parity harness. */
/** Counts an event on <html data-*> so tests and the Tester Hub can see what the surface did. */
const bump = (key: string) => {
  const d = document.documentElement.dataset;
  d[key] = String((Number(d[key]) || 0) + 1);
};

export interface CommandInitial {
  mode?: Mode;
  text?: string;
  chips?: ContextChip[];
  thread?: ThreadItem[];
  drawer?: boolean;
  picked?: string[];
  layout?: "mini" | "full";
  anchor?: "cursor" | "dock";
  miniTab?: "actions" | "dashboard";
  app?: { process: string; title?: string };
  expanding?: boolean;
}

interface ForegroundContext { process: string; appName: string; title: string; category: string; fullscreen: boolean; tiles: string[] }

export function CommandSurface({ initial }: { initial?: CommandInitial } = {}) {
  const lens = useLensState();
  const dashboardOn = !!(lens.config as { magicWaves?: { dashboard?: boolean } } | null)?.magicWaves?.dashboard;
  const settings = useCommandSettings();
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "ask");
  const [text, setText] = useState(initial?.text ?? "");
  const [caret, setCaret] = useState((initial?.text ?? "").length);
  const [chips, setChips] = useState<ContextChip[]>(initial?.chips ?? []);
  const [thread, dispatch] = useReducer(threadReducer, initial?.thread ?? ([] as ThreadItem[]));
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [drawer, setDrawer] = useState(initial?.drawer ?? false);
  const [shelf, setShelf] = useState(DEFAULT_SHELF);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial?.picked ?? []));
  const [active, setActive] = useState(0);
  const [clipKind, setClipKind] = useState<ClipKind | "all">("all");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [pages, setPages] = useState<Record<string, BridgeRequest>>({});
  const [layout, setLayout] = useState<"mini" | "full">(initial?.layout ?? "full");
  const [anchor, setAnchor] = useState<"cursor" | "dock">(initial?.anchor ?? "cursor");
  const [miniTab, setMiniTab] = useState<"actions" | "dashboard">(initial?.miniTab ?? "actions");
  const [expanding, setExpanding] = useState(!!initial?.expanding);
  const [activeTile, setActiveTile] = useState(0);
  const [fgApp, setFgApp] = useState<{ process: string; title: string } | null>(initial?.app ? { process: initial.app.process, title: initial.app.title ?? "" } : null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastAsk = useRef<Record<string, { text: string; chips: ContextChip[] }>>({});
  const answerFor = useRef<Record<string, { output: string; title: string }>>({});

  // ── data ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    invoke<{ templates: CommandTemplate[] }>("command_templates")
      .then((r) => {
        const list = r?.templates ?? [];
        // Built-in tiles that are prompts but not user templates (/review, /explain-error).
        const extra = Object.entries(SPECIAL_PROMPTS)
          .filter(([id]) => !list.some((t) => t.id === id))
          .map(([id, sp]) => ({ id, name: sp.name, description: sp.name, template: sp.template, provider: "local", input: "selection", options: [], output: "thread", builtin: true, enabled: true }));
        // Lens core apps as `/timer`, `/monitor`… (docs/CORE_APPS.md); ids Command already uses win.
        const withApps = [...list, ...extra, ...coreAppTemplates([...list, ...extra])];
        const withBackdrop = [...withApps, ...backdropTemplate(withApps)];
        const withWallpaper = [...withBackdrop, ...wallpaperTemplate(withBackdrop)];
        const withLensApps = [...withWallpaper, ...lensAppTemplates(withWallpaper)];
        setTemplates(withLensApps);
      })
      .catch(() => setTemplates([]));
    aiStatus().then(setAi).catch(() => setAi(null));
  }, []);
  // /dashboard only while the Magic Dashboard is on (docs/plans/MAGIC_WAVES.md); follows the flag live.
  useEffect(() => {
    setTemplates((list) => {
      const base = list.filter((t) => !isDashboardStub(t));
      return dashboardOn ? [...base, ...dashboardTemplates(base, true)] : base;
    });
  }, [dashboardOn, templates.length === 0]);
  useEffect(() => {
    if (initial) return; // a scripted start (tests, parity) keeps its own mode
    setMode(settings.defaultMode);
    setDrawer(settings.showShelfDrawer);
  }, [settings.defaultMode, settings.showShelfDrawer]);

  const clipQuery = mode === "clipboard" ? text : "";
  const { clips, status: clipState } = useClips(clipQuery, clipKind);
  const { items: shelfItems } = useShelf(shelf);

  const flash = useCallback((t: string, ok = true) => {
    setNotice({ text: t, ok });
    window.setTimeout(() => setNotice((n) => (n?.text === t ? null : n)), 2600);
  }, []);

  // ── the app you're in, and its selection (UI Automation; never the clipboard) ─────────────────
  const loadAppContext = useCallback(async () => {
    const ctx = await invoke<ForegroundContext>("context_foreground").catch(() => null);
    if (ctx?.process) setFgApp({ process: ctx.process, title: ctx.title });
    type Sel = { text?: string | null; app: string; category: string; refusal?: string | null };
    const sel = (await invoke<Sel | null>("selection_take").catch(() => null)) ?? (await invoke<Sel>("selection_read").catch(() => null));
    if (sel?.text) {
      const app = sel.app ? (sel.app.split(/[\\/]/).pop() ?? "").replace(/\.exe$/i, "") : "";
      setChips((cur) => [
        { ...textChip("selection", "Selection", sel.text!), detail: app, key: "selection-uia" },
        ...cur.filter((c) => c.key !== "selection-uia"),
      ]);
    }
  }, []);

  // ── auto-attached context (offered, never sent until Enter) ─────────────────────────────────
  const offerContext = useCallback(async () => {
    const want = settings.autoAttach;
    const next: ContextChip[] = [];
    if (want.includes("selection") || want.includes("clipboard")) {
      const latest = clips[0];
      const recent = latest && Date.now() - latest.tsMs < 15_000;
      if (latest && latest.kind !== "image" && (want.includes("clipboard") || recent)) {
        try {
          const value = await clipGetText(latest.id);
          next.push({ ...textChip(recent ? "selection" : "clipboard", recent ? "Just copied" : "Clipboard", value, { ids: [String(latest.id)] }), localOnly: latest.localOnly });
        } catch {
          /* history off or gone */
        }
      }
    }
    if (want.includes("window")) {
      try {
        const wins = await invoke<RunningWindow[]>("get_running_windows");
        const w = (wins ?? []).find((x) => x.isFocused) ?? (wins ?? [])[0];
        if (w) next.push({ ...textChip("window", w.title.slice(0, 40), w.title, { detail: sourceAppName(w.processName) ?? "" }), value: w.title, detail: sourceAppName(w.processName) ?? "" });
      } catch {
        /* ignore */
      }
    }
    setChips((cur) => {
      const keep = cur.filter((c) => !next.some((n) => n.key === c.key));
      return [...next, ...keep];
    });
  }, [settings.autoAttach, clips]);

  // ── opening, bridge requests ────────────────────────────────────────────────────────────────
  // One listener for the life of the window. It used to be re-registered whenever settings or
  // context helpers changed, which on a cold start (settings and clips arriving) left gaps where an
  // "open" event was lost; and the backend's replay of the first open could then land after the
  // user had typed and pressed Enter, resetting the input. Now the handler reads the latest state
  // through a ref, and each open carries a `seq` from the backend so a replay is applied only once.
  type OpenPayload = { mode?: Mode; text?: string; layout?: "mini" | "full"; anchor?: string; seq?: number } | null;
  const onOpenRef = useRef<(p: OpenPayload) => void>(() => {});
  const lastOpenSeq = useRef<number | null>(null);
  // Ready handshake with the backend (docs/brain/BUGS.md B-12). `linked` turns true once this
  // page's listeners are registered and it has applied the open the backend was holding for it.
  // An Enter pressed before that is kept and run then, so the first query is never lost.
  const [appliedSeq, setAppliedSeq] = useState<number | null>(null);
  const [linked, setLinked] = useState(false);
  const linkedRef = useRef(false);
  const queuedEnter = useRef<{ shift: boolean; ctrl: boolean } | null>(null);
  const runActiveRef = useRef<(shift: boolean, ctrl: boolean) => void>(() => {});
  onOpenRef.current = (payload: OpenPayload) => {
    const seq = typeof payload?.seq === "number" ? payload.seq : null;
    if (seq !== null && !isNewOpen(lastOpenSeq.current, seq)) return; // replay of an open we already applied
    if (seq !== null) {
      lastOpenSeq.current = seq;
      setAppliedSeq(seq);
    }
    const lay = payload?.layout ?? "full";
    setLayout(lay);
    setAnchor(payload?.anchor?.startsWith("dock") ? "dock" : "cursor");
    invoke("command_layout", { layout: lay, anchor: payload?.anchor ?? null }).catch(() => {});
    if (lay === "mini") {
      setMiniTab("actions");
      setActiveTile(0);
      loadAppContext();
    }
    if (payload?.mode) setMode(payload.mode);
    if (typeof payload?.text === "string") setText(payload.text);
    if (!settings.keepThread) dispatch({ type: "clear" });
    offerContext();
    window.setTimeout(() => inputRef.current?.focus(), 30);
  };
  useEffect(() => {
    let alive = true;
    const subs = [
      listen<OpenPayload>("lens://command/open", (e) => onOpenRef.current(e.payload)),
      listen<BridgeRequest>("lens://bridge/request", (e) => {
        const r = e.payload;
        if (!r?.id) return;
        setMode("ask");
        setPages((p) => ({ ...p, [r.id]: r }));
        dispatch({ type: "push", item: { kind: "bridge", key: `bridge-${r.id}`, request: r, state: "new", ts: Date.now() } });
      }),
    ];
    // Listeners first, then ask: the backend hands over the open this page still has to apply
    // (an event sent while the page was loading went nowhere). Nothing here is timed.
    Promise.all(subs)
      .then(() => invoke<OpenPayload>("command_ready_cmd"))
      .then((pending) => {
        if (alive && pendingOpen(pending)) onOpenRef.current(pending);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLinked(true);
      });
    return () => {
      alive = false;
      subs.forEach((p) => p.then((u) => u()).catch(() => {}));
    };
  }, []);
  // Tell the backend once an open is applied and committed: from here the submit handler sees it,
  // and the backend never sends that open again.
  useEffect(() => {
    if (appliedSeq === null) return;
    document.documentElement.dataset.commandOpen = String(appliedSeq);
    invoke("command_open_applied_cmd", { seq: appliedSeq }).catch(() => {});
  }, [appliedSeq]);
  useEffect(() => {
    linkedRef.current = linked;
    if (!linked) return;
    document.documentElement.dataset.commandReady = "1";
    const queued = queuedEnter.current;
    queuedEnter.current = null;
    if (queued) runActiveRef.current(queued.shift, queued.ctrl);
  }, [linked]);

  // ── AI events ───────────────────────────────────────────────────────────────────────────────
  useAiEvents({
    onDelta: (d) => dispatch({ type: "delta", reqId: d.id, text: d.text }),
    onDone: (d) => {
      dispatch({ type: "done", done: d });
      const route = answerFor.current[d.id];
      if (route?.output === "shelf" && !d.error) {
        // Read the finished text from the thread on the next tick.
        window.setTimeout(() => {
          const item = threadRef.current.find((i) => i.kind === "answer" && i.reqId === d.id);
          if (item && item.kind === "answer" && item.text.trim()) {
            shelfAdd({ kind: "answer", title: route.title, text: item.text }, shelf)
              .then(() => dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: "Saved to Shelf", detail: route.title, ok: true, ts: Date.now() } }))
              .catch(() => {});
          }
        }, 0);
      }
    },
    onToolProposal: (p) => dispatch({ type: "proposal", proposal: p, ts: Date.now() }),
    onToolResult: (r) => dispatch({ type: "toolResult", result: r }),
  });
  const threadRef = useRef(thread);
  threadRef.current = thread;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length]);

  // ── parsing ─────────────────────────────────────────────────────────────────────────────────
  const slash = useMemo(() => (mode === "ask" ? parseSlash(text, templates) : null), [mode, text, templates]);
  const mention = useMemo(() => (mode === "ask" ? mentionAtCaret(text, caret) : null), [mode, text, caret]);
  const popover = useMemo(() => {
    if (mention) return { kind: "mention" as const, items: mentionSuggestions(mention.partial) };
    if (slash?.completing) return { kind: "slash" as const, items: slashSuggestions(slash.typed, templates) };
    return null;
  }, [mention, slash, templates]);
  const [pop, setPop] = useState(0);
  useEffect(() => setPop(0), [popover?.kind, text]);

  const provider = useMemo(
    () => resolveProvider(slash?.command ?? null, settings.providers, ai?.providers ?? [], ai?.active ?? "local"),
    [slash, settings.providers, ai]
  );
  const dest = destinationOf(provider.kind);

  // Do mode: show what the offline parser understood, instantly.
  useEffect(() => {
    if (mode !== "do" || !text.trim()) {
      setIntent(null);
      return;
    }
    const t = window.setTimeout(() => aiIntent(text).then(setIntent).catch(() => setIntent(null)), 120);
    return () => window.clearTimeout(t);
  }, [mode, text]);

  const shelfFiltered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return mode === "shelf" && q ? shelfItems.filter((i) => `${i.title} ${i.text} ${i.tags.join(" ")}`.toLowerCase().includes(q)) : shelfItems;
  }, [mode, text, shelfItems]);
  const actionsFiltered = useMemo(() => slashSuggestions(mode === "actions" ? text.replace(/^\//, "") : "", templates), [mode, text, templates]);

  const listLen = mode === "clipboard" ? clips.length : mode === "shelf" ? shelfFiltered.length : mode === "actions" ? actionsFiltered.length : 0;
  useEffect(() => setActive(0), [mode, text, clipKind]);

  // ── chips ───────────────────────────────────────────────────────────────────────────────────
  const addChip = useCallback((c: ContextChip) => setChips((cur) => (cur.some((x) => x.key === c.key) ? cur : [...cur, c])), []);
  const removeChip = (key: string) => setChips((cur) => cur.filter((c) => c.key !== key));

  const shelfChip = (items: ShelfItem[]): ContextChip => {
    const tokens = items.reduce((n, i) => n + i.approx_tokens, 0);
    return {
      key: `shelf-${items.map((i) => i.id).join(",")}`,
      source: "shelf",
      label: items.length === 1 ? items[0].title.slice(0, 32) : `${items.length} Shelf items`,
      detail: formatTokens(tokens),
      chars: items.reduce((n, i) => n + i.chars, 0),
      tokens,
      localOnly: items.some((i) => i.local_only),
      ids: items.map((i) => i.id),
    };
  };

  const resolveMention = async (source: MentionSource, arg?: string) => {
    if (source === "shelf") {
      setDrawer(true);
      return;
    }
    if (source === "clipboard" || source === "selection") {
      const c = clips[0];
      if (!c) return flash(clipState?.enabled ? "Nothing copied yet." : "Turn on clipboard history to attach what you copy.", false);
      const value = await clipGetText(c.id).catch(() => "");
      addChip({ ...textChip(source, source === "selection" ? "Just copied" : "Clipboard", value, { ids: [String(c.id)] }), localOnly: c.localOnly });
      return;
    }
    if (source === "window") {
      const wins = await invoke<RunningWindow[]>("get_running_windows").catch(() => []);
      const w = (wins ?? []).find((x) => x.isFocused) ?? (wins ?? [])[0];
      if (w) addChip({ ...textChip("window", w.title.slice(0, 40), w.title), detail: sourceAppName(w.processName) ?? "" });
      return;
    }
    if (source === "page") {
      const last = Object.values(pages).pop();
      if (!last) return flash("Send a page from your browser first (right-click › Lens).", false);
      addChip({ ...textChip("page", last.title || last.url || "Page", last.page_text ?? ""), url: last.url, key: `page-${last.id}` });
      return;
    }
    if (source === "file" && arg) {
      addChip({ key: `file-${arg}`, source: "file", label: arg.split(/[\\/]/).pop() || arg, detail: arg, chars: 0, tokens: 0, localOnly: false, value: arg });
    }
  };

  // ── running things ──────────────────────────────────────────────────────────────────────────
  const hide = () => invoke("hide_surface", { label: "command" }).catch(() => {});

  const ask = async (raw: string, chipsNow: ContextChip[], allowTools = false) => {
    const { mentions, rest } = parseMentions(raw);
    for (const m of mentions) await resolveMention(m.source, m.arg);
    const parsed = parseSlash(rest, templates);
    const template = parsed?.command ?? null;

    // "dashboard", "open the dashboard" or /dashboard, while the Magic Dashboard is on.
    // Rust has the last word on the flag, so a Command opened before it was turned on still works.
    const dashboardAsked = isDashboardStub(template) || (!template && isDashboardPhrase(rest) && (await invoke<boolean>("dashboard_available").catch(() => false)));
    if (dashboardAsked) {
      // Hide Command first and wait, so its hide can't hand the focus back to another app after
      // the Dashboard has taken it.
      setText("");
      await hide();
      void openDashboard().then((err) => err && flash(err, false));
      return;
    }

    // Commands that are actions, not prompts.
    if (template && !template.template) {
      const arg = parsed?.args ?? "";
      if (isCoreAppStub(template) && runCoreAppSlash(template.id)) {
        hide();
        return setText("");
      }
      if (isBackdropStub(template)) {
        runBackdropSlash(arg);
        hide();
        return setText("");
      }
      if (isLensAppStub(template)) {
        // /report opens Report a problem; /update checks, or restarts into an update that's ready.
        hide();
        void runLensAppSlash(template.id).catch(() => {});
        return setText("");
      }
      if (isWallpaperStub(template)) {
        // "/wallpaper next" changes it in place and says which one; on its own it opens the picker.
        const opening = parseWallpaperSlash(arg) === "open";
        const done = runWallpaperSlash(arg);
        if (opening) hide();
        else done.then((line) => flash(line, line.startsWith("Showing")));
        return setText("");
      }
      switch (template.id) {
        case "note": {
          if (!arg.trim()) return flash("Type the note after /note.", false);
          await shelfAdd({ kind: "text", text: arg }, shelf);
          dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: "Saved to Shelf", detail: arg.slice(0, 40), ok: true, ts: Date.now() } });
          return setText("");
        }
        case "clip":
          setMode("clipboard");
          return setText(arg);
        case "clean":
          // Lens Cleaner opens on demand; nothing is deleted until you click (docs/CLEANER.md).
          await invoke("open_surface", { label: "cleaner" }).catch(() => {});
          hide();
          return setText("");
        case "shelf":
          setDrawer(true);
          setMode("shelf");
          return setText(arg);
        case "transcribe": {
          const path = arg || chipsNow.find((c) => c.source === "file")?.value;
          if (!path) return flash("Add a file: /transcribe C:\\video.mp4 or drop it here.", false);
          try {
            await invoke("transcribe_file", { path, opts: { srt: true } });
            dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: "Transcribing…", detail: path.split(/[\\/]/).pop(), ok: true, ts: Date.now() } });
          } catch (err) {
            dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: "Couldn't start transcription", detail: String(err), ok: false, ts: Date.now() } });
          }
          return setText("");
        }
        default:
          // /theme, /focus → the offline intent engine, with confirmation for anything risky.
          return ask(`${template.id} ${arg}`.trim(), chipsNow, true);
      }
    }

    const live = [...chipsNow];
    const shelfIds = live.filter((c) => c.source === "shelf").flatMap((c) => c.ids ?? []);
    const shelfText = shelfIds.length ? (await shelfAsContext(shelfIds).catch(() => null))?.text : undefined;
    const built = buildRequest({
      text: rest,
      slash: parsed,
      chips: live,
      overrides: settings.providers,
      providers: ai?.providers ?? [],
      active: ai?.active ?? "local",
      shelfText,
      allowTools,
    });
    if (!built.req.prompt.trim()) return;
    const userKey = newKey("u");
    const ansKey = newKey("a");
    dispatch({ type: "push", item: { kind: "user", key: userKey, text: built.display, command: template?.id, chips: built.sent, dest: built.dest, ts: Date.now() } });
    if (built.dropped.length) {
      dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: `Kept ${built.dropped.length} item${built.dropped.length > 1 ? "s" : ""} on this PC`, detail: "Marked private by the app it came from", ok: true, ts: Date.now() } });
    }
    dispatch({ type: "push", item: { kind: "answer", key: ansKey, reqId: null, text: "", status: "streaming", ts: Date.now() } });
    lastAsk.current[ansKey] = { text: raw, chips: chipsNow };
    setText("");
    try {
      const id = await aiAsk(built.req);
      answerFor.current[id] = { output: template?.output ?? "thread", title: template ? `${template.name}` : built.display.slice(0, 60) };
      dispatch({ type: "attachReq", key: ansKey, reqId: id });
    } catch (err) {
      dispatch({ type: "attachReq", key: ansKey, reqId: `failed-${ansKey}` });
      dispatch({ type: "done", done: { id: `failed-${ansKey}`, provider: "", model: "", error: String(err) || "AI is not set up yet. Choose a provider in Settings › AI." } });
    }
  };

  const knownIds = useMemo(() => new Set(templates.map((t) => t.id)), [templates]);
  const tiles = useMemo(() => tilesFor(fgApp?.process ?? "", settings.miniTiles, knownIds.size ? knownIds : undefined), [fgApp, settings.miniTiles, knownIds]);
  const appInfo = fgApp?.process
    ? { name: (fgApp.process.split(/[\\/]/).pop() ?? "").replace(/\.exe$/i, ""), category: categorize(fgApp.process) as AppCategory }
    : null;

  const runTile = (id: string) => {
    if (id === "ask") {
      setMode("ask");
      inputRef.current?.focus();
      return;
    }
    if (id === "shelf-add") {
      const body = text.trim() || chips.map((c) => c.value ?? "").filter(Boolean).join("\n\n");
      if (!body) return flash("Select or type something first.", false);
      const sel = chips.find((c) => c.source === "selection" || c.source === "clip");
      shelfAdd({ kind: sel ? "selection" : "text", text: body, source_app: fgApp?.process }, shelf)
        .then(() => flash("Added to Shelf"))
        .catch((e) => flash(String(e), false));
      setText("");
      return;
    }
    setMode("ask");
    ask(`/${id}${text.trim() ? " " + text.trim() : ""}`, chips);
  };

  const expand = () => {
    setExpanding(true);
    invoke("command_layout", { layout: "full", anchor: "center" }).catch(() => {});
    window.setTimeout(() => {
      setLayout("full");
      setExpanding(false);
      inputRef.current?.focus();
    }, 180);
  };

  const sessionTokens = thread.reduce((n, i) => n + (i.kind === "answer" && i.tokens ? i.tokens.in + i.tokens.out : 0), 0);
  const activeProvider = ai?.providers.find((p) => p.id === (provider.id ?? ai?.active)) ?? ai?.providers.find((p) => p.kind === provider.kind);
  const providerLabel = activeProvider ? `${activeProvider.label}${activeProvider.model ? " · " + activeProvider.model : ""}` : dest;
  const privacyLabel = ai?.privacy === "allow_cloud" ? "Cloud allowed" : ai?.privacy === "ask_each_time" ? "Asks before cloud" : "Local only";

  const latestAnswer = [...thread].reverse().find((i) => i.kind === "answer" && i.status === "done" && i.text) as
    | Extract<ThreadItem, { kind: "answer" }>
    | undefined;

  const handlers: CardHandlers = {
    onShowSetting: (target) => {
      void hide();
      void openSettingsAt(target);
    },
    onCopy: (t) => navigator.clipboard.writeText(t).then(() => flash("Copied")).catch(() => flash("Couldn't copy", false)),
    onPaste: (t) => clipPasteText(t).catch((e) => flash(String(e), false)),
    onToShelf: (t, title) =>
      shelfAdd({ kind: "answer", text: t, title }, shelf).then(() => flash("Saved to Shelf")).catch((e) => flash(String(e), false)),
    onRetry: (key) => {
      const prev = lastAsk.current[key];
      if (prev) ask(prev.text, prev.chips);
    },
    onStop: (key) => {
      const item = thread.find((i) => i.key === key);
      if (item?.kind === "answer" && item.reqId) aiCancel(item.reqId).catch(() => {});
      dispatch({ type: "cancel", key });
    },
    onTool: (callId, approve) => {
      dispatch({ type: "toolDecision", callId, approve });
      aiConfirmTool(callId, approve).catch(() => {});
    },
    onBridge: (key, run) => {
      const item = thread.find((i) => i.key === key);
      if (!item || item.kind !== "bridge") return;
      const r = item.request;
      dispatch({ type: "bridgeState", key, state: run === "dismiss" ? "dismissed" : "handled" });
      if (run === "dismiss") return;
      const page: ContextChip = { ...textChip("page", r.title || r.url || "Page", r.page_text ?? r.selection ?? ""), url: r.url, key: `page-${r.id}` };
      if (run === "note") {
        shelfAdd({ kind: r.page_text ? "page" : "selection", title: r.title, text: r.selection || r.page_text, url: r.url }, shelf)
          .then(() => flash("Saved to Shelf"))
          .catch((e) => flash(String(e), false));
        return;
      }
      const chipsNow = [...chips.filter((c) => c.source !== "page"), page];
      if (r.selection) chipsNow.unshift({ ...textChip("selection", "Selection", r.selection), key: `sel-${r.id}` });
      setChips(chipsNow);
      if (run === "summarise") ask("/summarise", chipsNow);
      else {
        setText("/ask-page ");
        inputRef.current?.focus();
      }
    },
  };

  const pasteClip = (c: ClipView, plain = false) => clipPaste(c.id, plain ? "plain" : "original").catch((e) => flash(String(e), false));

  const accept = (i: number) => {
    if (!popover) return;
    if (popover.kind === "slash") {
      const c = popover.items[i] as CommandTemplate | undefined;
      if (c) setText(`/${c.id} `);
    } else if (mention) {
      const m = popover.items[i] as { source: MentionSource } | undefined;
      if (!m) return;
      const before = text.slice(0, mention.start);
      const after = text.slice(caret);
      setText(`${before}${after}`.replace(/\s{2,}/g, " "));
      resolveMention(m.source);
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Do mode: the offline engine first (works with AI off), the AI only for what it doesn't know.
  // Every outcome leaves a visible card — failures included — so Enter never looks like it did nothing.
  const runDoMode = async (raw: string) => {
    const typed = raw.trim();
    bump("commandRun");
    setText("");
    // "dashboard" in Do mode opens the Magic Dashboard when it is on, the same as in Ask.
    if ((isDashboardPhrase(typed) || typed.toLowerCase() === "/dashboard") && (await invoke<boolean>("dashboard_available").catch(() => false))) {
      await hide();
      void openDashboard().then((err) => err && flash(err, false));
      return;
    }
    const out = await runDo(
      typed,
      {
        intent: aiIntent,
        runIntent: aiRunIntent,
        ask: async (t) => {
          const built = buildRequest({ text: t, slash: null, chips: [], overrides: settings.providers, providers: ai?.providers ?? [], active: ai?.active ?? "local", allowTools: true });
          return aiAsk(built.req);
        },
      },
      intent && intent.summary && typed ? intent : null
    );
    if (out.kind === "none") return;
    if (out.kind === "error") {
      dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: out.intent?.summary ?? "Couldn't do that", detail: out.message, ok: false, ts: Date.now() } });
      return;
    }
    if (out.kind === "intent") {
      // "Teach me": the card also says where this setting lives, with a link.
      dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: out.intent.summary, detail: "Offline · no AI needed", ok: true, ts: Date.now(), where: whereItLives(out.intent.action) ?? undefined } });
      if (!answersInText(out.intent)) return;
    } else {
      dispatch({ type: "push", item: { kind: "action", key: newKey("act"), title: typed.slice(0, 60), detail: "Asked the AI", ok: true, ts: Date.now() } });
    }
    const ansKey = newKey("a");
    dispatch({ type: "push", item: { kind: "answer", key: ansKey, reqId: null, text: "", status: "streaming", ts: Date.now() } });
    dispatch({ type: "attachReq", key: ansKey, reqId: out.reqId });
  };

  const runActive = (shift: boolean, ctrl: boolean) => {
    document.documentElement.dataset.commandActive = `${mode}:${text.trim().length}`;
    if (mode === "clipboard") {
      const c = clips[active];
      if (!c) return;
      if (ctrl) {
        clipGetText(c.id).then((value) => {
          addChip({ ...textChip("clip", (c.title || c.preview).slice(0, 28) || "Clip", value, { ids: [String(c.id)] }), localOnly: c.localOnly });
          setMode("ask");
          setText("");
        });
        return;
      }
      pasteClip(c, shift);
      return;
    }
    if (mode === "shelf") {
      const it = shelfFiltered[active];
      if (!it) return;
      addChip(shelfChip([it]));
      setMode("ask");
      setText("");
      return;
    }
    if (mode === "actions") {
      const c = actionsFiltered[active];
      if (!c) return;
      setMode("ask");
      setText(`/${c.id} `);
      return;
    }
    if (mode === "do") {
      if (text.trim()) void runDoMode(text);
      return;
    }
    if (ctrl && latestAnswer) {
      handlers.onPaste(latestAnswer.text);
      return;
    }
    if (text.trim()) ask(text, chips);
  };

  runActiveRef.current = runActive;

  // B-12b: the page marks when it has painted twice while visible and focused. Chromium does not
  // deliver input to a page that was hidden until it has produced frames again, so a key sent in
  // the first few milliseconds after Command is shown can be lost before any script sees it.
  useEffect(() => {
    let raf = 0;
    const arm = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => bump("commandKeysReady"));
      });
    };
    arm();
    window.addEventListener("focus", arm);
    document.addEventListener("visibilitychange", arm);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("focus", arm);
      document.removeEventListener("visibilitychange", arm);
    };
  }, []);

  // B-12b trace: counts every Enter keydown the page receives at all (capture phase, before
  // React), so a dropped Enter can be told apart from one the handler skipped.
  useEffect(() => {
    const seen = (e: KeyboardEvent) => {
      if (e.key === "Enter") bump("commandEnterSeen");
    };
    window.addEventListener("keydown", seen, true);
    return () => window.removeEventListener("keydown", seen, true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (popover && popover.items.length) {
      if (e.key === "ArrowDown") return e.preventDefault(), setPop((p) => (p + 1) % popover.items.length);
      if (e.key === "ArrowUp") return e.preventDefault(), setPop((p) => (p - 1 + popover.items.length) % popover.items.length);
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        // Enter on a fully typed command runs it; otherwise it completes.
        if (!(e.key === "Enter" && popover.kind === "slash" && slash?.command && slash.typed === slash.command.id)) {
          e.preventDefault();
          return accept(pop);
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setText((t) => (popover.kind === "slash" ? "" : t));
        return;
      }
    }
    if (layout === "mini" && !text && miniTab === "actions") {
      const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
      if (e.key in step) {
        e.preventDefault();
        setActiveTile((t) => Math.min(tiles.length - 1, Math.max(0, t + step[e.key])));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const id = tiles[activeTile];
        if (id) runTile(id);
        return;
      }
    }
    if (layout === "mini" && e.key === "Tab") {
      e.preventDefault();
      setMiniTab((t) => (t === "actions" ? "dashboard" : "actions"));
      return;
    }
    if (layout === "mini" && (e.ctrlKey || e.metaKey) && e.key === "Enter" && !latestAnswer) {
      e.preventDefault();
      return expand();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      setMode((m) => cycleMode(m, e.shiftKey ? -1 : 1));
      return;
    }
    if (ctrl && e.key.toLowerCase() === "b") {
      e.preventDefault();
      setDrawer((d) => !d);
      return;
    }
    if (listLen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((a) => (e.key === "ArrowDown" ? Math.min(listLen - 1, a + 1) : Math.max(0, a - 1)));
      return;
    }
    if (mode === "clipboard" && clips[active]) {
      const c = clips[active];
      if (ctrl && e.key.toLowerCase() === "s") return e.preventDefault(), clipToShelf([c.id], shelf).then(() => flash("Saved to Shelf"));
      if (ctrl && e.key.toLowerCase() === "p") return e.preventDefault(), clipPin(c.id, !c.pinned);
      if (e.key === "Delete") return e.preventDefault(), clipDelete(c.id);
    }
    if (e.key === "Enter" && !(e.shiftKey && mode === "ask")) {
      e.preventDefault();
      // Trace for B-12 (an Enter that seems to do nothing): counted here and in runDoMode, read by the E2E run.
      bump("commandEnter");
      if (!linkedRef.current) {
        bump("commandEnterQueued");
        // Still wiring up after a cold start: run this Enter the moment the handshake completes.
        queuedEnter.current = { shift: e.shiftKey, ctrl };
        return;
      }
      runActive(e.shiftKey, ctrl);
      return;
    }
    if (e.key === "Backspace" && !text && chips.length) {
      e.preventDefault();
      setChips((c) => c.slice(0, -1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      const streaming = thread.find((i) => i.kind === "answer" && i.status === "streaming");
      if (streaming) return handlers.onStop(streaming.key);
      if (text) return setText("");
      if (mode !== settings.defaultMode) return setMode(settings.defaultMode);
      hide();
    }
  };

  // Auto-grow the input (1–6 lines).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(6 * 20, Math.max(20, el.scrollHeight))}px`;
  }, [text]);

  const ModeIcon = MODE_ICON[mode];
  const bar = (
    <div className="cmd-bar">
      <button type="button" className="cmd-mode" onClick={() => setMode((m) => cycleMode(m))} aria-label={`Mode: ${MODE_LABEL[mode]}. Tab to change.`}>
        <ModeIcon size={15} strokeWidth={2.2} />
        <span>{MODE_LABEL[mode]}</span>
      </button>
      <textarea
        data-guide-id="command"
        ref={inputRef}
        className="cmd-input"
        rows={1}
        value={text}
        autoFocus
        spellCheck={mode === "ask"}
        placeholder={layout === "mini" && mode === "ask" ? "Ask, or pick an action" : PLACEHOLDER[mode]}
        aria-label={PLACEHOLDER[mode]}
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={onKeyDown}
      />
      {mode === "ask" || mode === "do" ? (
        <span className={`cmd-dest is-${dest.toLowerCase()}`} title={undefined}>
          {dest === "Claude" ? null : <Lock size={11} strokeWidth={2.4} />}
          {dest === "Script" ? "Offline" : dest}
        </span>
      ) : null}
      <button type="button" className={`cmd-icon${drawer ? " is-on" : ""}`} onClick={() => setDrawer((d) => !d)} aria-label="Shelf (Ctrl+B)" aria-pressed={drawer}>
        <PanelRight size={15} />
      </button>
    </div>
  );

  const expanded = thread.length > 0 || mode !== "ask" || drawer;
  const sentChipsBlocked = chips.some((c) => c.localOnly) && dest === "Claude";

  const popoverEl =
    popover && popover.items.length && layout === "mini" ? (
      <ul className="cmd-pop is-mini" role="listbox" aria-label={popover.kind === "slash" ? "Commands" : "Add context"}>
        {popover.items.slice(0, 6).map((it, i) => {
          const isSlash = popover.kind === "slash";
          const c = it as CommandTemplate;
          const m = it as { source: MentionSource; hint: string };
          return (
            <li key={isSlash ? c.id : m.source} role="option" aria-selected={i === pop} className={`cmd-pop-row${i === pop ? " is-active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); accept(i); }} onMouseMove={() => setPop(i)}>
              <span className="cmd-pop-key">{isSlash ? `/${c.id}` : `@${m.source}`}</span>
              <span className="cmd-pop-desc">{isSlash ? c.description || c.name : m.hint}</span>
            </li>
          );
        })}
      </ul>
    ) : null;

  if (layout === "mini") {
    return (
      <div className="cmd-root is-mini" data-guide-id="mini">
        <MiniView
          input={<>{bar}{popoverEl}</>}
          chips={chips}
          removeChip={removeChip}
          app={appInfo}
          tiles={tiles}
          templates={templates}
          activeTile={activeTile}
          setActiveTile={setActiveTile}
          runTile={runTile}
          latest={latestAnswer ?? ([...thread].reverse().find((i) => i.kind === "answer") as Extract<ThreadItem, { kind: "answer" }> | undefined) ?? null}
          onPaste={handlers.onPaste}
          onCopy={handlers.onCopy}
          onToShelf={(t) => handlers.onToShelf(t)}
          onStop={() => {
            const s = thread.find((i) => i.kind === "answer" && i.status === "streaming");
            if (s) handlers.onStop(s.key);
          }}
          shelfItems={shelfItems}
          useShelfItem={(it) => addChip(shelfChip([it]))}
          clips={clips}
          clipsOn={!!clipState?.enabled}
          pasteClip={(c) => pasteClip(c)}
          dest={dest}
          privacy={privacyLabel}
          providerLabel={providerLabel}
          onExpand={expand}
          tab={miniTab}
          setTab={setMiniTab}
          cards={settings.miniCards}
          sessionTokens={sessionTokens}
          aiReady={!!activeProvider?.available}
          anchor={anchor}
          expanding={expanding}
          onNotice={flash}
        />
      </div>
    );
  }

  return (
    <div
      className={`cmd-root pos-${settings.position} density-${settings.density}${expanded ? " is-expanded" : " is-compact"}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if ((e.target as HTMLElement).closest(".cmd-shelf")) return;
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files ?? []);
        files.slice(0, 10).forEach((f) => {
          const path = (f as unknown as { path?: string }).path ?? f.name;
          addChip({ key: `file-${path}`, source: "file", label: f.name, detail: path, chars: 0, tokens: 0, localOnly: false, value: path });
        });
        const t = e.dataTransfer.getData("text/plain");
        if (!files.length && t) addChip(textChip("selection", t.split("\n")[0].slice(0, 28) || "Dropped text", t));
      }}
    >
      <div className={`cmd-shell${drawer ? " has-drawer" : ""}`} style={{ ["--cmd-width" as string]: `${settings.width}px` }}>
        <main className="cmd-main">
          {bar}
          {popover && popover.items.length ? (
            <ul className="cmd-pop" role="listbox" aria-label={popover.kind === "slash" ? "Commands" : "Add context"}>
              {popover.items.slice(0, 8).map((it, i) => {
                const isSlash = popover.kind === "slash";
                const c = it as CommandTemplate;
                const m = it as { source: MentionSource; label: string; hint: string };
                return (
                  <li key={isSlash ? c.id : m.source} role="option" aria-selected={i === pop} className={`cmd-pop-row${i === pop ? " is-active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      accept(i);
                    }}
                    onMouseMove={() => setPop(i)}>
                    <span className="cmd-pop-key">{isSlash ? `/${c.id}` : `@${m.source}`}</span>
                    <span className="cmd-pop-desc">{isSlash ? c.description || c.name : m.hint}</span>
                    {isSlash && c.provider !== "local" ? <span className="cmd-pop-tag">{c.provider}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {chips.length || slash?.command ? (
            <div className="cmd-chips" aria-label="Context">
              {slash?.command ? (
                <span className="cmd-chip is-command">
                  <CommandIcon size={12} strokeWidth={2.2} />/{slash.command.id}
                  {slash.option ? <em>{slash.option}</em> : null}
                  {slash.lang ? <em>→ {slash.lang}</em> : null}
                </span>
              ) : null}
              {chips.map((c) => {
                const Icon = SOURCE_ICON[c.source];
                const blocked = c.localOnly && dest === "Claude";
                return (
                  <span key={c.key} className={`cmd-chip${blocked ? " is-blocked" : ""}`}>
                    <Icon size={12} strokeWidth={2.2} />
                    <span className="cmd-chip-label">{c.label}</span>
                    <span className="cmd-chip-detail">{blocked ? "stays on this PC" : c.detail}</span>
                    <button type="button" className="cmd-chip-x" aria-label={`Remove ${c.label}`} onClick={() => removeChip(c.key)}>
                      <X size={11} strokeWidth={2.6} />
                    </button>
                  </span>
                );
              })}
              {chips.length ? (
                <span className="cmd-chips-total">
                  {formatTokens(chips.reduce((n, c) => n + c.tokens, 0))} → {dest === "Script" ? "Offline" : dest}
                  {sentChipsBlocked ? " · private items stay here" : ""}
                </span>
              ) : null}
            </div>
          ) : null}

          <SafetyFlagBanners sources={["context", "step", "snip", "control"]} />
          {expanded ? (
            <div className="cmd-body" ref={bodyRef}>
              {mode === "ask" ? (
                thread.length ? (
                  <div className="cmd-thread">
                    {thread.map((it, i) => (
                      <ThreadCard key={it.key} item={it} h={handlers} latest={i === thread.length - 1} />
                    ))}
                  </div>
                ) : (
                  <Starters templates={templates} onPick={(id) => setText(`/${id} `)} />
                )
              ) : null}
              {mode === "do" ? (
                <div className="cmd-do">
                  {intent ? (
                    <button type="button" className="cmd-row is-active" onClick={() => runActive(false, false)}>
                      <span className="cmd-row-icon"><Zap size={14} /></span>
                      <span className="cmd-row-main">
                        <span className="cmd-row-title">{intent.summary}</span>
                        <span className="cmd-row-sub">Offline · {Math.round(intent.confidence * 100)}% sure · you'll confirm anything that changes settings</span>
                      </span>
                      <kbd className="cmd-kbd">↵</kbd>
                    </button>
                  ) : (
                    <div className="cmd-empty"><p>{text.trim() ? "Not sure what that means yet — Enter asks the AI to work it out." : "Type a command. Lens handles common ones instantly, offline."}</p></div>
                  )}
                  {thread.length ? (
                    <div className="cmd-thread">
                      {thread.filter((t) => t.kind === "tool" || t.kind === "action" || (t.kind === "answer" && !!t.text)).slice(-4).map((it, i, arr) => (
                        <ThreadCard key={it.key} item={it} h={handlers} latest={i === arr.length - 1} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {mode === "clipboard" ? (
                <ClipList
                  clips={clips}
                  status={clipState}
                  active={active}
                  setActive={setActive}
                  kind={clipKind}
                  setKind={setClipKind}
                  onPaste={pasteClip}
                  onCopy={(c) => clipCopy(c.id).then(() => flash("Copied")).catch((e) => flash(String(e), false))}
                  onShelf={(c) => clipToShelf([c.id], shelf).then(() => flash("Saved to Shelf")).catch((e) => flash(String(e), false))}
                  onPin={(c) => clipPin(c.id, !c.pinned)}
                  onDelete={(c) => clipDelete(c.id)}
                  onEnable={() => clipSetSettings({ ...(clipState?.settings ?? DEFAULT_CLIP_SETTINGS), enabled: true }).catch((e) => flash(String(e), false))}
                />
              ) : null}
              {mode === "shelf" ? (
                shelfFiltered.length ? (
                  <ol className="cmd-list" role="listbox" aria-label="Shelf">
                    {shelfFiltered.map((it, i) => {
                      const Icon = KIND_ICON[it.kind];
                      return (
                        <li key={it.id} role="option" aria-selected={i === active} className={`cmd-row${i === active ? " is-active" : ""}`}
                          onMouseMove={() => i !== active && setActive(i)} onClick={() => { setActive(i); runActive(false, false); }}>
                          <span className="cmd-row-icon"><Icon size={14} /></span>
                          <span className="cmd-row-main">
                            <span className="cmd-row-title">{it.title}</span>
                            <span className="cmd-row-sub">
                              {it.local_only ? <Lock size={11} /> : null}
                              <span>{it.kind}</span>
                              <span>{formatTokens(it.approx_tokens)}</span>
                              {it.tags.map((t) => <span key={t}>#{t}</span>)}
                            </span>
                          </span>
                          {i === active ? <kbd className="cmd-kbd">↵ use</kbd> : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div className="cmd-empty"><p>{text ? "Nothing on this shelf matches." : "The Shelf is empty. Save answers, clips and pages here to reuse them as context."}</p></div>
                )
              ) : null}
              {mode === "actions" ? (
                <ol className="cmd-list" role="listbox" aria-label="Commands">
                  {actionsFiltered.map((c, i) => (
                    <li key={c.id} role="option" aria-selected={i === active} className={`cmd-row${i === active ? " is-active" : ""}`}
                      onMouseMove={() => i !== active && setActive(i)} onClick={() => { setMode("ask"); setText(`/${c.id} `); }}>
                      <span className="cmd-row-icon"><CommandIcon size={14} /></span>
                      <span className="cmd-row-main">
                        <span className="cmd-row-title">{c.name}<span className="cmd-row-slash">/{c.id}</span></span>
                        <span className="cmd-row-sub"><span>{c.description}</span></span>
                      </span>
                      <span className="cmd-pop-tag">{(settings.providers[c.id] ?? c.provider) === "claude" ? "Claude" : (settings.providers[c.id] ?? c.provider) === "script" ? "Offline" : "Local"}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}

          <footer className="cmd-foot">
            {notice ? (
              <span className={`cmd-notice${notice.ok ? "" : " is-bad"}`} role="status">{notice.text}</span>
            ) : (
              <span className="cmd-hints">
                <span><kbd>Tab</kbd> mode</span>
                {mode === "ask" ? <span><kbd>/</kbd> commands</span> : null}
                {mode === "ask" ? <span className="is-optional"><kbd>@</kbd> context</span> : null}
                {mode === "clipboard" ? <span><kbd>⇧↵</kbd> plain</span> : null}
                {mode === "clipboard" ? <span className="is-optional"><kbd>Ctrl ↵</kbd> attach</span> : null}
                {mode === "ask" && latestAnswer ? <span className="is-optional"><kbd>Ctrl ↵</kbd> paste answer</span> : null}
                <span><kbd>Esc</kbd> {text ? "clear" : "close"}</span>
              </span>
            )}
            <span className="cmd-run">
              <CornerDownLeft size={12} strokeWidth={2.4} />
              {mode === "clipboard" ? "Paste" : mode === "shelf" ? "Use" : mode === "do" ? "Do it" : mode === "actions" ? "Choose" : "Send"}
            </span>
          </footer>
        </main>
        {drawer ? (
          <ShelfDrawer
            shelf={shelf}
            setShelf={(id) => {
              setShelf(id);
              setPicked(new Set());
            }}
            picked={picked}
            togglePick={(id) =>
              setPicked((p) => {
                const n = new Set(p);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            onUse={() => {
              const items = shelfItems.filter((i) => picked.has(i.id));
              if (items.length) addChip(shelfChip(items));
              setPicked(new Set());
              setMode("ask");
              inputRef.current?.focus();
            }}
            onNotice={flash}
          />
        ) : null}
      </div>
    </div>
  );
}

function Starters({ templates, onPick }: { templates: CommandTemplate[]; onPick: (id: string) => void }) {
  const list = STARTERS.map((id) => templates.find((t) => t.id === id)).filter(Boolean) as CommandTemplate[];
  if (!list.length) return null;
  return (
    <div className="cmd-starters" aria-label="Suggestions">
      {list.map((t) => (
        <button key={t.id} type="button" className="cmd-starter" onClick={() => onPick(t.id)}>
          <span className="cmd-pop-key">/{t.id}</span>
          <span className="cmd-pop-desc">{t.description}</span>
          <ArrowUp size={12} className="cmd-starter-go" />
        </button>
      ))}
    </div>
  );
}

export default CommandSurface;
