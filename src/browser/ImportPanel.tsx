import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Bookmark, Check, ChevronDown, ChevronRight, History, KeyRound, LayoutGrid, Loader2, PanelsTopLeft, Search, Undo2, X } from "lucide-react";
import {
  EVT_BROWSER_IMPORT, importDetect, importItems, importPreview, importReceipts, importRun, importUndo, type ImportCounts, type ImportItem, type ImportItems,
  type ImportKinds, type ImportProgress, type ImportReceipt, type ImportSource,
} from "./api";
import { Key } from "./ApprovalCard";
import { hostOf, relTime } from "./model";
import { oops } from "./oops";

export const BROWSER_TINT: Record<string, string> = {
  chrome: "#4285f4", edge: "#0c8ad8", brave: "#fb542b", firefox: "#ff7139", opera: "#ff1b2d", opera_gx: "#fa1e4e", vivaldi: "#ef3939", arc: "#5e5ce6",
};

type Step = "bookmarks" | "history" | "tabs" | "spaces";
const STEPS: { id: Step; title: string; icon: React.ReactNode; sub: (c: ImportCounts) => string }[] = [
  { id: "bookmarks", title: "Bookmarks", icon: <Bookmark size={15} />, sub: (c) => `${c.bookmarks.toLocaleString()} bookmarks, folders kept` },
  { id: "history", title: "History", icon: <History size={15} />, sub: (c) => `${c.history.toLocaleString()} pages` },
  { id: "tabs", title: "Open and pinned tabs", icon: <PanelsTopLeft size={15} />, sub: (c) => `${c.openTabs} open · ${c.pinnedTabs} pinned · they arrive asleep` },
  { id: "spaces", title: "Spaces & pinned tabs", icon: <LayoutGrid size={15} />, sub: spacesLine },
];

/** "3 spaces · 12 folders · 2 split views · colours kept" — only the parts the import has. */
export function spacesLine(c: ImportCounts): string {
  const n = (k: number | undefined, one: string, many: string) => (k ? `${k.toLocaleString()} ${k === 1 ? one : many}` : "");
  return [n(c.spaces, "space", "spaces") || "0 spaces", n(c.folders, "folder", "folders"), n(c.splits, "split view", "split views"), n(c.rules, "link rule", "link rules"), c.spaces ? "colours and icons kept" : ""].filter(Boolean).join(" · ");
}

export interface ImportSeed {
  sources: ImportSource[];
  pick?: { browser: string; profile: string };
  counts?: ImportCounts;
  progress?: Partial<Record<Step, ImportProgress["state"]>>;
  items?: ImportItems;
  receipts?: ImportReceipt[];
  /** Parity: which item list starts open, and which URLs start unticked. */
  open?: "bookmarks" | "tabs";
  skip?: string[];
  now?: number;
}

const SHOWN = 200;

