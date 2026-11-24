// The Guide panel: search, suggested questions, "Did you know?", lessons with live progress, and
// answers with "Show me". Works with no AI at all; with AI on, answers are grounded only in the
// Lens index and every citation is checked against it.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, BookOpen, Check, ChevronRight, Compass, Lightbulb, Search, Sparkles, X } from "lucide-react";
import { useAiRequest } from "../ai/client";
import { answerOffline, buildGroundedPrompt, parseCitations, whereOf, type OfflineAnswer } from "./answer";
import { GUIDE_EVENTS, guideEvent, showMe } from "./coach";
import { safeEvaluate } from "./conditions";
import { currentStep, lessonPercent, loadProgress, markStep, resetLesson, saveProgress, skipStep } from "./progress";
import { didYouKnow, suggestedQuestions, tipOfTheDay, type Tip } from "./tips";
import type { GuideEntry, GuideIndex, GuideProgress, GuideState, Lesson } from "./types";
import { EMPTY_PROGRESS } from "./types";
import "./guide.css";
import { fillStyle } from "../ui/motion";

export interface GuideContext {
  surface?: string;
  tab?: string;
  /** Focused third-party app, e.g. "Photoshop". Only its name is ever used. */
  app?: string;
}

export interface GuidePanelProps {
  /** Defaults to the generated index (loaded lazily). */
  index?: GuideIndex;
  config?: unknown;
  context?: GuideContext;
  initialQuery?: string;
  initialLesson?: string;
  /** AI is enabled in Settings › AI & Command (otherwise the Guide runs offline). */
  aiEnabled?: boolean;
  onClose?: () => void;
  /** Smaller paddings for Mini and Command. */
  compact?: boolean;
  /** Parity/testing. */
  initialProgress?: GuideProgress;
  initialAnswer?: { text: string; sourceIds: string[]; provider?: string };
}

type View = { kind: "home" } | { kind: "results"; query: string } | { kind: "lesson"; id: string };

