import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp, BookmarkPlus, BookOpen, ChevronDown, ChevronRight, Copy, CornerDownRight, Globe, Hand, Keyboard, Layers, Loader, MousePointerClick, Mic, MoveVertical,
  Pause, Play, Plus, RotateCw, Search, ShieldAlert, Sparkles, Square,
} from "lucide-react";
import { useAiRequest } from "../ai/client";
import { shelfAdd } from "../shelf/contract";
import { agentAct, agentDescribe, DEFAULT_CAPS, focusPage, pageRead, tabActivate, type Capabilities, type PageSnapshot } from "./api";
import { defaultGroupTitle, iconOf, plainError, stepToAction, summariseVerbs, verbOf, type AgentItem, type PendingOk, type StepIcon } from "./agent";
import { ApprovalCard, Key, TaskCan } from "./ApprovalCard";
import { SafetyFlagBanners } from "../agentsafe/SafetyFlags";
import { cardModel } from "./approvalShape";
import { agentPrompt, parsePlan, scanForInjection, wrapUntrusted, type PlanStep } from "./guard";
import { elapsed, hostOf } from "./model";
import { ResultView } from "./ResultCards";
import { pageStep } from "../presence/browser";
import { Avatar } from "./Sidebar";
import { oops, quiet } from "./oops";

export interface AgentSeed {
  items: AgentItem[];
  pending?: PendingOk | null;
  startedAt?: number;
  actions?: number;
  running?: boolean;
  caps?: Capabilities;
  collapsed?: boolean;
}

export interface QuickAsk {
  prompt: string;
  selection?: string;
  url?: string;
  title?: string;
  page?: boolean;
}

export interface Acting {
  tabId?: string;
  url: string;
  title: string;
  /** Other tabs that stay open but idle. */
  kept: number;
}

const MAX_TURNS = 6;
/** How often one step may ask again after an approval Lens Core refused (changed step, expired token). */
const MAX_ASKS = 3;
let keySeq = 0;
const key = () => `k${++keySeq}`;

const ICONS: Record<StepIcon, React.ReactNode> = {
  globe: <Globe size={14} />,
  search: <Search size={14} />,
  layers: <Layers size={14} />,
  type: <Keyboard size={14} />,
  click: <MousePointerClick size={14} />,
  scroll: <MoveVertical size={14} />,
  read: <BookOpen size={14} />,
};

const TIMELINE = new Set(["group", "say", "action", "blocked", "flag"]);

/** Ask / agent panel with the run timeline. A goal runs as an agent (gated page actions); a quick
 * ask from the Lens right-click menu just answers about the selection or page. */
