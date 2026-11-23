//! Lens voice control: "Lens, minimise this".
//!
//! Pipeline: push-to-talk key (or the opt-in wake phrase) → microphone (WASAPI, 16 kHz mono) →
//! local speech recognition (whisper.cpp's whisper-server on 127.0.0.1) → `grammar::interpret`
//! (voice-only commands, then the shared script intent engine) → the AI tool registry with its
//! risk gating (confirm-risk commands wait for a spoken or clicked "yes"). Audio never leaves
//! the PC and is never stored. See docs/VOICE.md.
//!
//! Pure, unit-tested parts: `grammar`, `numbers`, `fuzzy`, `catalog`, `state`, `audio`,
//! `safety`, `undo`, `geometry`. Windows glue: `capture`, `winops`, `whisper`.

pub mod audio;
pub mod capture;
pub mod catalog;
pub mod config;
pub mod converse;
pub mod early;
pub mod fuzzy;
pub mod geometry;
pub mod grammar;
pub mod hold;
pub mod keyhold;
pub mod numbers;
pub mod safety;
pub mod state;
pub mod undo;
pub mod whisper;
pub mod winops;

use crate::ai::intent::ArgV;
use crate::ai::tools::{self, Risk, ToolHost};
use config::VoiceConfig;
use grammar::{Interpretation, VoiceCommand};
use serde::Serialize;
use serde_json::{json, Value};
use state::{Activation, Effect, Input, Machine, Phase, PttStyle};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub const EV_STATE: &str = "lens://voice/state";
pub const EV_LEVEL: &str = "lens://voice/level";
pub const EV_HEARD: &str = "lens://voice/heard";
pub const EV_RESULT: &str = "lens://voice/result";
pub const EV_APPLY: &str = "lens://voice/apply";
pub const EV_SPEECH: &str = "lens://voice/speech";

/// Longest utterance kept in memory (15 s).
const MAX_SAMPLES: usize = 16_000 * 15;

#[derive(Debug, Clone, Serialize)]
pub struct StateEvent {
    pub phase: &'static str,
    pub enabled: bool,
    pub muted: bool,
    pub listening: bool,
    pub by_ptt: bool,
    pub activation: String,
    pub paused_reason: Option<&'static str>,
    pub hud_position: String,
    pub sounds: bool,
    /// Conversation mode is on.
    pub conversation: bool,
    /// "off" | "panel" | "fullscreen"
    pub conversation_view: String,
    /// Lens is speaking an answer aloud.
    pub speaking: bool,
    /// The utterance is for Lens (push-to-talk, wake word heard, conversation, an answer):
    /// the Dock morphs only when this is true, so ignored speech never shows.
    pub armed: bool,
    /// A Dock is showing the voice UI (the floating HUD then stays out of the way).
    pub dock_ui: bool,
}

