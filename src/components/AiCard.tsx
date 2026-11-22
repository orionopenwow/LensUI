/**
 * Control Center card: AI in Lens. Off by default. Picks the provider (built-in script helper, a local
 * model through Ollama or LM Studio, or Claude with your own key), sets privacy in plain words, chooses
 * what AI may propose doing, explains what AI can see, and shows a local usage log.
 *
 * Mount snippet: docs/AI_SURFACES.md §4.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Check, Cloud, Cpu, ExternalLink, Eye, KeyRound, Lock, RefreshCw, Sparkles, X } from "lucide-react";
import {
  AI_EVENTS,
  aiAsk,
  aiClearSecret,
  aiSetConfig,
  aiSetSecret,
  aiStatus,
  type AiDone,
  type AiPrivacy,
  type AiProviderInfo,
  type AiStatus,
} from "../ai/contract.shim";
import { isCloud } from "../ai/context";
import { openExternal } from "../ai/open";
import { clearUsage, readUsage, usageTotals, type UsageEntry } from "../ai/usageLog";
import "../ai/AskPanel.css";

/** Optional fields client.ts may add; the card uses them when present. */
type ProviderExtra = AiProviderInfo & { models?: string[]; endpoint?: string };
type StatusExtra = AiStatus & { tools?: Partial<ToolPerms> };

export interface ToolPerms {
  /** Volume, brightness, night light, theme. */
  settings: boolean;
  /** Focus, move, snap and tile windows; switch workspaces. */
  windows: boolean;
  /** Open apps and files (never delete or move them). */
  launch: boolean;
  /** Read open window titles for "what was I doing". */
  titles: boolean;
}

export const DEFAULT_TOOLS: ToolPerms = { settings: true, windows: true, launch: false, titles: false };
const INTRO_KEY = "lens.ai.introSeen";

const PRIVACY: { id: AiPrivacy; title: string; desc: string }[] = [
  { id: "local_only", title: "Keep everything on this PC", desc: "Only the script helper and local models answer. Cloud providers can't be used." },
  { id: "ask_each_time", title: "Ask me before sending", desc: "Each cloud request shows exactly what's attached and waits for your OK." },
  { id: "allow_cloud", title: "Allow cloud without asking", desc: "Faster. You still see what's attached before you press Send." },
];

const TOOLS: { id: keyof ToolPerms; title: string; desc: string }[] = [
  { id: "settings", title: "Change settings", desc: "Volume, brightness, night light, theme." },
  { id: "windows", title: "Arrange windows", desc: "Focus, snap, tile, move between workspaces." },
  { id: "launch", title: "Open apps and files", desc: "Never deletes, moves or edits files." },
  { id: "titles", title: "Read window titles", desc: "For “what was I doing?”. Titles can contain private text." },
];

function kindLabel(p: AiProviderInfo) {
  if (p.kind === "script") return "Built in · no model, instant, offline";
  if (p.kind === "claude") return "Anthropic Claude · cloud · your API key";
  return isCloud(p) ? "Cloud" : "On this PC";
}

