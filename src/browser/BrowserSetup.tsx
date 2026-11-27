// Lens Browser setup: five short steps and a summary, one decision per screen. Nothing changes
// until Done (setupFlow.ts). Keyboard: Enter = Next, Alt+←/→ = Back/Next, Esc = Skip.
// Steps swap with a 6 px crossfade in the direction of travel (DESIGN §5.3), instant with
// reduced motion (src/ui/motion handles that).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Columns2 } from "lucide-react";
import { glideIn } from "../ui/motion";
import { importDetect, importPreview, type BrowserSettings, type ImportCounts, type ImportSource } from "./api";
import { applyDraft, initialDraft, SEARCH_ENGINES, SENDS, skipSettings, stepAfter, STEPS, summary, type SetupDraft, type SetupStep } from "./setupFlow";
import { ModeThumb } from "./CustomisePanel";
import { TAB_STYLES, type TabStyle } from "./tabModes";
import { oops } from "./oops";

export interface SetupSeed {
  step?: SetupStep;
  sources?: ImportSource[];
  counts?: ImportCounts;
  draft?: Partial<SetupDraft>;
  provider?: string;
}

const TITLES: Record<SetupStep, string> = {
  welcome: "Welcome to Lens Browser",
  import: "Bring your stuff",
  look: "Pick how tabs look",
  privacy: "Privacy",
  ai: "AI, only if you want it",
  done: "All set",
};

