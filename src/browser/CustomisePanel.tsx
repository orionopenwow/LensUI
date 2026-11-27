import React, { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { DEFAULT_APPEARANCE, DEFAULT_SIDEBAR, SIDEBAR_WIDTH, type Appearance, type SidebarPrefs } from "./api";
import { Toggle } from "./AiPanel";
import { sidebarPrefs } from "./tabAi";
import { Key } from "./ApprovalCard";
import { oops } from "./oops";
import { TAB_STYLES, validStyle, type TabStyle } from "./tabModes";

/** hsl → #rrggbb */
export function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** #rrggbb → [hue 0–360, lightness 0–1] for placing the picker knob. */
export function hexHueLight(hex: string): [number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [220, 0.6];
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), l];
}

/** Field position (0–1, 0–1) → colour: x is hue, y runs from vivid (top) to deep (bottom). */
export function fieldColor(x: number, y: number): string {
  const cx = Math.max(0, Math.min(1, x));
  const cy = Math.max(0, Math.min(1, y));
  return hslHex(cx * 360, 0.82, 0.68 - cy * 0.42);
}

export const PRESETS: { id: string; label: string; a: string; b: string; accent: string | null; scheme?: Appearance["scheme"] }[] = [
  { id: "obsidian", label: "Obsidian", a: "#fafafa", b: "#0b0b0d", accent: null, scheme: "dark" },
  { id: "paper", label: "Paper", a: "#f4f1ea", b: "#1c1b19", accent: "#3f3f46", scheme: "light" },
  { id: "sage", label: "Sage", a: "#a8c5a0", b: "#16201a", accent: "#86b18a" },
  { id: "iris", label: "Iris", a: "#a99cf2", b: "#17142a", accent: "#8b7cf0" },
  { id: "rose", label: "Rose", a: "#e5a3b0", b: "#2a161b", accent: "#e08aa0" },
  { id: "contrast", label: "Contrast", a: "#ffffff", b: "#000000", accent: "#ffffff", scheme: "dark" },
];

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string, React.ReactNode?][]; onChange(v: T): void; label: string }) {
  return (
    <div className="lb-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text, icon]) => (
        <button data-weight="medium" key={v} role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
          {icon}
          {text}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, onChange, dithered, min = 0, max = 100 }: { label: string; value: number; onChange(v: number): void; dithered?: boolean; min?: number; max?: number }) {
  return (
    <label className="lb-slider">
      <span>{label}</span>
      <span className={`lb-slider-track${dithered ? " is-dither" : ""}`}>
        <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <span className="lb-slider-fill" style={{ width: `${((value - min) / (max - min)) * 100}%` }} aria-hidden />
      </span>
      <span className="lb-mono lb-dim lb-slider-val">{value}</span>
    </label>
  );
}

