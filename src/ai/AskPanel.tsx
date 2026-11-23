/**
 * Ask panel: the one conversation view used by the palette, the Dock's Ask mode, file drops and quick
 * actions. It always shows exactly what is attached (context chips, removable before sending), which
 * provider will answer and whether that leaves the PC, and it asks before any cloud send when privacy
 * says so. Tool proposals from the backend appear as Approve / Deny cards; nothing runs without a click.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow,
  ArrowUp,
  Check,
  Clipboard,
  Cloud,
  Copy,
  Cpu,
  FileText,
  Globe,
  Layers,
  Link2,
  Lock,
  PanelsTopLeft,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  TextSelect,
  Wrench,
  X,
} from "lucide-react";
import {
  aiStatus,
  useAiRequest,
  type AiContext,
  type AiProviderInfo,
  type AiStatus,
  type AiToolCard,
} from "./surfaceApi";
import { listen } from "@tauri-apps/api/event";
import {
  SHELF_CHANGED,
  openInCommand,
  shelfAdd,
  shelfAsContext,
  shelfList,
  type CommandHandoff,
  type ShelfItem,
} from "./shelfLink";
import {
  LARGE_CONTEXT_TOKENS,
  approxTokens,
  buildChips,
  composeHandoff,
  contextForProvider,
  estimateTokens,
  filterShelf,
  formatTokens,
  isCloud,
  mentionAt,
  shelfTitle,
  stripMention,
  withShelfText,
  privacyLabel,
  providerBadge,
  removeContext,
  sendGate,
  type ContextKind,
} from "./context";
import { MarkdownLite } from "./MarkdownLite";
import { openExternal } from "./open";
import { logUsage } from "./usageLog";
import "./AskPanel.css";

export interface AskPanelProps {
  /** Pass a status you already have; otherwise the panel loads it. */
  status?: AiStatus | null;
  initialPrompt?: string;
  initialContext?: AiContext;
  /** Send initialPrompt immediately (still goes through the privacy gate). */
  autoSend?: boolean;
  /** Use this provider instead of the active one. */
  providerId?: string;
  /** Let the AI propose Lens actions (each still needs Approve). Default true. */
  allowTools?: boolean;
  /** Smaller paddings and no history, for the Dock popover. */
  compact?: boolean;
  suggestions?: string[];
  onClose?: () => void;
  onOpenSettings?: () => void;
  onOpenLink?: (url: string) => void;
  /** Called with the hand-off text after it's copied, e.g. to open claude.ai. */
  onContinueInClaude?: (text: string) => void;
  /** Extra controls under the input (quick action buttons etc.). */
  footerSlot?: React.ReactNode;
  /** Shelf items attached from the start (e.g. dropped on the Dock sparkle). */
  initialShelfIds?: string[];
  /** Turn off Shelf features (chips, @-mentions, Add to Shelf) where the Shelf isn't available. */
  shelf?: boolean;
  /** Override "Open in Lens Command" (default: emit lens://command). */
  onOpenInCommand?: (h: CommandHandoff) => void;
}

const itemTokens = (i: ShelfItem) => i.approx_tokens ?? approxTokens((i.text ?? "").length + (i.title ?? "").length);

interface Turn {
  prompt: string;
  answer: string;
  provider: string;
  error?: string;
}

const DEFAULT_SUGGESTIONS = [
  "Summarise what's on my clipboard",
  "What was I working on this morning?",
  "Turn on night light and dim the screen",
  "Draft a polite reply saying I'll be late",
];

const CHIP_ICON: Record<ContextKind, React.ReactNode> = {
  selection: <TextSelect size={13} strokeWidth={2.2} />,
  clipboard: <Clipboard size={13} strokeWidth={2.2} />,
  window: <AppWindow size={13} strokeWidth={2.2} />,
  page: <FileText size={13} strokeWidth={2.2} />,
  url: <Link2 size={13} strokeWidth={2.2} />,
  files: <FileText size={13} strokeWidth={2.2} />,
};

