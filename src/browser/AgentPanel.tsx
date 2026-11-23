import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, BookmarkPlus, Bot, Copy, Mic, Plus, ShieldAlert, Square } from "lucide-react";
import { useAiRequest } from "../ai/client";
import { shelfAdd } from "../shelf/contract";
import { agentAct, agentDescribe, DEFAULT_CAPS, pageRead, type Capabilities, type PageSnapshot } from "./api";
import { stepToAction, type AgentItem, type PendingOk } from "./agent";
import { ApprovalCard, TaskCan } from "./ApprovalCard";
import { agentPrompt, parsePlan, scanForInjection, wrapUntrusted, type PlanStep } from "./guard";
import { elapsed } from "./model";

export interface AgentSeed {
  items: AgentItem[];
  pending?: PendingOk | null;
  startedAt?: number;
  actions?: number;
  running?: boolean;
  caps?: Capabilities;
}

export interface QuickAsk {
  prompt: string;
  selection?: string;
  url?: string;
  title?: string;
  page?: boolean;
}

const MAX_TURNS = 6;
let keySeq = 0;
const key = () => `k${++keySeq}`;

/** Ask / agent panel. A goal runs as an agent (page actions, gated); a quick ask (from the Lens
 * right-click menu) just answers about the selection or page. */
