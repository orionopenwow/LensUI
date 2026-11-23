/**
 * Right column: grouped controls. Basic shows the five that matter most (look, colours, speed,
 * warp, grain); Advanced shows everything. Each section has its own reset.
 */
import React, { useRef, useState } from "react";
import { Clipboard, Dices, ImagePlus, Lock, Palette as PaletteIcon, Plus, Unlock, X } from "lucide-react";
import {
  BLEND_SPACES,
  DITHERS,
  GRAIN_STYLES,
  HARMONIES,
  LAYER_BLENDS,
  LAYER_MASKS,
  MODES,
  RANGES,
  TONES,
  allPresets,
  defaultState,
  evenStops,
  harmony,
  modeById,
  parseHexList,
  tidyStops,
  type BackdropState,
  type Harmony,
  type LockKey,
  type RangeKey,
  type Stop,
} from "../engine";
import { LabSlider, Section, Segmented, Toggle } from "./controls";

export type SetFn = (patch: Partial<BackdropState> | ((s: BackdropState) => BackdropState), commit?: boolean) => void;

const R = (k: RangeKey) => ({ min: RANGES[k][0], max: RANGES[k][1], defaultValue: RANGES[k][2], step: RANGES[k][3] });

/** Draggable stops bar: drag a stop to move it, click the bar to add one, Delete removes. */
const StopsBar: React.FC<{ stops: Stop[]; onChange: (s: Stop[], commit?: boolean) => void; selected: number; onSelect: (i: number) => void }> = ({ stops, onChange, selected, onSelect }) => {
  const bar = useRef<HTMLDivElement>(null);
  const grad = `linear-gradient(90deg, ${stops.map((s) => `${s.color} ${s.pos * 100}%`).join(", ")})`;
  const posAt = (x: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  return (
    <div
      ref={bar}
      className="bd-stops"
      style={{ background: grad }}
      onPointerDown={(e) => {
        if (e.target !== bar.current || stops.length >= 8) return;
        const pos = posAt(e.clientX);
        const near = stops.reduce((a, s, i) => (Math.abs(s.pos - pos) < Math.abs(stops[a].pos - pos) ? i : a), 0);
        const next = tidyStops([...stops, { color: stops[near].color, pos }]);
        onChange(next, true);
      }}
      role="group"
      aria-label="Gradient stops. Click the bar to add a stop."
    >
      {stops.map((s, i) => (
        <button
          key={i}
          type="button"
          className={`bd-stop ${selected === i ? "on" : ""}`}
          style={{ left: `${s.pos * 100}%`, background: s.color }}
          aria-label={`Stop ${i + 1}, ${s.color}, at ${Math.round(s.pos * 100)}%`}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as Element).setPointerCapture(e.pointerId);
            onSelect(i);
          }}
          onPointerMove={(e) => {
            if (!(e.buttons & 1)) return;
            const next = stops.map((x, k) => (k === i ? { ...x, pos: posAt(e.clientX) } : x));
            onChange(next);
          }}
          onPointerUp={() => onChange(tidyStops(stops), true)}
          onKeyDown={(e) => {
            if ((e.key === "Delete" || e.key === "Backspace") && stops.length > 2) {
              onChange(stops.filter((_, k) => k !== i), true);
              onSelect(Math.max(0, i - 1));
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              const d = e.key === "ArrowLeft" ? -0.01 : 0.01;
              onChange(stops.map((x, k) => (k === i ? { ...x, pos: Math.max(0, Math.min(1, x.pos + d * (e.shiftKey ? 5 : 1))) } : x)), true);
            }
          }}
        />
      ))}
    </div>
  );
};

