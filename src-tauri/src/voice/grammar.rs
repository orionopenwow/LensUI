//! Transcript → voice command. Voice-only commands (dictation, paste, Shelf, ask, help, yes/no,
//! undo) are recognised here; everything else goes through the shared script intent engine
//! (`crate::ai::intent`), so voice, the palette and AI tools share one grammar and one set of
//! risk rules. Standard library only (plus the intent engine, which is also std-only).

use super::{catalog, fuzzy, numbers};
use crate::ai::intent::{self, ArgV, RawIntent};

#[derive(Debug, Clone, PartialEq)]
pub enum Target {
    Page,
    Selection,
    Auto,
}

#[derive(Debug, Clone, PartialEq)]
pub enum VoiceCommand {
    /// A script intent; runs through the AI tool registry and its risk gating.
    Intent(RawIntent),
    /// "type …": types the words into the focused field (guarded).
    Dictate(String),
    PasteLastClip,
    ShelfAddSelection,
    ShelfOpen,
    ShelfClear,
    Summarize(Target),
    Ask(String),
    ReadBack,
    Help,
    Confirm(bool),
    Undo,
    StopListening,
}

impl VoiceCommand {
    /// Catalog id (for per-command enable switches and the HUD chip).
    pub fn id(&self) -> &str {
        match self {
            VoiceCommand::Intent(i) => catalog::id_for_action(i.action),
            VoiceCommand::Dictate(_) => "dictate",
            VoiceCommand::PasteLastClip => "paste_last_clip",
            VoiceCommand::ShelfAddSelection => "shelf_add",
            VoiceCommand::ShelfOpen => "shelf_open",
            VoiceCommand::ShelfClear => "shelf_clear",
            VoiceCommand::Summarize(_) => "summarize",
            VoiceCommand::Ask(_) => "ask",
            VoiceCommand::ReadBack => "read_back",
            VoiceCommand::Help => "help",
            VoiceCommand::Confirm(_) => "confirm",
            VoiceCommand::Undo => "undo",
            VoiceCommand::StopListening => "stop_listening",
        }
    }