/** "Make it yours": accent field, scheme, presets, dither/grain, tabs, density, typeface. */
export function CustomisePanel({ value, onChange }: { value: Appearance; onChange(a: Appearance): void }) {
  const a = { ...DEFAULT_APPEARANCE, ...value };
  const field = useRef<HTMLDivElement>(null);
  const [hue, light] = hexHueLight(a.accent ?? "#7c8cf8");
  const knob = { left: `${(hue / 360) * 100}%`, top: `${Math.max(0, Math.min(1, (0.68 - light) / 0.42)) * 100}%` };
  const set = (patch: Partial<Appearance>) => onChange({ ...a, ...patch });
  const sb = sidebarPrefs(a.sidebar, DEFAULT_SIDEBAR, SIDEBAR_WIDTH);
  const setSb = (patch: Partial<SidebarPrefs>) => set({ sidebar: { ...sb, ...patch } });
  const pick = (e: React.PointerEvent) => {
    const r = field.current!.getBoundingClientRect();
    set({ accent: fieldColor((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height) });
  };
  const nudge = (dx: number, dy: number) => {
    const x = hue / 360 + dx;
    const y = (0.68 - light) / 0.42 + dy;
    set({ accent: fieldColor((x + 1) % 1, y) });
  };
  return (
    <div className="lb-settings">
      <section className="lb-card lb-make">
        <div
          ref={field}
          className="lb-field"
          role="slider"
          tabIndex={0}
          aria-label="Accent colour"
          aria-valuetext={a.accent ?? "Follows Lens"}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            pick(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && pick(e)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.08 : 0.02;
            if (e.key === "ArrowLeft") nudge(-step, 0);
            else if (e.key === "ArrowRight") nudge(step, 0);
            else if (e.key === "ArrowUp") nudge(0, -step);
            else if (e.key === "ArrowDown") nudge(0, step);
            else return;
            e.preventDefault();
          }}
        >
          <span className="lb-field-knob" style={{ ...knob, background: a.accent ?? "transparent" }} />
        </div>
        <Seg
          label="Colour scheme"
          value={a.scheme}
          onChange={(scheme) => set({ scheme })}
          options={[
            ["auto", "Auto", <Monitor key="m" size={13} />],
            ["light", "Light", <Sun key="s" size={13} />],
            ["dark", "Dark", <Moon key="d" size={13} />],
          ]}
        />
        <div className="lb-swatches" role="radiogroup" aria-label="Presets">
          {PRESETS.map((p) => {
            const on = (a.accent ?? null) === p.accent && (!p.scheme || p.scheme === a.scheme);
            return (
              <button data-weight="medium"
                key={p.id}
                role="radio"
                aria-checked={on}
                aria-label={p.label}
                className={`lb-swatch${on ? " is-on" : ""}`}
                style={{ background: `linear-gradient(135deg, ${p.a} 0 50%, ${p.b} 50% 100%)` }}
                onClick={() => set({ accent: p.accent, ...(p.scheme ? { scheme: p.scheme } : {}) })}
              />
            );
          })}
        </div>
        <Slider label="Dither" value={a.dither} onChange={(dither) => set({ dither })} dithered />
        <Slider label="Grain" value={a.grain} onChange={(grain) => set({ grain })} />
        <div className="lb-rule" />
        <div className="lb-make-row">
          <span className="lb-label">Tab position</span>
          <Seg label="Tab position" value={a.tabsLayout} onChange={(tabsLayout) => set({ tabsLayout })} options={[["vertical", "Vertical"], ["horizontal", "Horizontal"]]} />
        </div>
        <TabModePicker value={a.tabsLayout === "horizontal" ? validStyle(a.tabStyle) : "vertical"} onChange={(m) => set(m === "vertical" ? { tabsLayout: "vertical" } : { tabsLayout: "horizontal", tabStyle: m })} />
        <div className="lb-make-row">
          <span className="lb-label">Density</span>
          <Seg label="Density" value={a.density} onChange={(density) => set({ density })} options={[["compact", "Compact"], ["comfortable", "Comfortable"]]} />
        </div>
        <div className="lb-make-row">
          <span className="lb-label">Type</span>
          <Seg label="Typeface" value={a.typeface} onChange={(typeface) => set({ typeface })} options={[["lens", "Lens"], ["system", "System"], ["mono", "Mono"], ["serif", "Serif"]]} />
        </div>
        <div className="lb-rule" />
        <div className="lb-make-row">
          <span className="lb-label">Sidebar</span>
          <Seg label="Sidebar" value={sb.mode} onChange={(mode) => setSb({ mode })} options={[["full", "Full"], ["stack", "Icons"]]} />
        </div>
        <div className="lb-make-row">
          <span className="lb-label">Side</span>
          <Seg label="Sidebar side" value={sb.side} onChange={(side) => setSb({ side })} options={[["left", "Left"], ["right", "Right"]]} />
        </div>
        <div className="lb-make-row">
          <span className="lb-label">Group</span>
          <Seg label="Group tabs" value={sb.group} onChange={(group) => setSb({ group })} options={[["time", "By time"], ["site", "By site"], ["none", "Off"]]} />
        </div>
        {sb.mode === "full" ? <Slider label="Width" value={sb.width} min={SIDEBAR_WIDTH.min} max={SIDEBAR_WIDTH.max} onChange={(width) => setSb({ width })} /> : null}
        <div className="lb-make-toggles">
          {([["showChats", "Chats"], ["showMedia", "Now playing"], ["showSpaces", "Spaces"]] as [keyof SidebarPrefs, string][]).map(([k, label]) => (
            <label key={k} className="lb-make-toggle">
              <span>{label}</span>
              <Toggle on={sb[k] as boolean} label={`Show ${label.toLowerCase()} in the sidebar`} onChange={(v) => setSb({ [k]: v } as Partial<SidebarPrefs>)} />
            </label>
          ))}
        </div>
        <footer className="lb-make-foot">
          <button data-weight="medium" className="lb-btn lb-btn-sm lb-btn-ghost" onClick={() => onChange(DEFAULT_APPEARANCE)}>Reset <Key k="R" /></button>
          <button data-weight="heavy" className="lb-btn lb-btn-sm lb-btn-primary" onClick={() => void invoke("open_dock_popout_tab_cmd", { tab: "theme" }).catch(oops("open Lens themes"))}>
            <Palette size={13} /> Customise <Key k="⏎" />
          </button>
        </footer>
      </section>
      <p className="lb-hint">Change tabs, the sidebar, density, theme and type. Don't like the dither? Slide it to 0.</p>
    </div>
  );
}

/** A small Lens-drawn picture of each tab mode (no images), like the dock style picker. */
export function ModeThumb({ mode }: { mode: "vertical" | TabStyle }) {
  const parts: Record<string, React.ReactNode> = {
    vertical: <><i className="side" /><i className="bar" /><i className="addr" /><i className="t on" /><i className="t" /><i className="t" /></>,
    curved: <><i className="strip" /><i className="bar" /><i className="addr" /><i className="t on" /><i className="t" /><i className="t" /></>,
    joined: <><i className="strip" /><i className="bar" /><i className="addr" /><i className="t on" /><i className="t" /><i className="t" /></>,
    compact: <><i className="bar" /><i className="addr" /><i className="t on" /><i className="t" /><i className="t" /><i className="t" /></>,
    dynamic: <><i className="bar" /><i className="addr" /><i className="strip" /><i className="t on" /><i className="t" /><i className="t" /></>,
    merged: <><i className="bar" /><i className="addr" /><i className="t" /><i className="t" /><i className="t" /></>,
  };
  return <span className={`lb-mode-pic m-${mode}`} aria-hidden>{parts[mode]}</span>;
}

/** Vertical plus the five horizontal styles, as a radio group of thumbnails. */
export function TabModePicker({ value, onChange }: { value: "vertical" | TabStyle; onChange(m: "vertical" | TabStyle): void }) {
  const modes: { id: "vertical" | TabStyle; label: string; line: string }[] = [{ id: "vertical", label: "Vertical", line: "Tabs in the sidebar, with spaces and folders." }, ...TAB_STYLES];
  const pick = (i: number) => onChange(modes[(i + modes.length) % modes.length].id);
  const at = modes.findIndex((m) => m.id === value);
  return (
    <div className="lb-modes" role="radiogroup" aria-label="Tab style">
      {modes.map((m, i) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={m.id === value}
          aria-label={`${m.label}: ${m.line}`}
          tabIndex={m.id === value ? 0 : -1}
          data-weight="medium"
          className="lb-mode"
          onClick={() => onChange(m.id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); pick(at + 1); }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); pick(at - 1); }
          }}
        >
          <ModeThumb mode={m.id} />
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}
