import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Bookmark, Check, History, KeyRound, LayoutGrid, Loader2, PanelsTopLeft, X } from "lucide-react";
import {
  EVT_BROWSER_IMPORT, importDetect, importPreview, importRun, type ImportCounts, type ImportKinds, type ImportProgress, type ImportSource,
} from "./api";
import { Key } from "./ApprovalCard";

export const BROWSER_TINT: Record<string, string> = {
  chrome: "#4285f4", edge: "#0c8ad8", brave: "#fb542b", firefox: "#ff7139", opera: "#ff1b2d", opera_gx: "#fa1e4e", vivaldi: "#ef3939", arc: "#5e5ce6",
};

type Step = "bookmarks" | "history" | "tabs" | "spaces";
const STEPS: { id: Step; title: string; icon: React.ReactNode; sub: (c: ImportCounts) => string }[] = [
  { id: "bookmarks", title: "Bookmarks", icon: <Bookmark size={15} />, sub: (c) => `${c.bookmarks.toLocaleString()} bookmarks, folders kept` },
  { id: "history", title: "History", icon: <History size={15} />, sub: (c) => `${c.history.toLocaleString()} pages` },
  { id: "tabs", title: "Open and pinned tabs", icon: <PanelsTopLeft size={15} />, sub: (c) => `${c.openTabs} open · ${c.pinnedTabs} pinned · they arrive asleep` },
  { id: "spaces", title: "Spaces & pinned tabs", icon: <LayoutGrid size={15} />, sub: (c) => `${c.spaces} spaces with their folders` },
];

export interface ImportSeed {
  sources: ImportSource[];
  pick?: { browser: string; profile: string };
  counts?: ImportCounts;
  progress?: Partial<Record<Step, ImportProgress["state"]>>;
}

