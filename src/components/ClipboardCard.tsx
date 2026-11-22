// Control Center card: clipboard history v2 (opt-in, encrypted on this PC).
import React, { useEffect, useState } from "react";
import { Lock, Plus, X } from "lucide-react";
import {
  DEFAULT_CLIP_SETTINGS, DEFAULT_EXCLUDED_APPS, clipClear, clipIgnoreNext, clipPause, clipSetSettings, clipStatus, clipWipe,
  onClipChanged, type ClipSettings, type ClipStatus,
} from "../clip/contract";

const KEEP_DAYS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 0, label: "Until full" },
];
const KEEP_ITEMS = [100, 500, 2000, 10000];

const exe = (raw: string) => {
  const base = (raw.trim().split(/[\\/]/).pop() ?? "").toLowerCase();
  return !base ? "" : base.endsWith(".exe") ? base : `${base}.exe`;
};

export const ClipboardCard: React.FC = () => {
  const [st, setSt] = useState<ClipStatus | null>(null);
  const [app, setApp] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [msg, setMsg] = useState("");
  const s: ClipSettings = st?.settings ?? DEFAULT_CLIP_SETTINGS;

  useEffect(() => {
    const load = () => clipStatus().then(setSt).catch(() => setSt(null));
    load();
    const un = onClipChanged(load);
    return () => {
      un.then((u) => u()).catch(() => {});
    };
  }, []);

  const save = (patch: Partial<ClipSettings>) =>
    clipSetSettings({ ...s, ...patch }).then(setSt).catch((e) => setMsg(String(e)));

  const paused = !!st && st.pausedUntilMs > Date.now();

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Clipboard history</div>
          <div className="cc-desc">
            Keeps what you copy so you can paste it again from Lens Command. Stored encrypted on this PC only; never synced.
          </div>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="Clipboard history"
          className={`cc-toggle ${s.enabled ? "on" : ""}`} onClick={() => save({ enabled: !s.enabled })} />
      </div>

      <div className="cc-desc" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <Lock size={12} strokeWidth={2.4} />
        Password managers and anything an app marks as private are never recorded.
      </div>

      {s.enabled ? (
        <>
          <div className="cc-row" style={{ marginTop: 12 }}>
            <div>
              <div className="cc-label">{st ? `${st.count.toLocaleString()} clips · ${st.pinned} pinned` : "—"}</div>
              <div className="cc-desc">{paused ? `Paused until ${new Date(st!.pausedUntilMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : st?.ignoreNext ? "The next copy will be skipped." : "Recording."}</div>
            </div>
            <div className="cc-chip-grid">
              {paused ? (
                <button type="button" className="cc-chip" onClick={() => clipPause(0).then(setSt)}>Resume</button>
              ) : (
                <button type="button" className="cc-chip" onClick={() => clipPause(10).then(setSt)}>Pause 10 min</button>
              )}
              <button type="button" className={`cc-chip ${st?.ignoreNext ? "active" : ""}`} onClick={() => clipIgnoreNext().then(setSt)}>Skip next copy</button>
            </div>
          </div>

          <div className="cc-label" style={{ marginTop: 16 }}>Keep clips for</div>
          <div className="cc-chip-grid">
            {KEEP_DAYS.map((k) => (
              <button key={k.days} type="button" className={`cc-chip ${s.maxDays === k.days ? "active" : ""}`} onClick={() => save({ maxDays: k.days })}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="cc-label" style={{ marginTop: 12 }}>At most</div>
          <div className="cc-chip-grid">
            {KEEP_ITEMS.map((n) => (
              <button key={n} type="button" className={`cc-chip ${s.maxItems === n ? "active" : ""}`} onClick={() => save({ maxItems: n })}>
                {n.toLocaleString()} clips
              </button>
            ))}
          </div>

          <div className="cc-row" style={{ marginTop: 16 }}>
            <div>
              <div className="cc-label">Record images and files</div>
              <div className="cc-desc">Images are kept as small previews; files as their paths.</div>
            </div>
            <div className="cc-chip-grid">
              <button type="button" className={`cc-chip ${s.captureImages ? "active" : ""}`} onClick={() => save({ captureImages: !s.captureImages })}>Images</button>
              <button type="button" className={`cc-chip ${s.captureFiles ? "active" : ""}`} onClick={() => save({ captureFiles: !s.captureFiles })}>Files</button>
            </div>
          </div>
          <div className="cc-row" style={{ marginTop: 12 }}>
            <div>
              <div className="cc-label">Paste as plain text by default</div>
              <div className="cc-desc">Shift+Enter always pastes plain text.</div>
            </div>
            <button type="button" role="switch" aria-checked={s.preferPlainPaste} aria-label="Paste as plain text by default"
              className={`cc-toggle ${s.preferPlainPaste ? "on" : ""}`} onClick={() => save({ preferPlainPaste: !s.preferPlainPaste })} />
          </div>

          <div className="cc-label" style={{ marginTop: 16 }}>Never record from</div>
          <div className="cc-desc">Apps are matched by their program file name.</div>
          <div className="cc-chip-grid">
            {s.excludedApps.map((a) => (
              <span key={a} className="cc-chip">
                {a.replace(/\.exe$/i, "")}
                <button type="button" aria-label={`Allow ${a}`} style={{ background: "none", border: "none", color: "inherit", padding: 0, marginLeft: 4, cursor: "pointer", display: "inline-flex" }}
                  onClick={() => save({ excludedApps: s.excludedApps.filter((x) => x !== a) })}>
                  <X size={11} strokeWidth={2.6} />
                </button>
              </span>
            ))}
            <form style={{ display: "inline-flex", gap: 4 }} onSubmit={(e) => {
              e.preventDefault();
              const v = exe(app);
              if (v && !s.excludedApps.includes(v)) save({ excludedApps: [...s.excludedApps, v] });
              setApp("");
            }}>
              <input className="cc-input" value={app} onChange={(e) => setApp(e.target.value)} placeholder="app.exe" aria-label="Add an app to never record" style={{ width: 120 }} />
              <button type="submit" className="cc-chip" aria-label="Add app"><Plus size={12} /></button>
            </form>
            {DEFAULT_EXCLUDED_APPS.some((a) => !s.excludedApps.includes(a)) ? (
              <button type="button" className="cc-chip" onClick={() => save({ excludedApps: Array.from(new Set([...s.excludedApps, ...DEFAULT_EXCLUDED_APPS])) })}>
                Restore password managers
              </button>
            ) : null}
          </div>

          <div className="cc-label" style={{ marginTop: 16 }}>Clear</div>
          <div className="cc-chip-grid">
            <button type="button" className="cc-chip" onClick={() => clipClear(5).then((n) => setMsg(`Cleared ${n}.`))}>Last 5 minutes</button>
            <button type="button" className="cc-chip" onClick={() => clipClear(60).then((n) => setMsg(`Cleared ${n}.`))}>Last hour</button>
            <button type="button" className="cc-chip" onClick={() => clipClear().then((n) => setMsg(`Cleared ${n}. Pinned clips kept.`))}>All but pinned</button>
            {confirmWipe ? (
              <>
                <button type="button" className="cc-chip" style={{ color: "var(--lens-danger)" }} onClick={() => clipWipe().then(() => { setConfirmWipe(false); setMsg("History deleted."); })}>
                  Delete everything, including pinned
                </button>
                <button type="button" className="cc-chip" onClick={() => setConfirmWipe(false)}>Keep</button>
              </>
            ) : (
              <button type="button" className="cc-chip" onClick={() => setConfirmWipe(true)}>Delete all history…</button>
            )}
          </div>
        </>
      ) : null}
      {msg ? <div className="cc-desc" role="status" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>
  );
};

export default ClipboardCard;
