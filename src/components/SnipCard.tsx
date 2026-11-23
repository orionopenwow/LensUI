// Control Center card: Lens Snip — capture, pre-save studio, pins, recording, history.
import React, { useEffect, useState } from "react";
import { Camera, ShieldCheck } from "lucide-react";
import type { SnipSettings, SnipStatus } from "../snip/api";
import { DEFAULT_SNIP_SETTINGS, snipHistoryClear, snipPinsRelease, snipRecentClear, snipRecordMics, snipSetSettings, snipStart, snipStatus } from "../snip/api";
import { HistoryView } from "../snip/HistoryView";
import "../snip/snip.css";

const MODES = [
  ["region", "Region"],
  ["window", "Window"],
  ["monitor", "Screen"],
  ["all", "All screens"],
  ["freeform", "Freeform"],
  ["last", "Last region"],
] as const;
const AFTER = [
  ["studio", "Open the studio"],
  ["copy", "Copy"],
  ["save", "Save"],
  ["pin", "Pin"],
  ["shelf", "Shelf"],
] as const;
const BEAUTIFY = [
  ["none", "Off"],
  ["soft", "Soft"],
  ["vivid", "Vivid"],
  ["mono", "Mono"],
  ["theme", "Theme"],
] as const;
const KEEP_DAYS = [7, 30, 90, 365];

const Chips: React.FC<{ value: string | number; options: readonly (readonly [string | number, string])[]; onPick: (v: string) => void; label: string }> = ({ value, options, onPick, label }) => (
  <div role="radiogroup" aria-label={label} style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 }}>
    {options.map(([v, l]) => (
      <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={`snip-btn ${value === v ? "on" : ""}`} onClick={() => onPick(String(v))}>
        {l}
      </button>
    ))}
  </div>
);

const Row: React.FC<{ label: string; desc?: string; children: React.ReactNode }> = ({ label, desc, children }) => (
  <div className="cc-row" style={{ alignItems: "flex-start", gap: 16 }}>
    <div style={{ minWidth: 0 }}>
      <div className="cc-label">{label}</div>
      {desc ? <div className="cc-desc">{desc}</div> : null}
    </div>
    <div style={{ flex: "none", maxWidth: "60%", display: "flex", justifyContent: "flex-end" }}>{children}</div>
  </div>
);

const Toggle: React.FC<{ on: boolean; label: string; onChange: (v: boolean) => void }> = ({ on, label, onChange }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
);