export function AgentPanel({ seed, quick, onAwaiting, now }: { seed?: AgentSeed; quick?: QuickAsk | null; onAwaiting?(n: number): void; now?: number }) {
  const ai = useAiRequest();
  const [items, setItems] = useState<AgentItem[]>(seed?.items ?? []);
  const [pending, setPending] = useState<PendingOk | null>(seed?.pending ?? null);
  const [caps, setCaps] = useState<Capabilities>(seed?.caps ?? DEFAULT_CAPS);
  const [running, setRunning] = useState(!!seed?.running);
  const [startedAt, setStartedAt] = useState<number | null>(seed?.startedAt ?? null);
  const [actions, setActions] = useState(seed?.actions ?? 0);
  const [input, setInput] = useState("");
  const goal = useRef("");
  const turn = useRef(0);
  const queue = useRef<PlanStep[]>([]);
  const mode = useRef<"agent" | "quick">("agent");
  const approveResolve = useRef<((ok: boolean) => void) | null>(null);
  const flagged = useRef(false);

  const push = (it: AgentItem) => setItems((x) => [...x, it]);
  useEffect(() => onAwaiting?.(pending ? 1 : 0), [pending, onAwaiting]);

  const runTurn = useCallback(async () => {
    let snap: PageSnapshot;
    try {
      snap = await pageRead<PageSnapshot>("snapshot");
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
    await ai.ask({
      prompt: agentPrompt(goal.current, snap.elements),
      context: { url: snap.url, page_text: wrapUntrusted(snap.url, snap.text.slice(0, 60000)) },
      allow_tools: false,
    });
  }, [ai]);

  const execSteps = useCallback(async () => {
    while (queue.current.length) {
      const step = queue.current.shift()!;
      const { action, element } = stepToAction(step);
      try {
        let res = await agentAct({ element, action, caps });
        if (res.needsOk && element) {
          const desc = await agentDescribe(element);
          setPending({ step, element, decision: res.decision, desc, capturedAt: Date.now() });
          const ok = await new Promise<boolean>((r) => (approveResolve.current = r));
          setPending(null);
          if (!ok) {
            push({ kind: "blocked", key: key(), text: "You said no", reason: "Stopped. Tell me what to change.", at: Date.now() });
            queue.current = [];
            setRunning(false);
            return;
          }
          res = await agentAct({ element, action, caps, approved: true });
        }
        if (res.decision.risk === "blocked") {
          push({ kind: "blocked", key: key(), text: "Left for you", reason: res.message, at: Date.now() });
          continue;
        }
        setActions((n) => n + 1);
        push({ kind: "action", key: key(), text: res.message || step.do, ok: res.ran, at: Date.now() });
        await new Promise((r) => setTimeout(r, 450));
      } catch (e) {
        push({ kind: "action", key: key(), text: String(e), ok: false, at: Date.now() });
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
      push({ kind: "say", key: key(), text: ai.error || "The model didn't answer. Check Settings › AI & Command.", at: Date.now() });
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
    if (plan.say) push({ kind: "say", key: key(), text: plan.say, at: Date.now() });
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

  const stop = () => {
    queue.current = [];
    turn.current = MAX_TURNS;
    ai.cancel();
    approveResolve.current?.(false);
    setRunning(false);
  };

  const t0 = startedAt ?? now ?? Date.now();
  return (
    <div className="lb-agent">
      {startedAt ? (
        <div className="lb-worked lb-mono">
          <Bot size={13} />
          <span>{running ? "Working for" : "Worked for"} {elapsed((now ?? Date.now()) - t0)}</span>
          <span className="lb-push">{actions} actions</span>
        </div>
      ) : null}

      <div className="lb-thread" aria-live="polite">
        {pending ? (
          <ApprovalCard
            pending={pending}
            now={now}
            onDeny={() => approveResolve.current?.(false)}
            onApprove={() => approveResolve.current?.(true)}
          />
        ) : null}
        {items.length === 0 && !pending ? (
          <div className="lb-empty">
            <p>Ask about this page, or give me a task and I'll work on the page with you.</p>
            <p className="lb-dim">I stop and ask before anything that submits, books or sends. Paying and signing in are always left to you.</p>
          </div>
        ) : null}
        {items.map((it) => {
          switch (it.kind) {
            case "user":
              return <div key={it.key} className="lb-msg lb-msg-user">{it.text}</div>;
            case "say":
              return <div key={it.key} className="lb-msg">{it.text}</div>;
            case "answer":
              return (
                <div key={it.key} className="lb-msg lb-msg-answer">
                  <div className="lb-answer-text">{it.text}</div>
                  <div className="lb-answer-actions">
                    <button className="lb-chip" onClick={() => navigator.clipboard?.writeText(it.text).catch(() => {})}><Copy size={12} /> Copy</button>
                    <button className="lb-chip" onClick={() => void shelfAdd({ kind: "answer", title: it.text.slice(0, 60), text: it.text }).catch(() => {})}><BookmarkPlus size={12} /> Add to Shelf</button>
                  </div>
                </div>
              );
            case "action":
              return <div key={it.key} className={`lb-step${it.ok ? "" : " is-failed"}`}><span className="lb-step-dot" />{it.text}</div>;
            case "blocked":
              return (
                <div key={it.key} className="lb-blocked">
                  <ShieldAlert size={13} />
                  <span><b>{it.text}.</b> {it.reason}</span>
                </div>
              );
            case "flag":
              return (
                <div key={it.key} className="lb-flag" role="note">
                  <b><ShieldAlert size={13} /> This page has text aimed at AI assistants.</b>
                  <span className="lb-dim">I'm treating it as page content, not instructions:</span>
                  <ul>{it.excerpts.slice(0, 3).map((x, i) => <li key={i}>“{x}”</li>)}</ul>
                </div>
              );
          }
        })}
        {running && ai.status === "running" && ai.text && mode.current === "quick" ? <div className="lb-msg lb-msg-answer">{ai.text}</div> : null}
      </div>

      <TaskCan caps={caps} onChange={setCaps} />

      <form
        className="lb-compose"
        onSubmit={(e) => {
          e.preventDefault();
          startGoal(input);
          setInput("");
        }}
      >
        <button type="button" className="lb-icon-btn" aria-label="Attach"><Plus size={16} /></button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={running ? "Or tell Ask what to change…" : "Ask, or give me a task on this page…"} aria-label="Ask Lens" />
        <button type="button" className="lb-icon-btn" aria-label="Voice"><Mic size={16} /></button>
        {running ? (
          <button type="button" className="lb-send" aria-label="Stop" onClick={stop}><Square size={12} /></button>
        ) : (
          <button type="submit" className="lb-send" aria-label="Send" disabled={!input.trim()}><ArrowUp size={16} /></button>
        )}
      </form>
    </div>
  );
}