function useGuideIndex(given?: GuideIndex): GuideIndex | null {
  const [idx, setIdx] = useState<GuideIndex | null>(given ?? null);
  useEffect(() => {
    if (given) return setIdx(given);
    let alive = true;
    import("./indexData").then((m) => alive && setIdx(m.GUIDE_INDEX)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [given]);
  return idx;
}

export const GuidePanel: React.FC<GuidePanelProps> = (props) => {
  const { config, context = {}, aiEnabled = false, onClose, compact } = props;
  const index = useGuideIndex(props.index);
  const [progress, setProgress] = useState<GuideProgress>(props.initialProgress ?? EMPTY_PROGRESS);
  const [view, setView] = useState<View>(
    props.initialLesson ? { kind: "lesson", id: props.initialLesson } : props.initialQuery ? { kind: "results", query: props.initialQuery } : { kind: "home" }
  );
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [events, setEvents] = useState<Set<string>>(() => new Set());
  const [uiTab, setUiTab] = useState<string | undefined>(context.tab);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.initialProgress) loadProgress().then(setProgress).catch(() => {});
  }, [props.initialProgress]);

  const update = useCallback((fn: (p: GuideProgress) => GuideProgress) => {
    setProgress((p) => {
      const next = fn(p);
      void saveProgress(next);
      return next;
    });
  }, []);

  // Lesson checks: guide events, the Settings tab, and "open guide" requests.
  useEffect(() => {
    const add = (name: string) => setEvents((s) => (s.has(name) ? s : new Set(s).add(name)));
    const onLocal = (e: Event) => add(String((e as CustomEvent).detail));
    const open = (p: { query?: string; lesson?: string } | undefined) => {
      if (p?.lesson) setView({ kind: "lesson", id: p.lesson });
      else if (p?.query) {
        setQuery(p.query);
        setView({ kind: "results", query: p.query });
      }
    };
    const onOpen = (e: Event) => open((e as CustomEvent).detail);
    window.addEventListener(GUIDE_EVENTS.event, onLocal);
    window.addEventListener(GUIDE_EVENTS.open, onOpen);
    const uns: Promise<() => void>[] = [
      listen<string>(GUIDE_EVENTS.event, (e) => add(String(e.payload))),
      listen<string>("lens://settings-tab", (e) => setUiTab(String(e.payload))),
      listen<{ query?: string; lesson?: string }>(GUIDE_EVENTS.open, (e) => open(e.payload)),
    ];
    return () => {
      window.removeEventListener(GUIDE_EVENTS.event, onLocal);
      window.removeEventListener(GUIDE_EVENTS.open, onOpen);
      uns.forEach((p) => p.then((u) => u()).catch(() => {}));
    };
  }, []);

  useEffect(() => setUiTab(context.tab), [context.tab]);

  const state: GuideState = useMemo(
    () => ({ config: config ?? {}, ui: { surface: context.surface, tab: uiTab, focusedApp: context.app }, events }),
    [config, context.surface, context.app, uiTab, events]
  );

  const submit = (q: string) => {
    const t = q.trim();
    if (!t) return setView({ kind: "home" });
    setView({ kind: "results", query: t });
  };

  if (!index) {
    return (
      <div className={`guide-panel ${compact ? "compact" : ""}`} aria-busy="true">
        <div className="guide-loading">Loading the guide…</div>
      </div>
    );
  }

  return (
    <div className={`guide-panel ${compact ? "compact" : ""}`} role="region" aria-label="Guide">
      <header className="guide-head">
        {view.kind !== "home" ? (
          <button type="button" className="guide-icon-btn" aria-label="Back" onClick={() => setView({ kind: "home" })}>
            <ArrowLeft size={15} strokeWidth={2.2} />
          </button>
        ) : (
          <Compass size={16} strokeWidth={2.2} className="guide-head-icon" aria-hidden="true" />
        )}
        <div className="guide-head-title">Guide</div>
        <span className={`guide-badge ${aiEnabled ? "ai" : ""}`}>{aiEnabled ? "AI on" : "Offline"}</span>
        {onClose && (
          <button type="button" className="guide-icon-btn" aria-label="Close guide" onClick={onClose}>
            <X size={15} strokeWidth={2.2} />
          </button>
        )}
      </header>

      {view.kind !== "lesson" && (
        <form
          className="guide-search"
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
        >
          <Search size={14} strokeWidth={2.2} aria-hidden="true" />
          <input
            ref={inputRef}
            className="guide-input"
            value={query}
            placeholder="How do I…"
            aria-label="Ask the guide"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
                setView({ kind: "home" });
              }
            }}
          />
        </form>
      )}

      <div className="guide-body">
        {view.kind === "home" && (
          <Home
            index={index}
            config={config}
            context={{ ...context, tab: uiTab }}
            progress={progress}
            state={state}
            onAsk={(q) => {
              setQuery(q);
              submit(q);
            }}
            onLesson={(id) => setView({ kind: "lesson", id })}
            onDismissTip={(id) => update((p) => ({ ...p, dismissedTips: [...new Set([...p.dismissedTips, id])] }))}
          />
        )}
        {view.kind === "results" && (
          <Results
            key={view.query}
            index={index}
            query={view.query}
            aiEnabled={aiEnabled}
            app={context.app}
            initialAnswer={props.initialAnswer}
            onLesson={(id) => setView({ kind: "lesson", id })}
          />
        )}
        {view.kind === "lesson" && (
          <LessonView
            lesson={index.lessons.find((l) => l.id === view.id) ?? null}
            progress={progress}
            state={state}
            onUpdate={update}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const Home: React.FC<{
  index: GuideIndex;
  config: unknown;
  context: GuideContext;
  progress: GuideProgress;
  state: GuideState;
  onAsk: (q: string) => void;
  onLesson: (id: string) => void;
  onDismissTip: (id: string) => void;
}> = ({ index, config, context, progress, state, onAsk, onLesson, onDismissTip }) => {
  const tips = useMemo(() => {
    const today = tipOfTheDay(config, progress, index);
    const rest = didYouKnow(config, progress, index, 2);
    return today ? [today, ...rest.filter((t) => t.id !== today.id)].slice(0, 2) : rest;
  }, [config, progress, index]);
  const lessons = [...index.lessons].sort((a, b) => a.order - b.order);
  return (
    <>
      <section className="guide-section" aria-label="Suggested questions">
        <div className="guide-eyebrow">Ask about</div>
        <div className="guide-suggest">
          {suggestedQuestions(context).map((q) => (
            <button type="button" key={q} className="guide-chip" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      </section>

      {tips.length > 0 && (
        <section className="guide-section" aria-label="Did you know?">
          <div className="guide-eyebrow">Did you know?</div>
          {tips.map((t) => (
            <TipCard key={t.id} tip={t} index={index} onDismiss={() => onDismissTip(t.id)} />
          ))}
        </section>
      )}

      <section className="guide-section" aria-label="Lessons">
        <div className="guide-eyebrow">
          Lessons <span className="guide-count">{progress.completed.filter((id) => lessons.some((l) => l.id === id)).length}/{lessons.length}</span>
        </div>
        <ul className="guide-lessons">
          {lessons.map((l) => {
            const available = !l.requires || safeEvaluate(l.requires, state);
            const pct = lessonPercent(progress, l);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`guide-lesson-row ${available ? "" : "unavailable"}`}
                  onClick={() => onLesson(l.id)}
                  aria-label={`${l.title}, ${pct === 100 ? "done" : `${pct}% done`}${available ? "" : ", not in this build yet"}`}
                >
                  <span className={`guide-ring ${pct === 100 ? "done" : ""}`} style={{ "--pct": `${pct}%` } as React.CSSProperties} aria-hidden="true">
                    {pct === 100 ? <Check size={11} strokeWidth={3} /> : null}
                  </span>
                  <span className="guide-lesson-text">
                    <span className="guide-lesson-title">{l.title}</span>
                    <span className="guide-lesson-sub">{available ? `${l.minutes} min · ${l.summary}` : l.requiresNote ?? "Not in this build yet."}</span>
                  </span>
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
};

const TipCard: React.FC<{ tip: Tip; index: GuideIndex; onDismiss: () => void }> = ({ tip, index, onDismiss }) => {
  const entry = index.entries.find((e) => e.id === tip.entry);
  return (
    <div className="guide-tip">
      <Lightbulb size={14} strokeWidth={2.2} aria-hidden="true" />
      <div className="guide-tip-text">
        <div className="guide-tip-title">{tip.title}</div>
        <div className="guide-tip-body">{tip.text}</div>
        <div className="guide-actions">
          {entry?.target && (
            <button type="button" className="cc-btn-ghost guide-show" onClick={() => void showMe(entry.target!, entry.text.slice(0, 140), entry.title)}>
              Show me
            </button>
          )}
          <button type="button" className="cc-btn-ghost" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const ResultCard: React.FC<{ entry: GuideEntry; onLesson: (id: string) => void; n?: number }> = ({ entry, onLesson, n }) => {
  const isLesson = entry.target?.surface === "lesson";
  const canShow = !!entry.target && !isLesson && entry.target.surface !== "doc";
  const note = (entry.text || "").replace(/\s+/g, " ").slice(0, 160);
  return (
    <div className="guide-result">
      <div className="guide-result-top">
        {n !== undefined && <span className="guide-cite">{n}</span>}
        <div className="guide-result-title">{entry.title}</div>
        <span className="guide-kind">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
      </div>
      <div className="guide-where">{whereOf(entry)}</div>
      {note && <div className="guide-result-text">{note}</div>}
      {(canShow || isLesson) && (
        <div className="guide-actions">
          {canShow && (
            <button type="button" className="cc-btn-ghost guide-show" onClick={() => void showMe(entry.target!, note, entry.title)}>
              Show me
            </button>
          )}
          {isLesson && entry.target?.lesson && (
            <button type="button" className="cc-btn-ghost guide-show" onClick={() => onLesson(entry.target!.lesson!)}>
              Start lesson
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const KIND_LABEL: Record<string, string> = {
  setting: "Setting",
  card: "Settings card",
  tab: "Settings tab",
  lesson: "Lesson",
  command: "Command",
  pack: "Theme",
  "dock-style": "Dock style",
  scene: "Scene",
  hotkey: "Shortcut",
  doc: "Help",
};

const Results: React.FC<{
  index: GuideIndex;
  query: string;
  aiEnabled: boolean;
  app?: string;
  initialAnswer?: GuidePanelProps["initialAnswer"];
  onLesson: (id: string) => void;
}> = ({ index, query, aiEnabled, app, initialAnswer, onLesson }) => {
  const offline: OfflineAnswer = useMemo(() => answerOffline(index, query), [index, query]);
  const ai = useAiRequest();
  const [sources, setSources] = useState<GuideEntry[]>(() =>
    initialAnswer ? initialAnswer.sourceIds.map((id) => index.entries.find((e) => e.id === id)).filter((e): e is GuideEntry => !!e) : []
  );
  const answerText = initialAnswer?.text ?? ai.text;
  const parsed = useMemo(() => (answerText ? parseCitations(answerText, sources) : null), [answerText, sources]);
  const running = ai.status === "running" || ai.status === "waiting";
  const pending = ai.steps.find((s) => s.state === "awaiting");

  useEffect(() => {
    guideEvent("guide-asked");
  }, []);

  const askAi = () => {
    const grounded = buildGroundedPrompt(query, offline.passages);
    setSources(grounded.sources);
    void ai.ask({ prompt: grounded.prompt, context: { page_text: grounded.contextText }, allow_tools: false });
  };

  const teachApp = () => {
    if (!app) return;
    setSources([]);
    void ai.ask({
      prompt: `Give 5 short, practical tips for using ${app} on Windows. General advice only; say so if you're unsure about a feature.`,
      context: { app_name: app },
      allow_tools: false,
    });
  };

  const answerFirst = !!answerText || running || !!pending;
  const matches =
    offline.coverage === "none" ? null : (
      <section className="guide-section" aria-label="Best matches">
        <div className="guide-eyebrow">{offline.coverage === "good" ? "Best matches" : "Closest matches"}</div>
        {offline.cards.map((c) => (
          <ResultCard key={c.entry.id} entry={c.entry} onLesson={onLesson} />
        ))}
      </section>
    );

  return (
    <>
      {offline.coverage === "none" ? (
        <div className="guide-empty">
          <BookOpen size={16} strokeWidth={2.2} aria-hidden="true" />
          <div>
            The guide doesn't cover “{query}” yet.
            {aiEnabled ? " You can still ask AI; it will say if Lens doesn't have this." : " Try other words, or turn on AI in Settings › AI & Command for conversational answers."}
          </div>
        </div>
      ) : answerFirst ? null : (
        matches
      )}

      {(aiEnabled || initialAnswer) && (
        <section className="guide-section" aria-label="Answer">
          {!answerText && !running && !pending && (
            <div className="guide-actions">
              <button type="button" className="cc-btn-ghost guide-ask" onClick={askAi}>
                <Sparkles size={13} strokeWidth={2.2} aria-hidden="true" /> Explain with AI
              </button>
              {app && (
                <button type="button" className="cc-btn-ghost" onClick={teachApp}>
                  Tips for {app}
                </button>
              )}
            </div>
          )}
          {pending && (
            <div className="guide-consent" role="alertdialog" aria-label="Send to AI?">
              <div className="guide-consent-title">{pending.summary || "Send this question to AI?"}</div>
              <div className="guide-consent-text">Only your question and the Lens help snippets above are sent.</div>
              <div className="guide-actions">
                <button type="button" className="cc-btn-ghost" onClick={() => void ai.confirm(pending.call_id, false)}>
                  Don't send
                </button>
                <button type="button" className="cc-btn-primary" onClick={() => void ai.confirm(pending.call_id, true)}>
                  Send
                </button>
              </div>
            </div>
          )}
          {(answerText || running) && (
            <div className="guide-answer" aria-live="polite">
              <div className="guide-answer-head">
                <Sparkles size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>{initialAnswer?.provider ?? ai.provider ?? "AI"}</span>
                {running && <span className="guide-dots" aria-label="Answering" />}
              </div>
              <div className="guide-answer-text">{renderCited(parsed?.text ?? answerText)}</div>
              {parsed && parsed.citations.length > 0 && (
                <div className="guide-sources">
                  <div className="guide-eyebrow">Sources in Lens</div>
                  {parsed.citations.map((e) => (
                    <ResultCard key={e.id} entry={e} onLesson={onLesson} n={sources.indexOf(e) + 1} />
                  ))}
                </div>
              )}
            </div>
          )}
          {ai.status === "error" && <div className="guide-error">AI couldn't answer: {ai.error}. The matches above still apply.</div>}
        </section>
      )}
      {answerFirst && matches}
    </>
  );
};

/** Renders [n] citations as small badges, everything else as plain text with line breaks. */
function renderCited(text: string): React.ReactNode {
  const parts = text.split(/(\[\d{1,2}\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[(\d{1,2})\]$/);
    if (m) return <span key={i} className="guide-cite inline">{m[1]}</span>;
    return p.split("\n").map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>
        {line.split(/(\*\*[^*]+\*\*)/g).map((seg, k) =>
          /^\*\*[^*]+\*\*$/.test(seg) ? <strong key={k}>{seg.slice(2, -2)}</strong> : seg
        )}
        {j < arr.length - 1 ? <br /> : null}
      </React.Fragment>
    ));
  });
}

// ---------------------------------------------------------------------------------------------

const LessonView: React.FC<{
  lesson: Lesson | null;
  progress: GuideProgress;
  state: GuideState;
  onUpdate: (fn: (p: GuideProgress) => GuideProgress) => void;
}> = ({ lesson, progress, state, onUpdate }) => {
  const available = !lesson?.requires || safeEvaluate(lesson.requires, state);
  const cur = lesson ? currentStep(progress, lesson) : 1;
  const step = lesson?.steps.find((s) => s.n === cur) ?? lesson?.steps[0];
  const done = lesson ? progress.steps[lesson.id] ?? [] : [];
  const passed = !!step?.check && safeEvaluate(step.check, state);

  // Auto-advance when a step's check passes (after a beat, so the success message is seen).
  useEffect(() => {
    if (!lesson || !step || !passed || done.includes(step.n)) return;
    const t = window.setTimeout(() => onUpdate((p) => markStep(p, lesson, step.n)), 1600);
    return () => clearTimeout(t);
  }, [lesson, step, passed, done, onUpdate]);

  if (!lesson) return <div className="guide-empty">That lesson isn't in this build.</div>;
  const finished = progress.completed.includes(lesson.id);
  const pct = lessonPercent(progress, lesson);

  return (
    <div className="guide-lesson">
      <div className="guide-lesson-head">
        <div className="guide-lesson-name">{lesson.title}</div>
        <div className="guide-lesson-sub">{lesson.summary}</div>
        <div className="guide-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Lesson progress">
          <span style={fillStyle(pct / 100)} />
        </div>
      </div>

      {!available && <div className="guide-empty">{lesson.requiresNote ?? "This lesson needs a feature that isn't in this build yet."}</div>}

      <ol className="guide-steps">
        {lesson.steps.map((s) => {
          const isDone = done.includes(s.n);
          const isCur = !finished && s.n === step?.n;
          return (
            <li key={s.n} className={`guide-step ${isDone ? "done" : ""} ${isCur ? "current" : ""}`} aria-current={isCur ? "step" : undefined}>
              <span className="guide-step-dot" aria-hidden="true">{isDone ? <Check size={10} strokeWidth={3} /> : s.n}</span>
              <div className="guide-step-body">
                <div className="guide-step-title">{s.title}</div>
                {isCur && (
                  <>
                    <div className="guide-step-text">{s.text}</div>
                    {passed && s.success && <div className="guide-success" role="status">{s.success}</div>}
                    {available && (
                      <div className="guide-actions">
                        {s.target && (
                          <button type="button" className="cc-btn-ghost guide-show" onClick={() => void showMe(s.target!, s.text.slice(0, 140), s.title)}>
                            Show me
                          </button>
                        )}
                        {!s.check && (
                          <button type="button" className="cc-btn-ghost" onClick={() => onUpdate((p) => markStep(p, lesson, s.n))}>
                            I did it
                          </button>
                        )}
                        {s.check && !passed && <span className="guide-waiting">Waiting for you…</span>}
                        <button type="button" className="cc-btn-ghost guide-skip" onClick={() => onUpdate((p) => skipStep(p, lesson, s.n))}>
                          Skip step
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {finished && (
        <div className="guide-finished" role="status">
          <Check size={14} strokeWidth={2.6} aria-hidden="true" /> Lesson complete.
          <button type="button" className="cc-btn-ghost" onClick={() => onUpdate((p) => resetLesson(p, lesson.id))}>
            Start again
          </button>
        </div>
      )}
    </div>
  );
};

export default GuidePanel;