    /// Short label for the HUD chip ("Minimise · Chrome").
    pub fn label(&self) -> String {
        match self {
            VoiceCommand::Intent(i) => i.summary.clone(),
            VoiceCommand::Dictate(t) => {
                let shown: String = t.chars().take(32).collect();
                format!("Type · \"{}{}\"", shown, if t.chars().count() > 32 { "…" } else { "" })
            }
            VoiceCommand::PasteLastClip => "Paste the last clip".into(),
            VoiceCommand::ShelfAddSelection => "Add the selection to the Shelf".into(),
            VoiceCommand::ShelfOpen => "Open the Shelf".into(),
            VoiceCommand::ShelfClear => "Clear the Shelf".into(),
            VoiceCommand::Summarize(Target::Page) => "Summarise this page".into(),
            VoiceCommand::Summarize(Target::Selection) => "Summarise the selection".into(),
            VoiceCommand::Summarize(Target::Auto) => "Summarise".into(),
            VoiceCommand::Ask(q) => {
                let shown: String = q.chars().take(40).collect();
                format!("Ask · {}", shown)
            }
            VoiceCommand::ReadBack => "Read that back".into(),
            VoiceCommand::Help => "Voice commands".into(),
            VoiceCommand::Confirm(true) => "Yes".into(),
            VoiceCommand::Confirm(false) => "No".into(),
            VoiceCommand::Undo => "Undo".into(),
            VoiceCommand::StopListening => "Stop listening".into(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Options {
    /// Wake phrases, e.g. ["hey lens", "lens"].
    pub wake_phrases: Vec<String>,
    /// Wake-word mode: ignore anything that doesn't start with a wake phrase.
    pub require_wake: bool,
    /// User phrases: (spoken, what it means), e.g. ("lights out", "dark mode").
    pub aliases: Vec<(String, String)>,
    /// Installed and running app names, for ASR-tolerant matching.
    pub app_names: Vec<String>,
    /// Recogniser confidence for the whole utterance (1.0 if unknown).
    pub asr_confidence: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Interpretation {
    pub command: Option<VoiceCommand>,
    pub confidence: f32,
    /// What Lens heard, cleaned (shown in the HUD).
    pub heard: String,
    /// False in wake mode when the utterance didn't start with the wake phrase.
    pub woke: bool,
    /// A close command phrase when nothing matched.
    pub suggestion: Option<String>,
}

/// Below this, Lens asks "did you mean …?" instead of acting.
pub const MIN_CONFIDENCE: f32 = 0.6;

const FILLERS: &[&str] = &["um", "umm", "uh", "uhh", "uhm", "erm", "er", "hmm", "mm", "ah"];

/// Things Whisper writes for silence or noise; never commands.
const HALLUCINATIONS: &[&str] = &[
    "thank you", "thanks for watching", "thank you for watching", "you", "bye", "thank you very much", "subtitles by the amara.org community",
    "please subscribe", "i'll see you next time", "music",
];

/// How recognisers spell "Lens".
const LENS_SPELLINGS: &[&str] = &["lens", "lenz", "lense", "len's", "lens's", "lenns"];

fn lower(s: &str) -> String {
    s.to_lowercase()
}

/// Removes bracketed noise tags, fillers and edge punctuation; keeps the original case.
fn clean(raw: &str) -> String {
    let mut s = String::with_capacity(raw.len());
    let mut depth = 0i32;
    for c in raw.chars() {
        match c {
            '[' | '(' | '<' | '{' => depth += 1,
            ']' | ')' | '>' | '}' => depth = (depth - 1).max(0),
            '♪' | '*' => {}
            _ if depth == 0 => s.push(c),
            _ => {}
        }
    }
    let words: Vec<&str> = s
        .split_whitespace()
        .filter(|w| !FILLERS.contains(&lower(w.trim_matches(|c: char| !c.is_alphanumeric())).as_str()))
        .collect();
    let joined = words.join(" ");
    joined.trim().trim_matches(|c: char| c == ',' || c == '.' || c == '!' || c == '?' || c == '-' || c == '…' || c.is_whitespace()).to_string()
}

/// Strips a leading wake phrase (with recogniser spellings and "hey/ok" variants). Returns the
/// rest (original case) if one was found.
fn strip_wake<'a>(text: &'a str, phrases: &[String]) -> Option<&'a str> {
    let low = lower(text);
    let mut candidates: Vec<String> = Vec::new();
    for p in phrases {
        let p = lower(p.trim());
        if p.is_empty() {
            continue;
        }
        candidates.push(p.clone());
        if p.contains("lens") {
            for sp in LENS_SPELLINGS {
                candidates.push(p.replace("lens", sp));
            }
        }
    }
    // Longest first, so "hey lens" wins over "lens".
    candidates.sort_by_key(|c| std::cmp::Reverse(c.len()));
    candidates.dedup();
    for c in &candidates {
        for lead in ["", "hey ", "hi ", "ok ", "okay ", "yo "] {
            let full = format!("{}{}", lead, c);
            if low.starts_with(&full) {
                let rest = &low[full.len()..];
                if rest.is_empty() || rest.starts_with([' ', ',', '.', '!', '?', ':']) {
                    // Byte offsets match: wake phrases are ASCII and lowercasing ASCII keeps length.
                    if text.is_char_boundary(full.len()) {
                        return Some(text[full.len()..].trim_start_matches([' ', ',', '.', '!', '?', ':']).trim());
                    }
                }
            }
        }
    }
    None
}

fn strip_prefix_ci<'a>(text: &'a str, prefixes: &[&str]) -> Option<&'a str> {
    let low = lower(text);
    for p in prefixes {
        if low.starts_with(p) && text.is_char_boundary(p.len()) {
            return Some(text[p.len()..].trim());
        }
    }
    None
}

fn voice_only(t: &str, cased: &str) -> Option<(VoiceCommand, f32)> {
    // Answers and voice control (exact phrases only).
    const YES: &[&str] = &["yes", "yeah", "yep", "yup", "yes please", "confirm", "do it", "go ahead", "sure", "ok", "okay", "correct", "that's right", "affirmative"];
    const NO: &[&str] = &["no", "nope", "nah", "cancel", "never mind", "nevermind", "don't", "do not", "stop", "no thanks", "forget it", "abort"];
    if YES.contains(&t) {
        return Some((VoiceCommand::Confirm(true), 1.0));
    }
    if NO.contains(&t) {
        return Some((VoiceCommand::Confirm(false), 1.0));
    }
    if matches!(t, "undo" | "undo that" | "undo it" | "take that back" | "revert" | "revert that" | "go back" | "put it back" | "undo the last thing") {
        return Some((VoiceCommand::Undo, 1.0));
    }
    if matches!(t, "help" | "voice help" | "what can i say" | "what can you do" | "commands" | "show commands" | "list commands" | "show me the commands") {
        return Some((VoiceCommand::Help, 1.0));
    }
    if matches!(
        t,
        "stop listening" | "mute the mic" | "mute the microphone" | "mute mic" | "mute microphone" | "go to sleep" | "sleep" | "goodbye"
            | "be quiet lens" | "turn off voice" | "voice off"
    ) {
        return Some((VoiceCommand::StopListening, 1.0));
    }

    // Dictation keeps the original wording and case.
    if let Some(rest) = strip_prefix_ci(cased, &["type out ", "type ", "dictate ", "insert the text ", "insert "]) {
        if !rest.is_empty() {
            return Some((VoiceCommand::Dictate(rest.to_string()), 0.95));
        }
    }

    // Paste
    if matches!(
        t,
        "paste" | "paste that" | "paste it" | "paste the last clip" | "paste last clip" | "paste the clipboard" | "paste my clipboard"
            | "paste the last thing i copied" | "paste what i copied" | "paste here"
    ) {
        return Some((VoiceCommand::PasteLastClip, 0.95));
    }

    // Shelf
    if t.contains("shelf") || t.starts_with("shelve ") {
        if t.starts_with("clear") || t.starts_with("empty") || t.starts_with("wipe") {
            return Some((VoiceCommand::ShelfClear, 0.95));
        }
        if t.starts_with("open") || t.starts_with("show") || t == "shelf" {
            return Some((VoiceCommand::ShelfOpen, 0.95));
        }
        if ["add ", "save ", "put ", "stash ", "send ", "shelf this", "shelve ", "copy "].iter().any(|v| t.starts_with(v)) {
            return Some((VoiceCommand::ShelfAddSelection, 0.93));
        }
    }

    // Summarise
    if let Some(rest) = strip_prefix_ci(t, &["summarize", "summarise", "tl;dr", "tldr", "give me the gist of", "give me the gist", "sum up", "recap"]) {
        let target = if ["page", "site", "article", "tab", "website", "web page", "webpage"].iter().any(|w| rest.contains(w)) {
            Target::Page
        } else if ["selection", "selected", "highlighted", "this text", "the text"].iter().any(|w| rest.contains(w)) {
            Target::Selection
        } else {
            Target::Auto
        };
        return Some((VoiceCommand::Summarize(target), 0.93));
    }

    // Read back
    if matches!(
        t,
        "read that back" | "read it back" | "read it" | "read that" | "read it out" | "read that out" | "read it aloud" | "read that out loud"
            | "read it out loud" | "say that again" | "read the answer" | "read me the answer"
    ) {
        return Some((VoiceCommand::ReadBack, 0.95));
    }

    // Explicit ask
    if let Some(rest) = strip_prefix_ci(cased, &["ask claude ", "ask ai ", "ask lens ", "ask ", "question "]) {
        if !rest.is_empty() {
            return Some((VoiceCommand::Ask(rest.to_string()), 0.93));
        }
    }
    None
}

fn looks_like_question(t: &str) -> bool {
    let words = t.split_whitespace().count();
    let starts = [
        "what ", "why ", "how ", "who ", "when ", "where ", "which ", "explain ", "tell me ", "describe ", "define ", "is ", "are ",
        "can ", "could ", "should ", "does ", "do ", "write ", "draft ", "translate ",
    ];
    words >= 3 && starts.iter().any(|s| t.starts_with(s))
}

/// Replaces an app name the recogniser misheard with the closest installed/running app.
fn fix_app_name(mut i: RawIntent, apps: &[String]) -> (RawIntent, f32) {
    if apps.is_empty() || !matches!(i.action, "open_app" | "switch_app" | "close_app" | "window_action") {
        return (i, 1.0);
    }
    let Some(name) = i.arg_str("name").map(str::to_string) else { return (i, 1.0) };
    if name == "focused" {
        return (i, 1.0);
    }
    match fuzzy::best_app(&name, apps) {
        Some((app, score)) if app != name => {
            let app = app.to_string();
            for (k, v) in i.args.iter_mut() {
                if *k == "name" {
                    *v = ArgV::S(app.clone());
                }
            }
            if let Some(pos) = i.summary.to_lowercase().find(&name.to_lowercase()) {
                i.summary.replace_range(pos..pos + name.len(), &app);
            }
            (i, score.clamp(0.75, 1.0))
        }
        _ => (i, 1.0),
    }
}

/// The whole pipeline for one utterance.
pub fn interpret(transcript: &str, opts: &Options) -> Interpretation {
    let asr = if opts.asr_confidence > 0.0 { opts.asr_confidence.min(1.0) } else { 1.0 };
    let cleaned = clean(transcript);
    let empty = |heard: String, woke: bool| Interpretation { command: None, confidence: 0.0, heard, woke, suggestion: None };
    if cleaned.is_empty() || cleaned.chars().count() > 400 {
        return empty(String::new(), !opts.require_wake);
    }
    if HALLUCINATIONS.contains(&lower(&cleaned).as_str()) {
        return empty(String::new(), !opts.require_wake);
    }

    // Wake phrase
    let (cased, woke) = match strip_wake(&cleaned, &opts.wake_phrases) {
        Some(rest) => (rest.to_string(), true),
        None if opts.require_wake => return empty(cleaned, false),
        None => (cleaned.clone(), true),
    };
    if cased.is_empty() {
        // "Hey Lens" alone: woke, waiting for the command.
        return Interpretation { command: None, confidence: 1.0, heard: cleaned, woke, suggestion: None };
    }
    let mut t = intent::normalize(&cased.replace([',', ';'], " "));
    if t.is_empty() {
        return empty(cleaned, woke);
    }

    // User aliases (exact phrase → what it means)
    if let Some((_, meaning)) = opts.aliases.iter().find(|(spoken, _)| intent::normalize(spoken) == t) {
        t = intent::normalize(meaning);
    }

    if let Some((cmd, conf)) = voice_only(&t, cased.trim_end_matches(['.', '!', '?'])) {
        return Interpretation { command: Some(cmd), confidence: conf * asr, heard: cleaned, woke, suggestion: None };
    }

    let with_digits = numbers::convert(&t);
    if let Some(raw) = intent::parse(&with_digits) {
        let (fixed, name_conf) = fix_app_name(raw, &opts.app_names);
        let conf = fixed.confidence * name_conf * asr;
        return Interpretation { command: Some(VoiceCommand::Intent(fixed)), confidence: conf, heard: cleaned, woke, suggestion: None };
    }

    if looks_like_question(&t) {
        return Interpretation { command: Some(VoiceCommand::Ask(cased.clone())), confidence: 0.7 * asr, heard: cleaned, woke, suggestion: None };
    }

    let examples = catalog::all_examples();
    let suggestion = fuzzy::did_you_mean(&t, &examples).map(str::to_string);
    Interpretation { command: None, confidence: 0.0, heard: cleaned, woke, suggestion }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> Options {
        Options {
            wake_phrases: vec!["hey lens".into(), "lens".into()],
            require_wake: false,
            aliases: vec![("lights out".into(), "dark mode".into()), ("work mode".into(), "focus mode on".into())],
            app_names: ["Spotify", "Google Chrome", "Firefox", "Visual Studio Code", "Notepad", "Microsoft Teams", "Discord", "OneNote"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
            asr_confidence: 1.0,
        }
    }

    /// (transcript, expected command id, one arg "k=v" for intents, or "" ; for voice-only the
    /// payload text). 150+ phrasings including fillers, recogniser punctuation and spellings,
    /// spoken numbers and misheard app names.
    const TABLE: &[(&str, &str, &str)] = &[
        // windows
        ("Lens, minimize this.", "window_action", "action=minimize"),
        ("Hey Lens, minimise this window", "window_action", "action=minimize"),
        ("um, lens, minimize", "window_action", "action=minimize"),
        ("Minimise Chrome.", "window_action", "name=Google Chrome"),
        ("minimize spot if i", "window_action", "name=Spotify"),
        ("Restore.", "window_action", "action=restore"),
        ("bring it back", "window_action", "action=restore"),
        ("Maximize this", "snap_window", "slot=maximize"),
        ("maximise", "snap_window", "slot=maximize"),
        ("Pin this on top.", "window_action", "action=pin"),
        ("keep this on top", "window_action", "action=pin"),
        ("always on top", "window_action", "action=pin"),
        ("Unpin this window.", "window_action", "action=unpin"),
        ("close this window", "close_app", "name=focused"),
        ("Close notepad.", "close_app", "name=Notepad"),
        ("quit discourd", "close_app", "name=Discord"),
        ("snap left", "snap_window", "slot=left"),
        ("Snap right.", "snap_window", "slot=right"),
        ("move window to the top left", "snap_window", "slot=top-left"),
        ("centre this", "snap_window", "slot=center"),
        ("Move this to the next monitor.", "move_window", "to=next_monitor"),
        ("send this window to the other screen", "move_window", "to=next_monitor"),
        ("move it to the main monitor", "move_window", "to=prev_monitor"),
        ("Move this window to workspace two.", "move_window", "target=2"),
        ("move this to desktop three", "move_window", "target=3"),
        ("arrange windows", "arrange_windows", "layout=smart-group"),
        ("Grid layout.", "arrange_windows", "layout=grid"),
        ("side by side", "arrange_windows", "layout=split"),
        ("Show desktop.", "show_desktop", ""),
        ("minimise everything", "show_desktop", ""),
        ("Minimize all.", "show_desktop", ""),
        // apps
        ("Open Spotify.", "open_app", "name=Spotify"),
        ("open spot if i", "open_app", "name=Spotify"),
        ("Lens open fire fox", "open_app", "name=Firefox"),
        ("launch visual studio code", "open_app", "name=Visual Studio Code"),
        ("can you open note pad", "open_app", "name=Notepad"),
        ("Open One Note.", "open_app", "name=OneNote"),
        ("switch to chrome", "switch_app", "name=Google Chrome"),
        ("Go to teams.", "switch_app", "name=Microsoft Teams"),
        ("focus on teems", "switch_app", "name=Microsoft Teams"),
        ("bring up discord", "switch_app", "name=Discord"),
        ("find budget", "search_files", "query=budget"),
        ("Where is my resume?", "search_files", "query=my resume"),
        ("search for tax return", "search_files", "query=tax return"),
        // desktop
        ("Workspace two.", "switch_workspace", "target=2"),
        ("go to workspace three", "switch_workspace", "target=3"),
        ("next workspace", "switch_workspace", "target=next"),
        ("Previous workspace.", "switch_workspace", "target=prev"),
        ("desktop four", "switch_workspace", "target=4"),
        ("Overview.", "open_overview", ""),
        ("show all windows", "open_overview", ""),
        ("task view", "open_overview", ""),
        ("Next wallpaper.", "next_wallpaper", ""),
        ("change the wallpaper", "next_wallpaper", ""),
        ("show the aurora scene", "set_wallpaper_scene", "scene=aurora"),
        ("Falling sand.", "set_wallpaper_scene", "scene=sand"),
        ("use the starfield wallpaper", "set_wallpaper_scene", "scene=starfield"),
        ("Calm mode.", "set_calm_mode", "enabled=true"),
        ("calm mode off", "set_calm_mode", "enabled=false"),
        ("freeze the wallpaper", "set_calm_mode", "enabled=true"),
        // look
        ("Dark mode.", "set_color_mode", "mode=dark"),
        ("switch to light mode", "set_color_mode", "mode=light"),
        ("lens, go dark", "set_color_mode", "mode=dark"),
        ("night mode", "set_color_mode", "mode=dark"),
        ("Theme Tokyo Night.", "set_theme_pack", "id=tokyo-night"),
        ("use the nord theme", "set_theme_pack", "id=nord-frost"),
        ("apply dracula theme", "set_theme_pack", "id=dracula-glass"),
        ("switch theme to rose pine", "set_theme_pack", "id=rose-pine"),
        ("Accent purple.", "set_accent", "color=#a855f7"),
        ("change the accent colour to teal", "set_accent", "color=#14b8a6"),
        ("make the accent orange", "set_accent", "color=#f97316"),
        ("set accent color to sky blue", "set_accent", "color=#0ea5e9"),
        ("Make the dock slim.", "set_dock_style", "style=slim"),
        ("switch the dock to taskbar", "set_dock_style", "style=taskbar"),
        ("use the minimal dock", "set_dock_style", "style=minimal"),
        ("dock style floating", "set_dock_style", "style=floating"),
        // system
        ("Volume thirty percent.", "set_volume", "level=30"),
        ("set volume to forty five", "set_volume", "level=45"),
        ("volume 80", "set_volume", "level=80"),
        ("turn the volume to max", "set_volume", "level=100"),
        ("Louder.", "set_volume", "delta=10"),
        ("turn it up", "set_volume", "delta=10"),
        ("Turn it down.", "set_volume", "delta=-10"),
        ("quieter", "set_volume", "delta=-10"),
        ("Mute.", "set_mute", "muted=true"),
        ("unmute", "set_mute", "muted=false"),
        ("Brightness sixty.", "set_brightness", "level=60"),
        ("set brightness to seventy five percent", "set_brightness", "level=75"),
        ("dim the screen", "set_brightness", "delta=-10"),
        ("brighter", "set_brightness", "delta=10"),
        ("Do not disturb.", "set_dnd", "enabled=true"),
        ("do not disturb for thirty minutes", "set_dnd", "minutes=30"),
        ("turn off do not disturb", "set_dnd", "enabled=false"),
        ("mute notifications", "set_dnd", "enabled=true"),
        ("Focus mode on.", "set_focus_mode", "enabled=true"),
        ("help me focus", "set_focus_mode", "enabled=true"),
        ("turn off focus mode", "set_focus_mode", "enabled=false"),
        ("night light on", "set_night_light", "enabled=true"),
        ("Turn off the night light.", "set_night_light", "enabled=false"),
        ("Timer for five minutes.", "start_timer", "seconds=300"),
        ("set a timer for ninety seconds", "start_timer", "seconds=90"),
        ("ten minute timer", "start_timer", "seconds=600"),
        ("Pomodoro.", "start_timer", "seconds=1500"),
        ("remind me in twenty minutes to stretch", "start_timer", "label=stretch"),
        ("open display settings", "open_settings_page", "page=ms-display"),
        ("Open dock settings.", "open_settings_page", "page=dock"),
        ("bluetooth settings", "open_settings_page", "page=ms-bluetooth"),
        ("Lock the screen.", "lock_screen", ""),
        ("lock my computer", "lock_screen", ""),
        ("take a note buy milk", "create_note", "text=buy milk"),
        ("What's 12 times 7?", "calculate", "result=84"),
        ("five km in miles", "calculate", "to=mi"),
        // shelf & clipboard (voice-only)
        ("Add this to the shelf.", "shelf_add", ""),
        ("save this to my shelf", "shelf_add", ""),
        ("shelf this", "shelf_add", ""),
        ("Open the shelf.", "shelf_open", ""),
        ("show my shelf", "shelf_open", ""),
        ("Clear the shelf.", "shelf_clear", ""),
        ("empty the shelf", "shelf_clear", ""),
        ("Paste the last clip.", "paste_last_clip", ""),
        ("paste that", "paste_last_clip", ""),
        ("paste", "paste_last_clip", ""),
        ("Type see you at five.", "dictate", "see you at five"),
        ("lens type Hello World", "dictate", "Hello World"),
        ("dictate Meeting moved to Thursday", "dictate", "Meeting moved to Thursday"),
        ("type out thanks, talk soon", "dictate", "thanks, talk soon"),
        // ask & command
        ("Summarise this page.", "summarize", "page"),
        ("summarize the selection", "summarize", "selection"),
        ("summarise", "summarize", "auto"),
        ("tldr this article", "summarize", "page"),
        ("give me the gist", "summarize", "auto"),
        ("Ask what's a good name for a cat.", "ask", "what's a good name for a cat"),
        ("ask claude how tall is everest", "ask", "how tall is everest"),
        ("Why is the sky blue?", "ask", "Why is the sky blue"),
        ("explain quantum computing simply", "ask", "explain quantum computing simply"),
        ("how do I reset my router", "ask", "how do I reset my router"),
        ("Read that back.", "read_back", ""),
        ("read it out loud", "read_back", ""),
        // voice
        ("Help.", "help", ""),
        ("what can I say", "help", ""),
        ("Undo.", "undo", ""),
        ("undo that", "undo", ""),
        ("take that back", "undo", ""),
        ("Yes.", "confirm", "true"),
        ("yeah", "confirm", "true"),
        ("go ahead", "confirm", "true"),
        ("No.", "confirm", "false"),
        ("cancel", "confirm", "false"),
        ("never mind", "confirm", "false"),
        ("Stop listening.", "stop_listening", ""),
        ("mute the mic", "stop_listening", ""),
        // aliases
        ("lights out", "set_color_mode", "mode=dark"),
        ("Work mode.", "set_focus_mode", "enabled=true"),
        // fillers and spellings
        ("uh lenz open spotify", "open_app", "name=Spotify"),
        ("Okay Lens, show desktop.", "show_desktop", ""),
        ("hey lense, dark mode please", "set_color_mode", "mode=dark"),
        ("Lens can you, um, mute", "set_mute", "muted=true"),
        ("[BLANK_AUDIO] lens volume twenty", "set_volume", "level=20"),
    ];

    fn check(i: &Interpretation, id: &str, spec: &str) -> bool {
        let Some(cmd) = &i.command else { return false };
        if cmd.id() != id {
            return false;
        }
        match cmd {
            VoiceCommand::Intent(raw) => {
                if spec.is_empty() {
                    return true;
                }
                let (k, v) = spec.split_once('=').unwrap();
                match raw.args.iter().find(|(n, _)| *n == k) {
                    Some((_, ArgV::S(s))) => s == v,
                    Some((_, ArgV::N(n))) => crate::ai::calc::format_number(*n) == v,
                    Some((_, ArgV::B(b))) => b.to_string() == v,
                    None => false,
                }
            }
            VoiceCommand::Dictate(t) | VoiceCommand::Ask(t) => spec.is_empty() || t == spec,
            VoiceCommand::Summarize(t) => matches!((t, spec), (Target::Page, "page") | (Target::Selection, "selection") | (Target::Auto, "auto")),
            VoiceCommand::Confirm(b) => spec.is_empty() || b.to_string() == spec,
            _ => true,
        }
    }

    #[test]
    fn phrase_table() {
        assert!(TABLE.len() >= 150, "need at least 150 phrasings, have {}", TABLE.len());
        let o = opts();
        let mut failures = Vec::new();
        for (phrase, id, spec) in TABLE {
            let i = interpret(phrase, &o);
            if !check(&i, id, spec) || i.confidence < MIN_CONFIDENCE {
                failures.push(format!("{:?} → {:?} (conf {:.2})", phrase, i.command, i.confidence));
            }
        }
        assert!(failures.is_empty(), "{} failures:\n{}", failures.len(), failures.join("\n"));
    }

    #[test]
    fn wake_mode_requires_the_phrase() {
        let o = Options { require_wake: true, ..opts() };
        assert!(!interpret("minimize this", &o).woke);
        assert!(interpret("minimize this", &o).command.is_none());
        let i = interpret("Hey Lens, minimize this.", &o);
        assert!(i.woke);
        assert_eq!(i.command.as_ref().map(|c| c.id().to_string()), Some("window_action".into()));
        // The phrase alone wakes without a command.
        let w = interpret("Hey Lens.", &o);
        assert!(w.woke && w.command.is_none());
        // "lens" must be a whole word: "lenses are cool" is not a wake.
        assert!(!interpret("lenses are cool", &o).woke);
        assert!(!interpret("lensing effect", &o).woke);
    }

    #[test]
    fn silence_and_noise_are_ignored() {
        for t in ["", "   ", "Thank you.", "[BLANK_AUDIO]", "(silence)", "♪ ♪", "um", "you"] {
            assert!(interpret(t, &opts()).command.is_none(), "{:?}", t);
        }
    }

    #[test]
    fn unknown_gets_a_suggestion() {
        let i = interpret("minimize dis", &opts());
        assert!(i.command.is_some() || i.suggestion.is_some());
        let j = interpret("shoe desk top", &opts());
        assert_eq!(j.suggestion.as_deref(), Some("show desktop"));
        let k = interpret("banana bread", &opts());
        assert!(k.command.is_none());
    }

    #[test]
    fn low_asr_confidence_lowers_the_score() {
        let o = Options { asr_confidence: 0.4, ..opts() };
        let i = interpret("open spotify", &o);
        assert!(i.confidence < MIN_CONFIDENCE);
    }

    #[test]
    fn dictation_never_becomes_a_command() {
        // "type delete everything" must type the words, not run anything.
        let i = interpret("type delete all my files", &opts());
        assert_eq!(i.command, Some(VoiceCommand::Dictate("delete all my files".into())));
    }

    #[test]
    fn interpretation_is_fast() {
        // Script intents should leave nearly the whole latency budget for speech recognition.
        let o = opts();
        let start = std::time::Instant::now();
        let mut n = 0;
        for _ in 0..5 {
            for (p, _, _) in TABLE {
                let _ = interpret(p, &o);
                n += 1;
            }
        }
        let per = start.elapsed().as_secs_f64() * 1000.0 / n as f64;
        assert!(per < 5.0, "interpret took {:.3} ms per phrase", per);
    }
}
