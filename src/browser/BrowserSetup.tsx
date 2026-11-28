// Lens Browser setup: five short steps and a summary, one decision per screen. Nothing changes
// until Done (setupFlow.ts). Keyboard: Enter = Next, Alt+←/→ = Back/Next, Esc = Skip.
// Steps swap with a 6 px crossfade in the direction of travel (DESIGN §5.3), instant with
// reduced motion (src/ui/motion handles that).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Brain, Check, Columns2, Compass, Download, Globe, LayoutGrid, MousePointerClick, Palette, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { LensCloud } from "../presence/LensCloud";
import { glideIn } from "../ui/motion";
import { defaultBrowserStatus, importDetect, importPreview, makeDefaultBrowser, type BrowserSettings, type DefaultBrowserStatus, type ImportCounts, type ImportSource } from "./api";
import { applyDraft, initialDraft, NOVEL, SEARCH_ENGINES, SENDS, skipSettings, stepAfter, STEPS, summary, TOUR, type SetupDraft, type SetupStep } from "./setupFlow";
import { ModeThumb, ThemeGallery } from "./CustomisePanel";
import { TAB_STYLES, type TabStyle } from "./tabModes";
import { oops, quiet } from "./oops";

export interface SetupSeed {
  step?: SetupStep;
  sources?: ImportSource[];
  counts?: ImportCounts;
  draft?: Partial<SetupDraft>;
  provider?: string;
  /** Open on a tour slide (parity scenes). */
  tour?: number;
  defaultStatus?: DefaultBrowserStatus;
}

const NOVEL_ICONS: Record<string, React.ReactNode> = {
  ai: <Sparkles size={16} />,
  magic: <MousePointerClick size={16} />,
  brain: <Brain size={16} />,
  agents: <Bot size={16} />,
  colour: <Palette size={16} />,
};
const TOUR_BG: Record<string, string> = {
  ai: "radial-gradient(70% 90% at 30% 0%, rgb(56 189 248 / .35), transparent 70%), radial-gradient(60% 80% at 90% 100%, rgb(168 85 247 / .3), transparent 70%)",
  magic: "radial-gradient(70% 90% at 70% 0%, rgb(251 113 133 / .32), transparent 70%), radial-gradient(60% 80% at 10% 100%, rgb(250 204 21 / .22), transparent 70%)",
  brain: "radial-gradient(70% 90% at 50% 0%, rgb(52 211 153 / .3), transparent 70%), radial-gradient(60% 80% at 100% 100%, rgb(14 165 233 / .22), transparent 70%)",
  agents: "radial-gradient(70% 90% at 20% 100%, rgb(129 140 248 / .34), transparent 70%), radial-gradient(60% 80% at 90% 0%, rgb(56 189 248 / .22), transparent 70%)",
  colour: "conic-gradient(from 200deg at 50% 0%, rgb(239 68 68 / .3), rgb(234 179 8 / .3), rgb(34 197 94 / .3), rgb(14 165 233 / .3), rgb(168 85 247 / .3), rgb(239 68 68 / .3))",
};

