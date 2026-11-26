// Lens Cleaner: Home → Scan → Cleanup / Space map → Done, plus Apps, Timeline and the Downloads
// review. Nothing is deleted without an explicit click: every clean goes through a dry-run preview
// built in Rust, and your own files go to the Recycle Bin through the approval card.
// docs/CLEANER.md has the safety model and the polish checklist.

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Eraser, Settings2, X } from "lucide-react";
import { api, EVENTS, on } from "./api";
import { AppsPanel, DownloadsPanel, TimelinePanel } from "./Extras";
import { Cleanup } from "./Cleanup";
import { Done, type DoneInfo } from "./Done";
import { Home } from "./Home";
import { flow, fmtSize, initialFlow, keyAction, selectionPayload, type CleanupTab, type FlowState } from "./model";
import { PreviewSheet } from "./PreviewSheet";
import { Scanning } from "./Scanning";
import { SettingsPanel } from "./SettingsPanel";
import { SpaceMap, type MapView } from "./SpaceMap";
import type { AppUsage, HistoryView, Overview, Preview, ScanProgress, SpaceNode, SpaceProgress, SpaceSummary, SpaceView, Verdict } from "./types";
import { Ring } from "./ui";
import "./cleaner.css";

export interface CleanerDemo {
  flow?: Partial<FlowState>;
  scan?: { done: Record<string, number>; found: number };
  preview?: { preview: Preview; title: string; smart?: boolean; userFiles?: boolean };
  done?: DoneInfo;
  share?: boolean;
  undo?: number;
  settings?: boolean;
  space?: { root?: string; mode?: MapView; filter?: string; selected?: string[]; nodeId?: number; moving?: { path: string; done: number; total: number } };
  downloadsPicked?: string[];
}

interface SheetState {
  preview: Preview;
  title: string;
  smart?: boolean;
  userFiles?: boolean;
}

const TABS: [CleanupTab, string][] = [
  ["cleanup", "Cleanup"],
  ["space", "Space map"],
  ["apps", "Apps"],
  ["timeline", "Timeline"],
  ["downloads", "Downloads"],
];