/// Progress of a spoken answer (conversation mode reveals words in sync).
#[derive(Debug, Clone, Serialize)]
pub struct SpeechEvent {
    pub id: u64,
    /// Index of the word being spoken (whitespace-separated words).
    pub word: usize,
    pub done: bool,
    /// Stopped early (barge-in, Stop, Esc).
    pub interrupted: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ResultEvent {
    /// "done" | "failed" | "confirm" | "suggest" | "refused" | "info" | "hint"
    pub status: &'static str,
    pub heard: String,
    pub command: Option<String>,
    pub label: String,
    pub message: String,
    pub confidence: f32,
    /// Label of the undo step, if the action can be undone.
    pub undo: Option<String>,
    pub suggestion: Option<String>,
    /// End of speech → action done, when measured (ms).
    pub latency_ms: Option<u64>,
    /// The command ran from the partial transcript, before the final pass.
    pub early: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct VoiceStatus {
    pub config: VoiceConfig,
    pub phase: &'static str,
    pub muted: bool,
    pub paused_reason: Option<&'static str>,
    pub engine_ready: bool,
    pub engine_error: Option<String>,
    pub hotkey_error: Option<String>,
    pub mic_error: Option<String>,
}

enum Pending {
    Tool { name: &'static str, args: Value, label: String },
    Command(Box<VoiceCommand>),
    ShelfClear,
    Chain(Vec<(&'static str, Value)>, String),
}

struct Inner {
    app: Option<AppHandle>,
    cfg: VoiceConfig,
    machine: Machine,
    capture_stop: Option<Arc<AtomicBool>>,
    utterance: Option<Vec<i16>>,
    preroll: audio::Ring,
    vad: audio::Vad,
    last_frame_ms: u64,
    last_level_ms: u64,
    last_partial_ms: u64,
    pending: Option<Pending>,
    undo: Vec<(Vec<undo::Step>, String)>,
    /// Latest partial reading of the current utterance, and the one before it.
    partial: Option<early::Candidate>,
    prev_key: Option<String>,
    partial_busy: bool,
    /// Sample index where speech was last heard in this utterance.
    last_loud: usize,
    heard_speech: bool,
    silence_ms: u64,
    /// When the current silence began (end of speech), for latency.
    speech_end_at: u64,
    early_fired: bool,
    /// The wake word was recognised in this utterance's partials.
    utt_woke: bool,
    dock_ui: bool,
    /// The current command was typed (no wake word or prefix needed).
    typed: bool,
    /// Bumped to drop stale recognitions and commands.
    generation: u64,
    paused_reason: Option<safety::PauseReason>,
    hotkeys: Vec<String>,
    hotkey_error: Option<String>,
    mic_error: Option<String>,
    mic_error_at: u64,
    engine_error: Option<String>,
    test_mic_until: u64,
    /// "Hey Lens" alone opens a short window where the next utterance needs no wake phrase.
    woke_until: u64,
    mic_restarts: u32,
    apps: (u64, Vec<String>),
    last_phase: Phase,
}

static START: OnceLock<Instant> = OnceLock::new();
static VOICE: OnceLock<Mutex<Inner>> = OnceLock::new();
static ENGINE: OnceLock<Mutex<Option<whisper::Server>>> = OnceLock::new();
static TICKER: OnceLock<()> = OnceLock::new();

fn now() -> u64 {
    START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn activation_of(cfg: &VoiceConfig) -> Activation {
    match cfg.activation.as_str() {
        "wake" => Activation::Wake,
        "both" => Activation::Both,
        _ => Activation::PushToTalk,
    }
}

fn style_of(cfg: &VoiceConfig) -> PttStyle {
    if cfg.ptt_style == "toggle" {
        PttStyle::Toggle
    } else {
        PttStyle::Hold
    }
}

fn voice() -> MutexGuard<'static, Inner> {
    VOICE
        .get_or_init(|| {
            let cfg = VoiceConfig::load();
            Mutex::new(Inner {
                app: None,
                machine: Machine::new(activation_of(&cfg), style_of(&cfg)),
                vad: audio::Vad::new(cfg.sensitivity),
                cfg,
                capture_stop: None,
                utterance: None,
                preroll: audio::Ring::new(16_000 * 3 / 10),
                last_frame_ms: 0,
                last_level_ms: 0,
                last_partial_ms: 0,
                pending: None,
                undo: Vec::new(),
                partial: None,
                prev_key: None,
                partial_busy: false,
                last_loud: 0,
                heard_speech: false,
                silence_ms: 0,
                speech_end_at: 0,
                early_fired: false,
                utt_woke: false,
                dock_ui: false,
                typed: false,
                generation: 0,
                paused_reason: None,
                hotkeys: Vec::new(),
                hotkey_error: None,
                mic_error: None,
                mic_error_at: 0,
                engine_error: None,
                test_mic_until: 0,
                woke_until: 0,
                mic_restarts: 0,
                apps: (0, Vec::new()),
                last_phase: Phase::Off,
            })
        })
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn engine() -> MutexGuard<'static, Option<whisper::Server>> {
    ENGINE.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner())
}

fn phase_name(p: Phase) -> &'static str {
    match p {
        Phase::Off => "off",
        Phase::Idle => "idle",
        Phase::Listening => "listening",
        Phase::Thinking => "thinking",
        Phase::Confirming => "confirming",
        Phase::Done => "done",
        Phase::Error => "error",
        Phase::Muted => "muted",
        Phase::Paused => "paused",
    }
}

fn state_event(v: &Inner) -> StateEvent {
    StateEvent {
        phase: phase_name(v.machine.phase),
        enabled: v.cfg.enabled,
        muted: v.machine.is_muted(),
        listening: v.capture_stop.is_some(),
        by_ptt: v.machine.by_ptt(),
        activation: v.cfg.activation.clone(),
        paused_reason: v.paused_reason.map(|r| r.label()),
        hud_position: v.cfg.hud_position.clone(),
        sounds: v.cfg.sounds,
        conversation: v.machine.in_conversation(),
        conversation_view: v.cfg.conversation.clone(),
        speaking: converse::is_speaking(),
        armed: v.machine.by_ptt() || v.utt_woke || v.machine.in_conversation() || v.machine.expects_answer(),
        dock_ui: v.dock_ui,
    }
}

fn emit<S: Serialize + Clone>(app: &Option<AppHandle>, event: &str, payload: S) {
    if let Some(a) = app {
        let _ = a.emit(event, payload);
    }
}

fn app() -> Option<AppHandle> {
    voice().app.clone()
}

fn result(mut ev: ResultEvent) {
    let (app, speak, tts_voice) = {
        let mut v = voice();
        if matches!(ev.status, "done" | "confirm") && v.speech_end_at > 0 {
            ev.latency_ms = Some(now().saturating_sub(v.speech_end_at));
            ev.early = v.early_fired;
            v.speech_end_at = 0;
        }
        (v.app.clone(), v.cfg.tts_enabled, v.cfg.tts_voice.clone())
    };
    // Read aloud only what the user needs to hear (questions, answers, refusals).
    if speak && (matches!(ev.status, "confirm" | "suggest" | "refused") || ev.command.as_deref() == Some("calculate")) {
        let text = if ev.status == "confirm" { format!("{} Say yes or no.", ev.label) } else { ev.message.clone() };
        std::thread::spawn(move || {
            let _ = winops::speak(&text, &tts_voice);
        });
    }
    emit(&app, EV_RESULT, ev);
}

// ---------------------------------------------------------------------------------------------
// Setup and configuration
// ---------------------------------------------------------------------------------------------

/// Called once at startup (and lazily by any voice command): remembers the app, registers the
/// hotkeys and starts the background ticker.
pub fn init(app: &AppHandle) {
    let first = {
        let mut v = voice();
        let first = v.app.is_none();
        if first {
            v.app = Some(app.clone());
        }
        first
    };
    if first {
        let cfg = voice().cfg.clone();
        let _ = apply(cfg, false);
    }
    TICKER.get_or_init(|| {
        let _ = std::thread::Builder::new().name("lens-voice-tick".into()).spawn(tick_loop);
    });
}

/// Applies (and optionally saves) a new configuration.
pub fn apply(cfg: VoiceConfig, save: bool) -> Result<(), String> {
    let cfg = cfg.sanitized();
    if save {
        cfg.save()?;
    }
    let (enabled_now, was_enabled, app) = {
        let mut v = voice();
        let was = v.cfg.enabled;
        v.cfg = cfg.clone();
        v.machine.activation = activation_of(&cfg);
        v.machine.style = style_of(&cfg);
        v.vad = audio::Vad::new(cfg.sensitivity);
        (cfg.enabled, was, v.app.clone())
    };
    if enabled_now && !was_enabled || enabled_now && voice().machine.phase == Phase::Off {
        feed(Input::Enable);
    } else if !enabled_now && was_enabled {
        feed(Input::Disable);
    }
    if let Some(app) = app {
        register_hotkeys(&app, &cfg);
    }
    if enabled_now {
        // Warm the recogniser so the first command is quick.
        std::thread::spawn(|| {
            let _ = ensure_engine();
        });
    } else {
        *engine() = None;
    }
    sync_capture();
    emit_state();
    Ok(())
}

fn register_hotkeys(app: &AppHandle, cfg: &VoiceConfig) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    let gs = app.global_shortcut();
    let old: Vec<String> = std::mem::take(&mut voice().hotkeys);
    for k in old {
        if let Ok(sc) = k.parse::<Shortcut>() {
            let _ = gs.unregister(sc);
        }
    }
    let mut registered = Vec::new();
    let mut errors = Vec::new();
    keyhold::stop();
    if cfg.enabled {
        if let Some(vk) = keyhold::single_key(&cfg.ptt_hotkey) {
            // Hold Right Ctrl / Right Alt: a keyboard hook (global shortcuts need a key).
            keyhold::start(vk, on_hold);
        } else if cfg.wants_ptt() || cfg.activation == "wake" {
            // Even in wake mode the key works, so there's always an explicit way in.
            match cfg.ptt_hotkey.parse::<Shortcut>() {
                Ok(sc) => match gs.on_shortcut(sc, |_app, _s, ev| {
                    if ev.state == ShortcutState::Pressed {
                        feed(Input::PttDown);
                    } else {
                        feed(Input::PttUp);
                    }
                }) {
                    Ok(()) => registered.push(cfg.ptt_hotkey.clone()),
                    Err(_) => errors.push(format!("{} is already used by another app or Lens feature.", cfg.ptt_hotkey)),
                },
                Err(_) => errors.push(format!("\"{}\" isn't a valid key combination.", cfg.ptt_hotkey)),
            }
        }
        if !cfg.mute_hotkey.is_empty() {
            match cfg.mute_hotkey.parse::<Shortcut>() {
                Ok(sc) => match gs.on_shortcut(sc, |_app, _s, ev| {
                    if ev.state == ShortcutState::Pressed {
                        let muted = voice().machine.is_muted();
                        set_muted(!muted);
                    }
                }) {
                    Ok(()) => registered.push(cfg.mute_hotkey.clone()),
                    Err(_) => errors.push(format!("{} is already used.", cfg.mute_hotkey)),
                },
                Err(_) => errors.push(format!("\"{}\" isn't a valid key combination.", cfg.mute_hotkey)),
            }
        }
    }
    let mut v = voice();
    v.hotkeys = registered;
    v.hotkey_error = if errors.is_empty() { None } else { Some(errors.join(" ")) };
}

/// Hold-to-talk decisions from the single-key hook (and the Dock button via `hold_button`).
fn on_hold(o: hold::HoldOut) {
    match o {
        hold::HoldOut::Start => feed(Input::PttDown),
        hold::HoldOut::Send => feed(Input::PttUp),
        hold::HoldOut::Cancel => feed(Input::Cancel),
        hold::HoldOut::Latched => {
            result(ResultEvent { status: "hint", label: "Hands-free".into(), message: "Listening hands-free. Tap again to send.".into(), ..Default::default() });
        }
    }
}

/// The Dock / Mini shows the voice UI (`true`) or not; the floating HUD steps aside for it.
pub fn set_dock_ui(active: bool) {
    voice().dock_ui = active;
    emit_state();
}

pub fn status() -> VoiceStatus {
    // The recogniser may be busy with an utterance; busy counts as ready.
    let engine_ready = match ENGINE.get_or_init(|| Mutex::new(None)).try_lock() {
        Ok(mut e) => e.as_mut().map(|s| s.alive()).unwrap_or(false),
        Err(_) => true,
    };
    let v = voice();
    VoiceStatus {
        config: v.cfg.clone(),
        phase: phase_name(v.machine.phase),
        muted: v.machine.is_muted(),
        paused_reason: v.paused_reason.map(|r| r.label()),
        engine_ready,
        engine_error: v.engine_error.clone(),
        hotkey_error: v.hotkey_error.clone(),
        mic_error: v.mic_error.clone(),
    }
}

fn emit_state() {
    let (app, ev) = {
        let mut v = voice();
        v.last_phase = v.machine.phase;
        (v.app.clone(), state_event(&v))
    };
    emit(&app, EV_STATE, ev);
}

// ---------------------------------------------------------------------------------------------
// The state machine driver
// ---------------------------------------------------------------------------------------------

/// Feeds one input to the state machine and performs the effects.
pub fn feed(input: Input) {
    let (effects, changed) = {
        let mut v = voice();
        let t = now();
        let fx = v.machine.step(input, t);
        let changed = v.machine.phase != v.last_phase;
        (fx, changed)
    };
    for fx in effects {
        perform(fx);
    }
    sync_capture();
    if changed {
        emit_state();
    }
}

fn perform(fx: Effect) {
    match fx {
        Effect::StartCapture => {
            let mut v = voice();
            let pre = v.preroll.take();
            v.utterance = Some(pre);
            v.last_partial_ms = now();
            v.partial = None;
            v.prev_key = None;
            v.last_loud = 0;
            v.heard_speech = false;
            v.silence_ms = 0;
            v.speech_end_at = 0;
            v.early_fired = false;
            v.utt_woke = false;
            v.typed = false;
        }
        Effect::StopAndRecognise => {
            let (samples, generation, ready) = {
                let mut v = voice();
                v.generation += 1;
                if v.speech_end_at == 0 {
                    v.speech_end_at = now();
                }
                // A partial that already covers everything said is as good as a final pass.
                let ready = v
                    .partial
                    .as_ref()
                    .filter(|c| v.heard_speech && c.covered >= v.last_loud && !c.interp.heard.is_empty())
                    .map(|c| c.interp.heard.clone());
                (v.utterance.take().unwrap_or_default(), v.generation, ready)
            };
            match ready {
                Some(text) => {
                    emit(&app(), EV_HEARD, json!({ "text": text, "partial": false }));
                    feed(Input::Transcript(text));
                }
                None => {
                    std::thread::spawn(move || recognise(samples, generation));
                }
            }
        }
        Effect::StopAndDiscard => {
            voice().utterance = None;
        }
        Effect::Interpret(text) => {
            let generation = voice().generation;
            std::thread::spawn(move || handle_text(&text, generation));
        }
        Effect::AbortWork => {
            voice().generation += 1;
        }
        Effect::Approve => {
            let pending = voice().pending.take();
            if let Some(p) = pending {
                std::thread::spawn(move || run_pending(p));
            } else {
                feed(Input::ActionDone);
            }
        }
        Effect::Deny => {
            if voice().pending.take().is_some() {
                result(ResultEvent { status: "info", label: "Cancelled".into(), message: "Cancelled.".into(), ..Default::default() });
            }
        }
        Effect::HintMuted => {
            let key = voice().cfg.mute_hotkey.clone();
            result(ResultEvent {
                status: "hint",
                label: "Voice is muted".into(),
                message: format!("Voice is muted. Press {} to unmute.", key),
                ..Default::default()
            });
        }
        Effect::HintTooShort => result(ResultEvent {
            status: "hint",
            label: "Hold the key while you speak".into(),
            message: "Hold the key while you speak, then let go.".into(),
            ..Default::default()
        }),
    }
}

/// Starts or stops the microphone to match what the state needs: the wake listener, an
/// utterance, a spoken yes/no, or the settings mic test. Nothing else keeps the mic open.
fn sync_capture() {
    let mut v = voice();
    let t = now();
    let wake = (v.cfg.wants_wake() && !v.machine.is_paused() || v.machine.in_conversation()) && !v.machine.is_muted();
    let answer = v.cfg.enabled && v.cfg.confirm_by_voice && v.machine.expects_answer() && !v.machine.is_muted();
    let need = v.cfg.enabled && (wake || answer || v.utterance.is_some()) || v.test_mic_until > t;
    // After a microphone error, wait before trying again (no tight retry loop).
    let backoff = v.mic_error.is_some() && t.saturating_sub(v.mic_error_at) < 5_000;
    if need && v.capture_stop.is_none() && !backoff {
        let stop = Arc::new(AtomicBool::new(false));
        v.capture_stop = Some(stop.clone());
        v.last_frame_ms = t;
        v.vad.recalibrate();
        let mic = v.cfg.mic_id.clone();
        let _ = std::thread::Builder::new().name("lens-voice-mic".into()).spawn(move || {
            let r = capture::run(&mic, &stop, &mut |f: &[i16]| on_frame(f));
            if let Err(e) = r {
                on_capture_error(&stop, e);
            }
        });
    } else if !need {
        if let Some(stop) = v.capture_stop.take() {
            stop.store(true, Ordering::Relaxed);
        }
    }
}

fn on_capture_error(stop: &Arc<AtomicBool>, e: String) {
    {
        let mut v = voice();
        // Only clear if this is still the active capture.
        if v.capture_stop.as_ref().map(|s| Arc::ptr_eq(s, stop)).unwrap_or(false) {
            v.capture_stop = None;
        }
        v.mic_error = Some(e.clone());
        v.mic_error_at = now();
    }
    result(ResultEvent { status: "failed", label: "Microphone".into(), message: e, ..Default::default() });
    feed(Input::Cancel);
}

fn on_frame(frame: &[i16]) {
    let db = audio::dbfs(frame);
    let mut inputs = Vec::new();
    let mut barge_in = false;
    let level = {
        let mut v = voice();
        let t = now();
        v.last_frame_ms = t;
        v.mic_error = None;
        v.mic_restarts = 0;
        let show_level = v.utterance.is_some() || v.test_mic_until > t;
        if let Some(u) = v.utterance.as_mut() {
            if u.len() < MAX_SAMPLES {
                u.extend_from_slice(frame);
            }
            let len = u.len();
            if v.vad.loud(db) {
                v.heard_speech = true;
                v.last_loud = len;
                v.silence_ms = 0;
                v.speech_end_at = 0;
            } else if v.heard_speech {
                if v.silence_ms == 0 {
                    v.speech_end_at = t;
                }
                v.silence_ms += 20;
            }
        } else {
            v.preroll.push(frame);
        }
        let listening_for_speech = ((v.cfg.wants_wake() && !v.machine.is_paused() || v.machine.in_conversation()) && !v.machine.is_muted())
            || v.machine.expects_answer();
        if listening_for_speech {
            // While Lens speaks, its own voice reaches the mic: only clearly louder speech
            // barges in.
            let speaking = converse::is_speaking();
            match v.vad.push(if speaking { db - 8.0 } else { db }) {
                Some(audio::VadEvent::SpeechStart) => {
                    barge_in = speaking;
                    inputs.push(Input::SpeechStart)
                }
                Some(audio::VadEvent::SpeechEnd) => inputs.push(Input::SpeechEnd),
                None => {}
            }
        }
        if show_level && t.saturating_sub(v.last_level_ms) >= 50 {
            v.last_level_ms = t;
            Some((v.app.clone(), audio::meter(db)))
        } else {
            None
        }
    };
    if let Some((app, level)) = level {
        emit(&app, EV_LEVEL, json!({ "level": level }));
    }
    maybe_fire_early();
    if barge_in {
        // Barge-in: the user talks over the answer, so stop speaking and listen.
        stop_speaking();
    }
    for i in inputs {
        feed(i);
    }
}

// ---------------------------------------------------------------------------------------------
// Recognition
// ---------------------------------------------------------------------------------------------

fn ensure_engine() -> Result<(), String> {
    let (server, model, threads, lang) = {
        let v = voice();
        (v.cfg.whisper_server_path.clone(), v.cfg.whisper_model_path.clone(), v.cfg.threads, v.cfg.language.clone())
    };
    let mut e = engine();
    if let Some(s) = e.as_mut() {
        if s.alive() {
            return Ok(());
        }
    }
    *e = None;
    match whisper::Server::start(&server, &model, threads, &lang) {
        Ok(s) => {
            *e = Some(s);
            voice().engine_error = None;
            Ok(())
        }
        Err(err) => {
            voice().engine_error = Some(err.clone());
            Err(err)
        }
    }
}

fn transcribe(samples: &[i16]) -> Result<String, String> {
    if samples.len() < 16_000 * 3 / 10 {
        return Ok(String::new()); // < 300 ms: nothing said
    }
    ensure_engine()?;
    let wav = audio::wav(samples, audio::SAMPLE_RATE);
    let e = engine();
    let s = e.as_ref().ok_or("Speech recognition isn't running.")?;
    s.transcribe(&wav, whisper::BIAS)
}

fn recognise(samples: Vec<i16>, generation: u64) {
    let started = Instant::now();
    let r = transcribe(&samples);
    if voice().generation != generation {
        return; // cancelled or superseded
    }
    match r {
        Ok(text) => {
            emit(&app(), EV_HEARD, json!({ "text": text, "partial": false, "ms": started.elapsed().as_millis() as u64 }));
            if text.trim().is_empty() && voice().machine.by_ptt() {
                result(ResultEvent {
                    status: "failed",
                    label: "Didn't catch that".into(),
                    message: "Didn't catch that. Try again, or say \"Lens, help\".".into(),
                    ..Default::default()
                });
            }
            feed(Input::Transcript(text));
        }
        Err(e) => {
            result(ResultEvent { status: "failed", label: "Speech recognition".into(), message: e, ..Default::default() });
            feed(Input::Transcript(String::new()));
        }
    }
}

/// Live words while a push-to-talk utterance is still going (only when the recogniser is free).
/// Streaming: re-recognises the utterance so far (at most the last 6 s) every ~350 ms while
/// the user talks, shows the live words, wakes the Dock when "Lens" is heard, and lets safe
/// commands fire the moment speech ends. Runs only when the recogniser is free.
fn partial_transcript(samples: Vec<i16>, covered: usize, generation: u64) {
    let window = &samples[samples.len().saturating_sub(16_000 * 6)..];
    let wav = audio::wav(window, audio::SAMPLE_RATE);
    let text = {
        let Some(Ok(guard)) = ENGINE.get().map(|m| m.try_lock()) else {
            voice().partial_busy = false;
            return;
        };
        let r = guard.as_ref().map(|s| s.transcribe(&wav, whisper::BIAS));
        drop(guard);
        match r {
            Some(Ok(t)) => t,
            _ => {
                voice().partial_busy = false;
                return;
            }
        }
    };
    let opts = options_for_next();
    let interp = grammar::interpret(&text, &opts);
    let key = interp.command.as_ref().and_then(early::intent_key);
    let (app, armed_now, show, ignore) = {
        let mut v = voice();
        v.partial_busy = false;
        if v.generation != generation || v.utterance.is_none() {
            return;
        }
        let was = v.utt_woke;
        if interp.woke && opts.require_wake && !interp.heard.is_empty() {
            v.utt_woke = true;
        }
        // Wake mode: three words in and no "Lens" → not for us; drop it silently.
        let ignore = opts.require_wake && !interp.woke && text.split_whitespace().count() >= 3;
        let armed = v.machine.by_ptt() || v.utt_woke || v.machine.in_conversation() || v.machine.expects_answer();
        v.prev_key = v.partial.as_ref().and_then(|c| c.key.clone());
        v.partial = Some(early::Candidate { interp, key, covered });
        (v.app.clone(), !was && v.utt_woke, armed && !text.trim().is_empty(), ignore)
    };
    if ignore {
        feed(Input::Cancel);
        return;
    }
    if armed_now {
        emit_state();
    }
    if show {
        emit(&app, EV_HEARD, json!({ "text": text, "partial": true }));
    }
    maybe_fire_early();
}

fn risk3(r: &crate::ai::intent::RawIntent) -> early::Risk3 {
    match tools::tool_for_intent(r).map(|(t, _)| tools::risk_of(t)) {
        Some(Risk::Low) => early::Risk3::Low,
        Some(Risk::Confirm) => early::Risk3::Confirm,
        _ => early::Risk3::Blocked,
    }
}

/// Fires a safe, complete command from the partial transcript once speech has ended.
fn maybe_fire_early() {
    let text = {
        let mut v = voice();
        if v.early_fired || v.machine.phase != Phase::Listening || v.machine.expects_answer() {
            return;
        }
        let decision = v.partial.as_ref().and_then(|c| {
            let ok = early::can_fire(c, v.prev_key.as_deref(), v.last_loud, v.silence_ms, &risk3)
                && c.interp.command.as_ref().map(|cmd| !v.cfg.disabled_commands.iter().any(|d| d == cmd.id())).unwrap_or(false);
            ok.then(|| c.interp.heard.clone())
        });
        let Some(text) = decision else { return };
        v.early_fired = true;
        text
    };
    feed(Input::EarlyFire(text));
}

// ---------------------------------------------------------------------------------------------
// Interpreting and running commands
// ---------------------------------------------------------------------------------------------

fn app_names() -> Vec<String> {
    {
        let v = voice();
        if now().saturating_sub(v.apps.0) < 60_000 && !v.apps.1.is_empty() {
            return v.apps.1.clone();
        }
    }
    let mut names: Vec<String> = crate::sys_telemetry::scan_start_menu_apps().into_iter().map(|a| a.name).collect();
    for w in crate::win_windows::list_running_windows() {
        names.push(w.process_name.trim_end_matches(".exe").to_string());
    }
    names.sort();
    names.dedup();
    names.truncate(2000);
    voice().apps = (now(), names.clone());
    names
}

fn options_for_next() -> grammar::Options {
    let (cfg, by_ptt, expecting, woke_until, typed) = {
        let v = voice();
        (v.cfg.clone(), v.machine.by_ptt(), v.machine.expects_answer(), v.woke_until, v.typed)
    };
    let conversation = voice().machine.in_conversation();
    let require_wake = (cfg.wants_wake() && !by_ptt || by_ptt && cfg.require_prefix) && !expecting && !conversation && !typed && now() > woke_until;
    grammar::Options {
        wake_phrases: cfg.wake_phrases(),
        require_wake,
        aliases: cfg.aliases.iter().map(|a| (a.phrase.clone(), a.means.clone())).collect(),
        app_names: app_names(),
        asr_confidence: 1.0,
    }
}

fn handle_text(text: &str, generation: u64) {
    let opts = options_for_next();
    let interp = grammar::interpret(text, &opts);
    if voice().generation != generation {
        return;
    }
    decide(interp, generation);
}

fn decide(i: Interpretation, generation: u64) {
    let heard = i.heard.clone();
    let Some(cmd) = i.command.clone() else {
        if !i.woke {
            feed(Input::Cancel); // not for Lens
            return;
        }
        if heard.is_empty() || i.confidence >= 1.0 {
            // "Hey Lens" on its own: listen for the command without the wake phrase.
            voice().woke_until = now() + 6_000;
            result(ResultEvent { status: "info", heard, label: "Listening…".into(), message: "I'm listening.".into(), ..Default::default() });
            feed(Input::Cancel);
            return;
        }
        if let Some(s) = i.suggestion.clone() {
            let again = grammar::interpret(&s, &grammar::Options { app_names: Vec::new(), ..options_for_next() });
            if let Some(c) = again.command {
                voice().pending = Some(Pending::Command(Box::new(c)));
                result(ResultEvent {
                    status: "suggest",
                    heard,
                    label: format!("Did you mean \"{}\"?", s),
                    message: format!("Did you mean \"{}\"?", s),
                    suggestion: Some(s),
                    ..Default::default()
                });
                feed(Input::NeedsConfirm);
                return;
            }
        }
        result(ResultEvent {
            status: "failed",
            heard,
            label: "Didn't catch that".into(),
            message: "I didn't understand that. Say \"Lens, help\" to see what you can say.".into(),
            ..Default::default()
        });
        feed(Input::ActionFailed);
        return;
    };

    // Answers are handled even below the confidence threshold ("yeah" vs "yes").
    if let VoiceCommand::Confirm(yes) = cmd {
        if voice().machine.is_confirming() {
            feed(Input::Answer(yes));
        } else {
            feed(Input::Cancel);
        }
        return;
    }

    if i.confidence < grammar::MIN_CONFIDENCE {
        let label = cmd.label();
        voice().pending = Some(Pending::Command(Box::new(cmd)));
        result(ResultEvent {
            status: "suggest",
            heard,
            label: format!("Did you mean \"{}\"?", label),
            message: format!("Did you mean \"{}\"?", label),
            suggestion: Some(label),
            confidence: i.confidence,
            ..Default::default()
        });
        feed(Input::NeedsConfirm);
        return;
    }

    let ids: Vec<String> = match &cmd {
        VoiceCommand::Chain(list) => list.iter().map(|r| catalog::id_for_action(r.action).to_string()).collect(),
        other => vec![other.id().to_string()],
    };
    if voice().cfg.disabled_commands.iter().any(|d| ids.contains(d)) {
        result(ResultEvent {
            status: "refused",
            heard,
            command: Some(cmd.id().to_string()),
            label: cmd.label(),
            message: "That voice command is turned off in Voice settings.".into(),
            ..Default::default()
        });
        feed(Input::ActionFailed);
        return;
    }
    if voice().generation != generation {
        return;
    }
    execute(cmd, heard, i.confidence);
}

fn apply_ui(action: &str, args: Value) {
    emit(&app(), EV_APPLY, json!({ "action": action, "args": args }));
}

fn done(heard: String, cmd: &VoiceCommand, confidence: f32, message: String, undo: Option<String>) {
    result(ResultEvent {
        status: "done",
        heard,
        command: Some(cmd.id().to_string()),
        label: cmd.label(),
        message,
        confidence,
        undo,
        ..Default::default()
    });
    feed(Input::ActionDone);
}

fn refused(heard: String, cmd: &VoiceCommand, message: String) {
    result(ResultEvent { status: "refused", heard, command: Some(cmd.id().to_string()), label: cmd.label(), message, ..Default::default() });
    feed(Input::ActionFailed);
}

fn failed(heard: String, cmd: &VoiceCommand, message: String) {
    result(ResultEvent { status: "failed", heard, command: Some(cmd.id().to_string()), label: cmd.label(), message, ..Default::default() });
    feed(Input::ActionFailed);
}

fn execute(cmd: VoiceCommand, heard: String, confidence: f32) {
    match &cmd {
        VoiceCommand::Confirm(_) => {}
        VoiceCommand::Undo => match run_undo() {
            Ok(msg) => done(heard, &cmd, confidence, msg, None),
            Err(e) => failed(heard, &cmd, e),
        },
        VoiceCommand::StopListening => {
            let key = voice().cfg.mute_hotkey.clone();
            set_muted(true);
            result(ResultEvent {
                status: "info",
                heard,
                command: Some(cmd.id().to_string()),
                label: "Voice muted".into(),
                message: format!("Voice is muted. Press {} to turn it back on.", key),
                ..Default::default()
            });
        }
        VoiceCommand::Help => {
            apply_ui("help", json!({}));
            done(heard, &cmd, confidence, "Here's what you can say.".into(), None);
        }
        VoiceCommand::ShelfOpen => {
            apply_ui("shelf_open", json!({}));
            done(heard, &cmd, confidence, "Opened the Shelf.".into(), None);
        }
        VoiceCommand::ShelfAddSelection => {
            apply_ui("shelf_add_selection", json!({}));
            done(heard, &cmd, confidence, "Adding the selection to the Shelf.".into(), None);
        }
        VoiceCommand::ShelfClear => {
            voice().pending = Some(Pending::ShelfClear);
            result(ResultEvent {
                status: "confirm",
                heard,
                command: Some(cmd.id().to_string()),
                label: "Clear the Shelf?".into(),
                message: "Clear everything on the Shelf?".into(),
                confidence,
                ..Default::default()
            });
            feed(Input::NeedsConfirm);
        }
        VoiceCommand::Summarize(t) => {
            let target = match t {
                grammar::Target::Page => "page",
                grammar::Target::Selection => "selection",
                grammar::Target::Auto => "auto",
            };
            apply_ui("summarize", json!({ "target": target }));
            done(heard, &cmd, confidence, "Summarising in Lens Command.".into(), None);
        }
        VoiceCommand::Ask(q) => {
            // With a conversation view, spoken questions open it (and follow-ups need no wake).
            let view = voice().cfg.conversation.clone();
            let converse = view != "off";
            if converse && !voice().machine.in_conversation() {
                set_conversation(true);
            }
            apply_ui("ask", json!({ "text": q, "conversation": converse }));
            done(heard, &cmd, confidence, if converse { "Thinking…".into() } else { "Asking in Lens Command.".into() }, None);
        }
        VoiceCommand::Converse(on) => {
            set_conversation(*on);
            apply_ui("conversation", json!({ "open": on }));
            done(heard, &cmd, confidence, if *on { "I'm listening.".into() } else { "Conversation ended.".into() }, None);
        }
        VoiceCommand::ReadBack => {
            apply_ui("read_back", json!({}));
            done(heard, &cmd, confidence, "Reading the last answer.".into(), None);
        }
        VoiceCommand::Dictate(_) | VoiceCommand::PasteLastClip => {
            if !voice().cfg.allow_typing {
                refused(heard, &cmd, "Typing by voice is turned off in Voice settings.".into());
                return;
            }
            let target = winops::focused_target();
            if let Err(r) = safety::dictation_allowed(&target) {
                refused(heard, &cmd, r.message().into());
                return;
            }
            let r = match &cmd {
                VoiceCommand::Dictate(text) => winops::type_text(text),
                _ => winops::paste(),
            };
            match r {
                Ok(()) => done(heard, &cmd, confidence, if matches!(cmd, VoiceCommand::Dictate(_)) { "Typed.".into() } else { "Pasted.".into() }, None),
                Err(e) => failed(heard, &cmd, e),
            }
        }
        VoiceCommand::Chain(list) => {
            let mut calls: Vec<(&'static str, Value)> = Vec::new();
            for raw in list {
                let Some((tool, args)) = tools::tool_for_intent(raw) else {
                    failed(heard, &cmd, format!("\"{}\" can't be part of a chain.", raw.summary));
                    return;
                };
                match tools::validate(tool, &args) {
                    Ok(a) => calls.push((tool, a)),
                    Err(e) => {
                        failed(heard, &cmd, e);
                        return;
                    }
                }
            }
            if calls.iter().any(|(t, _)| tools::risk_of(t) == Risk::Blocked) {
                refused(heard, &cmd, "Lens doesn't allow one of those.".into());
                return;
            }
            let label = cmd.label();
            if calls.iter().any(|(t, _)| tools::risk_of(t) == Risk::Confirm) {
                voice().pending = Some(Pending::Chain(calls, label.clone()));
                result(ResultEvent {
                    status: "confirm",
                    heard,
                    command: Some("chain".into()),
                    label: format!("{}?", label),
                    message: format!("{}? Say yes or no.", label),
                    confidence,
                    ..Default::default()
                });
                feed(Input::NeedsConfirm);
                return;
            }
            match run_chain(&calls) {
                Ok((msg, undo)) => done(heard, &cmd, confidence, msg, undo),
                Err(e) => failed(heard, &cmd, e),
            }
        }
        VoiceCommand::Intent(raw) => {
            let Some((tool, args)) = tools::tool_for_intent(raw) else {
                // Maths and conversions answer in words.
                done(heard, &cmd, confidence, raw.summary.clone(), None);
                return;
            };
            let args = match tools::validate(tool, &args) {
                Ok(a) => a,
                Err(e) => {
                    failed(heard, &cmd, e);
                    return;
                }
            };
            match tools::risk_of(tool) {
                Risk::Blocked => refused(heard, &cmd, "Lens doesn't allow that.".into()),
                Risk::Confirm => {
                    let label = tools::describe(tool, &args);
                    voice().pending = Some(Pending::Tool { name: tool, args, label: label.clone() });
                    result(ResultEvent {
                        status: "confirm",
                        heard,
                        command: Some(cmd.id().to_string()),
                        label: format!("{}?", label),
                        message: format!("{}? Say yes or no.", label),
                        confidence,
                        ..Default::default()
                    });
                    feed(Input::NeedsConfirm);
                }
                Risk::Low => match run_tool(tool, &args) {
                    Ok((msg, undo)) => done(heard, &cmd, confidence, msg, undo),
                    Err(e) => failed(heard, &cmd, e),
                },
            }
        }
    }
}

fn run_pending(p: Pending) {
    match p {
        Pending::Tool { name, args, label } => {
            let cmd_id = name.to_string();
            match run_tool(name, &args) {
                Ok((msg, undo)) => {
                    result(ResultEvent { status: "done", command: Some(cmd_id), label, message: msg, undo, ..Default::default() });
                    feed(Input::ActionDone);
                }
                Err(e) => {
                    result(ResultEvent { status: "failed", command: Some(cmd_id), label, message: e, ..Default::default() });
                    feed(Input::ActionFailed);
                }
            }
        }
        Pending::ShelfClear => {
            apply_ui("shelf_clear", json!({}));
            result(ResultEvent {
                status: "done",
                command: Some("shelf_clear".into()),
                label: "Clear the Shelf".into(),
                message: "Cleared the Shelf.".into(),
                ..Default::default()
            });
            feed(Input::ActionDone);
        }
        Pending::Command(cmd) => execute(*cmd, String::new(), 1.0),
        Pending::Chain(calls, label) => match run_chain(&calls) {
            Ok((msg, undo)) => {
                result(ResultEvent { status: "done", command: Some("chain".into()), label, message: msg, undo, ..Default::default() });
                feed(Input::ActionDone);
            }
            Err(e) => {
                result(ResultEvent { status: "failed", command: Some("chain".into()), label, message: e, ..Default::default() });
                feed(Input::ActionFailed);
            }
        },
    }
}

const ARG_KEYS: &[&str] = &["action", "name", "slot", "level", "delta", "muted", "enabled", "mode", "id", "color", "style", "target"];

fn argv(args: &Value) -> Vec<(&'static str, ArgV)> {
    ARG_KEYS
        .iter()
        .filter_map(|k| {
            let v = args.get(*k)?;
            Some((
                *k,
                match v {
                    Value::String(s) => ArgV::S(s.clone()),
                    Value::Bool(b) => ArgV::B(*b),
                    Value::Number(n) => ArgV::N(n.as_f64().unwrap_or(0.0)),
                    _ => return None,
                },
            ))
        })
        .collect()
}

fn snapshot(tool: &str, args: &Value) -> undo::Snapshot {
    let mut s = undo::Snapshot::default();
    match tool {
        "set_volume" | "set_mute" | "set_brightness" | "set_night_light" => {
            let q = crate::win_quick_settings::get_quick_settings_state();
            s.volume = Some(q.volume);
            s.muted = Some(q.muted);
            s.brightness = Some(q.brightness);
            s.night_light = Some(q.night_light_enabled);
        }
        "set_dnd" => s.dnd = Some(crate::win_notifications::is_dnd()),
        "set_theme_pack" | "set_accent" => {
            if let Some(app) = app() {
                let cfg = app.state::<crate::AppState>().config.lock().unwrap_or_else(|e| e.into_inner()).theme.clone();
                s.theme_pack = Some(cfg.preset.clone()).filter(|p| !p.is_empty());
                if cfg.accent_mode == "custom" && cfg.custom_accent.len() == 7 {
                    s.accent = Some(cfg.custom_accent.to_lowercase());
                }
            }
        }
        "switch_workspace" => {
            let w = crate::win_workspaces::get_workspace_status();
            if w.enabled {
                s.workspace = Some((w.active + 1).to_string());
            }
        }
        "window_action" | "snap_window" => {
            let name = args.get("name").and_then(Value::as_str).unwrap_or("focused");
            if let Ok(h) = winops::resolve_window(name) {
                let (min, max, top) = winops::window_state(h);
                s.hwnd = Some(h);
                s.minimized = Some(min);
                s.maximized = Some(max);
                s.topmost = Some(top);
            }
        }
        _ => {}
    }
    s
}

/// Runs a validated registry tool (same host the AI and MCP use); returns its undo step.
fn run_tool_raw(tool: &'static str, args: &Value) -> Result<(String, Option<undo::Step>), String> {
    let app = app().ok_or("Lens isn't ready yet.")?;
    let snap = snapshot(tool, args);
    let host = tools::lens::LensToolHost { app };
    let msg = host.run(tool, args)?;
    Ok((msg, undo::inverse(tool, &argv(args), &snap)))
}

fn push_undo(steps: Vec<undo::Step>, label: String) {
    if steps.is_empty() {
        return;
    }
    let mut v = voice();
    v.undo.push((steps, label));
    if v.undo.len() > 5 {
        v.undo.remove(0);
    }
}

fn run_tool(tool: &'static str, args: &Value) -> Result<(String, Option<String>), String> {
    let (msg, step) = run_tool_raw(tool, args)?;
    let label = step.as_ref().map(|s| s.label());
    if let (Some(step), Some(l)) = (step, label.clone()) {
        push_undo(vec![step], l);
    }
    Ok((msg, label))
}

/// Runs a chain in order; one undo puts all of it back. Stops at the first failure.
fn run_chain(calls: &[(&'static str, Value)]) -> Result<(String, Option<String>), String> {
    let mut steps = Vec::new();
    let mut msgs = Vec::new();
    for (tool, args) in calls {
        let (msg, step) = run_tool_raw(tool, args)?;
        msgs.push(msg);
        if let Some(s) = step {
            steps.push(s);
        }
    }
    let label = if steps.is_empty() { None } else { Some(if steps.len() == 1 { steps[0].label() } else { format!("Undo all {} changes", steps.len()) }) };
    if let Some(l) = label.clone() {
        push_undo(steps, l);
    }
    Ok((msgs.join(" "), label))
}

fn run_undo() -> Result<String, String> {
    let (steps, label) = voice().undo.pop().ok_or("Nothing to undo.")?;
    for step in steps.into_iter().rev() {
        run_undo_step(step)?;
    }
    Ok(format!("Undone: {}.", label.to_lowercase()))
}

fn run_undo_step(step: undo::Step) -> Result<(), String> {
    match step {
        undo::Step::Window(hwnd, action) => winops::window_action(hwnd, action)?,
        undo::Step::Tool(tool, args) => {
            let mut m = serde_json::Map::new();
            for (k, v) in args {
                m.insert(
                    k.to_string(),
                    match v {
                        ArgV::S(s) => Value::String(s),
                        ArgV::B(b) => Value::Bool(b),
                        ArgV::N(n) => json!(n as i64),
                    },
                );
            }
            let args = tools::validate(tool, &Value::Object(m))?;
            let app = app().ok_or("Lens isn't ready yet.")?;
            tools::lens::LensToolHost { app }.run(tool, &args)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Public controls (commands, Dock mic, HUD)
// ---------------------------------------------------------------------------------------------

pub fn set_muted(muted: bool) {
    feed(if muted { Input::Mute } else { Input::Unmute });
    emit_state();
}

/// Runs a typed command through the same pipeline (HUD text box, settings "Try it").
pub fn run_typed(text: &str) -> Result<(), String> {
    let text: String = text.chars().take(400).collect();
    if text.trim().is_empty() {
        return Err("Type a command.".into());
    }
    if voice().machine.phase == Phase::Off {
        // Typed commands work even with the microphone side switched off.
        let mut i = grammar::interpret(&text, &grammar::Options { require_wake: false, ..options_for_next() });
        i.woke = true;
        if let Some(cmd) = i.command.clone() {
            if i.confidence >= grammar::MIN_CONFIDENCE {
                std::thread::spawn(move || execute(cmd, i.heard.clone(), i.confidence));
                return Ok(());
            }
        }
        return Err(i.suggestion.map(|s| format!("Did you mean \"{}\"?", s)).unwrap_or_else(|| "Lens didn't understand that.".into()));
    }
    voice().typed = true;
    feed(Input::Typed);
    feed(Input::Transcript(text));
    Ok(())
}

/// Conversation mode on/off. Off also stops any spoken answer.
pub fn set_conversation(on: bool) {
    if !on {
        stop_speaking();
    }
    feed(Input::Converse(on));
    sync_capture();
    emit_state();
}

/// Speaks an answer, emitting word progress for the conversation view.
pub fn speak_answer(text: &str) -> Result<u64, String> {
    let voice_name = voice().cfg.tts_voice.clone();
    let owned = text.to_string();
    let cb: Arc<dyn Fn(u64, converse::Progress) + Send + Sync> = Arc::new(move |id, p| {
        let ev = match p {
            converse::Progress::Started => {
                emit_state();
                SpeechEvent { id, word: 0, done: false, interrupted: false }
            }
            converse::Progress::Word(pos) => SpeechEvent { id, word: converse::word_index(&owned, pos), done: false, interrupted: false },
            converse::Progress::Done => SpeechEvent { id, word: usize::MAX, done: true, interrupted: false },
        };
        let finished = ev.done;
        emit(&app(), EV_SPEECH, ev);
        if finished {
            emit_state();
        }
    });
    converse::speak(text, &voice_name, cb)
}

/// Stops the spoken answer (Stop button, Esc, barge-in).
pub fn stop_speaking() {
    if converse::stop() {
        emit(&app(), EV_SPEECH, SpeechEvent { id: 0, word: 0, done: true, interrupted: true });
        emit_state();
    }
}

pub fn answer(yes: bool) {
    feed(Input::Answer(yes));
}

pub fn cancel() {
    feed(Input::Cancel);
}

pub fn undo_last() -> Result<String, String> {
    run_undo()
}

pub fn test_mic(on: bool) {
    voice().test_mic_until = if on { now() + 8_000 } else { 0 };
    sync_capture();
}

pub fn shutdown() {
    converse::stop();
    {
        let mut v = voice();
        if let Some(stop) = v.capture_stop.take() {
            stop.store(true, Ordering::Relaxed);
        }
    }
    keyhold::stop();
    if let Ok(mut e) = ENGINE.get_or_init(|| Mutex::new(None)).try_lock() {
        *e = None;
    }
}

// ---------------------------------------------------------------------------------------------
// Background: timeouts, auto-pause, watchdog, live words
// ---------------------------------------------------------------------------------------------

fn tick_loop() {
    let mut last_env = 0u64;
    loop {
        std::thread::sleep(Duration::from_millis(100));
        let t = now();
        let enabled = voice().cfg.enabled;
        if !enabled {
            continue;
        }
        feed(Input::Tick);

        // Auto-pause always-listening (locked, fullscreen, games, calls, mic busy).
        if t.saturating_sub(last_env) >= 1_000 {
            last_env = t;
            let (wants_wake, meetings, fullscreen) = {
                let v = voice();
                (v.cfg.wants_wake(), v.cfg.pause_in_meetings, v.cfg.pause_in_fullscreen)
            };
            let env = winops::env();
            let reason = if wants_wake { safety::wake_pause_reason(&env, meetings, fullscreen) } else { safety::ptt_allowed(&env).err() };
            let changed = {
                let mut v = voice();
                let changed = v.paused_reason != reason;
                v.paused_reason = reason;
                changed
            };
            if changed {
                feed(if reason.is_some() { Input::Pause } else { Input::Resume });
                emit_state();
            }
        }

        // Watchdog: restart a microphone that stopped delivering audio.
        let stalled = {
            let v = voice();
            v.capture_stop.is_some() && t.saturating_sub(v.last_frame_ms) > 2_000
        };
        if stalled {
            let give_up = {
                let mut v = voice();
                if let Some(stop) = v.capture_stop.take() {
                    stop.store(true, Ordering::Relaxed);
                }
                v.mic_restarts += 1;
                v.mic_restarts > 3
            };
            if give_up {
                voice().mic_error = Some("The microphone stopped responding.".into());
                feed(Input::Cancel);
            } else {
                sync_capture();
            }
        }

        // Streaming partials (live words, wake detection, early fire).
        let partial = {
            let mut v = voice();
            let enough = v.utterance.as_ref().map(|u| u.len() >= 16_000 / 2).unwrap_or(false);
            if enough && !v.partial_busy && v.machine.phase == Phase::Listening && t.saturating_sub(v.last_partial_ms) >= 350 {
                v.last_partial_ms = t;
                v.partial_busy = true;
                v.utterance.clone().map(|u| {
                    let covered = u.len();
                    (u, covered, v.generation)
                })
            } else {
                None
            }
        };
        if let Some((samples, covered, generation)) = partial {
            std::thread::spawn(move || partial_transcript(samples, covered, generation));
        }

        // Re-sync the microphone (retries after an error back-off).
        if t % 1_000 < 100 {
            sync_capture();
        }

        // Settings mic test ends on its own.
        let test_over = {
            let mut v = voice();
            let over = v.test_mic_until != 0 && t > v.test_mic_until;
            if over {
                v.test_mic_until = 0;
            }
            over
        };
        if test_over {
            sync_capture();
        }
    }
}

/// The command catalog for help and settings.
pub fn catalog_json() -> Value {
    Value::Array(
        catalog::COMMANDS
            .iter()
            .map(|c| json!({ "id": c.id, "group": c.group, "title": c.title, "examples": c.examples, "risk": c.risk }))
            .collect(),
    )
}

#[cfg(test)]
mod bench {
    //! End-to-end latency on real hardware (Windows, whisper.cpp installed). Run with:
    //!   set LENS_WHISPER_SERVER=C:\\…\\whisper-server.exe
    //!   set LENS_WHISPER_MODEL=C:\\…\\ggml-base.en.bin
    //!   set LENS_VOICE_FIXTURES=C:\\…\\fixtures   (WAVs from scripts/voice/make-fixtures.ps1)
    //!   cargo test --lib voice::bench -- --ignored --nocapture
    //! Each fixture is named after its expected command id, e.g. "window_action--minimise-this.wav".
    use super::*;

    #[test]
    #[ignore]
    fn end_of_speech_to_action() {
        let (Ok(server), Ok(model), Ok(dir)) =
            (std::env::var("LENS_WHISPER_SERVER"), std::env::var("LENS_WHISPER_MODEL"), std::env::var("LENS_VOICE_FIXTURES"))
        else {
            eprintln!("set LENS_WHISPER_SERVER, LENS_WHISPER_MODEL and LENS_VOICE_FIXTURES");
            return;
        };
        let srv = whisper::Server::start(&server, &model, 4, "en").expect("whisper-server");
        let mut times = Vec::new();
        let mut wrong = Vec::new();
        let opts = grammar::Options { wake_phrases: vec!["hey lens".into(), "lens".into()], ..Default::default() };
        for entry in std::fs::read_dir(&dir).expect("fixtures dir").flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("wav") {
                continue;
            }
            let want = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").split("--").next().unwrap_or("").to_string();
            let (_, samples) = audio::read_wav(&std::fs::read(&path).unwrap()).expect("16-bit mono WAV");
            let t0 = Instant::now();
            let text = srv.transcribe(&audio::wav(&samples, audio::SAMPLE_RATE), whisper::BIAS).unwrap_or_default();
            let i = grammar::interpret(&text, &opts);
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            times.push(ms);
            let got = i.command.as_ref().map(|c| c.id().to_string()).unwrap_or_default();
            if got != want {
                wrong.push(format!("{:?}: heard {:?} → {:?}", path.file_name().unwrap_or_default(), text, got));
            }
        }
        assert!(!times.is_empty(), "no fixtures found");
        times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let p = |q: f64| times[((times.len() as f64 - 1.0) * q).round() as usize];
        eprintln!("fixtures: {}  p50: {:.0} ms  p95: {:.0} ms  max: {:.0} ms  misrecognised: {}", times.len(), p(0.5), p(0.95), p(1.0), wrong.len());
        for w in &wrong {
            eprintln!("  {}", w);
        }
        assert!(p(0.95) < 400.0, "p95 {:.0} ms is over the 400 ms budget", p(0.95));
    }

    /// Streaming: partials every 350 ms of audio; how long after the end of speech does a safe
    /// command fire from a partial (early fire), versus waiting for a final pass?
    #[test]
    #[ignore]
    fn partial_to_action() {
        let (Ok(server), Ok(model), Ok(dir)) =
            (std::env::var("LENS_WHISPER_SERVER"), std::env::var("LENS_WHISPER_MODEL"), std::env::var("LENS_VOICE_FIXTURES"))
        else {
            eprintln!("set LENS_WHISPER_SERVER, LENS_WHISPER_MODEL and LENS_VOICE_FIXTURES");
            return;
        };
        let srv = whisper::Server::start(&server, &model, 4, "en").expect("whisper-server");
        let opts = grammar::Options { wake_phrases: vec!["hey lens".into(), "lens".into()], ..Default::default() };
        let risk = |r: &crate::ai::intent::RawIntent| match tools::tool_for_intent(r).map(|(t, _)| tools::risk_of(t)) {
            Some(Risk::Low) => early::Risk3::Low,
            Some(Risk::Confirm) => early::Risk3::Confirm,
            _ => early::Risk3::Blocked,
        };
        let (mut early_ms, mut final_ms, mut fired, mut total) = (Vec::new(), Vec::new(), 0, 0);
        for entry in std::fs::read_dir(&dir).expect("fixtures dir").flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("wav") {
                continue;
            }
            let (_, mut samples) = audio::read_wav(&std::fs::read(&path).unwrap()).expect("16-bit mono WAV");
            samples.extend(std::iter::repeat(0).take(16_000 / 2)); // 500 ms of silence after speech
            // Where speech ends (energy VAD, as at runtime).
            let mut vad = audio::Vad::new(0.5);
            let mut last_loud = 0;
            for (i, f) in samples.chunks(audio::FRAME).enumerate() {
                let db = audio::dbfs(f);
                if vad.loud(db) {
                    last_loud = (i + 1) * audio::FRAME;
                }
                vad.push(db);
            }
            total += 1;
            let mut prev: Option<String> = None;
            let mut done = false;
            let mut end = 16_000 / 2;
            while end <= samples.len() && !done {
                let t0 = Instant::now();
                let text = srv.transcribe(&audio::wav(&samples[..end], audio::SAMPLE_RATE), whisper::BIAS).unwrap_or_default();
                let infer_ms = t0.elapsed().as_secs_f64() * 1000.0;
                let interp = grammar::interpret(&text, &opts);
                let key = interp.command.as_ref().and_then(early::intent_key);
                let silence_ms = (end.saturating_sub(last_loud) as u64 * 1000) / 16_000;
                let cand = early::Candidate { interp, key: key.clone(), covered: end };
                if early::can_fire(&cand, prev.as_deref(), last_loud, silence_ms, &risk) {
                    // Audio time from end of speech to this partial, plus recognising it.
                    early_ms.push(((end - last_loud) as f64 * 1000.0 / 16_000.0) + infer_ms);
                    fired += 1;
                    done = true;
                }
                prev = key;
                end += 16_000 * 35 / 100;
            }
            // The non-streaming path: wait for 700 ms of silence, then one final pass.
            let t0 = Instant::now();
            let _ = srv.transcribe(&audio::wav(&samples[..last_loud.min(samples.len())], audio::SAMPLE_RATE), whisper::BIAS);
            final_ms.push(700.0 + t0.elapsed().as_secs_f64() * 1000.0);
        }
        let pct = |v: &mut Vec<f64>, q: f64| {
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            if v.is_empty() { f64::NAN } else { v[((v.len() as f64 - 1.0) * q).round() as usize] }
        };
        eprintln!(
            "early fire: {}/{} fixtures · p50 {:.0} ms · p95 {:.0} ms after end of speech  |  final-pass path: p50 {:.0} ms · p95 {:.0} ms",
            fired, total, pct(&mut early_ms, 0.5), pct(&mut early_ms, 0.95), pct(&mut final_ms, 0.5), pct(&mut final_ms, 0.95)
        );
        assert!(early_ms.is_empty() || pct(&mut early_ms, 0.95) < 700.0);
    }
}