export const SnipCard: React.FC<{ demo?: SnipStatus }> = ({ demo }) => {
  const [st, setSt] = useState<SnipStatus | null>(demo ?? null);
  const [mics, setMics] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const s: SnipSettings = st?.settings ?? DEFAULT_SNIP_SETTINGS;

  useEffect(() => {
    if (demo) return;
    snipStatus().then(setSt).catch(() => setSt(null));
  }, [demo]);

  const save = (patch: Partial<SnipSettings>) => {
    const next = { ...s, ...patch };
    setSt((x) => (x ? { ...x, settings: next } : x));
    if (demo) return;
    snipSetSettings(next).then(setSt).catch((e) => setMsg(String(e)));
  };

  return (
    <div className="cc-card" data-guide-id="snip-card">
      <Row label="Lens Snip" desc="Capture any part of the screen, then mark it up, hide private details, pin it, or send it on — before anything is saved.">
        <Toggle on={s.enabled} label="Lens Snip" onChange={(v) => save({ enabled: v })} />
      </Row>

      {s.enabled ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
            <button type="button" className="snip-btn primary" onClick={() => void snipStart().catch((e) => setMsg(String(e)))}>
              <Camera size={14} /> Snip now
            </button>
            <span className="cc-desc">
              or press <span className="snip-kbd">{s.hotkey}</span>
              {st && !st.hotkeyOk ? " — not registered" : ""}
            </span>
          </div>
          {st?.message ? <div className="cc-desc" role="status">{st.message}</div> : null}

          <Row label="Shortcut" desc="A modifier plus a key, e.g. Ctrl+Shift+S. Press it again while recording to stop.">
            <input className="snip-input" style={{ width: 160 }} value={s.hotkey} aria-label="Snip shortcut" onChange={(e) => setSt((x) => (x ? { ...x, settings: { ...s, hotkey: e.target.value } } : x))} onBlur={() => save({ hotkey: s.hotkey })} />
          </Row>
          <Row label="Use the Print Screen key" desc="Lens takes over Print Screen and gives it back to Windows when you turn this off or close Lens. A Windows policy can keep the key; your shortcut still works.">
            <Toggle on={s.printScreen} label="Use the Print Screen key" onChange={(v) => save({ printScreen: v })} />
          </Row>
          <Row label="Start in">
            <Chips value={s.defaultMode} options={MODES} label="Default capture mode" onPick={(v) => save({ defaultMode: v })} />
          </Row>
          <Row label="After a capture">
            <Chips value={s.afterCapture} options={AFTER} label="After a capture" onPick={(v) => save({ afterCapture: v })} />
          </Row>
          <Row label="Include the pointer">
            <Toggle on={s.includeCursor} label="Include the pointer" onChange={(v) => save({ includeCursor: v })} />
          </Row>

          <div className="cc-label" style={{ marginTop: 16 }}>Before you save</div>
          <Row label="Suggest what to hide" desc="Reads the text in each snip with Windows OCR on this PC and suggests blurring emails, phone numbers, card numbers, keys and IP addresses. You decide what's hidden.">
            <Toggle on={s.autoRedact} label="Suggest what to hide" onChange={(v) => save({ autoRedact: v })} />
          </Row>
          <Row label="Text language" desc={st?.ocrLanguages.length ? `Installed: ${st.ocrLanguages.join(", ")}` : "Uses the Windows OCR language packs for your languages."}>
            <select className="snip-input" style={{ width: 160 }} value={s.ocrLanguage} aria-label="OCR language" onChange={(e) => save({ ocrLanguage: e.target.value })}>
              <option value="auto">Automatic</option>
              {(st?.ocrLanguages ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Row>
          <Row label="Frame">
            <Chips value={s.beautify} options={BEAUTIFY} label="Frame preset" onPick={(v) => save({ beautify: v })} />
          </Row>

          <div className="cc-label" style={{ marginTop: 16 }}>Saving and sharing</div>
          <Row label="Save to" desc="Empty = Pictures\Screenshots\Lens. Recordings go to Videos\Lens.">
            <input className="snip-input" style={{ width: 220 }} placeholder="Pictures\Screenshots\Lens" value={s.saveDir} aria-label="Save folder" onChange={(e) => setSt((x) => (x ? { ...x, settings: { ...s, saveDir: e.target.value } } : x))} onBlur={() => save({ saveDir: s.saveDir })} />
          </Row>
          <Row label="File name" desc="{date} {time} {app} {title} {w} {h} {n:3}">
            <input className="snip-input" style={{ width: 220 }} value={s.filenameTemplate} aria-label="File name template" onChange={(e) => setSt((x) => (x ? { ...x, settings: { ...s, filenameTemplate: e.target.value } } : x))} onBlur={() => save({ filenameTemplate: s.filenameTemplate })} />
          </Row>
          <Row label="Recent apps" desc="One-click chips for the apps and share targets you used last. Lens copies the snip and brings the app forward — you always press Send yourself.">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="snip-btn" onClick={() => void snipRecentClear().then(() => setMsg("Recent apps cleared"))}>Clear</button>
              <Toggle on={s.showRecent} label="Show recent apps" onChange={(v) => save({ showRecent: v })} />
            </div>
          </Row>
          <Row label="Pins" desc="Pinned snips float above your windows.">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="range" min={0.2} max={1} step={0.05} value={s.pinOpacity} aria-label="Pin opacity" style={{ accentColor: "var(--lens-fg)" }} onChange={(e) => save({ pinOpacity: Number(e.target.value) })} />
              <button type="button" className="snip-btn" onClick={() => void snipPinsRelease()}>Make pins clickable</button>
            </div>
          </Row>

          <div className="cc-label" style={{ marginTop: 16 }}>Recording</div>
          {st && !st.canRecord ? <div className="cc-desc">Recording uses ffmpeg. Set it up under Transcription, or install ffmpeg and restart Lens.</div> : null}
          <Row label="Format">
            <Chips value={s.recordFormat} options={[["mp4", "MP4 video"], ["gif", "GIF"]]} label="Recording format" onPick={(v) => save({ recordFormat: v })} />
          </Row>
          <Row label="Quality">
            <Chips value={s.recordQuality} options={[["small", "Small"], ["balanced", "Balanced"], ["best", "Best"]]} label="Recording quality" onPick={(v) => save({ recordQuality: v })} />
          </Row>
          <Row label="Frames per second">
            <Chips value={s.recordFps} options={[[15, "15"], [30, "30"], [60, "60"]]} label="Frames per second" onPick={(v) => save({ recordFps: Number(v) })} />
          </Row>
          <Row label="Microphone" desc="Off unless you pick one.">
            <select className="snip-input" style={{ width: 220 }} value={s.recordMic} aria-label="Microphone" onFocus={() => !mics.length && !demo && snipRecordMics().then(setMics).catch(() => {})} onChange={(e) => save({ recordMic: e.target.value })}>
              <option value="">No microphone</option>
              {[...new Set([s.recordMic, ...mics].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Row>

          <div className="cc-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={13} /> History — on this PC, encrypted, never synced
          </div>
          <Row label="Keep a history">
            <Toggle on={s.historyEnabled} label="Keep a history" onChange={(v) => save({ historyEnabled: v })} />
          </Row>
          {s.historyEnabled ? (
            <>
              <Row label="Keep for">
                <Chips value={s.historyDays} options={KEEP_DAYS.map((d) => [d, d >= 365 ? "1 year" : `${d} days`] as const)} label="Keep history for" onPick={(v) => save({ historyDays: Number(v) })} />
              </Row>
              <HistoryView compact demo={demo ? [] : undefined} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                {confirmClear ? (
                  <>
                    <span className="cc-desc">Delete every snip in history? This can't be undone.</span>
                    <button type="button" className="snip-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
                    <button type="button" className="snip-btn danger" onClick={() => void snipHistoryClear().then((n) => { setMsg(`Deleted ${n} snips`); setConfirmClear(false); })}>Delete all</button>
                  </>
                ) : (
                  <button type="button" className="snip-btn danger" onClick={() => setConfirmClear(true)}>Clear history…</button>
                )}
              </div>
            </>
          ) : null}
        </>
      ) : null}
      {msg ? <div className="cc-desc" role="status" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>
  );
};