/** Tick list for one kind (bookmarks or tabs): filter, tick all, untick all. */
function ItemPicker({ label, items, skip, onSkip }: { label: string; items: ImportItem[]; skip: Set<string>; onSkip(next: Set<string>): void }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const match = f ? items.filter((i) => `${i.title} ${i.url} ${i.folder}`.toLowerCase().includes(f)) : items;
  const kept = items.filter((i) => !skip.has(i.url)).length;
  const setAll = (on: boolean) => {
    const next = new Set(skip);
    for (const i of match) {
      if (on) next.delete(i.url);
      else next.add(i.url);
    }
    onSkip(next);
  };
  return (
    <div className="lb-pick-list" role="group" aria-label={`Choose ${label}`}>
      <div className="lb-list-actions">
        <label className="lb-filter">
          <Search size={13} className="lb-dim" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${label}`} aria-label={`Filter ${label}`} />
        </label>
        <button data-weight="light" className="lb-chip" onClick={() => setAll(true)}>All</button>
        <button data-weight="light" className="lb-chip" onClick={() => setAll(false)}>None</button>
      </div>
      <p className="lb-mono lb-dim" aria-live="polite">{kept.toLocaleString()} of {items.length.toLocaleString()} will come across</p>
      <ul className="lb-pick-items">
        {match.slice(0, SHOWN).map((i, n) => (
          <li key={`${i.url}-${n}`}>
            <label className="lb-pick-row">
              <input
                type="checkbox"
                checked={!skip.has(i.url)}
                onChange={(e) => {
                  const next = new Set(skip);
                  if (e.target.checked) next.delete(i.url);
                  else next.add(i.url);
                  onSkip(next);
                }}
              />
              <span className="lb-tab-title">{i.title || hostOf(i.url) || i.url}</span>
              <span className="lb-mono lb-dim">{i.folder || hostOf(i.url)}</span>
            </label>
          </li>
        ))}
      </ul>
      {match.length > SHOWN ? <p className="lb-mono lb-dim">Showing the first {SHOWN}. Filter to find the rest; All and None apply to every match.</p> : null}
      {match.length === 0 ? <p className="lb-dim">Nothing matches “{filter}”.</p> : null}
    </div>
  );
}

/** "Bring everything with you": pick a browser, agree to a look inside, then import. */
export function ImportPanel({ seed, searchUrl, onChanged }: { seed?: ImportSeed; searchUrl?: string; onChanged?(): void }) {
  const [items, setItems] = useState<ImportItems | null>(seed?.items ?? null);
  const [skip, setSkip] = useState<Set<string>>(new Set(seed?.skip ?? []));
  const [open, setOpen] = useState<"bookmarks" | "tabs" | null>(seed?.open ?? null);
  const [adopt, setAdopt] = useState(false);
  const [receipts, setReceipts] = useState<ImportReceipt[]>(seed?.receipts ?? []);
  const [removing, setRemoving] = useState<string | null>(null);
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
    importReceipts().then(setReceipts).catch(oops("load past imports"));
    const un = listen<ImportProgress>(EVT_BROWSER_IMPORT, (e) => {
      if (e.payload.step !== "done") setProgress((p) => ({ ...p, [e.payload.step]: e.payload.state }));
    });
    return () => void un.then((u) => u());
  }, [seed]);

  const src = sources?.find((s) => s.browser === pick?.browser);
  const isArc = src?.engine === "arc";
  // Arc: spaces instead of open tabs. Zen: both (its workspaces become spaces).
  const isZen = src?.browser === "zen";
  const steps = STEPS.filter((s) => (s.id === "spaces" ? isArc || isZen : s.id === "tabs" ? !isArc : true));

  const look = async (browser: string, profile: string) => {
    setPick({ browser, profile });
    setConsent(null);
    setCounts(null);
    setProgress({});
    setItems(null);
    setSkip(new Set());
    setOpen(null);
    setAdopt(false);
    setBusy(true);
    setErr(null);
    try {
      setCounts(await importPreview(browser, profile, { bookmarks: true, history: true, tabs: true, spaces: true }));
      // The rows to tick and the defaults that can carry over; the counts above don't depend on it.
      importItems(browser, profile).then(setItems).catch(oops("read that browser's data"));
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
      await importRun(pick.browser, pick.profile, kinds, [...skip], adopt);
      setReceipts(await importReceipts().catch(() => receipts));
      onChanged?.();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (removing !== id) return setRemoving(id);
    setRemoving(null);
    setErr(null);
    try {
      if (!seed) await importUndo(id);
      setReceipts((list) => list.filter((r) => r.id !== id));
      onChanged?.();
    } catch (e) {
      setErr(String(e));
    }
  };
  const pickable = (id: Step): ImportItem[] => (id === "bookmarks" ? items?.bookmarks ?? [] : id === "tabs" || id === "spaces" ? items?.tabs ?? [] : []);
  const defaults = items?.defaults;
  const sameSearch = !!defaults?.searchUrl && defaults.searchUrl === searchUrl;

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
            <button data-weight="medium"
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
            <button data-weight="medium" className="lb-btn lb-btn-sm" onClick={() => setConsent(null)}>Not now <Key k="Esc" /></button>
            <button data-weight="heavy" className="lb-btn lb-btn-sm lb-btn-primary" disabled={busy} onClick={() => void look(pick.browser, pick.profile)}>
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
            const rows = pickable(s.id);
            const listKey = s.id === "bookmarks" ? "bookmarks" : "tabs";
            const canPick = rows.length > 0 && kinds[s.id] && !zero && !busy && !st;
            const left = rows.filter((r) => skip.has(r.url)).length;
            return (
              <React.Fragment key={s.id}>
                <div className={`lb-check-row${zero ? " is-empty" : ""}`}>
                  <label className="lb-check-main">
                    <input type="checkbox" checked={kinds[s.id] && !zero} disabled={zero || busy} onChange={(e) => setKinds({ ...kinds, [s.id]: e.target.checked })} />
                    <span className="lb-check-icon" aria-hidden>{s.icon}</span>
                    <span className="lb-check-text">
                      <b>{s.title}</b>
                      <span className="lb-dim">{zero ? "Nothing to bring" : left ? `${s.sub(counts)} · ${left} left behind` : s.sub(counts)}</span>
                    </span>
                  </label>
                  {canPick ? (
                    <button data-weight="light" className="lb-chip" aria-expanded={open === listKey} onClick={() => setOpen(open === listKey ? null : listKey)}>
                      {open === listKey ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Choose
                    </button>
                  ) : null}
                  <span className="lb-check-state" aria-label={st ?? (kinds[s.id] && !zero ? "Will import" : "Skipped")}>
                    {st === "done" ? <Check size={15} /> : st === "running" ? <span className="lb-progress" /> : st === "failed" ? <X size={15} className="lb-never" /> : null}
                  </span>
                </div>
                {canPick && open === listKey ? <ItemPicker label={s.id === "bookmarks" ? "bookmarks" : "tabs"} items={rows} skip={skip} onSkip={setSkip} /> : null}
              </React.Fragment>
            );
          })}
          {counts.notes.map((n, i) => <p key={i} className="lb-note lb-dim">{n}</p>)}
          <div className="lb-ok-actions">
            <span className="lb-mono lb-dim">History may miss the last few minutes if {src?.label} is open.</span>
            <span className="lb-push" />
            <button data-weight="heavy" className="lb-btn lb-btn-sm lb-btn-primary" disabled={busy || !Object.values(kinds).some(Boolean)} onClick={() => void run()}>
              {busy ? <Loader2 size={13} className="lb-spin" /> : null} Import <Key k="⏎" />
            </button>
          </div>
        </section>
      ) : null}

      {counts && pick ? (
        <section className="lb-card lb-carry" aria-label="What carries over">
          <b>Settings that carry over</b>
          <dl className="lb-carry-list">
            <div>
              <dt>Search engine</dt>
              <dd>
                {defaults?.searchUrl ? (
                  sameSearch ? (
                    <span className="lb-dim">{defaults.searchName ?? hostOf(defaults.searchUrl)} · already the same</span>
                  ) : (
                    <label className="lb-pick-row">
                      <input type="checkbox" checked={adopt} disabled={busy} onChange={(e) => setAdopt(e.target.checked)} />
                      <span>Use {defaults.searchName ?? hostOf(defaults.searchUrl)} here too</span>
                    </label>
                  )
                ) : (
                  <span className="lb-dim">{items ? `Couldn't be read from ${src?.label}. Lens keeps its own.` : "Checking…"}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>New tab page</dt>
              <dd className="lb-dim">{defaults?.homepage ? `Lens keeps its own. ${hostOf(defaults.homepage)} was your home page; bookmark it to keep it one click away.` : "Lens keeps its own, with your most visited sites."}</dd>
            </div>
            <div>
              <dt>Selection highlight</dt>
              <dd className="lb-dim">{src?.engine === "firefox" ? "Pages use the Chromium highlight colour here; it can't be changed per browser." : "Same as before: pages use the same engine and the same highlight."}</dd>
            </div>
            <div>
              <dt>Smooth scrolling</dt>
              <dd className="lb-dim">On by default, as in {src?.engine === "firefox" ? "Edge and Chrome" : src?.label}.</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {receipts.length ? (
        <section className="lb-card lb-receipts" aria-label="Past imports">
          <b>Past imports</b>
          {receipts.map((r) => (
            <div key={r.id} className="lb-receipt">
              <span className="lb-check-text">
                <span>{r.label} <span className="lb-mono lb-dim">· {relTime(r.atMs, seed?.now)}</span></span>
                <span className="lb-dim">
                  {[r.bookmarks && `${r.bookmarks.toLocaleString()} bookmarks`, r.tabs && `${r.tabs} tabs`, r.history && `${r.history.toLocaleString()} history pages`, r.searchChanged && "search engine"].filter(Boolean).join(" · ") || "Nothing left"}
                </span>
              </span>
              <button data-weight="light" className={`lb-chip${removing === r.id ? " is-warn" : ""}`} onClick={() => void remove(r.id)} onBlur={() => setRemoving(null)}>
                <Undo2 size={12} /> {removing === r.id ? "Really remove all of it?" : "Remove"}
              </button>
            </div>
          ))}
          <p className="lb-mono lb-dim">Remove takes out exactly what that import added. Things you already had stay.</p>
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
