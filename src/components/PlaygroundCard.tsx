import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Gauge, Hand, Moon, Sparkles, Timer, Trash2, Wand2 } from "lucide-react";
import type { LensConfig } from "../types/lens";
import { PillFillBar } from "./PillFillBar";
import { readWorkspaces } from "./WorkspacesCard";
import type { WallpaperSettings, WallpaperState } from "../surfaces/wallpaperTypes";
import { PlaygroundView } from "../playground/PlaygroundView";
import type { RunnerStats } from "../playground/runner";
import { DEFAULT_IDLE_SCENE, SCENES, sceneById } from "../playground/registry";
import { normaliseOptions, type SceneModule, type SceneOptions } from "../playground/types";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

type Stats = RunnerStats & { scene?: string; fpsCap?: number };

const PAUSE_TEXT: Record<string, string> = {
  covered: "Paused: a window fills the screen.",
  battery: "Paused: on battery.",
};

/** Live thumbnail that only animates while it is on screen. */
const SceneTile: React.FC<{ scene: SceneModule; active: boolean; selected: boolean; options?: SceneOptions; calm: boolean; onSelect: () => void }> = ({
  scene,
  active,
  selected,
  options,
  calm,
  onSelect,
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <button data-weight="medium"
      ref={ref}
      type="button"
      className="pg-tile"
      aria-pressed={selected}
      aria-label={`${scene.name}${active ? " (on your desktop)" : ""}`}
      onClick={onSelect}
      style={{
        position: "relative",
        height: 86,
        borderRadius: 12,
        overflow: "hidden",
        padding: 0,
        cursor: "pointer",
        border: selected ? "2px solid var(--lens-fg)" : "1px solid var(--lens-border)",
        background: "rgb(var(--lens-ink) / 0.05)",
      }}
    >
      {/* Previews are 15 fps, low resolution and stop when scrolled out of view. */}
      <PlaygroundView sceneId={scene.id} options={options} preview fps={15} dprCap={1} paused={!visible} still={calm} seed={7} />
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "14px 8px 5px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          fontWeight: 700,
          color: "#fafafa",
          background: "linear-gradient(transparent, rgb(0 0 0 / 0.7))",
          textAlign: "left",
        }}
      >
        {scene.interactive && <Hand size={11} strokeWidth={2.6} aria-hidden="true" />}
        {scene.name}
        {active && (
          <span
            style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: 7, background: "var(--lens-accent)", boxShadow: "0 0 0 2px rgb(0 0 0 / 0.4)" }}
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  );
};

