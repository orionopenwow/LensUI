import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LensConfig } from "../types/lens";
import { packById } from "../themes/packs";
import { cursorApi, currentAccentHex, prefersReducedMotion } from "../cursors/api";
import { FxEngine, resolveFxColor } from "../cursors/effects";
import {
  ALL_ROLES,
  CURSOR_FAMILIES,
  DEFAULT_FX,
  PAUSE_LABELS,
  TILE_ROLES,
  type CursorFamily,
  type CursorPreview,
  type CursorStyle,
  type CursorSuiteStatus,
  type FxButton,
  type FxSettings,
  type FxStatus,
  type PointerSettings,
} from "../cursors/types";
import "../cursors/cursors.css";

interface Props {
  config: LensConfig;
}

type Tab = "look" | "behaviour" | "effects";

/**
 * Control Center card: Look (code-drawn Windows pointer sets), Behaviour (speed, wheel, focus
 * follows mouse … through SystemParametersInfo) and Effects (the click-through overlay).
 * Every OS change is backed up before the first write and has a one-click restore.
 */
export const CursorSuiteCard: React.FC<Props> = ({ config }) => {
  const [tab, setTab] = useState<Tab>("look");
  const [status, setStatus] = useState<CursorSuiteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    cursorApi
      .status()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(refresh, [refresh]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "look", label: "Look" },
    { id: "behaviour", label: "Behaviour" },
    { id: "effects", label: "Effects" },
  ];

  return (
    <div className="cc-card cs-card">
      <div className="cs-head">
        <div>
          <div className="cc-label">Mouse pointer</div>
          <div className="cc-desc">Pointer sets, how the mouse behaves, and effects. Everything here can be undone in one click.</div>
        </div>
        <div className="cs-tabs" role="tablist" aria-label="Mouse pointer">
          {tabs.map((t) => (
            <button data-weight="light"
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`cs-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="cs-error">{error}</div>}
      {tab === "look" && <LookTab config={config} status={status} onChanged={refresh} onError={setError} />}
      {tab === "behaviour" && <BehaviourTab status={status} onChanged={refresh} onError={setError} />}
      {tab === "effects" && <EffectsTab onError={setError} />}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------------------------

function themeStyle(config: LensConfig): { accent: string; dark: boolean } {
  const pack = packById(config.theme.preset);
  return { accent: currentAccentHex(), dark: pack?.scheme !== "light" };
}

const SpinnerImg: React.FC<{ p: CursorPreview; px: number; animate: boolean }> = ({ p, px, animate }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!animate || p.frames.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % p.frames.length), 66);
    return () => window.clearInterval(id);
  }, [animate, p.frames.length]);
  return <img className="cs-cur" src={p.frames[i % p.frames.length]} width={px} height={px} alt={p.label} draggable={false} />;
};

const LookTab: React.FC<{
  config: LensConfig;
  status: CursorSuiteStatus | null;
  onChanged: () => void;
  onError: (e: string | null) => void;
}> = ({ config, status, onChanged, onError }) => {
  const themed = themeStyle(config);
  const st = status?.state;
  const [family, setFamily] = useState<CursorFamily>(st?.style.family ?? "obsidian");
  const [dark, setDark] = useState<boolean>(st?.style.dark ?? themed.dark);
  const [highVis, setHighVis] = useState<boolean>(st?.style.highVisibility ?? false);
  const [size, setSize] = useState<number>(st?.size ?? 32);
  const [follow, setFollow] = useState<boolean>(st?.followTheme ?? true);
  const [busy, setBusy] = useState(false);
  const [tiles, setTiles] = useState<Record<string, CursorPreview[]>>({});
  const [full, setFull] = useState<CursorPreview[]>([]);
  const animate = !prefersReducedMotion();

  // Adopt the saved choice once status arrives.
  const adopted = useRef(false);
  useEffect(() => {
    if (!st || adopted.current) return;
    adopted.current = true;
    setFamily(st.style.family);
    setDark(st.applied ? st.style.dark : themed.dark);
    setHighVis(st.style.highVisibility);
    setSize(st.size);
    setFollow(st.followTheme);
  }, [st, themed.dark]);

  const accent = follow || !st ? themed.accent : st.style.accent;
  const style = useMemo<CursorStyle>(() => ({ family, dark, accent, highVisibility: highVis }), [family, dark, accent, highVis]);

  // Family tiles: four roles each, drawn by the same Rust rasteriser that writes the .cur files.
  useEffect(() => {
    let live = true;
    Promise.all(
      CURSOR_FAMILIES.map((f) =>
        cursorApi
          .previews({ ...style, family: f.id }, 64, TILE_ROLES)
          .then((p) => [f.id, p] as const)
          .catch(() => [f.id, [] as CursorPreview[]] as const)
      )
    ).then((all) => {
      if (live) setTiles(Object.fromEntries(all));
    });
    return () => {
      live = false;
    };
  }, [style.dark, style.accent, style.highVisibility]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    cursorApi
      .previews(style, 64, ALL_ROLES)
      .then((p) => live && setFull(p))
      .catch(() => live && setFull([]));
    return () => {
      live = false;
    };
  }, [style]);

  const applied = !!st?.applied;
  const matchesApplied =
    applied &&
    st!.style.family === family &&
    st!.style.dark === dark &&
    st!.style.highVisibility === highVis &&
    st!.style.accent.toLowerCase() === accent.toLowerCase() &&
    st!.size === size;

  const apply = async () => {
    setBusy(true);
    try {
      await cursorApi.apply(style, size);
      if (st && st.followTheme !== follow) await cursorApi.followTheme(follow);
      onError(null);
      onChanged();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    try {
      await cursorApi.restore();
      onError(null);
      onChanged();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const toggleFollow = async () => {
    const next = !follow;
    setFollow(next);
    try {
      await cursorApi.followTheme(next);
      onChanged();
    } catch (e) {
      onError(String(e));
    }
  };

  return (
    <div className="cs-pane">
      <div className="cs-family-grid" role="radiogroup" aria-label="Pointer set">
        {CURSOR_FAMILIES.map((f) => (
          <button data-weight="light"
            key={f.id}
            type="button"
            role="radio"
            aria-checked={family === f.id}
            className={`cs-family ${family === f.id ? "active" : ""} ${dark ? "on-dark" : "on-light"}`}
            onClick={() => setFamily(f.id)}
          >
            <span className="cs-family-row">
              {(tiles[f.id] ?? []).map((p) => (
                <SpinnerImg key={p.role} p={p} px={28} animate={animate && family === f.id} />
              ))}
            </span>
            <span className="cs-family-name">{f.label}</span>
            <span className="cs-family-blurb">{f.blurb}</span>
          </button>
        ))}
      </div>

      <div className={`cs-strip ${dark ? "on-dark" : "on-light"}`} aria-label="Every pointer in this set">
        {full.map((p) => (
          <div key={p.role} className="cs-strip-cell">
            <SpinnerImg p={p} px={32} animate={animate} />
            <span>{p.label}</span>
          </div>
        ))}
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Tone</div>
          <div className="cc-desc">Dark pointers have a light rim; light pointers a dark one.</div>
        </div>
        <div className="cc-chip-grid" role="radiogroup" aria-label="Tone">
          {[
            { id: true, label: "Dark" },
            { id: false, label: "Light" },
          ].map((o) => (
            <button data-weight="light"
              key={String(o.id)}
              type="button"
              role="radio"
              aria-checked={dark === o.id}
              className={`cc-chip ${dark === o.id ? "active" : ""}`}
              onClick={() => setDark(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Size</div>
          <div className="cc-desc">
            {status && !status.supportsBaseSize
              ? "Needs Windows 10 version 1903 or later; older versions keep the standard size."
              : "The same setting as Windows' pointer size. Every set is drawn sharp up to 128 px."}
          </div>
        </div>
        <div className="cs-range">
          <input
            className="cc-range"
            type="range"
            min={32}
            max={256}
            step={16}
            value={size}
            aria-label="Pointer size"
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <span className="cs-num">{size} px</span>
        </div>
      </div>

      <ToggleRow
        label="High visibility"
        desc="A thick contrasting outline that reads on any background."
        on={highVis}
        onToggle={() => setHighVis(!highVis)}
      />
      <ToggleRow
        label="Follow theme pack"
        desc="Re-colour the pointers when you switch theme packs."
        on={follow}
        onToggle={toggleFollow}
      />

      <div className="cs-actions">
        <span className="cs-state">
          {applied ? `Using Lens ${CURSOR_FAMILIES.find((f) => f.id === st!.style.family)?.label ?? ""} pointers` : "Using your Windows pointers"}
        </span>
        <button data-weight="medium" type="button" className="cc-btn-ghost cs-btn" disabled={busy || !status?.hasCursorBackup} onClick={restore}>
          Restore my Windows pointers
        </button>
        <button data-weight="medium" type="button" className="cc-btn" disabled={busy || matchesApplied} onClick={apply}>
          {busy ? "Applying…" : matchesApplied ? "Applied" : "Apply"}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------------------------

const ToggleRow: React.FC<{ label: string; desc?: string; on: boolean; onToggle: () => void; disabled?: boolean }> = ({
  label,
  desc,
  on,
  onToggle,
  disabled,
}) => (
  <div className="cc-row">
    <div>
      <div className="cc-label">{label}</div>
      {desc && <div className="cc-desc">{desc}</div>}
    </div>
    <button data-weight="light"
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`cc-toggle ${on ? "on" : ""}`}
      onClick={onToggle}
    />
  </div>
);

const RangeRow: React.FC<{
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}> = ({ label, desc, value, min, max, step = 1, format, onCommit }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const timer = useRef<number | undefined>(undefined);
  return (
    <div className="cc-row">
      <div>
        <div className="cc-label">{label}</div>
        {desc && <div className="cc-desc">{desc}</div>}
      </div>
      <div className="cs-range">
        <input
          className="cc-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          aria-label={label}
          onChange={(e) => {
            const n = Number(e.target.value);
            setV(n);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => onCommit(n), 220);
          }}
        />
        <span className="cs-num">{format(v)}</span>
      </div>
    </div>
  );
};

const BehaviourTab: React.FC<{
  status: CursorSuiteStatus | null;
  onChanged: () => void;
  onError: (e: string | null) => void;
}> = ({ status, onChanged, onError }) => {
  const [p, setP] = useState<PointerSettings | null>(status?.pointer ?? null);
  useEffect(() => {
    if (status) setP(status.pointer);
  }, [status]);
  if (!p) return <div className="cs-pane cc-desc">Reading your pointer settings…</div>;

  const set = async (patch: Partial<PointerSettings>) => {
    const next = { ...p, ...patch };
    setP(next);
    try {
      const now = await cursorApi.setPointer(next);
      setP(now);
      onError(null);
      onChanged();
    } catch (e) {
      onError(String(e));
    }
  };
  const reset = async () => {
    try {
      await cursorApi.resetPointer();
      onError(null);
      onChanged();
    } catch (e) {
      onError(String(e));
    }
  };

  return (
    <div className="cs-pane">
      <div className="cs-group">Movement</div>
      <RangeRow label="Pointer speed" value={p.speed} min={1} max={20} format={(v) => `${v} / 20`} onCommit={(v) => set({ speed: v })} />
      <ToggleRow
        label="Enhance pointer precision"
        desc="Acceleration: fast flicks travel further. Many gamers and artists turn it off."
        on={p.enhancePrecision}
        onToggle={() => set({ enhancePrecision: !p.enhancePrecision })}
      />
      <RangeRow
        label="Pointer trails"
        desc="Windows' own trails. Off at the far left."
        value={p.trails}
        min={0}
        max={7}
        format={(v) => (v < 2 ? "Off" : `${v}`)}
        onCommit={(v) => set({ trails: v < 2 ? 0 : v })}
      />
      <ToggleRow label="Snap to default button" desc="Jump to OK in new dialogs." on={p.snapToDefault} onToggle={() => set({ snapToDefault: !p.snapToDefault })} />

      <div className="cs-group">Buttons</div>
      <ToggleRow
        label="Swap left and right buttons"
        desc="For left-handed use."
        on={p.swapButtons}
        onToggle={() => set({ swapButtons: !p.swapButtons })}
      />
      <RangeRow
        label="Double-click speed"
        desc="Longest gap between the two clicks."
        value={p.doubleClickMs}
        min={200}
        max={900}
        step={10}
        format={(v) => `${v} ms`}
        onCommit={(v) => set({ doubleClickMs: v })}
      />
      <ToggleRow
        label="ClickLock"
        desc="Hold the button briefly to drag without holding it down."
        on={p.clickLock}
        onToggle={() => set({ clickLock: !p.clickLock })}
      />

      <div className="cs-group">Wheel</div>
      <RangeRow label="Lines per notch" value={p.wheelLines} min={1} max={20} format={(v) => `${v}`} onCommit={(v) => set({ wheelLines: v })} />
      <RangeRow label="Characters per tilt" value={p.wheelChars} min={1} max={20} format={(v) => `${v}`} onCommit={(v) => set({ wheelChars: v })} />

      <div className="cs-group">Visibility</div>
      <ToggleRow label="Show location when I press Ctrl" on={p.sonar} onToggle={() => set({ sonar: !p.sonar })} />
      <ToggleRow label="Hide while typing" on={p.hideWhileTyping} onToggle={() => set({ hideWhileTyping: !p.hideWhileTyping })} />

      <div className="cs-group">Focus</div>
      <ToggleRow
        label="Focus follows mouse"
        desc="The window under the pointer becomes active."
        on={p.focusFollowsMouse}
        onToggle={() => set({ focusFollowsMouse: !p.focusFollowsMouse })}
      />
      {p.focusFollowsMouse && (
        <>
          <RangeRow
            label="Delay"
            value={p.focusDelayMs}
            min={0}
            max={1000}
            step={50}
            format={(v) => `${v} ms`}
            onCommit={(v) => set({ focusDelayMs: v })}
          />
          <ToggleRow label="Bring it to the front" on={p.focusRaise} onToggle={() => set({ focusRaise: !p.focusRaise })} />
        </>
      )}

      <div className="cs-actions">
        <span className="cs-state">{status?.hasPointerBackup ? "Your original settings are saved." : "Nothing changed yet."}</span>
        <button data-weight="medium" type="button" className="cc-btn-ghost cs-btn" disabled={!status?.hasPointerBackup} onClick={reset}>
          Reset to my original settings
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------------------

type Demo = "ripples" | "glowTrail" | "cometTrail" | "spotlight" | "shakeToFind" | "keystrokes";

/** A tiny looping preview of one effect, driven by a scripted pointer path. */
const EffectPreview: React.FC<{ demo: Demo; color: string }> = ({ demo, color }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 72 * dpr;
    canvas.height = 44 * dpr;
    const s: FxSettings = { ...DEFAULT_FX, [demo]: true, spotlightRadius: 16 };
    const engine = new FxEngine(canvas, s, { color, scale: dpr * 0.55, reducedMotion: false, compact: true });
    const reduced = prefersReducedMotion();
    const t0 = performance.now();
    let raf = 0;
    let lastClick = -1;
    const W = canvas.width;
    const H = canvas.height;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      let x = W / 2 + Math.cos(t * 1.6) * W * 0.3;
      let y = H / 2 + Math.sin(t * 3.2) * H * 0.22;
      if (demo === "shakeToFind") {
        x = W / 2 + Math.sin(t * 18) * W * 0.18 * (Math.sin(t * 1.4) > 0.3 ? 1 : 0.05);
        y = H / 2;
      }
      engine.pointer(x, y);
      const beat = Math.floor(t / 1.1);
      if (beat !== lastClick) {
        lastClick = beat;
        const buttons: FxButton[] = ["left", "right", "left", "middle"];
        if (demo === "ripples") engine.click(buttons[beat % 4], x, y);
        if (demo === "keystrokes") engine.key(["Ctrl + C", "Ctrl + V", "Alt + Tab"][beat % 3]);
        if (demo === "keystrokes" && beat % 3 === 2) engine.click("left", x, y);
        if (demo === "shakeToFind" && beat % 2 === 0) engine.locate();
        if (demo === "spotlight" && beat === 0) engine.toggleSpotlight(true);
      }
      engine.draw();
      if (!reduced) raf = requestAnimationFrame(tick);
    };
    tick();
    if (reduced) {
      // One still frame a moment in, so the preview shows something meaningful.
      window.setTimeout(() => engine.draw(), 200);
    }
    return () => {
      cancelAnimationFrame(raf);
      engine.destroy();
    };
  }, [demo, color]);
  return <canvas ref={ref} className="cs-fx-preview" aria-hidden="true" />;
};

/** A box to try the enabled effects with the real mouse. */
const TestArea: React.FC<{ settings: FxSettings; color: string }> = ({ settings, color }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FxEngine | null>(null);
  const shakeRef = useRef<{ dir: number; travel: number; rev: number[]; lastX: number | null }>({ dir: 0, travel: 0, rev: [], lastX: null });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const engine = new FxEngine(canvas, settings, { color, scale: dpr * 0.8, reducedMotion: prefersReducedMotion() });
    engineRef.current = engine;
    return () => engine.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    engineRef.current?.setSettings({ ...settings, spotlightRadius: Math.min(settings.spotlightRadius, 70) });
    engineRef.current?.setOptions({ color });
  }, [settings, color]);

  const pos = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
  };
  const any = settings.ripples || settings.glowTrail || settings.cometTrail || settings.spotlight || settings.shakeToFind || settings.keystrokes;
  return (
    <div className="cs-test">
      <canvas
        ref={ref}
        className="cs-test-canvas"
        tabIndex={0}
        aria-label="Effects test area"
        onMouseMove={(e) => {
          const p = pos(e);
          engineRef.current?.pointer(p.x, p.y);
          // Same rule as the Rust shake detector, for trying shake-to-find here.
          const sh = shakeRef.current;
          const now = performance.now();
          if (sh.lastX !== null) {
            const dx = p.x - sh.lastX;
            const d = Math.sign(dx);
            if (d !== 0) {
              if (d === sh.dir) sh.travel += Math.abs(dx);
              else {
                if (sh.dir !== 0 && sh.travel >= 40) sh.rev.push(now);
                sh.dir = d;
                sh.travel = Math.abs(dx);
              }
              sh.rev = sh.rev.filter((t) => now - t < 700);
              if (sh.rev.length >= 4) {
                sh.rev = [];
                engineRef.current?.locate();
              }
            }
          }
          sh.lastX = p.x;
        }}
        onMouseDown={(e) => {
          const p = pos(e);
          const b: FxButton = e.button === 0 ? "left" : e.button === 2 ? "right" : e.button === 1 ? "middle" : "x";
          engineRef.current?.click(b, p.x, p.y);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.shiftKey && e.key === "F8") {
            engineRef.current?.toggleSpotlight();
            return;
          }
          const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"].filter(Boolean) as string[];
          if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
          const name = e.key.length === 1 ? e.key.toUpperCase() : e.key.replace("Arrow", "").replace("Escape", "Esc");
          const chord = e.ctrlKey || e.altKey || e.metaKey;
          const command = e.key.length > 1 && e.key !== " ";
          if (!settings.keystrokesAll && !chord && !command) return;
          engineRef.current?.key([...mods, name].join(" + "));
        }}
      />
      {!any && <span className="cs-test-hint">Turn an effect on, then move, click and shake here.</span>}
      {any && settings.spotlight && <span className="cs-test-hint corner">Click here, then Ctrl + Shift + F8</span>}
    </div>
  );
};

const EffectsTab: React.FC<{ onError: (e: string | null) => void }> = ({ onError }) => {
  const [fx, setFx] = useState<FxStatus | null>(null);
  useEffect(() => {
    cursorApi
      .fxGet()
      .then(setFx)
      .catch((e) => onError(String(e)));
  }, [onError]);
  const color = resolveFxColor(fx?.settings.color ?? "accent", currentAccentHex());
  if (!fx) return <div className="cs-pane cc-desc">Loading effects…</div>;
  const s = fx.settings;
  const set = async (patch: Partial<FxSettings>) => {
    const next = { ...s, ...patch };
    setFx({ ...fx, settings: next });
    try {
      setFx(await cursorApi.fxSet(next));
      onError(null);
    } catch (e) {
      onError(String(e));
    }
  };
  const pause = fx.paused ? PAUSE_LABELS[fx.paused] ?? fx.paused : "Running";

  const fxRow = (demo: Demo, label: string, desc: string, extra?: React.ReactNode) => (
    <div className="cs-fx-row">
      <EffectPreview demo={demo} color={color} />
      <div className="cs-fx-text">
        <div className="cc-label">{label}</div>
        <div className="cc-desc">{desc}</div>
        {extra}
      </div>
      <button data-weight="light"
        type="button"
        role="switch"
        aria-checked={s[demo]}
        aria-label={label}
        className={`cc-toggle ${s[demo] ? "on" : ""}`}
        onClick={() => set({ [demo]: !s[demo] } as Partial<FxSettings>)}
      />
    </div>
  );

  return (
    <div className="cs-pane">
      <div className="cs-fx-status">
        <span className={`cs-dot ${fx.paused ? "" : "live"}`} />
        {pause}
        <span className="cs-fx-note">Off by default. Pauses for fullscreen apps and protected games.</span>
      </div>
      {fxRow("ripples", "Click ripples", "Rings where you click. Left, right and middle look different.")}
      {fxRow("glowTrail", "Glow trail", "A soft glow that follows the pointer.")}
      {fxRow("cometTrail", "Comet trail", "A short tapering tail.")}
      {fxRow(
        "spotlight",
        "Spotlight",
        `Presenter mode: dims everything but the pointer. Toggle with ${fx.spotlightHotkey}.`,
        s.spotlight && (
          <div className="cs-inline-range">
            <input
              className="cc-range"
              type="range"
              min={80}
              max={400}
              step={10}
              value={s.spotlightRadius}
              aria-label="Spotlight size"
              onChange={(e) => set({ spotlightRadius: Number(e.target.value) })}
            />
            <span className="cs-num">{s.spotlightRadius} px</span>
          </div>
        )
      )}
      {fxRow("shakeToFind", "Shake to find", "Shake the mouse side to side to see where the pointer is.")}
      {fxRow(
        "keystrokes",
        "Keys and clicks",
        "Shows shortcuts and clicks at the bottom of the screen, for recordings and demos. Never saved.",
        s.keystrokes && (
          <label className="cs-check">
            <input type="checkbox" checked={s.keystrokesAll} onChange={() => set({ keystrokesAll: !s.keystrokesAll })} />
            Show every key, including letters (not just shortcuts)
          </label>
        )
      )}
      <div className="cs-fx-row muted">
        <div className="cs-fx-preview cs-fx-mag" aria-hidden="true">
          <span>+</span>
        </div>
        <div className="cs-fx-text">
          <div className="cc-label">Magnifier</div>
          <div className="cc-desc">Use Windows Magnifier (Windows + Plus). A click-through overlay can't magnify the screen without capturing it, so Lens doesn't.</div>
        </div>
      </div>

      <div className="cc-label cs-test-label">Try it</div>
      <TestArea settings={s} color={color} />

      <div className="cs-group">When to pause</div>
      <ToggleRow label="On battery" on={s.pauseOnBattery} onToggle={() => set({ pauseOnBattery: !s.pauseOnBattery })} />
      <ToggleRow
        label="When Windows animations are off"
        desc="Settings › Accessibility › Visual effects › Animation effects."
        on={s.respectReducedMotion}
        onToggle={() => set({ respectReducedMotion: !s.respectReducedMotion })}
      />
      <div className="cc-row">
        <div>
          <div className="cc-label">Colour</div>
        </div>
        <div className="cc-chip-grid" role="radiogroup" aria-label="Effect colour">
          {[
            { id: "accent", label: "Accent" },
            { id: "#fafafa", label: "White" },
            { id: "#facc15", label: "Yellow" },
            { id: "#fb7185", label: "Rose" },
          ].map((o) => (
            <button data-weight="light"
              key={o.id}
              type="button"
              role="radio"
              aria-checked={s.color === o.id}
              className={`cc-chip ${s.color === o.id ? "active" : ""}`}
              onClick={() => set({ color: o.id })}
            >
              <span className="cs-swatch" style={{ background: o.id === "accent" ? currentAccentHex() : o.id }} />
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