/** "Bring everything with you": pick a browser, agree to a look inside, then import. */
export function ImportPanel({ seed }: { seed?: ImportSeed }) {
  const [sources, setSources] = useState<ImportSource[] | null>(seed?.sources ?? null);
  const [pick, setPick] = useState<{ browser: string; profile: string } | null>(seed?.pick ?? null);
  const [counts, setCounts] = useState<ImportCounts | null>(seed?.counts ?? null);
  const [kinds, setKinds] = useState<ImportKinds>({ bookmarks: true, history: true, tabs: true, spaces: true });
  const [consent, setConsent] = useState<string | null>(null);
  const [progress, setProgress] = useState<Partial<Record<Step, ImportProgress["state"]>>>(seed?.progress ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (seed) return;
    importDetect().then(setSources).catch((e) => setErr(String(e)));
    const un = listen<ImportProgress>(EVT_BROWSER_IMPORT, (e) => {
      if (e.payload.step !== "done") setProgress((p) => ({ ...p, [e.payload.step]: e.payload.state }));
    });
    return () => void un.then((u) => u());
  }, [seed]);

  const src = sources?.find((s) => s.browser === pick?.browser);
  const isArc = src?.engine === "arc";
  const steps = STEPS.filter((s) => (s.id === "spaces" ? isArc : s.id === "tabs" ? !isArc : true));

  const look = async (browser: string, profile: string) => {
    setPick({ browser, profile });
    setConsent(null);
    setCounts(null);
    setProgress({});
    setBusy(true);
    setErr(null);
    try {
      setCounts(await importPreview(browser, profile, { bookmarks: true, history: true, tabs: true, spaces: true }));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!pick) return;
    setBusy(true);
    setErr(null);
    try {
      await importRun(pick.browser, pick.profile, kinds);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lb-settings">
      <div className="lb-settings-head">
        <h2>Bring everything with you</h2>
        <p className="lb-dim">Bookmarks with their folders, history, open and pinned tabs, and Arc spaces. Everything stays on this PC.</p>
      </div>

      <section className="lb-card lb-sources" aria-label="Browsers found on this PC">
        {sources === null ? <div className="lb-row lb-dim"><Loader2 size={14} className="lb-spin" /> Looking for browsers…</div> : null}
        {sources?.length === 0 ? <div className="lb-row lb-dim">No other browsers found on this PC.</div> : null}
        {sources?.map((s) => (
          <div key={s.browser} className={`lb-source${pick?.browser === s.browser ? " is-on" : ""}`}>
            <span className="lb-brand" style={{ background: BROWSER_TINT[s.browser] ?? "#71717a" }} aria-hidden>{s.label[0]}</span>
            <span className="lb-source-name">{s.label}</span>
            {s.profiles.length > 1 ? (
              <select className="lb-select" aria-label={`${s.label} profile`} defaultValue={s.profiles[0].id} id={`lb-prof-${s.browser}`}>
                {s.profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            ) : (
              <span className="lb-mono lb-dim">{s.profiles[0]?.label}</span>
            )}
            <button
              className="lb-btn lb-btn-sm lb-push"
              onClick={() => {
                const sel = document.getElementById(`lb-prof-${s.browser}`) as HTMLSelectElement | null;
                setConsent(s.browser);
                setPick({ browser: s.browser, profile: sel?.value ?? s.profiles[0].id });
              }}
            >
              Look inside <Key k="⏎" />
            </button>
          </div>
        ))}
      </section>

      {consent && pick && !counts ? (
        <section className="lb-card lb-consent" role="dialog" aria-label="Allow Lens to read">
          <p>
            Lens will read {src?.label}'s bookmarks, history and session files on this PC to count what can come across. Nothing is changed and
            nothing leaves your computer.
          </p>
          <div className="lb-ok-actions">
            <span className="lb-push" />
            <button className="lb-btn lb-btn-sm" onClick={() => setConsent(null)}>Not now <Key k="Esc" /></button>
            <button className="lb-btn lb-btn-sm lb-btn-primary" disabled={busy} onClick={() => void look(pick.browser, pick.profile)}>
              {busy ? <Loader2 size={13} className="lb-spin" /> : null} Allow and count <Key k="⏎" />
            </button>
          </div>
        </section>
      ) : null}

      {counts && pick ? (
        <section className="lb-card lb-checklist" aria-label="What to bring">
          {steps.map((s) => {
            const st = progress[s.id];
            const zero = (s.id === "bookmarks" && !counts.bookmarks) || (s.id === "history" && !counts.history) || (s.id === "tabs" && !counts.openTabs) || (s.id === "spaces" && !counts.spaces);
            return (
              <label key={s.id} className={`lb-check-row${zero ? " is-empty" : ""}`}>
                <input type="checkbox" checked={kinds[s.id] && !zero} disabled={zero || busy} onChange={(e) => setKinds({ ...kinds, [s.id]: e.target.checked })} />
                <span className="lb-check-icon" aria-hidden>{s.icon}</span>
                <span className="lb-check-text">
                  <b>{s.title}</b>
                  <span className="lb-dim">{zero ? "Nothing to bring" : s.sub(counts)}</span>
                </span>
                <span className="lb-check-state" aria-label={st ?? (kinds[s.id] && !zero ? "Will import" : "Skipped")}>
                  {st === "done" ? <Check size={15} /> : st === "running" ? <span className="lb-progress" /> : st === "failed" ? <X size={15} className="lb-never" /> : null}
                </span>
              </label>
            );
          })}
          {counts.notes.map((n, i) => <p key={i} className="lb-note lb-dim">{n}</p>)}
          <div className="lb-ok-actions">
            <span className="lb-mono lb-dim">History may miss the last few minutes if {src?.label} is open.</span>
            <span className="lb-push" />
            <button className="lb-btn lb-btn-sm lb-btn-primary" disabled={busy || !Object.values(kinds).some(Boolean)} onClick={() => void run()}>
              {busy ? <Loader2 size={13} className="lb-spin" /> : null} Import <Key k="⏎" />
            </button>
          </div>
        </section>
      ) : null}

      <section className="lb-card lb-never-card">
        <KeyRound size={16} />
        <div>
          <b>Passwords, cookies and payment cards stay put.</b>
          <p className="lb-dim">
            Use your password manager to bring logins. Lens never opens another browser's saved passwords, cookies or cards, so they can't
            leak through it.
          </p>
        </div>
      </section>
      {err ? <p className="lb-note lb-never" role="alert">{err}</p> : null}
    </div>
  );
}