function SettingControls({ scene, values, onChange }: { scene: SceneModule; values: SceneOptions; onChange: (key: string, v: SceneOptions[string]) => void }) {
  return (
    <>
      {scene.settings.map((f) => {
        if (f.type === "text") return null;
        if (f.type === "range") {
          return (
            <PillFillBar
              key={f.key}
              label={f.label}
              value={Number(values[f.key])}
              min={f.min}
              max={f.max}
              step={f.step}
              unit={f.unit ?? ""}
              fillColor="var(--lens-accent)"
              icon={<Sparkles size={14} strokeWidth={2.3} />}
              onChange={(v) => onChange(f.key, v)}
            />
          );
        }
        if (f.type === "choice") {
          return (
            <div className="cc-row" key={f.key}>
              <div className="cc-label">{f.label}</div>
              <div className="cc-chip-grid" role="radiogroup" aria-label={f.label}>
                {f.options.map((o) => (
                  <button data-weight="light"
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={values[f.key] === o.id}
                    className={`cc-chip ${values[f.key] === o.id ? "active" : ""}`}
                    onClick={() => onChange(f.key, o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div className="cc-row" key={f.key}>
            <div>
              <div className="cc-label">{f.label}</div>
              {f.hint && <div className="cc-desc">{f.hint}</div>}
            </div>
            <button data-weight="light"
              type="button"
              className={`cc-toggle ${values[f.key] ? "on" : ""}`}
              aria-label={f.label}
              aria-pressed={!!values[f.key]}
              onClick={() => onChange(f.key, !values[f.key])}
            />
          </div>
        );
      })}
    </>
  );
}

/** Compact scene picker (a native select keeps long lists tidy and keyboard friendly). */
function ScenePicker({ value, onChange, emptyLabel, label }: { value: string; onChange: (id: string) => void; emptyLabel: string; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        flexShrink: 0,
        minWidth: 150,
        height: 30,
        padding: "0 10px",
        borderRadius: 9,
        border: "1px solid var(--lens-border)",
        background: "rgb(var(--lens-ink) / 0.06)",
        color: "var(--lens-fg)",
        font: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <option value="">{emptyLabel}</option>
      {SCENES.map((sc) => (
        <option key={sc.id} value={sc.id}>
          {sc.name}
        </option>
      ))}
    </select>
  );
}

function BudgetMeter({ stats, label }: { stats: Stats | null; label: string }) {
  const pct = stats ? Math.min(100, Math.round(stats.budget * 100)) : 0;
  const tone = pct < 25 ? "#34D399" : pct < 60 ? "#FBBF24" : "#F87171";
  return (
    <div className="cc-row" aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Gauge size={16} strokeWidth={2.3} aria-hidden="true" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div className="cc-label">Budget</div>
          <div className="cc-desc">
            {stats
              ? `${label}: ${stats.fps} fps, ${stats.ms.toFixed(1)} ms of work per frame (${pct}% of the frame).`
              : "Shown while a scene is running."}
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="lens-meter"
        style={{ width: 92, height: 8, borderRadius: 8, background: "rgb(var(--lens-ink) / 0.1)", flexShrink: 0 }}
      >
        <div className="lens-meter-fill" style={{ "--fill": Math.max(3, Math.min(100, pct)) / 100, background: tone } as React.CSSProperties} />
      </div>
    </div>
  );
}

/** Control Center card: Playground — interactive and ambient scenes as the Lens wallpaper. */
export const PlaygroundCard: React.FC<Props> = ({ config }) => {
  const [state, setState] = useState<WallpaperState | null>(null);
  const [selected, setSelected] = useState<string>(SCENES[0].id);
  const [liveStats, setLiveStats] = useState<Stats | null>(null);
  const [previewStats, setPreviewStats] = useState<Stats | null>(null);
  const [paused, setPaused] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const liveAt = useRef(0);

  const refresh = useCallback(() => {
    invoke<WallpaperState>("get_wallpaper_state_cmd")
      .then((s) => {
        setState(s);
        if (s.settings.scene && sceneById(s.settings.scene)) setSelected((cur) => (cur ? cur : s.settings.scene));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    invoke<WallpaperState>("get_wallpaper_state_cmd")
      .then((s) => s.settings.scene && sceneById(s.settings.scene) && setSelected(s.settings.scene))
      .catch(() => {});
    const un1 = listen("lens://wallpaper-changed", () => refresh());
    const un2 = listen<Stats>("lens://playground-stats", (e) => {
      liveAt.current = Date.now();
      setLiveStats(e.payload);
    });
    const un3 = listen<string | null>("lens://wallpaper-pause", (e) => setPaused(e.payload ?? null));
    const t = window.setInterval(() => {
      if (Date.now() - liveAt.current > 3000) setLiveStats(null);
    }, 1500);
    return () => {
      [un1, un2, un3].forEach((u) => u.then((f) => f()));
      clearInterval(t);
    };
  }, [refresh]);

  const save = async (patch: Partial<WallpaperSettings>) => {
    if (!state) return;
    const next = { ...state.settings, ...patch };
    // The input hook runs only when some chosen scene reacts to the cursor (or ripples are on).
    const ids = [next.scene, ...Object.values(next.workspaceScenes ?? {})];
    next.interactive = ids.some((id) => sceneById(id)?.interactive);
    setState({ ...state, settings: next });
    try {
      const res = await invoke<WallpaperState>("set_wallpaper_settings_cmd", { settings: next });
      if (res) setState(res);
      setStatus(null);
    } catch (e) {
      setStatus(String(e));
    }
  };

  if (!state) return null;
  const s = state.settings;
  const scene = sceneById(selected) ?? SCENES[0];
  const values = normaliseOptions(scene, s.sceneOptions?.[scene.id]);
  const onDesktop = s.enabled && s.scene === scene.id;
  const wsCfg = readWorkspaces(config);

  const setOption = (key: string, v: SceneOptions[string]) =>
    save({ sceneOptions: { ...(s.sceneOptions ?? {}), [scene.id]: { ...values, [key]: v } } });

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Playground</div>
          <div className="cc-desc">
            Living wallpapers behind your icons. Hand-marked scenes react to your cursor on the empty desktop; icons and
            windows work as usual.
          </div>
        </div>
      </div>

      <div className="cc-row">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Moon size={16} strokeWidth={2.3} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div>
            <div className="cc-label">Calm</div>
            <div className="cc-desc">Freeze the scene into a still picture and stop all animation and cursor tracking.</div>
          </div>
        </div>
        <button data-weight="light" type="button" className={`cc-toggle ${s.calm ? "on" : ""}`} aria-label="Calm" aria-pressed={s.calm} onClick={() => save({ calm: !s.calm })} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 8 }}>
        {SCENES.map((sc) => (
          <SceneTile
            key={sc.id}
            scene={sc}
            active={s.enabled && s.scene === sc.id}
            selected={sc.id === scene.id}
            options={s.sceneOptions?.[sc.id]}
            calm={s.calm}
            onSelect={() => setSelected(sc.id)}
          />
        ))}
      </div>

      <div
        style={{
          position: "relative",
          height: 190,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--lens-border)",
        }}
      >
        <PlaygroundView
          sceneId={scene.id}
          options={values}
          fps={30}
          still={s.calm}
          ripples={s.ripples}
          preview={false}
          domInput
          dprCap={1}
          seed={11}
          onStats={setPreviewStats}
        />
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 10,
            fontSize: 11,
            fontWeight: 700,
            color: "#fafafa",
            padding: "3px 8px",
            borderRadius: 7,
            background: "rgb(0 0 0 / 0.45)",
            pointerEvents: "none",
          }}
        >
          {scene.interactive ? "Try it here: move, click and drag" : "Preview"}
        </div>
      </div>

      <div className="cc-row">
        <div style={{ minWidth: 0 }}>
          <div className="cc-label">{scene.name}</div>
          <div className="cc-desc">{scene.blurb}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {onDesktop ? (
            <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={() => save({ scene: "" })}>
              Stop Scene
            </button>
          ) : (
            <button data-weight="medium" type="button" className="cc-btn" onClick={() => save({ enabled: true, scene: scene.id, calm: false })}>
              <Wand2 size={12} style={{ marginRight: 5, verticalAlign: -1 }} aria-hidden="true" />
              Use as Wallpaper
            </button>
          )}
        </div>
      </div>

      <SettingControls scene={scene} values={values} onChange={setOption} />

      {scene.id === "sand" && (
        <div className="cc-row">
          <div>
            <div className="cc-label">Sand canvas</div>
            <div className="cc-desc">
              Your drawing is kept between restarts. Right-drag erases; the mouse wheel changes the brush. Painting with
              the left button also draws Windows' selection box, so pick Alt + left or Middle button if that bothers you.
            </div>
          </div>
          <button data-weight="medium"
            type="button"
            className="cc-btn-ghost"
            style={{ flexShrink: 0 }}
            onClick={() => {
              emit("lens://playground-reset", "sand").catch(() => {});
              invoke("clear_playground_state_cmd", { scene: "sand" }).catch(() => {});
            }}
          >
            <Trash2 size={12} style={{ marginRight: 5, verticalAlign: -1 }} aria-hidden="true" />
            Clear
          </button>
        </div>
      )}

      <div className="cc-row">
        <div className="cc-label">Frame rate</div>
        <div className="cc-chip-grid" role="radiogroup" aria-label="Frame rate">
          {[30, 60].map((f) => (
            <button data-weight="light" key={f} type="button" role="radio" aria-checked={s.fps === f} className={`cc-chip ${s.fps === f ? "active" : ""}`} onClick={() => save({ fps: f })}>
              {f} fps
            </button>
          ))}
        </div>
      </div>
      <div className="cc-row">
        <div>
          <div className="cc-label">Click ripples</div>
          <div className="cc-desc">A soft ripple where you click empty desktop. Drawn in the wallpaper only.</div>
        </div>
        <button data-weight="light" type="button" className={`cc-toggle ${s.ripples ? "on" : ""}`} aria-label="Click ripples" aria-pressed={s.ripples} onClick={() => save({ ripples: !s.ripples })} />
      </div>

      <BudgetMeter stats={liveStats ?? previewStats} label={liveStats ? "On your desktop" : "Preview"} />
      {paused && s.enabled && s.scene && <div className="cc-desc">{PAUSE_TEXT[paused] ?? "Paused."}</div>}

      {wsCfg.enabled && (
        <>
          <div>
            <div className="cc-label">Scene per workspace</div>
            <div className="cc-desc">Each Lens workspace can show its own scene when you switch to it.</div>
          </div>
          {wsCfg.workspaces.map((w) => {
            const cur = s.workspaceScenes?.[w.id] ?? "";
            return (
              <div className="cc-row" key={w.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 10, background: w.color }} />
                  <div className="cc-label">{w.name}</div>
                </div>
                <ScenePicker
                  label={`Scene for ${w.name}`}
                  value={cur}
                  emptyLabel="Same as desktop"
                  onChange={(id) => {
                    const next = { ...(s.workspaceScenes ?? {}) };
                    if (id) next[w.id] = id;
                    else delete next[w.id];
                    save({ workspaceScenes: next });
                  }}
                />
              </div>
            );
          })}
        </>
      )}

      <div className="cc-row">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Timer size={16} strokeWidth={2.3} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div>
            <div className="cc-label">Idle mode</div>
            <div className="cc-desc">
              After a while without input, show a scene full screen. Any key or mouse move brings your desktop back. Never
              during games, fullscreen apps, presentations, calls or while the microphone is in use.
            </div>
          </div>
        </div>
        <button data-weight="light" type="button" className={`cc-toggle ${s.idleEnabled ? "on" : ""}`} aria-label="Idle mode" aria-pressed={s.idleEnabled} onClick={() => save({ idleEnabled: !s.idleEnabled })} />
      </div>
      {s.idleEnabled && (
        <>
          <PillFillBar label="Start after" value={s.idleMinutes} min={1} max={60} step={1} unit=" min" fillColor="var(--lens-accent)" icon={<Timer size={14} strokeWidth={2.3} />} onChange={(v) => save({ idleMinutes: v })} />
          <div className="cc-row">
            <div className="cc-label">Idle scene</div>
            <ScenePicker label="Idle scene" value={s.idleScene || ""} emptyLabel="Same as desktop" onChange={(id) => save({ idleScene: id })} />
          </div>
          {!s.idleScene && !s.scene && <div className="cc-desc">No desktop scene is set, so idle mode shows {sceneById(DEFAULT_IDLE_SCENE)?.name}.</div>}
        </>
      )}

      {status && <div className="cc-desc">{status}</div>}
    </div>
  );
};
