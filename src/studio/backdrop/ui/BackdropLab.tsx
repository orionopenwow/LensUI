/**
 * Lens Studio › Backdrop Lab. Looks on the left, the live canvas in the middle, controls on the
 * right; Inspire / Save / Fit / Export on top. See docs/BACKDROP_LAB.md.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vars } from "./vars";
import { Button } from "../../../ui";
import {
  ArrowLeftRight,
  Check,
  Download,
  Eye,
  Maximize2,
  Monitor,
  Pause,
  Play,
  Redo2,
  Save,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { useLensState } from "../../../hooks/useLensState";
import { packById } from "../../../themes/packs";
import {
  DAY_PARTS,
  DEFAULT_MOOD,
  HERO_PRESET_ID,
  LOCKS,
  ThumbnailService,
  adjustState,
  backdropToPack,
  decodeState,
  encodeState,
  evenStops,
  extractPalette,
  inspire,
  isAdjustment,
  modeById,
  moodPalette,
  normaliseState,
  packPalette,
  presetById,
  promptToState,
  rng,
  shareLink,
  type BackdropState,
  type DayPart,
  type Keyframes,
  type LockKey,
  type Mood,
  type ModeId,
} from "../engine";
import { History, coachSeen, loadCurrent, loadHistory, loadMine, pushHistory, removeMine, saveCurrent, saveMine, setCoachSeen, takePendingPrompt } from "../store";
import { makeTheme, restoreWallpaper, setKeyframes, setLiveWallpaper, setStillWallpaper, tryOnDesktop } from "../apply";
import type { WallpaperSettings } from "../../../surfaces/wallpaperTypes";
import { ControlsPanel, type SetFn } from "./ControlsPanel";
import { LooksPanel } from "./LooksPanel";
import { LiveCanvas, type HandlesMode, type Readability } from "./LiveCanvas";
import { ExportSheet } from "./ExportSheet";
import { LabSlider, Segmented, Tip, Toggle } from "./controls";
import "./lab.css";

interface Toast {
  text: string;
  undo?: () => void;
  id: number;
}

const COACH = [
  { title: "Pick a look", body: "Browse looks and presets on the left. Hover a tile to see it move." },
  { title: "Shape it", body: "Drag the handles on the canvas and tune colours and motion on the right. Press I to Inspire." },
  { title: "Make it yours", body: "Set it as a live wallpaper, make a theme from it, or export a loop." },
];

function initialState(): BackdropState {
  const q = new URLSearchParams(location.search).get("s");
  const fromLink = q ? decodeState(q) : null;
  return fromLink ?? loadCurrent() ?? presetById(HERO_PRESET_ID)!.state;
}

export const BackdropLab: React.FC<{ windowControls?: React.ReactNode }> = ({ windowControls }) => {
  const { config, updateConfig } = useLensState();
  const [s, setS] = useState<BackdropState>(initialState);
  const committed = useRef(s);
  const hist = useRef(new History());
  const [, force] = useState(0);
  const [mood, setMood] = useState<Mood>(DEFAULT_MOOD);
  const [locks, setLocks] = useState<Set<LockKey>>(new Set());
  const [advanced, setAdvanced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frame, setFrame] = useState<"fill" | "wide">("fill");
  const [compare, setCompare] = useState<BackdropState | null>(null);
  const [divider, setDivider] = useState(0.5);
  const [context, setContext] = useState(false);
  const [read, setRead] = useState<Readability | null>(null);
  const [handles, setHandles] = useState<HandlesMode>("hover");
  const [exportOpen, setExportOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [mine, setMine] = useState(loadMine);
  const [history, setHistory] = useState(loadHistory);
  const [prompt, setPrompt] = useState("");
  const [understood, setUnderstood] = useState<string>("");
  const [coach, setCoach] = useState(() => (coachSeen() ? -1 : 0));
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [keys, setKeys] = useState<Keyframes>({});
  const [liveOpts, setLiveOpts] = useState({ evolve: false, playlist: "off", timeOfDay: false, pulse: false, warmWhenBusy: false, albumColours: false, followTheme: false });
  const trial = useRef<ReturnType<typeof tryOnDesktop> | null>(null);
  const [trialLeft, setTrialLeft] = useState(0);
  const svc = useMemo(() => (typeof document !== "undefined" ? new ThumbnailService(160, 96) : null), []);
  useEffect(() => () => svc?.dispose(), [svc]);
  useEffect(() => {
    if (svc) svc.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  }, [svc]);

  const say = useCallback((text: string, undo?: () => void) => setToast({ text, undo, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.undo ? 7000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const commit = useCallback((next: BackdropState) => {
    if (encodeState(next) === encodeState(committed.current)) return;
    hist.current.push(committed.current);
    committed.current = next;
    saveCurrent(next);
    setHistory(pushHistory(next));
    force((n) => n + 1);
  }, []);

  const set: SetFn = useCallback(
    (patch, doCommit = false) => {
      setS((prev) => {
        const raw = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
        const next = normaliseState(raw);
        if (doCommit) commit(next);
        return next;
      });
    },
    [commit]
  );

  const replaceAll = useCallback(
    (next: BackdropState, name?: string) => {
      const n = normaliseState({ ...next, ...(name ? { name } : {}) });
      setS(n);
      commit(n);
    },
    [commit]
  );

  const doInspire = useCallback(() => {
    replaceAll(inspire(s, mood, locks, Date.now()));
  }, [s, mood, locks, replaceAll]);

  const undo = () => {
    const p = hist.current.undo(s);
    if (p) {
      committed.current = p;
      setS(p);
      force((n) => n + 1);
    }
  };
  const redo = () => {
    const p = hist.current.redo(s);
    if (p) {
      committed.current = p;
      setS(p);
      force((n) => n + 1);
    }
  };

  const save = () => {
    const name = s.name && !presetById(s.name) ? s.name : `${modeById(s.mode)?.name} ${new Date().toLocaleDateString([], { month: "short", day: "numeric" })}`;
    setMine(saveMine(name, s));
    say(`Saved to Mine as “${name}”`);
  };

  const runPrompt = (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (isAdjustment(t) && !/\b(make me|create|new)\b/i.test(t)) {
      const r = adjustState(s, t);
      if (r.changes.length) {
        replaceAll(r.state);
        setUnderstood(r.changes.join(" · "));
        return;
      }
    }
    const r = promptToState(t, s, Date.now());
    replaceAll(r.state);
    setUnderstood(r.understood.join(" · ") || "a fresh look");
  };

  // A prompt handed over by Lens Command / voice ("Lens, make me a calm blue aurora backdrop").
  useEffect(() => {
    const p = takePendingPrompt();
    if (p) runPrompt(p);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lens.backdrop.pendingPrompt") {
        const q = takePendingPrompt();
        if (q) runPrompt(q);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: I inspire · S save · F fit · E export · Space pause · C compare · Ctrl+Z / Ctrl+Shift+Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "i") doInspire();
      else if (k === "s") save();
      else if (k === "f") setFrame((f) => (f === "fill" ? "wide" : "fill"));
      else if (k === "e") setExportOpen(true);
      else if (k === "c") setCompare((c) => (c ? null : committed.current));
      else if (e.key === " " && el?.getAttribute("role") !== "slider") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "Escape") {
        setExportOpen(false);
        setMoodOpen(false);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onImage = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f);
      const c = document.createElement("canvas");
      const k = Math.min(1, 96 / Math.max(bmp.width, bmp.height));
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext("2d")!;
      g.drawImage(bmp, 0, 0, c.width, c.height);
      const pal = extractPalette(g.getImageData(0, 0, c.width, c.height).data, Math.max(4, Math.min(6, s.stops.length)));
      setImage(bmp);
      setImageName(f.name);
      if (!modeById(s.mode)?.image && pal.length >= 2) {
        set({ stops: evenStops(pal) }, true);
        say("Palette taken from your picture");
      }
    } catch {
      say("That picture couldn't be read.");
    }
  };

  const paletteFromTheme = () => {
    const pack = packById(config?.theme.preset);
    const accent = config?.theme.accentMode === "custom" ? config.theme.customAccent : pack?.accent ?? "#7C3AED";
    set({ stops: evenStops(packPalette(pack?.base ?? "#09090B", accent, pack?.scheme === "light")) }, true);
  };

  // ── actions ──
  const live = async () => {
    try {
      const prev = await setLiveWallpaper(s, { ...liveOpts });
      say("Playing on your desktop", () => restoreWallpaper(prev).catch(() => {}));
    } catch (e) {
      say(`Couldn't set the wallpaper: ${e}`);
    }
  };
  const still = async () => {
    try {
      const prev = await setStillWallpaper(s);
      say("Still wallpaper set", () => restoreWallpaper(prev).catch(() => {}));
    } catch (e) {
      say(`Couldn't save the picture: ${e}`);
    }
  };
  const tryIt = () => {
    trial.current?.cancel();
    const t = tryOnDesktop(s, 10_000);
    trial.current = t;
    setTrialLeft(10);
    const iv = window.setInterval(() => setTrialLeft((n) => Math.max(0, n - 1)), 1000);
    t.done.then((r) => {
      clearInterval(iv);
      setTrialLeft(0);
      trial.current = null;
      say(r === "kept" ? "Kept on your desktop" : "Back to your previous wallpaper");
    });
  };
  const theme = async () => {
    if (!config) return;
    const name = s.name || `${modeById(s.mode)?.name} theme`;
    try {
      const res = await makeTheme(s, name, config, updateConfig);
      say(`Theme “${name}” applied${res.report.ok ? "" : " (contrast adjusted)"}`, () => {
        updateConfig(res.prevConfig);
        if (res.prevWallpaper) restoreWallpaper(res.prevWallpaper as WallpaperSettings).catch(() => {});
      });
    } catch (e) {
      say(`Couldn't make a theme: ${e}`);
    }
  };

  const packPreview = useMemo(() => backdropToPack(s, s.name || "Backdrop"), [s]);
  const lowContrast = context && read && (read.top < 3 || read.bottom < 3);

  const livingUI = (
    <div className="bd-living">
      <Toggle label="Evolve slowly" hint="Drifts within this look's mood so it never quite repeats." checked={liveOpts.evolve} onChange={(v) => setLiveOpts((o) => ({ ...o, evolve: v }))} />
      <Toggle label="Follow the time of day" hint="Brighter by day, warmer at golden hour, dimmer at night." checked={liveOpts.timeOfDay} onChange={(v) => setLiveOpts((o) => ({ ...o, timeOfDay: v }))} />
      <Toggle label="Follow theme colours" hint="Switching packs crossfades the colours." checked={liveOpts.followTheme} onChange={(v) => setLiveOpts((o) => ({ ...o, followTheme: v }))} />
      <Toggle label="Soft pulse on notifications" checked={liveOpts.pulse} onChange={(v) => setLiveOpts((o) => ({ ...o, pulse: v }))} />
      <Toggle label="Warm slightly when the PC is busy" checked={liveOpts.warmWhenBusy} onChange={(v) => setLiveOpts((o) => ({ ...o, warmWhenBusy: v }))} />
      <Toggle label="Colours from what's playing" hint="Opt-in. Uses the album art Lens Music already shows." checked={liveOpts.albumColours} onChange={(v) => setLiveOpts((o) => ({ ...o, albumColours: v }))} />
      <div className="bd-field-label">Rotate looks</div>
      <Segmented label="Rotate looks" small value={liveOpts.playlist} options={[{ id: "off", label: "Off" }, { id: "15", label: "15 min" }, { id: "60", label: "Hourly" }]} onChange={(v) => setLiveOpts((o) => ({ ...o, playlist: v }))} />
      <div className="bd-field-label">Time-of-day looks</div>
      <div className="bd-keys">
        {DAY_PARTS.map((p) => (
          <button key={p.id} type="button" className={`bd-key ${keys[p.id as DayPart] ? "on" : ""}`} onClick={() => setKeys((k) => ({ ...k, [p.id]: s }))} aria-label={`Use this look for ${p.label.toLowerCase()}`}>
            <span className={`bd-key-sw ${keys[p.id as DayPart] ? "bd-v-bg" : ""}`} ref={vars({ "--bd-bg": keys[p.id as DayPart] ? `linear-gradient(135deg, ${keys[p.id as DayPart]!.stops.map((x) => x.color).join(",")})` : undefined })} />
            {p.label}
          </button>
        ))}
      </div>
      <div className="bd-row">
        <Button size="sm" className="bd-b" disabled={!Object.keys(keys).length} onClick={() => setKeyframes(keys).then(() => say("Time-of-day looks are on")).catch((e) => say(String(e)))}>
          Play time-of-day looks
        </Button>
        {Object.keys(keys).length > 0 && (
          <Button size="sm" variant="ghost" className="bd-b" onClick={() => setKeys({})}>
            Clear
          </Button>
        )}
      </div>
      <p className="bd-hint">The wallpaper pauses behind full-screen apps and games, on battery saver and when covered, and shows a still frame with reduced motion.</p>
    </div>
  );

  const shareUI = (
    <div className="bd-share">
      <code className="bd-code" aria-label="Share code">
        {encodeState(s)}
      </code>
      <div className="bd-row wrap">
        <Button size="sm" className="bd-b" onClick={() => navigator.clipboard.writeText(shareLink(s)).then(() => say("Link copied"))}>
          Copy link
        </Button>
        <Button size="sm" className="bd-b" onClick={() => navigator.clipboard.writeText(encodeState(s)).then(() => say("Code copied"))}>
          Copy code
        </Button>
        <Button size="sm"
         
          className="bd-b"
          onClick={async () => {
            const t = await navigator.clipboard.readText().catch(() => "");
            const st = decodeState(t);
            if (st) replaceAll(st);
            else say("No backdrop code on the clipboard");
          }}
        >
          Paste code
        </Button>
      </div>
      <div className="bd-pack-preview">
        <span className="bd-v-bg" ref={vars({ "--bd-bg": packPreview.pack.base })} />
        <span className="bd-v-bg" ref={vars({ "--bd-bg": packPreview.pack.accent })} />
        <small>
          Theme from this: text {packPreview.report.text.toFixed(1)}:1, accent {packPreview.report.accent.toFixed(1)}:1 {packPreview.report.ok ? "✓" : ""}
        </small>
      </div>
    </div>
  );

  const mode = modeById(s.mode);

  return (
    <div className={`bd-lab ${panelOpen ? "panel-open" : ""}`}>
      <header className="bd-top" data-tauri-drag-region>
        <div className="bd-title" data-tauri-drag-region>
          <span className="bd-crumb">Lens Studio</span>
          <span className="bd-crumb-sep">›</span>
          <b>Backdrop Lab</b>
        </div>
        <form
          className="bd-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            runPrompt(prompt);
          }}
        >
          <Wand2 size={13} aria-hidden />
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe a backdrop, or “slower and more purple”" aria-label="Describe a backdrop or a change" />
          {understood && <span className="bd-understood">{understood}</span>}
        </form>
        <div className="bd-actions">
          <div className="bd-split">
            <Button size="sm" className="bd-b" onClick={doInspire} aria-keyshortcuts="I">
              <Sparkles size={13} aria-hidden /> Inspire <kbd>I</kbd>
            </Button>
            <Button size="sm" className="bd-b lens-icon-btn" aria-label="Mood and locks" aria-expanded={moodOpen} onClick={() => setMoodOpen((o) => !o)}>
              <SlidersHorizontal size={13} aria-hidden />
            </Button>
            {moodOpen && (
              <div className="bd-pop" role="dialog" aria-label="Inspire mood">
                <LabSlider label="Calm ↔ Energetic" value={mood.energy} min={0} max={1} step={0.01} defaultValue={DEFAULT_MOOD.energy} onChange={(v) => setMood((m) => ({ ...m, energy: v }))} />
                <LabSlider label="Cool ↔ Warm" value={mood.warmth} min={0} max={1} step={0.01} defaultValue={DEFAULT_MOOD.warmth} onChange={(v) => setMood((m) => ({ ...m, warmth: v }))} />
                <LabSlider label="Minimal ↔ Rich" value={mood.richness} min={0} max={1} step={0.01} defaultValue={DEFAULT_MOOD.richness} onChange={(v) => setMood((m) => ({ ...m, richness: v }))} />
                <div className="bd-field-label">Keep (Inspire leaves these alone)</div>
                <div className="bd-row wrap">
                  {LOCKS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={locks.has(l.id)}
                      className={`bd-chip ${locks.has(l.id) ? "on" : ""}`}
                      onClick={() =>
                        setLocks((ls) => {
                          const n = new Set(ls);
                          if (n.has(l.id)) n.delete(l.id);
                          else n.add(l.id);
                          return n;
                        })
                      }
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button type="button" className="bd-icon-btn" aria-label="Undo" disabled={!hist.current.canUndo} onClick={undo}>
            <Undo2 size={14} aria-hidden />
          </button>
          <button type="button" className="bd-icon-btn" aria-label="Redo" disabled={!hist.current.canRedo} onClick={redo}>
            <Redo2 size={14} aria-hidden />
          </button>
          <Button size="sm" className="bd-b" onClick={save} aria-keyshortcuts="S">
            <Save size={13} aria-hidden /> Save
          </Button>
          <Button size="sm" className="bd-b" onClick={() => setFrame((f) => (f === "fill" ? "wide" : "fill"))} aria-pressed={frame === "wide"} aria-keyshortcuts="F">
            <Maximize2 size={13} aria-hidden /> Fit
          </Button>
          <Button size="sm" variant="primary" className="bd-b" onClick={() => setExportOpen(true)} aria-keyshortcuts="E">
            <Download size={13} aria-hidden /> Export
          </Button>
          {windowControls}
        </div>
      </header>

      <LooksPanel
        svc={svc}
        current={s}
        mine={mine}
        onPickMode={(id: ModeId) => {
          const m = modeById(id)!;
          set({ mode: id, params: Object.fromEntries(m.params.map((p) => [p.key, p.default])), handles: m.handles.map((h) => ({ ...h.default })) }, true);
        }}
        onPickState={(st, name) => replaceAll(st, name)}
        onRemoveMine={(id) => setMine(removeMine(id))}
      />

      <main className="bd-stage">
        <div className={`bd-stage-inner ${frame}`}>
          <LiveCanvas
            state={s}
            compare={compare}
            divider={divider}
            onDivider={setDivider}
            paused={paused}
            handles={handles}
            onHandles={(h, soft) => set((x) => ({ ...x, handles: h, ...(soft !== undefined ? { softness: soft } : {}) }))}
            onHandlesEnd={() => set({}, true)}
            context={context}
            onReadability={context ? setRead : undefined}
            image={image}
          />
          {trialLeft > 0 && (
            <div className="bd-trial" role="status">
              On your desktop for {trialLeft}s
              <Button size="sm" variant="primary" className="bd-b" onClick={() => trial.current?.keep()}>
                <Check size={13} aria-hidden /> Keep it
              </Button>
              <Button size="sm" className="bd-b" onClick={() => trial.current?.cancel()}>
                Revert now
              </Button>
            </div>
          )}
          {lowContrast && (
            <div className="bd-warn" role="status">
              Text over the {read!.top < 3 ? "top bar" : "dock"} may be hard to read ({Math.min(read!.top, read!.bottom).toFixed(1)}:1). Try a darker first colour or more vignette.
            </div>
          )}
        </div>
        <div className="bd-stage-bar">
          <button type="button" className="bd-icon-btn" aria-label={paused ? "Play" : "Pause"} aria-keyshortcuts="Space" onClick={() => setPaused((p) => !p)}>
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
          </button>
          <span className="bd-mode-name">{mode?.name}</span>
          <Segmented label="Handles" small value={handles} options={[{ id: "hover", label: "Handles on hover" }, { id: "always", label: "Always" }, { id: "off", label: "Off" }]} onChange={setHandles} />
          <Tip text="Compare with your last saved step (C)">
            <Button size="sm" className={`bd-b lens-icon-btn ${compare ? "on" : ""}`} aria-label="Compare" aria-pressed={!!compare} onClick={() => setCompare((c) => (c ? null : committed.current))} aria-keyshortcuts="C">
              <ArrowLeftRight size={13} aria-hidden />
            </Button>
          </Tip>
          <Tip text="Preview with the Top Bar, a window and the Dock">
            <Button size="sm" className={`bd-b lens-icon-btn ${context ? "on" : ""}`} aria-label="In context" aria-pressed={context} onClick={() => setContext((c) => !c)}>
              <Eye size={13} aria-hidden />
            </Button>
          </Tip>
          <div className="bd-stage-actions">
          <div className="bd-split">
            <Button size="sm" variant="primary" className="bd-b" onClick={live}>
              <Monitor size={13} aria-hidden /> Set as live wallpaper
            </Button>
            <Button size="sm" className="bd-b" onClick={tryIt} disabled={trialLeft > 0}>
              Try 10 s
            </Button>
            <Button size="sm" className="bd-b" onClick={still}>
              Still
            </Button>
          </div>
          <Button size="sm" className="bd-b" onClick={theme}>
            Make a theme
          </Button>
          </div>
          <Button size="sm" className="bd-b lens-icon-btn bd-panel-toggle" aria-label="Controls" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
            <SlidersHorizontal size={13} aria-hidden />
          </Button>
        </div>
        {history.length > 1 && (
          <div className="bd-history" role="list" aria-label="Recent looks">
            {history.slice(0, 30).map((code, i) => {
              const st = decodeState(code);
              if (!st) return null;
              return (
                <button
                  key={code.slice(-24) + i}
                  type="button"
                  role="listitem"
                  className="bd-hist bd-v-bg"
                  aria-label={`Go back to look ${i + 1}: ${modeById(st.mode)?.name}`}
                  ref={vars({ "--bd-bg": `linear-gradient(135deg, ${st.stops.map((x) => x.color).join(",")})` })}
                  onClick={() => replaceAll(st)}
                />
              );
            })}
          </div>
        )}
      </main>

      <ControlsPanel
        state={s}
        set={set}
        advanced={advanced}
        onAdvanced={setAdvanced}
        locks={locks}
        onLock={(k) =>
          setLocks((ls) => {
            const n = new Set(ls);
            if (n.has(k)) n.delete(k);
            else n.add(k);
            return n;
          })
        }
        onRandomPalette={() => set({ stops: evenStops(moodPalette(mood, rng(Date.now()))) }, true)}
        onImage={onImage}
        onPaletteFromTheme={paletteFromTheme}
        imageName={imageName}
        onClearImage={() => {
          setImage(null);
          setImageName(null);
        }}
        living={livingUI}
        share={shareUI}
      />

      {exportOpen && <ExportSheet state={s} onClose={() => setExportOpen(false)} onToast={say} />}

      {coach >= 0 && (
        <div className={`bd-coach step-${coach}`} role="dialog" aria-label="Getting started">
          <small>
            {coach + 1} of {COACH.length}
          </small>
          <b>{COACH[coach].title}</b>
          <p>{COACH[coach].body}</p>
          <div className="bd-row end">
            <Button size="sm" variant="ghost"
             
              className="bd-b"
              onClick={() => {
                setCoach(-1);
                setCoachSeen();
              }}
            >
              Skip
            </Button>
            <Button size="sm" variant="primary"
             
              className="bd-b"
              onClick={() => {
                if (coach >= COACH.length - 1) {
                  setCoach(-1);
                  setCoachSeen();
                } else setCoach(coach + 1);
              }}
            >
              {coach >= COACH.length - 1 ? "Start" : "Next"}
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <div className="bd-toast" role="status" key={toast.id}>
          {toast.text}
          {toast.undo && (
            <Button size="sm"
             
              className="bd-b"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