export function BrowserSetup({ settings, seed, live, onFinish }: { settings: BrowserSettings; seed?: SetupSeed; live: boolean; onFinish(next: BrowserSettings, importFrom: SetupDraft["importFrom"]): void }) {
  const [step, setStep] = useState<SetupStep>(seed?.step ?? "welcome");
  const [draft, setDraft] = useState<SetupDraft>({ ...initialDraft(settings), ...(seed?.draft ?? {}) });
  const [sources, setSources] = useState<ImportSource[] | null>(seed?.sources ?? null);
  const [counts, setCounts] = useState<ImportCounts | null>(seed?.counts ?? null);
  const [counting, setCounting] = useState(false);
  const dir = useRef<1 | -1>(1);
  const body = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const set = (p: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...p }));
  const go = (d: 1 | -1) => {
    dir.current = d;
    setStep((s) => stepAfter(s, d));
  };
  const done = () => onFinish(applyDraft(settings, draft), draft.importFrom);
  const skip = () => onFinish(skipSettings(settings), null);

  // Directional crossfade, then focus the new step's heading for screen readers.
  useLayoutEffect(() => {
    glideIn(body.current, { x: 6 * dir.current, opacity: 0 }, { duration: "base" });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (step !== "import" || sources || !live) return;
    importDetect().then(setSources).catch(oops("look for other browsers"));
  }, [step, sources, live]);

  const pickSource = (src: ImportSource) => {
    const profile = src.profiles[0];
    if (!profile) return;
    set({ importFrom: { browser: src.browser, profile: profile.id, label: src.label } });
    setCounts(null);
    if (!live) return;
    setCounting(true);
    void importPreview(src.browser, profile.id, { bookmarks: true, history: true, tabs: true, spaces: true })
      .then(setCounts)
      .catch(oops(`count what's in ${src.label}`))
      .finally(() => setCounting(false));
  };

  const i = STEPS.indexOf(step);
  return (
    <div
      className="lb-setup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-setup-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); skip(); }
        if (e.key === "Enter" && e.target === heading.current) { e.preventDefault(); if (step === "done") done(); else go(1); }
        if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); if (step !== "done") go(1); }
        if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      }}
    >
      <div className="lb-setup-card">
        <ol className="lb-setup-dots" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          {STEPS.map((s, k) => <li key={s} className={k === i ? "is-on" : k < i ? "is-past" : undefined} aria-current={k === i ? "step" : undefined}><span className="lb-sr">{TITLES[s]}</span></li>)}
        </ol>
        <div className="lb-setup-body" ref={body}>
          <h1 id="lb-setup-title" ref={heading} tabIndex={-1}>{TITLES[step]}</h1>

          {step === "welcome" ? (
            <>
              <p className="lb-setup-lead">A calm browser built into Lens: your tabs, an AI beside the page that asks before it acts, and nothing sent without a reason you can see.</p>
              <p className="lb-setup-sub">Four quick choices. Nothing changes until Done, and you can change everything later in Settings › Lens Browser.</p>
            </>
          ) : null}

          {step === "import" ? (
            <>
              <p className="lb-setup-lead">Bring bookmarks, history and tabs from the browser you use now. Passwords and cookies stay where they are.</p>
              <div className="lb-setup-options" role="radiogroup" aria-label="Import from">
                <button role="radio" aria-checked={!draft.importFrom} data-weight="medium" className="lb-setup-option" onClick={() => { set({ importFrom: null }); setCounts(null); }}>
                  <b>Start fresh</b><span>Nothing imported</span>
                </button>
                {(sources ?? []).map((src) => (
                  <button key={src.browser} role="radio" aria-checked={draft.importFrom?.browser === src.browser} data-weight="medium" className="lb-setup-option" onClick={() => pickSource(src)}>
                    <b>{src.label}</b><span>{src.profiles.length > 1 ? `${src.profiles.length} profiles, first one` : "Found on this PC"}</span>
                  </button>
                ))}
              </div>
              {sources && !sources.length ? <p className="lb-setup-sub">No other browsers found on this PC.</p> : null}
              <p className="lb-setup-sub" aria-live="polite">
                {draft.importFrom
                  ? counting
                    ? "Counting…"
                    : counts
                      ? `Will bring over ${counts.bookmarks.toLocaleString()} bookmarks, ${counts.history.toLocaleString()} pages of history, ${(counts.openTabs + counts.pinnedTabs).toLocaleString()} tabs${counts.spaces ? ` and ${counts.spaces} spaces` : ""}. One click removes it all again.`
                      : `Lens reads ${draft.importFrom.label}'s bookmarks, history and tabs when you press Done.`
                  : ""}
              </p>
            </>
          ) : null}

          {step === "look" ? (
            <>
              <p className="lb-setup-lead">Tabs down the side, or along the top. The colours follow your Lens theme.</p>
              <div className="lb-setup-modes" role="radiogroup" aria-label="Tab style">
                {([{ id: "vertical", label: "Vertical", line: "Tabs in the sidebar" }, ...TAB_STYLES] as { id: "vertical" | TabStyle; label: string; line: string }[]).map((m) => {
                  const on = m.id === "vertical" ? draft.tabsLayout === "vertical" : draft.tabsLayout === "horizontal" && draft.tabStyle === m.id;
                  return (
                    <button key={m.id} role="radio" aria-checked={on} aria-label={`${m.label}: ${m.line}`} data-weight="medium" className="lb-setup-mode" onClick={() => set(m.id === "vertical" ? { tabsLayout: "vertical" } : { tabsLayout: "horizontal", tabStyle: m.id as TabStyle })}>
                      <ModeThumb mode={m.id} />
                      <b>{m.label}</b>
                    </button>
                  );
                })}
              </div>
              <p className="lb-setup-sub">{draft.tabsLayout === "vertical" ? "Tabs in the sidebar, with spaces and folders." : TAB_STYLES.find((t) => t.id === draft.tabStyle)?.line}</p>
            </>
          ) : null}

          {step === "privacy" ? (
            <>
              <label className="lb-setup-switch">
                <span><b>Block ads and trackers</b><span className="lb-setup-sub">Pages load without most ads and tracking scripts. Only Lens Browser is affected.</span></span>
                <button type="button" role="switch" aria-checked={draft.blockTrackers} aria-label="Block ads and trackers" data-weight="medium" className={`lb-setup-toggle${draft.blockTrackers ? " is-on" : ""}`} onClick={() => set({ blockTrackers: !draft.blockTrackers })} />
              </label>
              <fieldset className="lb-setup-engines">
                <legend>Search with</legend>
                {SEARCH_ENGINES.map((e) => (
                  <label key={e.url} className="lb-setup-engine">
                    <input type="radio" name="lb-engine" checked={draft.searchUrl === e.url} onChange={() => set({ searchUrl: e.url })} />
                    <b>{e.name}</b>
                    <span>{e.note}</span>
                  </label>
                ))}
              </fieldset>
              <details className="lb-setup-sends">
                <summary>What Lens Browser sends on its own</summary>
                <ul>{SENDS.map((x) => <li key={x.what}><b>{x.what}</b> to {x.to}. {x.when}.</li>)}</ul>
                <p className="lb-setup-sub">Nothing else. Pages you visit talk to their own sites, as in any browser.</p>
              </details>
            </>
          ) : null}

          {step === "ai" ? (
            <>
              <label className="lb-setup-switch">
                <span><b>AI panel</b><span className="lb-setup-sub">Ask about a page, summarise, or let Lens do a task. It stops for your OK before it submits, books, sends or pays, and never handles passwords.</span></span>
                <button type="button" role="switch" aria-checked={draft.aiEnabled} aria-label="AI panel" data-weight="medium" className={`lb-setup-toggle${draft.aiEnabled ? " is-on" : ""}`} onClick={() => set({ aiEnabled: !draft.aiEnabled })} />
              </label>
              <p className="lb-setup-sub">{draft.aiEnabled ? `It uses ${seed?.provider ?? "the model you picked in Settings › AI & Command"} (local models work too).` : "Off: no AI buttons, menus or panels in Lens Browser."}</p>
              <p className="lb-setup-sub">Optional: your own Claude Code or Codex can use Lens through MCP (Settings › AI & Command › MCP). Every action still goes through Lens's approval card.</p>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <ul className="lb-setup-summary">
                {summary(draft, settings).map((line) => <li key={line}><Check size={14} /> {line}</li>)}
              </ul>
              <p className="lb-setup-sub">Change any of this in Settings › Lens Browser. <Columns2 size={12} aria-hidden /> Tip: drag a tab onto the page to see two side by side.</p>
            </>
          ) : null}
        </div>
        <footer className="lb-setup-foot">
          <button className="lb-btn lb-btn-ghost" data-weight="light" onClick={skip}>Skip</button>
          <span className="lb-push" />
          {step !== "welcome" ? <button className="lb-btn" data-weight="medium" onClick={() => go(-1)}><ArrowLeft size={14} /> Back</button> : null}
          {step === "done" ? (
            <button className="lb-btn lb-btn-primary" data-weight="heavy" autoFocus onClick={done}>Done <Check size={14} /></button>
          ) : (
            <button className="lb-btn lb-btn-primary" data-weight="medium" onClick={() => go(1)}>{step === "welcome" ? "Start" : "Next"} <ArrowRight size={14} /></button>
          )}
        </footer>
      </div>
    </div>
  );
}