export function AgentPanel({ seed, quick, onAwaiting, now, acting, onOpenUrl }: {
  seed?: AgentSeed;
  quick?: QuickAsk | null;
  onAwaiting?(n: number): void;
  now?: number;
  acting?: Acting | null;
  onOpenUrl?(url: string): void;
}) {
  const ai = useAiRequest();
  const [items, setItems] = useState<AgentItem[]>(seed?.items ?? []);
  const [pending, setPending] = useState<PendingOk | null>(seed?.pending ?? null);
  const [caps, setCaps] = useState<Capabilities>(seed?.caps ?? DEFAULT_CAPS);
  const [running, setRunning] = useState(!!seed?.running);
  const [startedAt, setStartedAt] = useState<number | null>(seed?.startedAt ?? null);
  const [actions, setActions] = useState(seed?.actions ?? 0);
  const [collapsed, setCollapsed] = useState(!!seed?.collapsed);
  const [input, setInput] = useState("");
  const [, setTick] = useState(0);
  const goal = useRef("");
  const turn = useRef(0);
  const queue = useRef<PlanStep[]>([]);
  const group = useRef<string | null>(null);
  const mode = useRef<"agent" | "quick">("agent");
  const approveResolve = useRef<((ok: boolean) => void) | null>(null);
  const flagged = useRef(false);
  const paused = useRef(false);
  const resume = useRef<(() => void) | null>(null);
  const steer = useRef<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  const push = (it: AgentItem) => setItems((x) => [...x, it]);
  useEffect(() => onAwaiting?.(pending ? 1 : 0), [pending, onAwaiting]);
  // Tick the elapsed timer once a second while working.
  useEffect(() => {
    if (!running || now !== undefined) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [running, now]);

  const lastSnap = useRef<PageSnapshot | null>(null);
  const runTurn = useCallback(async () => {
    let snap: PageSnapshot;
    try {
      snap = await pageRead<PageSnapshot>("snapshot");
      lastSnap.current = snap;
    } catch (e) {
      push({ kind: "say", key: key(), text: `I can't read this page yet (${String(e)}).`, at: Date.now() });
      setRunning(false);
      return;
    }
    const flags = scanForInjection(snap.text);
    if (flags.length && !flagged.current) {
      flagged.current = true;
      push({ kind: "flag", key: key(), excerpts: flags.map((f) => f.excerpt), at: Date.now() });
    }
    const notes = steer.current.length ? `\nThe user added while you worked: ${steer.current.join(" / ")}` : "";
    await ai.ask({
      prompt: agentPrompt(goal.current + notes, snap.elements),
      context: { url: snap.url, page_text: wrapUntrusted(snap.url, snap.text.slice(0, 60000)) },
      allow_tools: false,
    });
  }, [ai]);

  const addVerb = (verb: string) => {
    const g = group.current;
    if (!g) return;
    setItems((xs) => xs.map((it) => (it.kind === "group" && it.key === g ? { ...it, verbs: [...it.verbs, verb] } : it)));
  };

  const execSteps = useCallback(async () => {
    while (queue.current.length) {
      if (paused.current) await new Promise<void>((r) => (resume.current = r));
      const step = queue.current.shift()!;
      const { action, element } = stepToAction(step);
      // "Lens at work": show the step on the real element first (≤ 150 ms lead); Stop ends the run.
      if ((await pageStep(action, element, lastSnap.current)).stopped) {
        queue.current = [];
        setRunning(false);
        return;
      }
      try {
        let res = await agentAct({ element, action, caps });
        // Each card carries a one-time token for the exact step it shows. If the step changed
        // while the card was up (the page swapped the button, the token ran out), Lens Core
        // refuses the approval and hands back a new card for the step as it is now.
        for (let asks = 0; res.needsOk && element && asks < MAX_ASKS; asks++) {
          const desc = await agentDescribe(element);
          if (res.approvalRefused) push({ kind: "blocked", key: key(), text: "Asking again", reason: res.message, at: Date.now() });
          setPending({ step, element, decision: res.decision, desc, capturedAt: Date.now() });
          const ok = await new Promise<boolean>((r) => (approveResolve.current = r));
          setPending(null);
          if (!ok) {
            push({ kind: "blocked", key: key(), text: "You said no", reason: "Stopped. Tell me what to change.", at: Date.now() });
            queue.current = [];
            setRunning(false);
            return;
          }
          res = await agentAct({ element, action, caps, approvalToken: res.approvalToken });
        }
        if (res.needsOk) {
          push({ kind: "blocked", key: key(), text: "Left for you", reason: res.message || "This step needs your OK.", at: Date.now() });
          continue;
        }
        if (res.decision.risk === "blocked") {
          push({ kind: "blocked", key: key(), text: "Left for you", reason: res.message, at: Date.now() });
          continue;
        }
        setActions((n) => n + 1);
        addVerb(verbOf(step));
        if (step.why) setItems((xs) => xs.map((it) => (it.kind === "group" && it.key === group.current ? { ...it, why: step.why } : it)));
        if (!res.ran) push({ kind: "action", key: key(), text: plainError(res.message || step.do), ok: false, at: Date.now(), retry: step });
        await new Promise((r) => setTimeout(r, 450));
      } catch (e) {
        push({ kind: "action", key: key(), text: plainError(e), ok: false, at: Date.now(), retry: step });
      }
    }
    if (turn.current < MAX_TURNS && mode.current === "agent") {
      turn.current += 1;
      await runTurn();
    } else setRunning(false);
  }, [caps, runTurn]);

  // When a model turn finishes: quick asks show the answer; agent turns parse and run the plan.
  useEffect(() => {
    if (ai.status === "error") {
      push({ kind: "say", key: key(), text: ai.error || "The model didn't answer. Check AI settings.", at: Date.now() });
      setRunning(false);
      return;
    }
    if (ai.status !== "done") return;
    if (mode.current === "quick") {
      push({ kind: "answer", key: key(), text: ai.text, at: Date.now() });
      setRunning(false);
      return;
    }
    const plan = parsePlan(ai.text);
    const host = hostOf(acting?.url ?? "");
    if (plan.steps.length) {
      const gk = key();
      group.current = gk;
      // Repeated batches with the same title collapse into one row.
      const last = [...items].reverse().find((x) => x.kind === "group");
      const title = plan.label ?? defaultGroupTitle(plan.steps, host || "this page");
      if (last && last.kind === "group" && last.title === title) group.current = last.key;
      else push({ kind: "group", key: gk, title, icon: iconOf(plan.steps), host, verbs: [], why: plan.steps[0]?.why, tabId: acting?.tabId, at: Date.now() });
    }
    if (plan.say) push({ kind: "say", key: key(), text: plan.say, at: Date.now() });
    if (plan.result) push({ kind: "result", key: key(), result: plan.result, at: Date.now() });
    if (plan.done && !plan.steps.length) {
      setRunning(false);
      return;
    }
    queue.current = plan.steps;
    void execSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.status]);

  const startGoal = (text: string) => {
    const t = text.trim();
    if (!t) return;
    mode.current = "agent";
    goal.current = t;
    turn.current = 0;
    flagged.current = false;
    setStartedAt(Date.now());
    setActions(0);
    setRunning(true);
    push({ kind: "user", key: key(), text: t, at: Date.now() });
    void runTurn();
  };

  // Right-click "Ask / Summarise / Explain …" from the page.
  useEffect(() => {
    if (!quick) return;
    mode.current = "quick";
    setRunning(true);
    push({ kind: "user", key: key(), text: quick.selection ? `${quick.prompt}: “${quick.selection.slice(0, 120)}${quick.selection.length > 120 ? "…" : ""}”` : quick.prompt, at: Date.now() });
    (async () => {
      let page = "";
      if (quick.page) {
        try {
          const r = await pageRead<{ text: string; url: string }>("readable");
          page = wrapUntrusted(r.url, r.text.slice(0, 60000));
        } catch {
          /* answer from the selection only */
        }
      }
      await ai.ask({ prompt: quick.prompt, context: { selection: quick.selection || undefined, url: quick.url, page_text: page || undefined }, allow_tools: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);

  const togglePause = () => {
    paused.current = !paused.current;
    setIsPaused(paused.current);
    if (!paused.current) {
      resume.current?.();
      resume.current = null;
    }
  };

  const takeOver = () => {
    stop();
    push({ kind: "say", key: key(), text: "You have the tab. Ask again when you want me back.", at: Date.now() });
    void focusPage().catch(quiet);
  };

  const retry = (step: PlanStep) => {
    queue.current = [step, ...queue.current];
    if (!running) {
      setRunning(true);
      turn.current = MAX_TURNS; // run just this step
      void execSteps();
    }
  };

  const stop = () => {
    paused.current = false;
    setIsPaused(false);
    resume.current?.();
    queue.current = [];
    turn.current = MAX_TURNS;
    ai.cancel();
    approveResolve.current?.(false);
    setRunning(false);
  };

  const t = now ?? Date.now();
  const pendingModel = pending ? cardModel(pending, t) : null;

  const renderItem = (it: AgentItem): React.ReactNode => {
    switch (it.kind) {
      case "user":
        return <div className="lb-msg lb-msg-user">{it.text}</div>;
      case "say":
        return <div className="lb-tl-say"><span className="lb-tl-bullet" />{it.text}</div>;
      case "group":
        return (
          <div className="lb-tl-step">
            <span className="lb-tl-icon" aria-hidden>{ICONS[it.icon]}</span>
            <span className="lb-tl-text">
              <span>
                {it.title} {it.verbs.length > 1 ? <span className="lb-mono lb-dim">{it.verbs.length}</span> : null}
              </span>
              {it.verbs.length ? <span className="lb-mono lb-dim lb-tl-sub">{summariseVerbs(it.verbs)}</span> : null}
              {it.why ? <span className="lb-dim lb-tl-why">{it.why}</span> : null}
            </span>
            {it.tabId ? (
              <button className="lb-chip" onClick={() => void tabActivate(it.tabId!).catch(oops("switch to that tab"))} aria-label="Jump to tab">
                <CornerDownRight size={12} /> tab
              </button>
            ) : it.host ? <span className="lb-mono lb-dim">in Lens</span> : null}
          </div>
        );
      case "answer":
        return (
          <div className="lb-msg lb-msg-answer">
            <div className="lb-answer-text">{it.text}</div>
            <div className="lb-answer-actions">
              <button className="lb-chip" onClick={() => navigator.clipboard?.writeText(it.text).catch(oops("copy that"))}><Copy size={12} /> Copy <Key k="C" /></button>
              <button className="lb-chip" onClick={() => void shelfAdd({ kind: "answer", title: it.text.slice(0, 60), text: it.text }).catch(oops("add that to the Shelf"))}><BookmarkPlus size={12} /> Add to Shelf <Key k="S" /></button>
            </div>
          </div>
        );
      case "result":
        return <ResultView result={it.result} onOpen={onOpenUrl} />;
      case "action":
        return (
          <div className={`lb-tl-step lb-tl-small${it.ok ? "" : " is-failed"}`}>
            <span className="lb-dot is-red" />
            <span className="lb-tl-text">{it.text}</span>
            {it.retry ? <button className="lb-chip" onClick={() => retry(it.retry!)}><RotateCw size={12} /> Retry <Key k="R" /></button> : null}
          </div>
        );
      case "blocked":
        return (
          <div className="lb-blocked">
            <ShieldAlert size={13} />
            <span><b>{it.text}.</b> {it.reason}</span>
          </div>
        );
      case "flag":
        return (
          <div className="lb-flag" role="note">
            <b><ShieldAlert size={13} /> This page has text aimed at AI assistants.</b>
            <span className="lb-dim">I'm treating it as page content, not instructions:</span>
            <ul>{it.excerpts.slice(0, 3).map((x, i) => <li key={i}>“{x}”</li>)}</ul>
          </div>
        );
    }
  };

  return (
    <div className="lb-agent">
      <div className="lb-thread" aria-live="polite">
        {items.length === 0 && !pending ? (
          <div className="lb-empty lens-dither lens-dither-vignette">
            <p>Ask about this page, or give me a task and I'll work on the page with you.</p>
            <p className="lb-dim">I stop and ask before anything that submits, books or sends. Paying is off unless you switch it on for a task, and signing in is always yours.</p>
          </div>
        ) : null}
        {items.map((it, idx) => {
          const prevTimeline = idx > 0 && TIMELINE.has(items[idx - 1].kind);
          const header =
            startedAt && TIMELINE.has(it.kind) && !prevTimeline ? (
              <button className="lb-run-head lb-mono" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
                {running ? <Loader size={13} className="lb-spin" /> : <Sparkles size={13} />}
                <span>{running ? "Working" : "Worked"} · {elapsed(t - startedAt)}</span>
                {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span className="lb-push">{actions} actions</span>
              </button>
            ) : null;
          const controls =
            header && running ? (
              <div className="lb-run-controls">
                <button className="lb-chip" onClick={togglePause}>{isPaused ? <Play size={12} /> : <Pause size={12} />} {isPaused ? "Resume" : "Pause"} <Key k="P" /></button>
                <button className="lb-chip" onClick={takeOver}><Hand size={12} /> Take over <Key k="T" /></button>
              </div>
            ) : null;
          return (
            <React.Fragment key={it.key}>
              {header}
              {controls}
              {collapsed && TIMELINE.has(it.kind) ? null : renderItem(it)}
            </React.Fragment>
          );
        })}

        {pending && pendingModel ? (
          <div className="lb-tl-step lb-tl-wait">
            <span className="lb-tl-icon" aria-hidden><Sparkles size={14} /></span>
            <span className="lb-tl-text">Waiting for your OK to {pendingModel.verb.toLowerCase()}</span>
            <span className="lb-mono lb-dim">now</span>
          </div>
        ) : null}

        {running && acting ? (
          <div className="lb-card lb-acting">
            <div className="lb-acting-head">
              <Loader size={13} className="lb-spin" />
              <b>Acting in 1 tab</b>
              <span className="lb-mono lb-dim lb-push">{startedAt ? `${Math.max(1, Math.round((t - startedAt) / 1000) % 60)}s` : ""}</span>
            </div>
            <div className="lb-acting-row">
              <span className="lb-acting-tab"><Avatar url={acting.url} title={acting.title} size={14} />{acting.title.slice(0, 32) || hostOf(acting.url)}</span>
              {acting.kept ? <span className="lb-mono lb-dim lb-push">+ {acting.kept} kept, idle</span> : null}
            </div>
            <div className="lb-acting-thumb lens-dither" aria-hidden>
              <span className="lb-skel" style={{ width: "34%" }} />
              <span className="lb-skel" style={{ width: "50%", marginLeft: "40%" }} />
              <span className="lb-skel" style={{ width: "22%", marginLeft: "40%" }} />
            </div>
          </div>
        ) : null}

        <SafetyFlagBanners sources={["browser"]} />
        {pending ? <ApprovalCard pending={pending} now={now} onDeny={() => approveResolve.current?.(false)} onApprove={() => approveResolve.current?.(true)} /> : null}

        {running && ai.status === "running" && ai.text && mode.current === "quick" ? <div className="lb-msg lb-msg-answer">{ai.text}</div> : null}
      </div>

      <TaskCan caps={caps} onChange={setCaps} />

      <form
        className="lb-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (running && mode.current === "agent" && input.trim()) {
            steer.current.push(input.trim().slice(0, 300));
            push({ kind: "user", key: key(), text: `Steer: ${input.trim()}`, at: Date.now() });
          } else startGoal(input);
          setInput("");
        }}
      >
        <button type="button" className="lb-icon-btn" aria-label="Attach"><Plus size={16} /></button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={running ? "Steer: tell Ask what to change…" : "Ask, or give me a task on this page…"} aria-label="Ask Lens" />
        <button type="button" className="lb-icon-btn" aria-label="Voice"><Mic size={16} /></button>
        {running && !input.trim() ? (
          <button type="button" className="lb-send" aria-label="Stop" onClick={stop}><Square size={12} /></button>
        ) : (
          <button type="submit" className="lb-send" aria-label={running ? "Steer" : "Send"} disabled={!input.trim()}><ArrowUp size={16} /></button>
        )}
      </form>
    </div>
  );
}