export const CleanerApp: React.FC<{ demo?: CleanerDemo }> = ({ demo }) => {
  const [s, dispatch] = useReducer(flow, { ...initialFlow, ...demo?.flow });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [scanDone, setScanDone] = useState<Record<string, number>>(demo?.scan?.done ?? {});
  const [found, setFound] = useState(demo?.scan?.found ?? 0);
  const [sheet, setSheet] = useState<SheetState | null>(demo?.preview ?? null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DoneInfo | null>(demo?.done ?? null);
  const [undoUntil, setUndoUntil] = useState<number>(demo?.undo ? Date.now() + 30_000 : 0);
  const [undoCount, setUndoCount] = useState(demo?.undo ?? 0);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void }; error?: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(!!demo?.settings);

  // Space map
  const [root, setRoot] = useState(demo?.space?.root ?? "C:\\");
  const [summary, setSummary] = useState<SpaceSummary | null>(null);
  const [spaceProgress, setSpaceProgress] = useState<SpaceProgress | null>(null);
  const [view, setView] = useState<SpaceView | null>(null);
  const [nested, setNested] = useState<SpaceNode[] | null>(null);
  const [biggest, setBiggest] = useState<SpaceNode[]>([]);
  const [filter, setFilter] = useState(demo?.space?.filter ?? "all");
  const [mode, setMode] = useState<MapView>(demo?.space?.mode ?? "list");
  const [selected, setSelected] = useState<string[]>(demo?.space?.selected ?? []);
  const [moving, setMoving] = useState<{ path: string; done: number; total: number } | null>(demo?.space?.moving ?? null);

  // Extras
  const [apps, setApps] = useState<AppUsage[] | null>(null);
  const [appsErr, setAppsErr] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryView | null>(null);
  const [downloads, setDownloads] = useState<Verdict[] | null>(null);
  const [dlPicked, setDlPicked] = useState<string[]>(demo?.downloadsPicked ?? []);

  const say = useCallback((text: string, error = false, action?: { label: string; run: () => void }) => setToast({ text, error, action }), []);

  const loadOverview = useCallback(() => {
    api
      .overview()
      .then(setOverview)
      .catch((e) => say(`Couldn't read your drives: ${e}`, true, { label: "Try again", run: () => loadOverview() }));
  }, [say]);
  useEffect(loadOverview, [loadOverview]);

  // ── scan ────────────────────────────────────────────────────────────────────────────────────
  const scan = useCallback(() => {
    setScanDone({});
    setFound(0);
    dispatch({ type: "scan" });
    api
      .scan()
      .then((report) => dispatch({ type: "scanned", report }))
      .catch((e) => dispatch({ type: "scan-failed", error: `The scan stopped: ${e}. Nothing was changed.` }));
  }, []);

  useEffect(
    () =>
      on<ScanProgress>(EVENTS.progress, (p) => {
        if (!p.category) return;
        setScanDone((d) => ({ ...d, [p.category!]: p.size ?? 0 }));
        setFound(p.bytes);
      }),
    []
  );

  // ── preview and run ─────────────────────────────────────────────────────────────────────────
  const openPreview = useCallback(
    async (smart: boolean) => {
      const { categories, picks } = selectionPayload(s);
      try {
        setBusy(true);
        const preview = await api.preview(categories, picks, smart);
        if (!preview.entryCount && !preview.steps.length) {
          say("Nothing left to clean there. It may have been cleaned already.", false, { label: "Scan again", run: scan });
          return;
        }
        // Only your files (REVIEW picks) → the "Delete to Bin" approval card; anything mixed gets the full sheet.
        const onlyYours = preview.entries.length > 0 && preview.steps.length === 0 && preview.entries.every((e) => e.action === "recycle");
        setSheet({ preview, title: smart ? "Smart Clean: here's exactly what will happen" : "Here's exactly what will happen", smart, userFiles: onlyYours });
      } catch (e) {
        say(`Couldn't prepare the clean: ${e}`, true, { label: "Try again", run: () => openPreview(smart) });
      } finally {
        setBusy(false);
      }
    },
    [s, say, scan]
  );

  const binPaths = useCallback(
    async (paths: string[], permanent: boolean) => {
      try {
        const preview = await api.previewPaths(paths, permanent);
        if (!preview.entryCount) {
          say(preview.refused[0]?.[1] ?? "Those can't be removed.", true);
          return;
        }
        setSheet({ preview, title: permanent ? "Delete for good" : "Move to the Recycle Bin", userFiles: true });
      } catch (e) {
        say(String(e), true);
      }
    },
    [say]
  );

  const sysDrive = useMemo(() => overview?.drives.find((d) => d.root.toUpperCase().startsWith("C")) ?? overview?.drives[0], [overview]);

  const sheetId = sheet?.preview.id;
  const confirmCodeFor = useCallback(() => (sheetId ? api.confirmCode(sheetId) : Promise.reject(new Error("That preview has expired; scan again."))), [sheetId]);

  const run = useCallback(
    async (confirm?: string | null) => {
      if (!sheet) return;
      setBusy(true);
      const before = sysDrive;
      try {
        const out = await api.run(sheet.preview.id, confirm);
        setSheet(null);
        const ov = await api.overview().catch(() => null);
        if (ov) setOverview(ov);
        const after = ov?.drives.find((d) => d.root === before?.root);
        if (out.binned.length) {
          setUndoCount(out.binned.length);
          setUndoUntil(Date.now() + 30_000);
        }
        if (sheet.userFiles) {
          setSelected([]);
          setDlPicked([]);
          say(`${out.binned.length || out.deleted.length} item(s) removed · ${fmtSize(out.freed)} freed.`);
          if (summary) refreshNode(view?.node.id ?? 0);
          return;
        }
        setDone({
          freed: out.freed,
          root: before?.root ?? "C:\\",
          total: before?.total ?? 0,
          freeBefore: before?.free ?? 0,
          freeAfter: after?.free ?? (before?.free ?? 0) + out.freed,
          binned: out.binned.length,
          skipped: out.skipped,
          scanMs: s.report?.elapsedMs,
        });
        dispatch({ type: "cleaned", freed: out.freed });
      } catch (e) {
        say(`The clean stopped: ${e}. Anything not yet cleaned is untouched.`, true, { label: "Try again", run: () => run(confirm) });
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, sysDrive, say, summary, view]
  );

  const undo = useCallback(async () => {
    setUndoUntil(0);
    try {
      const r = await api.undo();
      say(r.left.length ? `Restored ${r.restored.length}; ${r.left.length} stayed in the Recycle Bin (${r.left[0][1]})` : `Restored ${r.restored.length} item(s) to where they were.`, r.left.length > 0);
      loadOverview();
    } catch (e) {
      say(String(e), true, { label: "Open Recycle Bin", run: () => api.reveal("shell:RecycleBinFolder") });
    }
  }, [say, loadOverview]);

  useEffect(() => {
    if (!undoUntil) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() > undoUntil) setUndoUntil(0);
    }, 250);
    return () => window.clearInterval(t);
  }, [undoUntil]);

  // ── space map ───────────────────────────────────────────────────────────────────────────────
  const refreshNode = useCallback(
    async (id: number) => {
      try {
        const v = await api.spaceChildren(root, id, 1, 80);
        setView(v);
        const deep = await api.spaceChildren(root, id, 3, 24);
        setNested(deep.children);
      } catch (e) {
        say(String(e), true, { label: "Rescan", run: () => mapDrive(root) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, say]
  );

  const mapDrive = useCallback(
    async (r: string) => {
      setRoot(r);
      setSummary(null);
      setView(null);
      setNested(null);
      setSpaceProgress({ files: 0, bytes: 0, folders: 0, current: r });
      try {
        const sum = await api.spaceScan(r);
        setSummary(sum);
        setSpaceProgress(null);
        const v = await api.spaceChildren(r, demo?.space?.nodeId ?? 0, 1, 80);
        setView(v);
        api.spaceChildren(r, v.node.id, 3, 24).then((d) => setNested(d.children)).catch(() => {});
      } catch (e) {
        setSpaceProgress(null);
        say(`Couldn't map ${r}: ${e}`, true, { label: "Try again", run: () => mapDrive(r) });
      }
    },
    [say, demo]
  );

  useEffect(() => {
    if (s.screen === "space" && !summary && !spaceProgress) mapDrive(root);
  }, [s.screen, summary, spaceProgress, root, mapDrive]);

  useEffect(() => {
    if (!summary) return;
    api.biggest(root, filter, 40).then(setBiggest).catch(() => setBiggest([]));
  }, [summary, root, filter]);

  useEffect(() => on<SpaceProgress>(EVENTS.space, setSpaceProgress), []);
  useEffect(() => on<{ path: string; done: number; total: number }>(EVENTS.move, (m) => setMoving(m.done >= m.total ? null : m)), []);

  const move = useCallback(
    async (path: string, destRoot: string) => {
      setMoving({ path, done: 0, total: 1 });
      try {
        const dest = await api.move(path, `${destRoot.replace(/[\\/]+$/, "")}\\Moved by Lens`);
        setMoving(null);
        setSelected((x) => x.filter((p) => p !== path));
        say(`Moved to ${dest}. The original is in the Recycle Bin.`, false, { label: "Show it", run: () => api.reveal(dest) });
        loadOverview();
      } catch (e) {
        setMoving(null);
        say(`Couldn't move it: ${e}`, true);
      }
    },
    [say, loadOverview]
  );

  // ── extras ──────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (s.tab === "apps" && !apps) {
      setAppsErr(null);
      api
        .apps()
        .then(setApps)
        .catch((e) => setAppsErr(`Couldn't list your apps: ${e}`));
    }
    if (s.tab === "timeline" && !history) api.history(root).then(setHistory).catch(() => setHistory({ enabled: false, series: [], growth: [] }));
    if (s.tab === "downloads" && !downloads)
      api
        .downloadsReview()
        .then((v) => {
          setDownloads(v);
          if (!demo?.downloadsPicked) setDlPicked(v.filter((x) => x.suggest).map((x) => x.path));
        })
        .catch((e) => {
          setDownloads([]);
          say(`Couldn't read Downloads: ${e}`, true);
        });
  }, [s.tab, apps, history, downloads, root, say, demo]);

  // ── focus requests (voice "empty the recycle bin", Explorer verb) ───────────────────────────
  const lastFocus = useRef(0);
  useEffect(
    () =>
      on<string>(EVENTS.focus, (f) => {
        if (Date.now() - lastFocus.current < 2500) return;
        lastFocus.current = Date.now();
        if (f === "recycle-bin") {
          api
            .preview(["recycle-bin"], [], false)
            .then((preview) => setSheet({ preview, title: "Empty the Recycle Bin?" }))
            .catch((e) => say(String(e), true));
        }
      }),
    [say]
  );

  // ── keyboard ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, target: e.target as HTMLElement });
      if (a === "back") {
        if (sheet) return setSheet(null);
        if (settingsOpen) return setSettingsOpen(false);
        if (s.screen === "scanning") {
          api.cancel().catch(() => {});
          return dispatch({ type: "cancel" });
        }
        if (s.screen === "space" && spaceProgress) return void api.cancel().catch(() => {});
        if (s.screen === "done" && !document.querySelector(".cl-sheet")) return dispatch({ type: "home" });
        return;
      }
      if (sheet || settingsOpen) return;
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (a === "clean" && tag === "BUTTON") return; // let the focused button act
      if (s.screen === "home" && a === "clean") {
        e.preventDefault();
        scan();
      } else if (s.screen === "cleanup" && s.tab === "cleanup") {
        if (a === "select-all-safe") {
          e.preventDefault();
          dispatch({ type: "select-all-safe" });
        } else if (a === "clean") {
          e.preventDefault();
          openPreview(false);
        } else if (a === "smart") {
          e.preventDefault();
          openPreview(true);
        } else if (a === "rescan") {
          e.preventDefault();
          scan();
        }
      } else if (s.screen === "done" && a === "clean" && !document.querySelector(".cl-sheet")) {
        dispatch({ type: "home" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.screen, s.tab, sheet, settingsOpen, spaceProgress, scan, openPreview]);

  const showTabs = s.screen !== "scanning" && s.screen !== "done";
  const activeTab: CleanupTab = s.screen === "space" ? "space" : s.tab;
  const undoLeft = undoUntil ? Math.max(0, undoUntil - now) : 0;

  return (
    <div className="cl-app" data-screen={s.screen}>
      <header className="cl-top" data-tauri-drag-region>
        <span className="cl-brand" data-tauri-drag-region>
          <span className="cl-brand-mark" aria-hidden>
            <Eraser size={14} strokeWidth={2.4} />
          </span>
          Lens Cleaner
        </span>
        {showTabs && (
          <nav className="cl-tabs" role="tablist" aria-label="Lens Cleaner">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                className={activeTab === id ? "is-on" : ""}
                onClick={() => (id === "space" ? dispatch({ type: "space" }) : dispatch({ type: "tab", tab: id }))}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <span className="cl-top-sp" data-tauri-drag-region />
        <button type="button" className="cl-icon-btn" aria-label="Lens Cleaner settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
          <Settings2 size={15} />
        </button>
        <button type="button" className="cl-icon-btn" aria-label="Close Lens Cleaner" onClick={() => api.close().catch(() => {})}>
          <X size={16} />
        </button>
      </header>

      <main className="cl-main" id="cl-main">
        {s.screen === "home" && s.tab === "cleanup" && <Home overview={overview} error={s.error} onScan={scan} onSpace={() => dispatch({ type: "space" })} onOpen={(u) => api.open(u).catch(() => {})} />}
        {s.screen === "scanning" && (
          <Scanning
            checklist={overview?.checklist ?? []}
            done={scanDone}
            found={found}
            onCancel={() => {
              api.cancel().catch(() => {});
              dispatch({ type: "cancel" });
            }}
          />
        )}
        {s.screen === "cleanup" && s.tab === "cleanup" && s.report && (
          <Cleanup
            s={s}
            dispatch={dispatch}
            busy={busy}
            onClean={() => openPreview(false)}
            onSmart={() => openPreview(true)}
            onRescan={scan}
            onReveal={(p) => api.reveal(p).catch((e) => say(String(e), true))}
            onOpen={(u) => api.open(u).catch((e) => say(String(e), true))}
          />
        )}
        {s.screen === "space" && (
          <SpaceMap
            drives={overview?.drives ?? []}
            root={root}
            summary={summary}
            progress={spaceProgress}
            view={view}
            nested={nested}
            biggest={biggest}
            filter={filter}
            mode={mode}
            selected={selected}
            moving={moving}
            onRoot={mapDrive}
            onRescan={() => mapDrive(root)}
            onOpenNode={refreshNode}
            onMode={setMode}
            onFilter={setFilter}
            onToggle={(p) => setSelected((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}
            onReveal={(p) => api.reveal(p).catch((e) => say(String(e), true))}
            onBin={binPaths}
            onMove={move}
            onCancel={() => api.cancel().catch(() => {})}
          />
        )}
        {s.screen !== "space" && s.screen !== "scanning" && s.screen !== "done" && s.tab === "apps" && (
          <AppsPanel
            apps={apps}
            error={appsErr}
            onRetry={() => {
              setApps(null);
              setAppsErr(null);
              api.apps().then(setApps).catch((e) => setAppsErr(String(e)));
            }}
            onReveal={(p) => api.reveal(p).catch(() => {})}
            onUninstall={(a) => api.appUninstall(a.key).catch((e) => say(String(e), true, { label: "Installed apps", run: () => api.open("ms-settings:appsfeatures") }))}
          />
        )}
        {s.screen !== "space" && s.screen !== "scanning" && s.screen !== "done" && s.tab === "timeline" && (
          <TimelinePanel
            root={root}
            data={history}
            total={overview?.drives.find((d) => d.root === root)?.total ?? 0}
            onReveal={(p) => api.reveal(p).catch(() => {})}
            onEnable={() => {
              api
                .settingsGet()
                .then((cur) => api.settingsSet({ ...cur, history: true }))
                .then(() => api.history(root))
                .then(setHistory)
                .catch((e) => say(String(e), true));
            }}
          />
        )}
        {s.screen !== "space" && s.screen !== "scanning" && s.screen !== "done" && s.tab === "downloads" && (
          <DownloadsPanel items={downloads} picked={dlPicked} onToggle={(p) => setDlPicked((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} onBin={() => binPaths(dlPicked, false)} onReveal={(p) => api.reveal(p).catch(() => {})} />
        )}
        {s.screen === "done" && done && <Done info={done} showShare={demo?.share} onDone={() => dispatch({ type: "home" })} onShare={(png) => api.share(png).then((p) => say(`Saved the card to ${p}`)).catch((e) => say(String(e), true))} />}
      </main>

      {settingsOpen && (
        <aside className="cl-drawer" role="dialog" aria-label="Lens Cleaner settings">
          <header className="cl-sheet-head">
            <span className="cl-h3">Settings</span>
            <button type="button" className="cl-icon-btn" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <SettingsPanel initial={overview?.settings ?? null} storageSense={overview?.storageSense ?? null} onOpen={(u) => api.open(u).catch(() => {})} />
        </aside>
      )}

      {sheet && <PreviewSheet preview={sheet.preview} title={sheet.title} smart={sheet.smart} userFiles={sheet.userFiles} busy={busy} onRun={run} onClose={() => setSheet(null)} onFullList={() => api.fullList(sheet.preview.id).catch((e) => say(String(e), true))} onConfirmCode={confirmCodeFor} />}

      <div className="cl-toasts" aria-live="polite">
        {undoLeft > 0 && (
          <div className="cl-toast is-undo" role="status">
            <Ring value={undoLeft / 30_000} size={22} label="Time left to undo" />
            <span>
              {undoCount} item{undoCount === 1 ? "" : "s"} went to the Recycle Bin.
            </span>
            <button type="button" className="cl-btn is-ghost is-sm" onClick={undo}>
              Restore from Recycle Bin
            </button>
          </div>
        )}
        {toast && (
          <div className={`cl-toast${toast.error ? " is-error" : ""}`} role={toast.error ? "alert" : "status"}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="cl-btn is-ghost is-sm"
                onClick={() => {
                  setToast(null);
                  toast.action!.run();
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="cl-icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