const timeAgo = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export const AiCard: React.FC<{ onTryIt?: () => void }> = ({ onTryIt }) => {
  const [status, setStatus] = useState<StatusExtra | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tools, setTools] = useState<ToolPerms>(DEFAULT_TOOLS);
  const [models, setModels] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [keyNote, setKeyNote] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { state: "running" | "ok" | "fail"; text: string }>>({});
  const [usage, setUsage] = useState<UsageEntry[]>(() => readUsage());
  const [showIntro, setShowIntro] = useState(false);
  const [showSee, setShowSee] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const testIds = useRef<Record<string, string>>({});

  const refresh = useCallback(() => {
    aiStatus()
      .then((s) => {
        setStatus(s as StatusExtra);
        setLoadError(false);
        if ((s as StatusExtra).tools) setTools({ ...DEFAULT_TOOLS, ...(s as StatusExtra).tools });
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    refresh();
    const un = listen<AiDone>(AI_EVENTS.done, (e) => {
      const entry = Object.entries(testIds.current).find(([, id]) => id === e.payload.id);
      if (!entry) return;
      const [pid] = entry;
      delete testIds.current[pid];
      setTests((t) => ({
        ...t,
        [pid]: e.payload.error
          ? { state: "fail", text: e.payload.error }
          : { state: "ok", text: `Working · ${e.payload.model || e.payload.provider}` },
      }));
    });
    return () => {
      un.then((f) => f());
    };
  }, [refresh]);

  const active = status?.providers.find((p) => p.id === status.active);
  const enabled = !!active && active.kind !== "off";
  const providers = (status?.providers ?? []).filter((p) => p.kind !== "off") as ProviderExtra[];
  const claude = providers.find((p) => p.kind === "claude");

  const push = async (patch: { active?: string; privacy?: AiPrivacy; tools?: ToolPerms; models?: Record<string, string> }) => {
    if (!status) return;
    const next = {
      active: patch.active ?? status.active,
      privacy: patch.privacy ?? status.privacy,
      tools: patch.tools ?? tools,
      models: { ...models, ...(patch.models ?? {}) },
    };
    setStatus({ ...status, active: next.active, privacy: next.privacy });
    await aiSetConfig(next).catch(() => {});
    refresh();
  };

  const setEnabled = (on: boolean) => {
    if (!status) return;
    if (on) {
      const first =
        providers.find((p) => p.available && !isCloud(p) && p.kind === "local") ??
        providers.find((p) => p.available && p.kind === "script") ??
        providers.find((p) => p.available);
      let seen = false;
      try {
        seen = localStorage.getItem(INTRO_KEY) === "1";
      } catch {
        /* ignore */
      }
      if (!seen) setShowIntro(true);
      push({ active: first?.id ?? status.active });
    } else {
      const off = status.providers.find((p) => p.kind === "off");
      push({ active: off?.id ?? "off" });
    }
  };

  const dismissIntro = () => {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const saveKey = async () => {
    if (!claude || !key.trim()) return;
    try {
      await aiSetSecret(claude.id, key.trim());
      setKey("");
      setKeyNote("Key saved");
      refresh();
    } catch (e) {
      setKeyNote(String(e));
    }
  };

  const removeKey = async () => {
    if (!claude) return;
    await aiClearSecret(claude.id).catch(() => {});
    setKeyNote("Key removed");
    refresh();
  };

  const test = async (p: AiProviderInfo) => {
    setTests((t) => ({ ...t, [p.id]: { state: "running", text: "Testing…" } }));
    try {
      const id = await aiAsk({ prompt: "Reply with the single word OK.", context: {}, provider: p.id, allow_tools: false });
      testIds.current[p.id] = id;
    } catch (e) {
      setTests((t) => ({ ...t, [p.id]: { state: "fail", text: String(e) } }));
    }
  };

  const toggle = (on: boolean, label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`cc-toggle ${on ? "on" : ""}`}
      onClick={onClick}
      style={disabled ? { opacity: 0.45 } : undefined}
    />
  );

  const totals = usageTotals(usage);

  return (
    <div className="cc-card ai-card-settings">
      <div className="cc-row">
        <div>
          <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} strokeWidth={2.4} aria-hidden="true" /> AI in Lens
          </div>
          <div className="cc-desc">
            Ask questions from the Dock and palette, summarise files and notifications, and let AI suggest actions you
            approve. Off until you turn it on.
          </div>
        </div>
        {toggle(enabled, "Use AI in Lens", () => setEnabled(!enabled), !status)}
      </div>

      {loadError && (
        <div className="cc-desc" role="alert">
          Lens couldn't reach its AI service. Restart Lens, then try again.{" "}
          <button type="button" className="cc-btn-ghost" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {showIntro && (
        <div className="ai-card" role="note">
          <Sparkles size={15} strokeWidth={2.3} aria-hidden="true" />
          <div>
            <div className="ai-card-title">AI is on</div>
            <div className="ai-card-text">
              Press Tab in Dock search to ask instead of search, type <strong>ai:</strong> in the palette, or drop a file on
              the sparkle. You always see what's attached before it's sent, and any action AI suggests waits for your
              Approve.
            </div>
            <div className="ai-card-actions">
              {onTryIt && (
                <button type="button" className="ai-btn ai-btn-primary" onClick={() => { dismissIntro(); onTryIt(); }}>
                  Try it
                </button>
              )}
              <button type="button" className="ai-btn" onClick={dismissIntro}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: enabled ? 1 : 0.55 }} aria-disabled={!enabled}>
        <div className="cc-row">
          <div className="cc-label">Who answers</div>
          <button type="button" className="cc-btn-ghost" onClick={refresh} aria-label="Look for local models again" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={12} strokeWidth={2.4} aria-hidden="true" /> Detect
          </button>
        </div>
        <div className="ai-prov-list" role="radiogroup" aria-label="AI provider">
          {providers.map((p) => {
            const sel = p.id === status?.active;
            const t = tests[p.id];
            const modelList = p.models?.length ? p.models : p.model ? [p.model] : [];
            return (
              <div key={p.id} className={`ai-prov ${sel ? "is-selected" : ""} ${p.available ? "" : "is-missing"}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  className="ai-prov-main"
                  disabled={!p.available || !enabled}
                  onClick={() => push({ active: p.id })}
                >
                  <span className={`ai-prov-dot ${p.available ? "on" : ""}`} aria-hidden="true" />
                  {isCloud(p) ? <Cloud size={14} strokeWidth={2.3} aria-hidden="true" /> : <Cpu size={14} strokeWidth={2.3} aria-hidden="true" />}
                  <span className="ai-prov-text">
                    <span className="ai-prov-name">{p.label}</span>
                    <span className="ai-prov-sub">
                      {p.available ? kindLabel(p) : p.kind === "local" ? "Not running · start Ollama or LM Studio, then Detect" : "Not available"}
                    </span>
                  </span>
                </button>
                {p.available && modelList.length > 0 && p.kind !== "script" && (
                  <select
                    className="cc-input ai-prov-model"
                    aria-label={`${p.label} model`}
                    value={models[p.id] ?? p.model}
                    disabled={!enabled}
                    onChange={(e) => {
                      setModels((m) => ({ ...m, [p.id]: e.target.value }));
                      push({ models: { [p.id]: e.target.value } });
                    }}
                  >
                    {modelList.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
                {p.available && (!p.needs_key || p.has_key) && (
                  <button type="button" className="cc-btn-ghost ai-prov-test" disabled={!enabled || t?.state === "running"} onClick={() => test(p)}>
                    Test
                  </button>
                )}
                {t && (
                  <span className={`ai-prov-result ${t.state}`} role="status">
                    {t.state === "ok" ? <Check size={12} strokeWidth={2.6} aria-hidden="true" /> : t.state === "fail" ? <X size={12} strokeWidth={2.6} aria-hidden="true" /> : null}
                    {t.text}
                  </span>
                )}
              </div>
            );
          })}
          {providers.length === 0 && <div className="cc-desc">Looking for AI providers…</div>}
        </div>
      </div>

      {claude && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: enabled ? 1 : 0.55 }}>
          <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <KeyRound size={13} strokeWidth={2.4} aria-hidden="true" /> Claude API key
          </div>
          {claude.has_key ? (
            <div className="cc-row">
              <div className="cc-desc" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Lock size={12} strokeWidth={2.4} aria-hidden="true" /> Key saved · stored encrypted on this PC, never shown again
              </div>
              <button type="button" className="cc-btn-ghost" onClick={removeKey} disabled={!enabled}>
                Remove key
              </button>
            </div>
          ) : (
            <>
              <div className="cc-row" style={{ gap: 8 }}>
                <input
                  className="cc-input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-ant-…"
                  aria-label="Claude API key"
                  value={key}
                  disabled={!enabled}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveKey()}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="cc-btn" onClick={saveKey} disabled={!enabled || !key.trim()}>
                  Save
                </button>
              </div>
              <div className="cc-desc">
                Stored encrypted on this PC (Windows DPAPI). Lens never logs or exports it.{" "}
                <button type="button" className="md-link" onClick={() => openExternal("https://console.anthropic.com/settings/keys")}>
                  Get a key <ExternalLink size={10} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>
            </>
          )}
          {keyNote && (
            <div className="cc-desc" role="status">
              {keyNote}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: enabled ? 1 : 0.55 }}>
        <div className="cc-label">Privacy</div>
        <div className="ai-choice-list" role="radiogroup" aria-label="Privacy">
          {PRIVACY.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={status?.privacy === o.id}
              className={`ai-choice ${status?.privacy === o.id ? "is-selected" : ""}`}
              disabled={!enabled}
              onClick={() => push({ privacy: o.id })}
            >
              <span className="ai-choice-radio" aria-hidden="true" />
              <span>
                <span className="ai-choice-title">{o.title}</span>
                <span className="ai-choice-desc">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, opacity: enabled ? 1 : 0.55 }}>
        <div className="cc-label">AI may suggest</div>
        <div className="cc-desc">Every suggestion waits for your Approve. Nothing runs on its own.</div>
        {TOOLS.map((t) => (
          <div key={t.id} className="cc-row" style={{ minHeight: 34 }}>
            <div>
              <div style={{ fontSize: 12.5, color: "var(--lens-fg-2)" }}>{t.title}</div>
              <div className="cc-desc">{t.desc}</div>
            </div>
            {toggle(tools[t.id], t.title, () => {
              const next = { ...tools, [t.id]: !tools[t.id] };
              setTools(next);
              push({ tools: next });
            }, !enabled)}
          </div>
        ))}
      </div>

      <div className="ai-disclosure">
        <button type="button" className="ai-disclosure-btn" aria-expanded={showSee} onClick={() => setShowSee((x) => !x)}>
          <Eye size={13} strokeWidth={2.4} aria-hidden="true" /> What can AI see?
        </button>
        {showSee && (
          <ul className="ai-see-list">
            <li>Only what you attach. Each request shows its attachments as chips you can remove before sending.</li>
            <li>Selection, clipboard and page text are read only when you start a request from them.</li>
            <li>Window titles are used only if “Read window titles” is on, and never sent to the cloud unless privacy allows it.</li>
            <li>Suggested apps learn from launches on this PC (app, hour, weekday). No AI model is involved and nothing is sent.</li>
            <li>Lens keeps a usage log below with times, providers and token counts. It never stores your questions or answers.</li>
          </ul>
        )}
      </div>

      <div className="ai-disclosure">
        <button type="button" className="ai-disclosure-btn" aria-expanded={showLog} onClick={() => { setUsage(readUsage()); setShowLog((x) => !x); }}>
          Usage · {totals.requests} request{totals.requests === 1 ? "" : "s"} · {totals.cloud} to the cloud
          {totals.tokens ? ` · ${totals.tokens.toLocaleString()} tokens` : ""}
        </button>
        {showLog && (
          <div className="ai-log">
            {usage.length === 0 ? (
              <div className="cc-desc">No requests yet.</div>
            ) : (
              usage.slice(0, 20).map((u, i) => (
                <div key={i} className="ai-log-row">
                  <span className={`ai-log-where ${u.cloud ? "cloud" : ""}`}>{u.cloud ? "Cloud" : "Local"}</span>
                  <span className="ai-log-model">{u.model || u.provider}</span>
                  <span className="ai-log-tokens">{u.input || u.output ? `${(u.input ?? 0) + (u.output ?? 0)} tok` : ""}</span>
                  <span className={`ai-log-ok ${u.ok ? "" : "fail"}`}>{u.ok ? "OK" : "Failed"}</span>
                  <span className="ai-log-when">{timeAgo(u.ts)}</span>
                </div>
              ))
            )}
            {usage.length > 0 && (
              <button type="button" className="cc-btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => { clearUsage(); setUsage([]); }}>
                Clear log
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