/** Opens Lens Apps (Settings, Lens Apps page) from the welcome. */
function openLensApps() {
  void invoke("open_surface", { label: "settings" })
    .then(() => emit("lens://settings-tab", "store"))
    .catch(oops("open Lens Apps"));
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
  // The tour: a slide index while it shows, over the welcome.
  const [tour, setTour] = useState<number | null>(seed?.tour ?? null);
  const [def, setDef] = useState<DefaultBrowserStatus | null>(seed?.defaultStatus ?? null);
  const [defAsked, setDefAsked] = useState(false);
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
  }, [step, tour]);

  // Default browser: read it now, and again when the person comes back from Windows Settings.
  useEffect(() => {
    if (!live) return;
    const check = () => void defaultBrowserStatus().then(setDef).catch(quiet);
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [live]);
  const makeDefault = () => {
    setDefAsked(true);
    if (!live) return;
    void makeDefaultBrowser().then(setDef).catch(oops("offer Lens Browser to Windows as a browser"));
  };
  const tourGo = (d: 1 | -1) => {
    dir.current = d;
    setTour((t) => (t === null ? 0 : t + d < 0 || t + d >= TOUR.length ? null : t + d));
  };

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
        if (tour !== null) {
          if ((e.key === "Enter" && e.target === heading.current) || (e.altKey && e.key === "ArrowRight")) { e.preventDefault(); tourGo(1); }
          if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); tourGo(-1); }
          return;
        }
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
          {tour !== null ? (
            <div className="lb-tour" aria-live="polite">
              <div className="lb-tour-pic" style={{ "--lb-tour-bg": TOUR_BG[TOUR[tour].id] } as React.CSSProperties} aria-hidden>
                {TOUR[tour].id === "colour" ? <span className="lb-mark-orb"><LensCloud /></span> : NOVEL_ICONS[TOUR[tour].id]}
              </div>
              <span className="lb-tour-count">Tour · {tour + 1} of {TOUR.length}</span>
              <h1 id="lb-setup-title" ref={heading} tabIndex={-1}>{TOUR[tour].title}</h1>
              <p className="lb-setup-lead">{TOUR[tour].body}</p>
              <ul aria-label="Try this">{TOUR[tour].tries.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ) : step === "welcome" ? (
            <>
              <div className="lb-setup-hero">
                <span className="lb-mark-orb" aria-hidden><LensCloud /></span>
                <div>
                  <h1 id="lb-setup-title" ref={heading} tabIndex={-1}>{TITLES.welcome}</h1>
                  <p className="lb-setup-sub">A calm browser built into Lens, with an AI beside the page that asks before it acts.</p>
                </div>
              </div>
              <div className="lb-setup-actions">
                <button type="button" data-weight="medium" className="lb-setup-action" data-done={def?.isDefault ? "true" : undefined} onClick={makeDefault} disabled={!!def?.isDefault}>
                  {def?.isDefault ? <Check size={16} /> : <Globe size={16} />}
                  <b>{def?.isDefault ? "It's your default" : "Make it your default"}</b>
                  <span>{def?.isDefault ? "Links from other apps open here." : defAsked ? "Windows opened Default apps: pick Lens Browser there." : "Links from other apps open in Lens Browser. Windows asks you to confirm."}</span>
                </button>
                <button type="button" data-weight="medium" className="lb-setup-action" onClick={() => tourGo(1)}>
                  <Compass size={16} />
                  <b>Take a tour</b>
                  <span>Five ideas in about a minute.</span>
                </button>
                <button type="button" data-weight="medium" className="lb-setup-action" onClick={() => { dir.current = 1; setStep("import"); }}>
                  <Download size={16} />
                  <b>Bring your stuff</b>
                  <span>Bookmarks, history and tabs. Passwords stay where they are.</span>
                </button>
              </div>
              <ul className="lb-setup-new" aria-label="What's new in Lens Browser">
                {NOVEL.map((n) => (
                  <li key={n.id}>{NOVEL_ICONS[n.id]}<b>{n.title}</b><span>{n.line}</span></li>
                ))}
                <li><LayoutGrid size={16} /><b>Lens Apps</b><span>Notes, Clipboard and more, free with Lens. <button type="button" className="lb-linkbtn" data-weight="light" onClick={openLensApps}>Open Lens Apps</button></span></li>
              </ul>
              <p className="lb-setup-sub">Then four quick choices. Nothing changes until Done, and you can change everything later in Settings › Lens Browser.</p>
            </>
          ) : (
            <h1 id="lb-setup-title" ref={heading} tabIndex={-1}>{TITLES[step]}</h1>
          )}

          {tour === null && step === "import" ? (
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

          {tour === null && step === "look" ? (
            <>
              <p className="lb-setup-lead">Tabs down the side, or along the top.</p>
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
              <p className="lb-setup-lead">And a theme. Colours, the new-tab backdrop and tab colours can all be changed later in Make it yours.</p>
              <ThemeGallery value={draft.theme} onPick={(theme) => set({ theme })} />
            </>
          ) : null}

          {tour === null && step === "privacy" ? (
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

          {tour === null && step === "ai" ? (
            <>
              <label className="lb-setup-switch">
                <span><b>AI panel</b><span className="lb-setup-sub">Ask about a page, summarise, or let Lens do a task. It stops for your OK before it submits, books, sends or pays, and never handles passwords.</span></span>
                <button type="button" role="switch" aria-checked={draft.aiEnabled} aria-label="AI panel" data-weight="medium" className={`lb-setup-toggle${draft.aiEnabled ? " is-on" : ""}`} onClick={() => set({ aiEnabled: !draft.aiEnabled })} />
              </label>
              <p className="lb-setup-sub">{draft.aiEnabled ? `It uses ${seed?.provider ?? "the model you picked in Settings › AI & Command"} (local models work too).` : "Off: no AI buttons, menus or panels in Lens Browser."}</p>
              <p className="lb-setup-sub">Optional: your own Claude Code or Codex can use Lens through MCP (Settings › AI & Command › MCP). Every action still goes through Lens's approval card.</p>
            </>
          ) : null}

          {tour === null && step === "done" ? (
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
          {tour !== null ? (
            <>
              <button className="lb-btn" data-weight="medium" onClick={() => tourGo(-1)}><ArrowLeft size={14} /> {tour === 0 ? "Welcome" : "Back"}</button>
              <button className="lb-btn lb-btn-primary" data-weight="medium" onClick={() => tourGo(1)}>{tour === TOUR.length - 1 ? "Back to setup" : "Next"} <ArrowRight size={14} /></button>
            </>
          ) : null}
          {tour === null && step !== "welcome" ? <button className="lb-btn" data-weight="medium" onClick={() => go(-1)}><ArrowLeft size={14} /> Back</button> : null}
          {tour !== null ? null : step === "done" ? (
            <button className="lb-btn lb-btn-primary" data-weight="heavy" autoFocus onClick={done}>Done <Check size={14} /></button>
          ) : (
            <button className="lb-btn lb-btn-primary" data-weight="medium" onClick={() => go(1)}>{step === "welcome" ? "Start" : "Next"} <ArrowRight size={14} /></button>
          )}
        </footer>
      </div>
    </div>
  );
}