export const ControlsPanel: React.FC<{
  state: BackdropState;
  set: SetFn;
  advanced: boolean;
  onAdvanced: (v: boolean) => void;
  locks: Set<LockKey>;
  onLock: (k: LockKey) => void;
  onRandomPalette: () => void;
  onImage: (file: File) => void;
  onPaletteFromTheme: () => void;
  imageName: string | null;
  onClearImage: () => void;
  living: React.ReactNode;
  share: React.ReactNode;
}> = ({ state: s, set, advanced, onAdvanced, locks, onLock, onRandomPalette, onImage, onPaletteFromTheme, imageName, onClearImage, living, share }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({ look: true, colors: true, shape: false, motion: true, grade: false, effects: true, layer: false, living: false, share: false });
  const [sel, setSel] = useState(0);
  const [paste, setPaste] = useState("");
  const [harm, setHarm] = useState<Harmony>("analogous");
  const file = useRef<HTMLInputElement>(null);
  const mode = modeById(s.mode)!;
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const d = defaultState(s.mode);
  const num = (k: RangeKey, label: string, unit = "", hint?: string) => (
    <LabSlider key={k} label={label} unit={unit} hint={hint} value={s[k] as number} {...R(k)} onChange={(v) => set({ [k]: v } as Partial<BackdropState>)} onCommit={() => set({}, true)} />
  );
  const lockBtn = (k: LockKey, label: string) => (
    <button
      type="button"
      className={`bd-icon-btn small ${locks.has(k) ? "on" : ""}`}
      aria-pressed={locks.has(k)}
      aria-label={`${locks.has(k) ? "Unlock" : "Lock"} ${label} (Inspire leaves locked groups alone)`}
      onClick={() => onLock(k)}
    >
      {locks.has(k) ? <Lock size={11} aria-hidden /> : <Unlock size={11} aria-hidden />}
    </button>
  );
  const selStop = s.stops[Math.min(sel, s.stops.length - 1)];

  return (
    <aside className="bd-right" aria-label="Controls">
      <div className="bd-right-head">
        <Segmented label="Detail" small value={advanced ? "adv" : "basic"} options={[{ id: "basic", label: "Basic" }, { id: "adv", label: "Advanced" }]} onChange={(v) => onAdvanced(v === "adv")} />
      </div>

      <Section id="look" title="Look" open={open.look} onToggle={() => toggle("look")} extra={lockBtn("mode", "look")} onReset={() => set({ params: d.params, handles: d.handles }, true)}>
        <select className="bd-select" aria-label="Look" value={s.mode} onChange={(e) => {
          const m = modeById(e.target.value)!;
          set({ mode: m.id, params: Object.fromEntries(m.params.map((p) => [p.key, p.default])), handles: m.handles.map((h) => ({ ...h.default })) }, true);
        }}>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.family} · {m.name}
            </option>
          ))}
        </select>
        <p className="bd-blurb">{mode.blurb}</p>
        {mode.params.map((p) => (
          <LabSlider
            key={p.key}
            label={p.label}
            value={s.params[p.key] ?? p.default}
            min={p.min}
            max={p.max}
            step={p.step}
            defaultValue={p.default}
            onChange={(v) => set((st) => ({ ...st, params: { ...st.params, [p.key]: v } }))}
            onCommit={() => set({}, true)}
          />
        ))}
        {mode.image && (
          <div className="bd-row">
            <button type="button" className="bd-btn" onClick={() => file.current?.click()}>
              <ImagePlus size={13} aria-hidden /> {imageName ? "Change picture" : "Choose a picture"}
            </button>
            {imageName && (
              <button type="button" className="bd-icon-btn small" aria-label="Remove picture" onClick={onClearImage}>
                <X size={12} aria-hidden />
              </button>
            )}
            <span className="bd-hint">{imageName ?? "Stays on this PC. A built-in picture is used until you choose one."}</span>
          </div>
        )}
      </Section>

      <Section id="colors" title="Colours" open={open.colors} onToggle={() => toggle("colors")} extra={lockBtn("palette", "colours")} onReset={() => set({ stops: d.stops, space: "oklab", bias: 0, sharpness: 0 }, true)}>
        <div className="bd-swatches" role="list" aria-label="Palette">
          {s.stops.map((st, i) => (
            <label key={i} className={`bd-swatch ${sel === i ? "on" : ""}`} style={{ background: st.color }} role="listitem">
              <input
                type="color"
                value={st.color.toLowerCase()}
                aria-label={`Colour ${i + 1}`}
                onFocus={() => setSel(i)}
                onChange={(e) => set((x) => ({ ...x, stops: x.stops.map((y, k) => (k === i ? { ...y, color: e.target.value.toUpperCase() } : y)) }))}
                onBlur={() => set({}, true)}
              />
            </label>
          ))}
          {s.stops.length < 8 && (
            <button type="button" className="bd-swatch add" aria-label="Add a colour" onClick={() => set((x) => ({ ...x, stops: evenStops([...x.stops.map((y) => y.color), x.stops[x.stops.length - 1].color]) }), true)}>
              <Plus size={13} aria-hidden />
            </button>
          )}
        </div>
        <div className="bd-row wrap">
          <button type="button" className="bd-btn" onClick={onRandomPalette}>
            <Dices size={13} aria-hidden /> Randomize
          </button>
          <button type="button" className="bd-btn" onClick={() => file.current?.click()}>
            <ImagePlus size={13} aria-hidden /> From image
          </button>
          <button type="button" className="bd-btn" onClick={onPaletteFromTheme}>
            <PaletteIcon size={13} aria-hidden /> From theme
          </button>
        </div>
        <StopsBar stops={s.stops} selected={sel} onSelect={setSel} onChange={(stops, commit) => set({ stops }, commit)} />
        {selStop && <div className="bd-hint">Stop {sel + 1}: {selStop.color} at {Math.round(selStop.pos * 100)}% · click the bar to add, Delete removes</div>}
        <Segmented label="Blend space" value={s.space} options={BLEND_SPACES} onChange={(v) => set({ space: v }, true)} />
        {num("bias", "Bias")}
        {num("sharpness", "Sharpness")}
        {advanced && (
          <>
            <div className="bd-row">
              <select className="bd-select" aria-label="Harmony" value={harm} onChange={(e) => setHarm(e.target.value as Harmony)}>
                {HARMONIES.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
              <button type="button" className="bd-btn" onClick={() => set({ stops: evenStops(harmony(s.stops[Math.floor(s.stops.length / 2)].color, harm, Math.max(3, s.stops.length))) }, true)}>
                Harmony from middle colour
              </button>
            </div>
            <div className="bd-row">
              <input className="bd-input" value={paste} placeholder="Paste hex colours: #0b0a1a, #7c3aed…" aria-label="Paste hex colours" onChange={(e) => setPaste(e.target.value)} />
              <button
                type="button"
                className="bd-icon-btn"
                aria-label="Use pasted colours"
                onClick={() => {
                  const list = parseHexList(paste);
                  if (list.length >= 2) set({ stops: evenStops(list) }, true);
                }}
              >
                <Clipboard size={13} aria-hidden />
              </button>
            </div>
          </>
        )}
      </Section>

      <Section id="motion" title="Motion" open={open.motion} onToggle={() => toggle("motion")} extra={lockBtn("motion", "motion")} onReset={() => set({ speed: d.speed, warp: d.warp, loop: d.loop }, true)}>
        {num("speed", "Flow speed")}
        {num("warp", "Warp")}
        {advanced && num("loop", "Loop length", " s", "seamless")}
      </Section>

      {advanced && (
        <Section id="shape" title="Shape" open={open.shape} onToggle={() => toggle("shape")} extra={lockBtn("shape", "shape")} onReset={() => set({ scale: d.scale, softness: d.softness }, true)}>
          {num("scale", "Noise scale")}
          {num("softness", "Softness")}
          <LabSlider label="Seed" value={s.seed} min={0} max={99999} step={1} defaultValue={7} onChange={(v) => set({ seed: v })} onCommit={() => set({}, true)} />
        </Section>
      )}

      {advanced && (
        <Section id="grade" title="Grade" open={open.grade} onToggle={() => toggle("grade")} extra={lockBtn("grade", "grade")} onReset={() => set({ brightness: 1, contrast: 1.05, saturation: 1.1, exposure: 0, tone: "none" }, true)}>
          {num("brightness", "Brightness")}
          {num("contrast", "Contrast")}
          {num("saturation", "Saturation")}
          {num("exposure", "Exposure", " EV")}
          <Segmented label="Tone" value={s.tone} options={TONES} onChange={(v) => set({ tone: v }, true)} />
        </Section>
      )}

      <Section id="effects" title="Effects" open={open.effects} onToggle={() => toggle("effects")} extra={lockBtn("effects", "effects")} onReset={() => set({ grain: 0.02, grainStyle: "fine", vignette: 0, dither: "blue", aberration: 0, bloom: 0 }, true)}>
        {num("grain", "Grain")}
        {advanced && (
          <>
            <Segmented label="Grain style" small value={s.grainStyle} options={GRAIN_STYLES} onChange={(v) => set({ grainStyle: v }, true)} />
            {num("vignette", "Vignette")}
            {num("bloom", "Bloom")}
            {num("aberration", "Chromatic edge")}
            <div className="bd-field-label">Dither (removes banding)</div>
            <Segmented label="Dither" small value={s.dither} options={DITHERS} onChange={(v) => set({ dither: v }, true)} />
          </>
        )}
      </Section>

      {advanced && (
        <Section id="layer" title="Layer" open={open.layer} onToggle={() => toggle("layer")} onReset={() => set({ layer: null }, true)}>
          <Toggle
            label="Blend a second look on top"
            checked={!!s.layer}
            onChange={(on) =>
              set(
                (x) => ({
                  ...x,
                  layer: on ? { look: { ...allPresets().find((p) => p.id === "light-edge-of-night")!.state }, blend: "screen", mask: "radial", amount: 0.6 } : null,
                }),
                true
              )
            }
          />
          {s.layer && (
            <>
              <select
                className="bd-select"
                aria-label="Second look"
                value=""
                onChange={(e) => {
                  const p = allPresets().find((x) => x.id === e.target.value);
                  if (p) set((x) => ({ ...x, layer: { ...x.layer!, look: { ...p.state } } }), true);
                }}
              >
                <option value="">Second look: {modeById(s.layer.look.mode)?.name} — pick a preset…</option>
                {allPresets().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Segmented label="Blend" small value={s.layer.blend} options={LAYER_BLENDS} onChange={(v) => set((x) => ({ ...x, layer: { ...x.layer!, blend: v } }), true)} />
              <Segmented label="Mask" small value={s.layer.mask} options={LAYER_MASKS} onChange={(v) => set((x) => ({ ...x, layer: { ...x.layer!, mask: v } }), true)} />
              <LabSlider label="Amount" value={s.layer.amount} min={0} max={1} step={0.01} defaultValue={0.6} onChange={(v) => set((x) => ({ ...x, layer: { ...x.layer!, amount: v } }))} onCommit={() => set({}, true)} />
            </>
          )}
        </Section>
      )}

      <Section id="living" title="Living wallpaper" open={open.living} onToggle={() => toggle("living")}>
        {living}
      </Section>
      <Section id="share" title="Share" open={open.share} onToggle={() => toggle("share")}>
        {share}
      </Section>

      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImage(f);
          e.target.value = "";
        }}
      />
    </aside>
  );
};