const HISTORY_CHARS = 4000;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Folds the last turns into the prompt so follow-ups make sense (the backend has no session memory). */
export function withHistory(prompt: string, turns: Turn[]): string {
  const prior = turns.filter((t) => t.answer && !t.error).slice(-2);
  if (!prior.length) return prompt;
  let hist = prior.map((t) => `User: ${t.prompt}\nAssistant: ${t.answer}`).join("\n\n");
  if (hist.length > HISTORY_CHARS) hist = hist.slice(hist.length - HISTORY_CHARS);
  return `Earlier in this conversation:\n${hist}\n\nNow: ${prompt}`;
}

function riskTone(risk: string): "low" | "medium" | "high" {
  return risk === "high" ? "high" : risk === "medium" ? "medium" : "low";
}

const ToolCard: React.FC<{ card: AiToolCard; onDecide: (approve: boolean) => void }> = ({ card, onDecide }) => {
  const tone = riskTone(card.risk);
  const args = Object.entries(card.args ?? {});
  return (
    <div className={`ai-tool ai-risk-${tone}`} role="group" aria-label={`Proposed action: ${card.summary}`}>
      <div className="ai-tool-head">
        <Wrench size={14} strokeWidth={2.3} aria-hidden="true" />
        <span className="ai-tool-title">{card.summary}</span>
        <span className="ai-tool-risk">{tone === "high" ? "High impact" : tone === "medium" ? "Changes settings" : "Low impact"}</span>
      </div>
      <div className="ai-tool-meta">
        <code>{card.tool}</code>
        {args.length > 0 && (
          <span className="ai-tool-args">
            {args.slice(0, 4).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")}
          </span>
        )}
      </div>
      {card.result ? (
        <div className={`ai-tool-result ${card.result.ok ? "ok" : "fail"}`} role="status">
          {card.result.ok ? <Check size={13} strokeWidth={2.6} aria-hidden="true" /> : <X size={13} strokeWidth={2.6} aria-hidden="true" />}
          {card.result.message}
        </div>
      ) : card.decision ? (
        <div className="ai-tool-result" role="status">
          {card.decision === "approved" ? "Approved · running…" : "Denied · nothing was changed"}
        </div>
      ) : (
        <div className="ai-tool-actions">
          <button type="button" className="ai-btn ai-btn-primary" onClick={() => onDecide(true)} autoFocus>
            Approve
          </button>
          <button type="button" className="ai-btn" onClick={() => onDecide(false)}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
};

export const AskPanel: React.FC<AskPanelProps> = ({
  status: statusProp,
  initialPrompt = "",
  initialContext,
  autoSend = false,
  providerId,
  allowTools = true,
  compact = false,
  suggestions = DEFAULT_SUGGESTIONS,
  onClose,
  onOpenSettings,
  onOpenLink = openExternal,
  onContinueInClaude,
  footerSlot,
  initialShelfIds,
  shelf = true,
  onOpenInCommand,
}) => {
  const [status, setStatus] = useState<AiStatus | null>(statusProp ?? null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [ctx, setCtx] = useState<AiContext>(initialContext ?? {});
  const [chosen, setChosen] = useState<string | undefined>(providerId);
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const [gateCard, setGateCard] = useState<"consent" | "blocked" | "no-provider" | "needs-key" | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [lastSent, setLastSent] = useState<{ prompt: string; ctx: AiContext } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shelfAll, setShelfAll] = useState<ShelfItem[]>([]);
  const [shelfIds, setShelfIds] = useState<string[]>(initialShelfIds ?? []);
  const [sentShelfIds, setSentShelfIds] = useState<string[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number; caret: number } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const { state, ask, cancel, decide, reset } = useAiRequest();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    if (statusProp) setStatus(statusProp);
    else aiStatus().then(setStatus).catch(() => setStatus(null));
  }, [statusProp]);

  useEffect(() => {
    if (!shelf) return;
    const load = () => shelfList().then((l) => setShelfAll(Array.isArray(l) ? l : [])).catch(() => setShelfAll([]));
    load();
    const un = listen(SHELF_CHANGED, load);
    return () => {
      un.then((f) => f());
    };
  }, [shelf]);

  const shelfAttached = useMemo(
    () => shelfIds.map((id) => shelfAll.find((i) => i.id === id) ?? ({ id, kind: "text", title: "Shelf item" } as ShelfItem)),
    [shelfIds, shelfAll]
  );
  const shelfTokens = shelfAttached.reduce((s, i) => s + itemTokens(i), 0);
  const mentionMatches = mention ? filterShelf(shelfAll, mention.query, shelfIds) : [];

  const provider: AiProviderInfo | undefined = useMemo(() => {
    if (!status) return undefined;
    const id = chosen ?? status.active;
    return status.providers.find((p) => p.id === id) ?? status.providers.find((p) => p.id === status.active);
  }, [status, chosen]);

  const localAlt = useMemo(
    // Prefer a real local model over the script helper.
    () =>
      status?.providers.find((p) => p.available && p.kind === "local" && !isCloud(p)) ??
      status?.providers.find((p) => p.available && p.kind === "script"),
    [status]
  );
  const privacy = status?.privacy ?? "ask_each_time";
  const badge = providerBadge(provider);
  const chips = buildChips(ctx);
  const busy = state.phase === "streaming";

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  };

  // Commit the finished answer to history.
  useEffect(() => {
    if (!lastSent) return;
    if (state.phase === "done" || state.phase === "error" || state.phase === "cancelled") {
      logUsage({
        ts: Date.now(),
        provider: state.provider || provider?.id || "",
        model: state.model || provider?.model || "",
        cloud: isCloud(provider),
        input: state.usage?.input_tokens,
        output: state.usage?.output_tokens,
        ok: state.phase !== "error",
      });
      setTurns((t) => [
        ...t,
        { prompt: lastSent.prompt, answer: state.text, provider: state.provider, error: state.phase === "error" ? state.error : undefined },
      ]);
    }
    // only on phase changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.text, state.tools.length, turns.length, gateCard]);

  const doSend = useCallback(
    async (p: string, c: AiContext, consented: boolean) => {
      const text = p.trim();
      if (!text || !status) return;
      const gate = sendGate(privacy, provider, consented || consentFor === text);
      if (gate !== "ok") {
        setGateCard(gate);
        return;
      }
      setGateCard(null);
      setConsentFor(null);
      setLastSent({ prompt: text, ctx: c });
      setSentShelfIds(shelfIds);
      setPrompt("");
      setMention(null);
      let full = c;
      if (shelfIds.length) {
        const r = await shelfAsContext(shelfIds).catch(() => null);
        if (r?.text) full = withShelfText(c, r.text);
      }
      await ask({
        prompt: compact ? text : withHistory(text, turns),
        context: contextForProvider(full, provider, privacy),
        provider: provider?.id,
        allow_tools: allowTools,
      });
    },
    [status, privacy, provider, consentFor, ask, compact, turns, allowTools, shelfIds]
  );

  useEffect(() => {
    if (autoSend && !autoSent.current && status && initialPrompt.trim()) {
      autoSent.current = true;
      doSend(initialPrompt, initialContext ?? {}, false);
    }
  }, [autoSend, status, initialPrompt, initialContext, doSend]);

  const pickMention = (item: ShelfItem) => {
    if (!mention) return;
    const r = stripMention(prompt, mention.start, mention.caret);
    setPrompt(r.text);
    setShelfIds((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]));
    setMention(null);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(r.caret, r.caret);
      }
    });
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setPrompt(v);
    if (!shelf) return;
    const caret = e.target.selectionStart ?? v.length;
    const m = mentionAt(v, caret);
    setMention(m ? { ...m, caret } : null);
    setMentionIdx(0);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && mentionMatches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setMentionIdx((i) => (i + d + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionMatches[Math.min(mentionIdx, mentionMatches.length - 1)]);
        return;
      }
    }
    if (mention && e.key === "Escape") {
      e.preventDefault();
      setMention(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy) doSend(prompt, ctx, false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (busy) cancel();
      else onClose?.();
    }
  };

  const handoff = async () => {
    const src = lastSent ?? { prompt, ctx };
    const text = composeHandoff(src.prompt, src.ctx, state.text);
    const ok = await copyText(text);
    flash(ok ? "Copied · paste it into Claude" : "Couldn't copy");
    onContinueInClaude?.(text);
  };

  const addToShelf = async () => {
    if (!state.text.trim()) return;
    try {
      await shelfAdd({
        kind: "answer",
        title: (lastSent?.prompt ?? "AI answer").slice(0, 80),
        text: state.text,
        source_app: state.model || state.provider || "Lens AI",
      });
      flash("Added to Shelf");
    } catch {
      flash("Couldn't add to Shelf");
    }
  };

  const toCommand = () => {
    const h: CommandHandoff = {
      action: "continue",
      prompt: lastSent?.prompt ?? prompt,
      answer: state.text || undefined,
      context: lastSent?.ctx ?? ctx,
      shelf_ids: lastSent ? sentShelfIds : shelfIds,
      provider: provider?.id,
    };
    if (onOpenInCommand) onOpenInCommand(h);
    else openInCommand(h).catch(() => flash("Lens Command isn't available"));
  };

  const retry = () => {
    if (!lastSent) return;
    setTurns((t) => t.slice(0, -1));
    reset();
    doSend(lastSent.prompt, lastSent.ctx, true);
  };

  const showAnswer = state.phase !== "idle";
  // The current answer is drawn live below; once it finishes it is also the last entry of `turns`.
  const currentCommitted = state.phase === "done" || state.phase === "error" || state.phase === "cancelled";
  const historyShown = compact ? [] : showAnswer && currentCommitted ? turns.slice(0, -1) : turns;

  return (
    <section className={`ai-panel ${compact ? "is-compact" : ""}`} aria-label="Ask AI">
      <header className="ai-head">
        <Sparkles size={15} strokeWidth={2.3} aria-hidden="true" className="ai-head-icon" />
        <span className="ai-head-title">Ask</span>
        <div className="ai-head-right">
          <div className="ai-provider-wrap">
            <button
              type="button"
              className={`ai-badge tone-${badge.tone}`}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label={`Answered by ${badge.text}. Change provider`}
              onClick={() => setPickerOpen((o) => !o)}
            >
              {badge.tone === "cloud" ? <Cloud size={12} strokeWidth={2.4} aria-hidden="true" /> : <Cpu size={12} strokeWidth={2.4} aria-hidden="true" />}
              {badge.text}
              {provider?.model ? <span className="ai-badge-model">{provider.model}</span> : null}
            </button>
            {pickerOpen && status && (
              <ul className="ai-provider-menu" role="listbox" aria-label="AI provider">
                {status.providers
                  .filter((p) => p.kind !== "off")
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={p.id === provider?.id}
                        disabled={!p.available}
                        className={p.id === provider?.id ? "is-selected" : ""}
                        onClick={() => {
                          setChosen(p.id);
                          setPickerOpen(false);
                          setGateCard(null);
                        }}
                      >
                        <span>{p.label}</span>
                        <span className="ai-provider-sub">
                          {!p.available ? "Not found" : isCloud(p) ? "Cloud" : p.kind === "script" ? "Built in · no AI model" : "On this PC"}
                          {p.model ? ` · ${p.model}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <span className={`ai-privacy ${isCloud(provider) ? "is-cloud" : ""}`}>
            {isCloud(provider) ? <Globe size={12} strokeWidth={2.3} aria-hidden="true" /> : <Lock size={12} strokeWidth={2.3} aria-hidden="true" />}
            {isCloud(provider) ? privacyLabel(privacy) : "Stays on this PC"}
          </span>
          {onClose && (
            <button type="button" className="ai-icon-btn" aria-label="Close" onClick={onClose}>
              <X size={15} strokeWidth={2.3} />
            </button>
          )}
        </div>
      </header>

      <div className="ai-scroll" ref={scrollRef} aria-live="polite">
        {!showAnswer && historyShown.length === 0 && !gateCard && (
          <div className="ai-empty">
            <div className="ai-empty-title">What can I help with?</div>
            <div className="ai-empty-sub">
              {isCloud(provider)
                ? "Answers come from the cloud. You'll see what's attached before anything is sent."
                : "Answers are made on this PC. Nothing leaves it."}
            </div>
            <div className="ai-suggest" role="list">
              {suggestions.map((s) => (
                <button key={s} type="button" role="listitem" className="ai-suggest-item" onClick={() => doSend(s, ctx, false)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {historyShown.map((t, i) => (
          <div key={i} className="ai-turn">
            <div className="ai-q">{t.prompt}</div>
            {t.error ? <div className="ai-a ai-a-error">{t.error}</div> : <div className="ai-a"><MarkdownLite text={t.answer} onCopy={(x) => copyText(x).then(() => flash("Copied"))} onOpenLink={onOpenLink} /></div>}
          </div>
        ))}

        {showAnswer && lastSent && (
          <div className="ai-turn is-current">
            <div className="ai-q">{lastSent.prompt}</div>
            {state.phase === "error" ? (
              <div className="ai-card ai-card-error" role="alert">
                <ShieldAlert size={15} strokeWidth={2.3} aria-hidden="true" />
                <div>
                  <div className="ai-card-title">That didn't work</div>
                  <div className="ai-card-text">{state.error || "The AI provider didn't answer."}</div>
                  <div className="ai-card-actions">
                    <button type="button" className="ai-btn ai-btn-primary" onClick={retry}>
                      <RotateCcw size={13} strokeWidth={2.4} aria-hidden="true" /> Try again
                    </button>
                    {onOpenSettings && (
                      <button type="button" className="ai-btn" onClick={onOpenSettings}>
                        AI settings
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="ai-a">
                {state.text ? (
                  <MarkdownLite text={state.text} onCopy={(x) => copyText(x).then(() => flash("Copied"))} onOpenLink={onOpenLink} />
                ) : busy ? (
                  <div className="ai-thinking" aria-label="Thinking">
                    <span /><span /><span />
                  </div>
                ) : null}
                {busy && state.text && <span className="ai-caret" aria-hidden="true" />}
                {state.phase === "cancelled" && <div className="ai-note">Stopped.</div>}
              </div>
            )}
            {state.tools.map((t) => (
              <ToolCard key={t.call_id} card={t} onDecide={(ok) => decide(t.call_id, ok)} />
            ))}
            {(state.phase === "done" || state.phase === "cancelled") && (
              <div className="ai-answer-bar">
                <button type="button" className="ai-chipbtn" onClick={() => copyText(state.text).then((ok) => flash(ok ? "Copied" : "Couldn't copy"))}>
                  <Copy size={12} strokeWidth={2.4} aria-hidden="true" /> Copy
                </button>
                <button type="button" className="ai-chipbtn" onClick={retry}>
                  <RotateCcw size={12} strokeWidth={2.4} aria-hidden="true" /> Retry
                </button>
                {shelf && (
                  <button type="button" className="ai-chipbtn" onClick={addToShelf}>
                    <Layers size={12} strokeWidth={2.4} aria-hidden="true" /> Add to Shelf
                  </button>
                )}
                <button type="button" className="ai-chipbtn" onClick={toCommand}>
                  <PanelsTopLeft size={12} strokeWidth={2.4} aria-hidden="true" /> Open in Lens Command
                </button>
                <button type="button" className="ai-chipbtn" onClick={handoff}>
                  <Sparkles size={12} strokeWidth={2.4} aria-hidden="true" /> Continue in Claude
                </button>
                <span className="ai-answer-meta">
                  {state.model || state.provider}
                  {state.usage?.output_tokens ? ` · ${state.usage.output_tokens} tokens` : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {gateCard === "consent" && provider && (
          <div className="ai-card ai-card-consent" role="alertdialog" aria-label="Send to the cloud?">
            <Cloud size={15} strokeWidth={2.3} aria-hidden="true" />
            <div>
              <div className="ai-card-title">Send this to {provider.label}?</div>
              <div className="ai-card-text">
                {chips.length + shelfAttached.length
                  ? `Your question and ${chips.length + shelfAttached.length === 1 ? "this attachment" : `these ${chips.length + shelfAttached.length} attachments`} leave this PC (${formatTokens(estimateTokens(prompt, ctx, shelfTokens))}):`
                  : "Your question leaves this PC. Nothing else is attached."}
              </div>
              {chips.length + shelfAttached.length > 0 && (
                <ul className="ai-consent-list">
                  {chips.map((c) => (
                    <li key={c.kind}>
                      {CHIP_ICON[c.kind]} {c.label}
                    </li>
                  ))}
                  {shelfAttached.map((i) => (
                    <li key={`shelf-${i.id}`}>
                      <Layers size={13} strokeWidth={2.2} /> Shelf · {shelfTitle(i)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="ai-card-actions">
                <button
                  type="button"
                  className="ai-btn ai-btn-primary"
                  autoFocus
                  onClick={() => {
                    setConsentFor(prompt.trim() || lastSent?.prompt || "");
                    doSend(prompt || lastSent?.prompt || "", ctx, true);
                  }}
                >
                  Send once
                </button>
                {localAlt && (
                  <button
                    type="button"
                    className="ai-btn"
                    onClick={() => {
                      setChosen(localAlt.id);
                      setGateCard(null);
                    }}
                  >
                    Use {localAlt.label} instead
                  </button>
                )}
                <button type="button" className="ai-btn ai-btn-quiet" onClick={() => setGateCard(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {gateCard === "blocked" && (
          <div className="ai-card" role="alert">
            <Lock size={15} strokeWidth={2.3} aria-hidden="true" />
            <div>
              <div className="ai-card-title">Your privacy setting keeps AI on this PC</div>
              <div className="ai-card-text">{provider?.label ?? "This provider"} runs in the cloud, so Lens didn't send anything.</div>
              <div className="ai-card-actions">
                {localAlt && (
                  <button type="button" className="ai-btn ai-btn-primary" onClick={() => { setChosen(localAlt.id); setGateCard(null); }}>
                    Use {localAlt.label}
                  </button>
                )}
                {onOpenSettings && <button type="button" className="ai-btn" onClick={onOpenSettings}>Privacy settings</button>}
              </div>
            </div>
          </div>
        )}

        {(gateCard === "no-provider" || gateCard === "needs-key") && (
          <div className="ai-card" role="alert">
            <ShieldAlert size={15} strokeWidth={2.3} aria-hidden="true" />
            <div>
              <div className="ai-card-title">{gateCard === "needs-key" ? `${provider?.label ?? "Claude"} needs an API key` : "No AI is set up yet"}</div>
              <div className="ai-card-text">
                {gateCard === "needs-key"
                  ? "Add your key in AI settings. It's stored encrypted on this PC."
                  : "Turn on a local model (Ollama or LM Studio), the built-in script helper, or Claude in AI settings."}
              </div>
              <div className="ai-card-actions">
                {onOpenSettings && <button type="button" className="ai-btn ai-btn-primary" onClick={onOpenSettings}>Open AI settings</button>}
                {localAlt && gateCard === "needs-key" && (
                  <button type="button" className="ai-btn" onClick={() => { setChosen(localAlt.id); setGateCard(null); }}>
                    Use {localAlt.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="ai-foot">
        {(chips.length > 0 || shelfAttached.length > 0) && (
          <div className="ai-chips" role="list" aria-label="Attached to this question">
            {chips.map((c) => (
              <span key={c.kind} className="ai-chip" role="listitem">
                {CHIP_ICON[c.kind]}
                <span className="ai-chip-label">{c.label}</span>
                <span className="ai-chip-pop" role="tooltip">{c.preview}</span>
                <button
                  type="button"
                  className="ai-chip-x"
                  aria-label={`Remove ${c.label}`}
                  disabled={busy}
                  onClick={() => setCtx((x) => removeContext(x, c.kind))}
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              </span>
            ))}
            {shelfAttached.map((i) => (
              <span key={`shelf-${i.id}`} className="ai-chip is-shelf" role="listitem">
                <Layers size={13} strokeWidth={2.2} />
                <span className="ai-chip-label">{shelfTitle(i)}</span>
                <span className="ai-chip-pop" role="tooltip">
                  Shelf · {i.kind}
                  {i.source_app ? ` · ${i.source_app}` : ""} · {formatTokens(itemTokens(i))}
                </span>
                <button
                  type="button"
                  className="ai-chip-x"
                  aria-label={`Remove ${shelfTitle(i)} from this question`}
                  disabled={busy}
                  onClick={() => setShelfIds((ids) => ids.filter((x) => x !== i.id))}
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              </span>
            ))}
            <span
              className={`ai-size ${estimateTokens(prompt, ctx, shelfTokens) > LARGE_CONTEXT_TOKENS ? "is-large" : ""}`}
              aria-label={`Size about ${estimateTokens(prompt, ctx, shelfTokens)} tokens`}
            >
              {formatTokens(estimateTokens(prompt, ctx, shelfTokens))}
            </span>
          </div>
        )}
        {mention && (
          <div className="ai-mention" role="listbox" aria-label="Attach from your Shelf">
            <div className="ai-mention-head">
              <Layers size={12} strokeWidth={2.4} aria-hidden="true" /> Attach from your Shelf
            </div>
            {mentionMatches.length === 0 ? (
              <div className="ai-mention-empty">
                {shelfAll.length ? "Nothing on your Shelf matches." : "Your Shelf is empty. Add answers, pages or files to it to reuse them here."}
              </div>
            ) : (
              mentionMatches.map((i, idx) => (
                <button
                  key={i.id}
                  type="button"
                  role="option"
                  aria-selected={idx === mentionIdx}
                  className={`ai-mention-item ${idx === mentionIdx ? "is-active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(i);
                  }}
                >
                  <span className="ai-mention-title">{shelfTitle(i)}</span>
                  <span className="ai-mention-sub">
                    {i.kind}
                    {i.source_app ? ` · ${i.source_app}` : ""} · {formatTokens(itemTokens(i))}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
        <div className="ai-input-row">
          <textarea
            ref={inputRef}
            className="ai-input"
            rows={1}
            value={prompt}
            placeholder={turns.length ? "Ask a follow-up…" : shelf ? "Ask anything… (@ to attach from your Shelf)" : "Ask anything…"}
            aria-label="Your question"
            onChange={onInput}
            onKeyDown={onKey}
            autoFocus
          />
          {busy ? (
            <button type="button" className="ai-send is-stop" aria-label="Stop" onClick={cancel}>
              <Square size={12} strokeWidth={0} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="ai-send" aria-label="Send" disabled={!prompt.trim()} onClick={() => doSend(prompt, ctx, false)}>
              <ArrowUp size={15} strokeWidth={2.6} />
            </button>
          )}
        </div>
        {footerSlot}
        <div className="ai-hint">
          <kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> {busy ? "stop" : "close"}
          {!compact && turns.length > 0 && (
            <button type="button" className="ai-hint-link" onClick={() => { setTurns([]); reset(); setLastSent(null); }}>
              New conversation
            </button>
          )}
        </div>
        {toast && <div className="ai-toast" role="status">{toast}</div>}
      </footer>
    </section>
  );
};
