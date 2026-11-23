/**
 * Left column: every look and preset with live thumbnails, search and filters
 * (family, mood, colour temperature, motion). Hover a tile to play it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { FAMILIES, MODES, allPresets, defaultState, modeById, srgbToOklch, hexToRgb, type BackdropState, type ModeId, type Preset, type ThumbnailService } from "../engine";
import { MODE_ENERGY } from "../engine/inspire";
import { decodeState } from "../engine";
import type { MyPreset } from "../store";

type Tab = "looks" | "presets" | "mine";
type Motion = "any" | "calm" | "lively";
type Temp = "any" | "cool" | "warm";

const Thumb: React.FC<{ svc: ThumbnailService | null; state: BackdropState; name: string }> = ({ svc, state, name }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !svc) return;
    svc.add(c, state);
    return () => svc.remove(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svc]);
  useEffect(() => {
    if (ref.current && svc) svc.update(ref.current, state);
  }, [state, svc]);
  return (
    <canvas
      ref={ref}
      className="bd-thumb"
      aria-hidden="true"
      data-name={name}
      onPointerEnter={() => ref.current && svc?.setHot(ref.current, true)}
      onPointerLeave={() => ref.current && svc?.setHot(ref.current, false)}
      style={svc?.available ? undefined : { background: `linear-gradient(135deg, ${state.stops.map((s) => s.color).join(",")})` }}
    />
  );
};

function warmthOf(s: BackdropState): number {
  // Average hue position on a warm (red–yellow) vs cool (cyan–violet) axis, chroma-weighted.
  let w = 0;
  let n = 0;
  for (const st of s.stops) {
    const [, c, h] = srgbToOklch(hexToRgb(st.color));
    const warm = Math.cos(((h - 50) * Math.PI) / 180);
    w += warm * c;
    n += c;
  }
  return n > 0 ? 0.5 + 0.5 * (w / n) : 0.5;
}

export const LooksPanel: React.FC<{
  svc: ThumbnailService | null;
  current: BackdropState;
  mine: MyPreset[];
  onPickMode: (m: ModeId) => void;
  onPickState: (s: BackdropState, name?: string) => void;
  onRemoveMine: (id: string) => void;
}> = ({ svc, current, mine, onPickMode, onPickState, onRemoveMine }) => {
  const [tab, setTab] = useState<Tab>("looks");
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<string>("all");
  const [motion, setMotion] = useState<Motion>("any");
  const [temp, setTemp] = useState<Temp>("any");
  const presets = useMemo(() => allPresets(), []);
  // Looks are shown with the current palette, so you compare shapes, not colours.
  const lookStates = useMemo(() => {
    const m = new Map<ModeId, BackdropState>();
    for (const mode of MODES) {
      const d = defaultState(mode.id);
      m.set(mode.id, { ...d, stops: current.stops, space: current.space });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(current.stops), current.space]);

  const needle = q.trim().toLowerCase();
  const matchMotion = (e: number) => motion === "any" || (motion === "calm" ? e < 0.4 : e >= 0.4);
  const looks = MODES.filter(
    (m) =>
      (family === "all" || m.family === family) &&
      matchMotion(MODE_ENERGY[m.id]) &&
      (!needle || m.name.toLowerCase().includes(needle) || m.blurb.toLowerCase().includes(needle) || m.family.toLowerCase().includes(needle))
  );
  const presetList = presets.filter((p: Preset) => {
    if (family !== "all" && p.group !== family && modeById(p.state.mode)?.family !== family) return false;
    if (!matchMotion(p.energy)) return false;
    if (temp !== "any") {
      const w = warmthOf(p.state);
      if (temp === "warm" ? w < 0.5 : w >= 0.5) return false;
    }
    return !needle || p.name.toLowerCase().includes(needle) || p.group.toLowerCase().includes(needle) || (modeById(p.state.mode)?.name.toLowerCase().includes(needle) ?? false);
  });
  const groups = ["Lens", "Soft", "Light", "Nature", "Pattern", "Glass", "Packs"].map((g) => ({ g, list: presetList.filter((p) => p.group === g) })).filter((x) => x.list.length);

  return (
    <aside className="bd-left" aria-label="Looks and presets">
      <div className="bd-tabs" role="tablist">
        {(["looks", "presets", "mine"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "looks" ? `Looks ${MODES.length}` : t === "presets" ? `Presets ${presets.length}` : `Mine ${mine.length}`}
          </button>
        ))}
      </div>
      <div className="bd-search">
        <Search size={13} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search looks" aria-label="Search looks and presets" />
      </div>
      {tab !== "mine" && (
        <div className="bd-filters">
          <select aria-label="Family" value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="all">All families</option>
            {FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            {tab === "presets" && <option value="Packs">Theme packs</option>}
          </select>
          <select aria-label="Motion" value={motion} onChange={(e) => setMotion(e.target.value as Motion)}>
            <option value="any">Any motion</option>
            <option value="calm">Calm</option>
            <option value="lively">Lively</option>
          </select>
          {tab === "presets" && (
            <select aria-label="Colour temperature" value={temp} onChange={(e) => setTemp(e.target.value as Temp)}>
              <option value="any">Any colour</option>
              <option value="cool">Cool</option>
              <option value="warm">Warm</option>
            </select>
          )}
        </div>
      )}
      <div className="bd-list" role="listbox" aria-label={tab}>
        {tab === "looks" &&
          (looks.length ? (
            looks.map((m) => (
              <button key={m.id} role="option" aria-selected={current.mode === m.id} className={`bd-item ${current.mode === m.id ? "on" : ""}`} onClick={() => onPickMode(m.id)}>
                <Thumb svc={svc} state={lookStates.get(m.id)!} name={m.name} />
                <span className="bd-item-text">
                  <b>{m.name}</b>
                  <small>{m.blurb}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="bd-empty">No looks match. Clear the search or filters.</p>
          ))}
        {tab === "presets" &&
          (groups.length ? (
            groups.map(({ g, list }) => (
              <div key={g} className="bd-group">
                <div className="bd-group-title">{g === "Packs" ? "From your theme packs" : g}</div>
                <div className="bd-grid">
                  {list.map((p) => (
                    <button key={p.id} role="option" aria-selected={current.name === p.name} className="bd-tile" onClick={() => onPickState(p.state, p.name)}>
                      <Thumb svc={svc} state={p.state} name={p.name} />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="bd-empty">No presets match.</p>
          ))}
        {tab === "mine" &&
          (mine.length ? (
            <div className="bd-grid">
              {mine.map((p) => {
                const s = decodeState(p.code);
                if (!s) return null;
                return (
                  <div key={p.id} className="bd-tile-wrap">
                    <button role="option" aria-selected={false} className="bd-tile" onClick={() => onPickState(s, p.name)}>
                      <Thumb svc={svc} state={s} name={p.name} />
                      <span>{p.name}</span>
                    </button>
                    <button className="bd-icon-btn small bd-tile-del" aria-label={`Delete ${p.name}`} onClick={() => onRemoveMine(p.id)}>
                      <Trash2 size={11} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="bd-empty">
              Looks you save with <kbd>S</kbd> appear here. They stay on this PC.
            </p>
          ))}
      </div>
    </aside>
  );
};
