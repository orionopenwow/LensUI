// Settings › Voice: turn voice on, choose how it listens, the keys, the microphone, the local
// speech engine, privacy, read-aloud, which commands are allowed and your own phrases.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Mic, Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_VOICE_CONFIG,
  SINGLE_HOLD_KEYS,
  VOICE_EVENTS,
  VOICE_GROUPS,
  prettyKeys,
  validHotkey,
  voiceCommands,
  voiceListMics,
  voiceListTtsVoices,
  voiceRunText,
  voiceSetConfig,
  voiceStatus,
  voiceTestMic,
  type VoiceCommandInfo,
  type VoiceConfig,
  type VoiceMic,
  type VoiceResultEvent,
  type VoiceStatus,
} from "../voice/contract";
import { filterCommands } from "../voice/hudState";
import "./VoiceCard.css";
import { fillStyle } from "../ui/motion";

const LANGS: [string, string][] = [
  ["en", "English"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["fr", "Français"],
  ["it", "Italiano"],
  ["pt", "Português"],
  ["nl", "Nederlands"],
  ["auto", "Detect automatically"],
];

const Toggle: React.FC<{ on: boolean; label: string; onChange: (v: boolean) => void }> = ({ on, label, onChange }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
);

const Row: React.FC<{ label: string; desc?: React.ReactNode; children?: React.ReactNode }> = ({ label, desc, children }) => (
  <div className="cc-row lvc-row">
    <div className="lvc-row-text">
      <div className="cc-label">{label}</div>
      {desc && <div className="cc-desc">{desc}</div>}
    </div>
    {children}
  </div>
);

export interface VoiceCardProps {
  /** For the parity gallery: start with this status instead of asking the backend. */
  initialStatus?: VoiceStatus;
}

export function VoiceCard({ initialStatus }: VoiceCardProps) {
  const [status, setStatus] = useState<VoiceStatus | null>(initialStatus ?? null);
  const [cfg, setCfg] = useState<VoiceConfig>(initialStatus?.config ?? DEFAULT_VOICE_CONFIG);
  const [mics, setMics] = useState<VoiceMic[]>([]);
  const [voices, setVoices] = useState<string[]>([]);
  const [commands, setCommands] = useState<VoiceCommandInfo[]>([]);
  const [query, setQuery] = useState("");
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [tryText, setTryText] = useState("");
  const [tryResult, setTryResult] = useState<string>("");
  const [wakeExplainer, setWakeExplainer] = useState(false);
  const [draft, setDraft] = useState({ phrase: "", means: "" });
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!initialStatus)
      voiceStatus()
        .then((s) => {
          setStatus(s);
          setCfg(s.config);
        })
        .catch(() => {});
    voiceCommands()
      .then((c) => setCommands(Array.isArray(c) ? c : []))
      .catch(() => {});
    voiceListMics()
      .then((m) => setMics(Array.isArray(m) ? m : []))
      .catch(() => {});
    const un = [
      listen<{ level: number }>(VOICE_EVENTS.level, (e) => setLevel(e.payload.level)),
      listen<VoiceResultEvent>(VOICE_EVENTS.result, (e) => setTryResult(`${e.payload.label}${e.payload.message && e.payload.message !== e.payload.label ? ` — ${e.payload.message}` : ""}`)),
    ];
    return () => {
      un.forEach((u) => u.then((f) => f()).catch(() => {}));
      voiceTestMic(false).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cfg.tts_enabled && voices.length === 0)
      voiceListTtsVoices()
        .then((v) => setVoices(Array.isArray(v) ? v : []))
        .catch(() => {});
  }, [cfg.tts_enabled, voices.length]);

  const save = (patch: Partial<VoiceConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      voiceSetConfig(next)
        .then(setStatus)
        .catch(() => {});
    }, 250);
  };

  const setActivation = (a: string) => {
    if ((a === "wake" || a === "both") && cfg.activation === "ptt") {
      setWakeExplainer(true);
      return;
    }
    save({ activation: a });
  };

  const shown = useMemo(() => filterCommands(commands, query), [commands, query]);
  const disabled = new Set(cfg.disabled_commands);
  const pttValid = validHotkey(cfg.ptt_hotkey);
  const muteValid = cfg.mute_hotkey === "" || validHotkey(cfg.mute_hotkey);
  const engineSet = cfg.whisper_server_path.trim() !== "" && cfg.whisper_model_path.trim() !== "";

  return (
    <div className="cc-card lvc">
      <Row
        label="Voice control"
        desc={
          <>
            Say “Lens, minimise this”. Speech is recognised on this PC with whisper.cpp; audio is never saved or sent anywhere.
          </>
        }
      >
        <Toggle on={cfg.enabled} label="Voice control" onChange={(v) => save({ enabled: v })} />
      </Row>

      {status?.hotkey_error && <div className="lvc-note warn">{status.hotkey_error}</div>}
      {status?.mic_error && <div className="lvc-note warn">{status.mic_error}</div>}

      <div className="lvc-section">
        <div className="lvc-section-title">How Lens listens</div>
        <div className="cc-chip-grid" role="radiogroup" aria-label="How Lens listens">
          {[
            ["ptt", "Push-to-talk"],
            ["wake", "Wake phrase"],
            ["both", "Both"],
          ].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={cfg.activation === id} className={`cc-chip ${cfg.activation === id ? "active" : ""}`} onClick={() => setActivation(id)}>
              {label}
            </button>
          ))}
        </div>
        {wakeExplainer && (
          <div className="lvc-explainer" role="alertdialog" aria-label="Always listening">
            <div className="cc-label">Always listening</div>
            <p>
              With a wake phrase, the microphone stays on and Windows shows its microphone icon. Lens only reacts to speech that starts with “{cfg.wake_phrase}”. Everything is
              recognised on this PC and nothing is recorded. Listening pauses while the PC is locked, in fullscreen apps and games, and during calls.
            </p>
            <div className="lvc-actions">
              <button
                type="button"
                className="cc-btn"
                onClick={() => {
                  setWakeExplainer(false);
                  save({ activation: "both" });
                }}
              >
                Turn on wake phrase
              </button>
              <button type="button" className="cc-btn-ghost" onClick={() => setWakeExplainer(false)}>
                Keep push-to-talk
              </button>
            </div>
          </div>
        )}

        <Row
          label="Hold to talk"
          desc={pttValid ? `Hold ${prettyKeys(cfg.ptt_hotkey)} while you speak, or hold the mic at the end of the Dock. Double-tap for hands-free.` : "Use modifiers plus one key, like Ctrl+Alt+V."}
        >
          <div className="lvc-inline">
            <div className="cc-chip-grid" role="radiogroup" aria-label="Hold-to-talk key">
              {Object.entries(SINGLE_HOLD_KEYS).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={cfg.ptt_hotkey === id} className={`cc-chip ${cfg.ptt_hotkey === id ? "active" : ""}`} onClick={() => save({ ptt_hotkey: id })}>
                  {label}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={!SINGLE_HOLD_KEYS[cfg.ptt_hotkey]}
                className={`cc-chip ${!SINGLE_HOLD_KEYS[cfg.ptt_hotkey] ? "active" : ""}`}
                onClick={() => !SINGLE_HOLD_KEYS[cfg.ptt_hotkey] || save({ ptt_hotkey: "Ctrl+Alt+V" })}
              >
                Shortcut
              </button>
            </div>
            {!SINGLE_HOLD_KEYS[cfg.ptt_hotkey] && (
              <input className={`cc-input lvc-key ${pttValid ? "" : "invalid"}`} aria-label="Hold-to-talk shortcut" value={cfg.ptt_hotkey} onChange={(e) => save({ ptt_hotkey: e.target.value })} />
            )}
          </div>
        </Row>
        <Row label="Press twice instead of holding" desc="First press starts listening, second press sends.">
          <Toggle on={cfg.ptt_style === "toggle"} label="Press twice instead of holding" onChange={(v) => save({ ptt_style: v ? "toggle" : "hold" })} />
        </Row>
        <Row label="Require “Lens” first" desc={cfg.activation === "ptt" ? "Only act on commands that start with “Lens…”, even while holding the key." : "Always on with a wake phrase: speech that doesn't start with “Lens” is ignored."}>
          <Toggle on={cfg.activation !== "ptt" || cfg.require_prefix} label="Require Lens first" onChange={(v) => cfg.activation === "ptt" && save({ require_prefix: v })} />
        </Row>
        <Row label="Mute key" desc="Turns voice off and on from anywhere.">
          <input className={`cc-input lvc-key ${muteValid ? "" : "invalid"}`} aria-label="Mute key" value={cfg.mute_hotkey} onChange={(e) => save({ mute_hotkey: e.target.value })} />
        </Row>
        {cfg.activation !== "ptt" && (
          <>
            <Row label="Wake phrase" desc="Say it before a command. “Lens” on its own works too.">
              <input className="cc-input lvc-key" aria-label="Wake phrase" value={cfg.wake_phrase} onChange={(e) => save({ wake_phrase: e.target.value })} />
            </Row>
            <Row label="Sensitivity" desc="Higher picks up quieter speech; lower ignores more background noise.">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Sensitivity"
                className="lvc-range"
                value={Math.round(cfg.sensitivity * 100)}
                onChange={(e) => save({ sensitivity: Number(e.target.value) / 100 })}
              />
            </Row>
          </>
        )}
      </div>

      <div className="lvc-section">
        <div className="lvc-section-title">Microphone and speech</div>
        <Row label="Microphone">
          <div className="lvc-inline">
            <select className="cc-input lvc-select" aria-label="Microphone" value={cfg.mic_id} onChange={(e) => save({ mic_id: e.target.value })}>
              <option value="">Windows default</option>
              {mics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="cc-btn-ghost lvc-test"
              aria-pressed={testing}
              onClick={() => {
                const on = !testing;
                setTesting(on);
                setLevel(0);
                voiceTestMic(on).catch(() => {});
                if (on) window.setTimeout(() => setTesting(false), 8000);
              }}
            >
              <Mic size={13} /> {testing ? "Testing…" : "Test"}
            </button>
          </div>
        </Row>
        {testing && (
          <div className="lvc-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
            <span style={fillStyle(level)} />
          </div>
        )}
        <Row label="Language">
          <select className="cc-input lvc-select" aria-label="Language" value={cfg.language} onChange={(e) => save({ language: e.target.value })}>
            {LANGS.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Row>
        <Row
          label="Speech engine"
          desc={
            status?.engine_ready
              ? "Ready: whisper.cpp is running on this PC."
              : status?.engine_error
                ? status.engine_error
                : engineSet
                  ? "Starts when voice is on."
                  : "Uses whisper.cpp. Choose whisper-server.exe and a model; ggml-base.en.bin is a good start."
          }
        >
          <span className={`lvc-dot ${status?.engine_ready ? "ok" : status?.engine_error ? "bad" : ""}`} aria-hidden="true" />
        </Row>
        <div className="lvc-paths">
          <input
            className="cc-input"
            aria-label="whisper-server.exe path"
            placeholder={"C:\\Tools\\whisper.cpp\\whisper-server.exe"}
            value={cfg.whisper_server_path}
            onChange={(e) => save({ whisper_server_path: e.target.value })}
          />
          <input
            className="cc-input"
            aria-label="Model file path"
            placeholder={"C:\\Tools\\whisper.cpp\\models\\ggml-base.en.bin"}
            value={cfg.whisper_model_path}
            onChange={(e) => save({ whisper_model_path: e.target.value })}
          />
        </div>
      </div>

      <div className="lvc-section">
        <div className="lvc-section-title">Privacy and safety</div>
        <Row label="Pause during calls" desc="Stops always-listening while Teams, Zoom, Discord and other call apps are in front, or another app uses the mic.">
          <Toggle on={cfg.pause_in_meetings} label="Pause during calls" onChange={(v) => save({ pause_in_meetings: v })} />
        </Row>
        <Row label="Pause in fullscreen" desc="Games and fullscreen video. Push-to-talk still works.">
          <Toggle on={cfg.pause_in_fullscreen} label="Pause in fullscreen" onChange={(v) => save({ pause_in_fullscreen: v })} />
        </Row>
        <Row label="Answer by voice" desc="Say “yes” or “no” when Lens asks before closing an app or locking.">
          <Toggle on={cfg.confirm_by_voice} label="Answer by voice" onChange={(v) => save({ confirm_by_voice: v })} />
        </Row>
        <Row label="Typing by voice" desc="“Type …” and “paste the last clip”. Never into password fields, sign-in windows or admin apps.">
          <Toggle on={cfg.allow_typing} label="Typing by voice" onChange={(v) => save({ allow_typing: v })} />
        </Row>
        <div className="lvc-note">Speech stays on this PC. Lens has no cloud speech option, and recordings are never kept.</div>
      </div>

      <div className="lvc-section">
        <div className="lvc-section-title">Feedback</div>
        <Row label="Sounds" desc="A short tone when listening starts and stops.">
          <Toggle on={cfg.sounds} label="Sounds" onChange={(v) => save({ sounds: v })} />
        </Row>
        <Row label="Read answers aloud" desc="Questions, results and refusals, with a Windows voice.">
          <Toggle on={cfg.tts_enabled} label="Read answers aloud" onChange={(v) => save({ tts_enabled: v })} />
        </Row>
        {cfg.tts_enabled && (
          <Row label="Voice">
            <select className="cc-input lvc-select" aria-label="Reading voice" value={cfg.tts_voice} onChange={(e) => save({ tts_voice: e.target.value })}>
              <option value="">Windows default</option>
              {voices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Row>
        )}
        <Row label="Conversation view" desc="Questions you ask out loud open a spoken Q&A view. Say “let's talk” to start one, “that's all” or Esc to close.">
          <div className="cc-chip-grid">
            {[
              ["off", "Off"],
              ["panel", "Panel"],
              ["fullscreen", "Full screen"],
            ].map(([id, label]) => (
              <button key={id} type="button" className={`cc-chip ${cfg.conversation === id ? "active" : ""}`} onClick={() => save({ conversation: id })}>
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Where the voice card appears">
          <div className="cc-chip-grid">
            {[
              ["dock", "Above the Dock"],
              ["top", "Under the Top Bar"],
            ].map(([id, label]) => (
              <button key={id} type="button" className={`cc-chip ${cfg.hud_position === id ? "active" : ""}`} onClick={() => save({ hud_position: id })}>
                {label}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <div className="lvc-section">
        <div className="lvc-section-title">Try a command</div>
        <form
          className="lvc-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tryText.trim()) return;
            setTryResult("…");
            voiceRunText(tryText).catch((err) => setTryResult(String(err)));
          }}
        >
          <input className="cc-input lvc-grow" aria-label="Type a voice command" placeholder="minimise this" value={tryText} onChange={(e) => setTryText(e.target.value)} />
          <button type="submit" className="cc-btn">
            Run
          </button>
        </form>
        {tryResult && <div className="cc-desc lvc-try-result">{tryResult}</div>}
      </div>

      <div className="lvc-section">
        <div className="lvc-section-title">Commands</div>
        <input className="cc-input lvc-grow" aria-label="Search voice commands" placeholder="Search commands" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="lvc-commands">
          {VOICE_GROUPS.map((g) => {
            const items = shown.filter((c) => c.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="lvc-group">
                <div className="lvc-group-title">{g}</div>
                {items.map((c) => (
                  <div key={c.id} className="lvc-cmd">
                    <div className="lvc-cmd-text">
                      <div className="lvc-cmd-title">
                        {c.title}
                        {c.risk === "confirm" && <span className="lvc-tag">Asks first</span>}
                        {c.risk === "guarded" && <span className="lvc-tag">Safe fields only</span>}
                      </div>
                      <div className="cc-desc">“{c.examples.slice(0, 2).join("”, “")}”</div>
                    </div>
                    <Toggle
                      on={!disabled.has(c.id)}
                      label={c.title}
                      onChange={(on) => save({ disabled_commands: on ? cfg.disabled_commands.filter((d) => d !== c.id) : [...cfg.disabled_commands, c.id] })}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="lvc-section">
        <div className="lvc-section-title">Your phrases</div>
        <div className="cc-desc">Teach Lens your own words: “lights out” → “dark mode”.</div>
        {cfg.aliases.map((a, i) => (
          <div key={`${a.phrase}-${i}`} className="lvc-alias">
            <span className="lvc-alias-say">“{a.phrase}”</span>
            <span className="lvc-alias-arrow">→</span>
            <span className="lvc-alias-means">{a.means}</span>
            <button type="button" className="cc-btn-ghost" aria-label={`Remove ${a.phrase}`} onClick={() => save({ aliases: cfg.aliases.filter((_, j) => j !== i) })}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <form
          className="lvc-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.phrase.trim() || !draft.means.trim()) return;
            save({ aliases: [...cfg.aliases, { phrase: draft.phrase.trim(), means: draft.means.trim() }] });
            setDraft({ phrase: "", means: "" });
          }}
        >
          <input className="cc-input lvc-grow" aria-label="When I say" placeholder="When I say…" value={draft.phrase} onChange={(e) => setDraft({ ...draft, phrase: e.target.value })} />
          <input className="cc-input lvc-grow" aria-label="Do this" placeholder="…do this (a command)" value={draft.means} onChange={(e) => setDraft({ ...draft, means: e.target.value })} />
          <button type="submit" className="cc-btn-ghost" aria-label="Add phrase">
            <Plus size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
