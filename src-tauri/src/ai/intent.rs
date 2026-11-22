//! The "script" assistant's intent engine: turns everyday desktop requests into structured
//! intents with no model, no network and no randomness. Standard library only (plus the sibling
//! `calc` module), so it is fast enough to run on every keystroke of a command palette.
//!
//! Each intent has an `action`, flat string/number/bool `args`, a `confidence` in 0..=1 and a
//! one-line `summary` the UI can show ("Open Spotify"). `mod.rs` turns these into the
//! serde `Intent` of the IPC contract.

use super::calc;

#[derive(Debug, Clone, PartialEq)]
pub enum ArgV {
    S(String),
    N(f64),
    B(bool),
}

#[derive(Debug, Clone, PartialEq)]
pub struct RawIntent {
    pub action: &'static str,
    pub args: Vec<(&'static str, ArgV)>,
    pub confidence: f32,
    pub summary: String,
}

impl RawIntent {
    fn new(action: &'static str, confidence: f32, summary: impl Into<String>) -> Self {
        RawIntent { action, args: Vec::new(), confidence, summary: summary.into() }
    }
    fn s(mut self, k: &'static str, v: impl Into<String>) -> Self {
        self.args.push((k, ArgV::S(v.into())));
        self
    }
    fn n(mut self, k: &'static str, v: f64) -> Self {
        self.args.push((k, ArgV::N(v)));
        self
    }
    fn b(mut self, k: &'static str, v: bool) -> Self {
        self.args.push((k, ArgV::B(v)));
        self
    }
    pub fn arg_str(&self, k: &str) -> Option<&str> {
        self.args.iter().find(|(n, _)| *n == k).and_then(|(_, v)| match v {
            ArgV::S(s) => Some(s.as_str()),
            _ => None,
        })
    }
    pub fn arg_num(&self, k: &str) -> Option<f64> {
        self.args.iter().find(|(n, _)| *n == k).and_then(|(_, v)| match v {
            ArgV::N(n) => Some(*n),
            _ => None,
        })
    }
    pub fn arg_bool(&self, k: &str) -> Option<bool> {
        self.args.iter().find(|(n, _)| *n == k).and_then(|(_, v)| match v {
            ArgV::B(b) => Some(*b),
            _ => None,
        })
    }
}

/// Every action the engine can emit (the UI and docs list these).
pub const ACTIONS: &[&str] = &[
    "open_app",
    "switch_app",
    "close_app",
    "set_color_mode",
    "set_theme_pack",
    "snap_window",
    "arrange_windows",
    "show_desktop",
    "set_focus_mode",
    "set_dnd",
    "set_volume",
    "change_volume",
    "set_mute",
    "set_brightness",
    "change_brightness",
    "set_night_light",
    "switch_workspace",
    "search_files",
    "start_timer",
    "calculate",
    "convert",
    "open_settings_page",
    "create_note",
];

/// (spoken names, pack id). Must stay in step with src/themes/packs.ts and
/// `win_mcp::BUILTIN_PACKS` (a test in ai/mod.rs checks the ids).
pub const PACK_ALIASES: &[(&[&str], &str)] = &[
    (&["obsidian", "default", "lens"], "obsidian"),
    (&["windows mesh", "mesh", "windows"], "windows-mesh"),
    (&["graphite"], "graphite"),
    (&["midnight"], "midnight"),
    (&["catppuccin mocha", "catppuccin", "mocha"], "catppuccin-mocha"),
    (&["tokyo night", "tokyonight", "tokyo"], "tokyo-night"),
    (&["nord frost", "nord"], "nord-frost"),
    (&["dracula glass", "dracula"], "dracula-glass"),
    (&["gruvbox warm", "gruvbox"], "gruvbox-warm"),
    (&["kanagawa wave", "kanagawa"], "kanagawa-wave"),
    (&["rose pine", "rosé pine", "rose-pine", "rosepine"], "rose-pine"),
    (&["everforest dark", "everforest"], "everforest-dark"),
    (&["hyprland neon", "hyprland", "neon"], "hyprland-neon"),
    (&["sequoia frost", "sequoia"], "sequoia-frost"),
    (&["cyberpunk amber", "cyberpunk", "amber"], "cyberpunk-amber"),
    (&["solarized matte", "solarized"], "solarized-matte"),
    (&["alabaster daylight", "alabaster", "daylight"], "alabaster-daylight"),
    (&["paper minimal", "paper"], "paper-minimal"),
];

/// Settings pages the engine recognises: (spoken names, page id). Ids starting with "ms-"
/// are Windows Settings pages; the rest are Lens Control Center pages.
pub const SETTINGS_PAGES: &[(&[&str], &str)] = &[
    (&["display", "screen", "monitor", "resolution"], "ms-display"),
    (&["sound", "audio"], "ms-sound"),
    (&["wifi", "wi-fi", "network", "internet"], "ms-network"),
    (&["bluetooth", "devices"], "ms-bluetooth"),
    (&["battery", "power"], "ms-power"),
    (&["windows update", "update", "updates"], "ms-update"),
    (&["apps", "installed apps", "programs"], "ms-apps"),
    (&["privacy"], "ms-privacy"),
    (&["mouse"], "ms-mouse"),
    (&["keyboard", "typing"], "ms-keyboard"),
    (&["theme", "themes", "appearance", "look"], "theme"),
    (&["dock"], "dock"),
    (&["top bar", "topbar", "bar"], "topbar"),
    (&["wallpaper", "background", "desktop"], "wallpaper"),
    (&["window", "windows style", "window style", "frames"], "windows"),
    (&["workspaces", "workspace"], "workspaces"),
    (&["tiling", "layouts"], "tiling"),
    (&["notifications", "notification"], "notifications"),
    (&["plugins", "plugin", "extensions"], "plugins"),
    (&["ai", "lens intelligence", "intelligence", "assistant", "claude"], "ai"),
    (&["agents", "mcp"], "agents"),
    (&["cursor", "cursors", "pointer"], "cursor"),
    (&["lens", "control center", "settings"], "home"),
];

const POLITE_PREFIXES: &[&str] = &[
    "hey lens, ",
    "ok lens, ",
    "lens, ",
    "hey lens ",
    "ok lens ",
    "lens ",
    "please ",
    "can you please ",
    "could you please ",
    "can you ",
    "could you ",
    "would you ",
    "will you ",
    "i want to ",
    "i'd like to ",
    "i would like to ",
    "i need to ",
    "let's ",
    "lets ",
    "go ahead and ",
    "quickly ",
    "just ",
];

const POLITE_SUFFIXES: &[&str] = &[" please", " for me", " now", " thanks", " thank you", " right now"];

/// Lowercases, trims punctuation and polite filler.
pub fn normalize(text: &str) -> String {
    let mut t: String = text
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c == '’' { '\'' } else { c })
        .collect();
    t = t.replace(": ", " ");
    t = t.trim_end_matches(['?', '!', '.', ' ']).trim().to_string();
    t = t.trim_start_matches(['/', '>', ' ']).to_string();
    if let Some(rest) = t.strip_prefix("lens,") {
        t = rest.trim().to_string();
    }
    loop {
        let before = t.clone();
        for p in POLITE_PREFIXES {
            if let Some(rest) = t.strip_prefix(p) {
                t = rest.trim().to_string();
            }
        }
        for s in POLITE_SUFFIXES {
            if let Some(rest) = t.strip_suffix(s) {
                t = rest.trim().trim_end_matches(',').trim().to_string();
            }
        }
        if t == before {
            break;
        }
    }
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn title_case(s: &str) -> String {
    s.split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn strip_any<'a>(t: &'a str, prefixes: &[&str]) -> Option<&'a str> {
    prefixes.iter().find_map(|p| t.strip_prefix(p)).map(str::trim)
}

fn clean_app_name(raw: &str) -> Option<String> {
    let mut n = raw.trim();
    for p in ["the ", "my ", "up ", "app ", "application "] {
        if let Some(r) = n.strip_prefix(p) {
            n = r.trim();
        }
    }
    for s in [" app", " application", " window", " program", " for me", " up"] {
        if let Some(r) = n.strip_suffix(s) {
            n = r.trim();
        }
    }
    if n.is_empty() || n.len() > 60 || n.chars().any(|c| c.is_control()) {
        return None;
    }
    Some(n.to_string())
}

pub fn find_pack(name: &str) -> Option<&'static str> {
    let n = name.trim().trim_end_matches(" theme").trim_end_matches(" pack").trim();
    PACK_ALIASES
        .iter()
        .find(|(aliases, id)| aliases.contains(&n) || *id == n)
        .map(|(_, id)| *id)
}

fn find_settings_page(name: &str) -> Option<&'static str> {
    let n = name.trim();
    SETTINGS_PAGES
        .iter()
        .find(|(aliases, id)| aliases.contains(&n) || *id == n)
        .map(|(_, id)| *id)
}

fn parse_level(s: &str) -> Option<f64> {
    let t = s.trim().trim_end_matches('%').trim().trim_end_matches(" percent").trim();
    let t = t.strip_prefix("to ").unwrap_or(t).trim().trim_end_matches('%').trim();
    let v: f64 = match t {
        "max" | "maximum" | "full" | "100" => 100.0,
        "half" => 50.0,
        "min" | "minimum" | "zero" => 0.0,
        _ => t.parse().ok()?,
    };
    if (0.0..=100.0).contains(&v) {
        Some(v.round())
    } else {
        None
    }
}

fn on_off(t: &str) -> Option<bool> {
    let on = ["on", "enable", "enabled", "start", "activate", "turn on", "switch on", "begin"];
    let off = ["off", "disable", "disabled", "stop", "deactivate", "turn off", "switch off", "end", "exit", "leave"];
    if on.iter().any(|w| t == *w || t.starts_with(&format!("{} ", w)) || t.ends_with(&format!(" {}", w))) {
        return Some(true);
    }
    if off.iter().any(|w| t == *w || t.starts_with(&format!("{} ", w)) || t.ends_with(&format!(" {}", w))) {
        return Some(false);
    }
    None
}

/// Parses one request. `None` = not a desktop command (send it to a model instead).
pub fn parse(text: &str) -> Option<RawIntent> {
    if text.len() > 400 {
        return None;
    }
    let t = normalize(text);
    if t.is_empty() {
        return None;
    }
    let t = t.as_str();

    // --- maths and units first: "5 km in miles" must not become "open ..."
    if let Some(i) = parse_math(t) {
        return Some(i);
    }

    // --- timers
    if let Some(i) = parse_timer(t) {
        return Some(i);
    }

    // --- colour mode
    if let Some(i) = parse_color_mode(t) {
        return Some(i);
    }

    // --- theme packs
    if let Some(i) = parse_theme(t) {
        return Some(i);
    }

    // --- focus / do not disturb / night light
    if let Some(i) = parse_toggles(t) {
        return Some(i);
    }

    // --- volume / brightness
    if let Some(i) = parse_levels(t) {
        return Some(i);
    }

    // --- workspaces
    if let Some(i) = parse_workspace(t) {
        return Some(i);
    }

    // --- window arrangement
    if let Some(i) = parse_windows(t) {
        return Some(i);
    }

    // --- settings pages
    if let Some(i) = parse_settings(t) {
        return Some(i);
    }

    // --- notes
    if let Some(rest) = strip_any(t, &["take a note ", "take note ", "make a note ", "note to self ", "note ", "jot down ", "remember to "]) {
        let body = rest.trim_start_matches(['-', ':', ' ']).trim().trim_start_matches("that ").trim();
        if !body.is_empty() {
            let shown: String = body.chars().take(40).collect();
            return Some(RawIntent::new("create_note", 0.9, format!("Save a note: \"{}\"", shown)).s("text", body));
        }
    }

    // --- file search
    if let Some(rest) = strip_any(t, &["search files for ", "search my files for ", "find file ", "find files ", "find my ", "find the ", "find ", "search for ", "search ", "where is ", "where's ", "locate ", "look for "]) {
        let q = rest.trim_start_matches("files ").trim_start_matches("for ").trim().trim_matches('"');
        if !q.is_empty() && q.len() <= 120 {
            return Some(RawIntent::new("search_files", 0.85, format!("Search for \"{}\"", q)).s("query", q));
        }
    }

    // --- apps
    parse_apps(t)
}

fn parse_math(t: &str) -> Option<RawIntent> {
    if let Some(c) = calc::parse_conversion(t) {
        let summary = format!(
            "{} {} = {} {}",
            calc::format_number(c.value),
            c.from,
            calc::format_number((c.result * 1e4).round() / 1e4),
            c.to
        );
        return Some(
            RawIntent::new("convert", 0.97, summary)
                .n("value", c.value)
                .s("from", c.from)
                .s("to", c.to)
                .n("result", c.result),
        );
    }
    let expr = strip_any(t, &["what's ", "what is ", "whats ", "calculate ", "calc ", "compute ", "solve ", "= ", "="]);
    let candidate = expr.unwrap_or(t);
    if expr.is_some() || calc::looks_like_math(t) || candidate.contains("% of ") {
        if let Some(v) = calc::eval(candidate) {
            let summary = format!("{} = {}", candidate, calc::format_number(v));
            return Some(RawIntent::new("calculate", 0.97, summary).s("expression", candidate).n("result", v));
        }
    }
    None
}

fn parse_timer(t: &str) -> Option<RawIntent> {
    if t == "pomodoro" || t == "start a pomodoro" || t == "start pomodoro" {
        return Some(RawIntent::new("start_timer", 0.95, "Start a 25 min focus timer").n("seconds", 1500.0).s("label", "Pomodoro"));
    }
    let rest = strip_any(t, &["set a timer for ", "set timer for ", "set a timer ", "set timer ", "start a timer for ", "start timer for ", "timer for ", "timer ", "remind me in ", "countdown "]);
    let (dur_text, label) = match rest {
        Some(r) => {
            // "remind me in 20 minutes to stretch" → label "stretch"
            match r.find(" to ").or_else(|| r.find(" for ")) {
                Some(i) => (&r[..i], Some(r[i + 4..].trim())),
                None => (r, None),
            }
        }
        None => {
            // "5 minute timer", "10 min timer"
            let r = t.strip_suffix(" timer").or_else(|| t.strip_suffix(" countdown"))?;
            (r.trim_start_matches("a ").trim_end_matches(" long"), None)
        }
    };
    let secs = calc::parse_duration_secs(dur_text.trim())?;
    let mut i = RawIntent::new("start_timer", 0.95, format!("Start a {} timer", calc::describe_duration(secs))).n("seconds", secs as f64);
    if let Some(l) = label.filter(|l| !l.is_empty()) {
        i.summary = format!("{} — {}", i.summary, l);
        i = i.s("label", l);
    }
    Some(i)
}

fn parse_color_mode(t: &str) -> Option<RawIntent> {
    let dark = [
        "dark mode", "dark theme", "go dark", "make it dark", "switch to dark", "switch to dark mode", "turn on dark mode",
        "enable dark mode", "dark mode on", "use dark mode", "turn off light mode", "light mode off", "night mode",
    ];
    let light = [
        "light mode", "light theme", "go light", "make it light", "switch to light", "switch to light mode",
        "turn on light mode", "enable light mode", "light mode on", "use light mode", "turn off dark mode", "dark mode off",
        "day mode",
    ];
    if dark.contains(&t) {
        return Some(RawIntent::new("set_color_mode", 0.97, "Switch to dark mode").s("mode", "dark"));
    }
    if light.contains(&t) {
        return Some(RawIntent::new("set_color_mode", 0.97, "Switch to light mode").s("mode", "light"));
    }
    if t == "toggle dark mode" || t == "toggle light mode" || t == "toggle theme" {
        return Some(RawIntent::new("set_color_mode", 0.9, "Toggle dark and light mode").s("mode", "toggle"));
    }
    None
}

fn parse_theme(t: &str) -> Option<RawIntent> {
    let themed = t.contains("theme") || t.contains(" pack") || t.contains("skin") || t.contains("colors") || t.contains("colours");
    let rest = strip_any(
        t,
        &[
            "apply the ", "apply ", "use the ", "use ", "switch theme to ", "change theme to ", "change the theme to ",
            "set theme to ", "set the theme to ", "theme to ", "theme ", "switch to the ", "switch to ", "try ", "make it ",
            "go ",
        ],
    )
    .unwrap_or(t);
    let name = rest
        .trim_end_matches(" theme pack")
        .trim_end_matches(" theme")
        .trim_end_matches(" pack")
        .trim_end_matches(" colors")
        .trim_end_matches(" colours")
        .trim_end_matches(" skin")
        .trim();
    let id = find_pack(name)?;
    // "switch to windows" / "use mesh" without the word theme could mean an app; only accept
    // bare names that are unmistakably packs.
    let generic = matches!(name, "windows" | "default" | "lens" | "paper" | "neon" | "amber" | "daylight" | "midnight" | "mocha" | "tokyo");
    if generic && !themed {
        return None;
    }
    let shown = PACK_ALIASES.iter().find(|(_, i)| *i == id).map(|(a, _)| title_case(a[0])).unwrap_or_default();
    Some(RawIntent::new("set_theme_pack", if themed { 0.95 } else { 0.8 }, format!("Apply the {} theme", shown)).s("id", id))
}

fn parse_toggles(t: &str) -> Option<RawIntent> {
    // Focus mode
    if t.contains("focus mode") || t == "focus" || t == "start focusing" || t == "stop focusing" || t == "help me focus" {
        let enabled = match t {
            "stop focusing" => false,
            "start focusing" | "focus" | "help me focus" => true,
            _ => on_off(&t.replace("focus mode", "").trim().to_string()).unwrap_or(!t.contains("toggle")),
        };
        if t.contains("toggle") {
            return Some(RawIntent::new("set_focus_mode", 0.9, "Toggle focus mode"));
        }
        return Some(
            RawIntent::new("set_focus_mode", 0.95, if enabled { "Turn on focus mode" } else { "Turn off focus mode" })
                .b("enabled", enabled),
        );
    }
    // Do not disturb
    let dnd_words = ["do not disturb", "don't disturb", "dnd", "notifications", "notification"];
    if let Some(w) = dnd_words.iter().find(|w| t.contains(*w)) {
        let rest = t.replace(w, "");
        let rest = rest.trim();
        let mut enabled = on_off(rest);
        if w.starts_with("notification") {
            // "mute notifications" / "silence notifications" = DND on; "show notifications" = off
            if ["mute", "silence", "hide", "pause", "block", "stop"].iter().any(|v| rest.starts_with(v)) {
                enabled = Some(true);
            } else if ["unmute", "unsilence", "resume", "allow", "show"].iter().any(|v| rest.starts_with(v)) {
                enabled = Some(false);
            } else {
                return None; // "open notifications" etc. is not DND
            }
        } else if rest.is_empty() || rest == "mode" || rest == "go" || rest == "enter" || rest == "i need" {
            enabled = enabled.or(Some(true));
        }
        let enabled = enabled?;
        let mut i = RawIntent::new("set_dnd", 0.95, if enabled { "Turn on Do Not Disturb" } else { "Turn off Do Not Disturb" })
            .b("enabled", enabled);
        if enabled {
            if let Some(idx) = rest.find("for ") {
                if let Some(secs) = calc::parse_duration_secs(&rest[idx + 4..]) {
                    i.summary = format!("Turn on Do Not Disturb for {}", calc::describe_duration(secs));
                    i = i.n("minutes", (secs as f64 / 60.0).round());
                }
            }
        }
        return Some(i);
    }
    // Night light
    if t.contains("night light") || t.contains("nightlight") || t.contains("blue light") {
        let rest = t.replace("night light", "").replace("nightlight", "").replace("blue light filter", "").replace("blue light", "");
        let enabled = on_off(rest.trim());
        return Some(match enabled {
            Some(e) => RawIntent::new("set_night_light", 0.95, if e { "Turn on night light" } else { "Turn off night light" }).b("enabled", e),
            None => RawIntent::new("set_night_light", 0.85, "Toggle night light"),
        });
    }
    None
}

fn parse_levels(t: &str) -> Option<RawIntent> {
    // Mute / unmute (sound)
    match t {
        "mute" | "mute sound" | "mute audio" | "mute the sound" | "mute volume" | "silence" | "be quiet" | "sound off" => {
            return Some(RawIntent::new("set_mute", 0.95, "Mute sound").b("muted", true))
        }
        "unmute" | "unmute sound" | "unmute audio" | "sound on" => {
            return Some(RawIntent::new("set_mute", 0.95, "Unmute sound").b("muted", false))
        }
        "louder" | "volume up" | "turn it up" | "turn up the volume" | "turn the volume up" | "raise volume" | "increase volume" => {
            return Some(RawIntent::new("change_volume", 0.95, "Turn the volume up").n("delta", 10.0))
        }
        "quieter" | "softer" | "volume down" | "turn it down" | "turn down the volume" | "turn the volume down" | "lower volume" | "decrease volume" => {
            return Some(RawIntent::new("change_volume", 0.95, "Turn the volume down").n("delta", -10.0))
        }
        "brighter" | "brightness up" | "increase brightness" | "raise brightness" | "turn up the brightness" => {
            return Some(RawIntent::new("change_brightness", 0.95, "Make the screen brighter").n("delta", 10.0))
        }
        "dimmer" | "dim the screen" | "dim screen" | "brightness down" | "decrease brightness" | "lower brightness" | "turn down the brightness" => {
            return Some(RawIntent::new("change_brightness", 0.95, "Dim the screen").n("delta", -10.0))
        }
        _ => {}
    }
    for (word, action, summary) in [("volume", "set_volume", "Set volume to"), ("brightness", "set_brightness", "Set brightness to")] {
        if !t.contains(word) {
            continue;
        }
        let rest = t
            .replace("set the ", "")
            .replace("set ", "")
            .replace("change the ", "")
            .replace("change ", "")
            .replace("turn the ", "")
            .replace("turn ", "")
            .replace("put the ", "")
            .replace(word, "")
            .replace(" at ", " ")
            .replace(" level", "");
        let rest = rest.trim().trim_start_matches("to ").trim();
        if let Some(v) = parse_level(rest) {
            let v = if word == "brightness" { v.max(10.0) } else { v };
            return Some(RawIntent::new(action, 0.95, format!("{} {}%", summary, v)).n("level", v));
        }
    }
    None
}

fn parse_workspace(t: &str) -> Option<RawIntent> {
    match t {
        "next workspace" | "next desktop" | "workspace next" => {
            return Some(RawIntent::new("switch_workspace", 0.95, "Go to the next workspace").s("target", "next"))
        }
        "previous workspace" | "prev workspace" | "last workspace" | "previous desktop" | "workspace prev" => {
            return Some(RawIntent::new("switch_workspace", 0.95, "Go to the previous workspace").s("target", "prev"))
        }
        _ => {}
    }
    let rest = strip_any(t, &["go to ", "switch to ", "open ", "show ", "move to ", ""])?;
    let num = rest
        .strip_prefix("workspace ")
        .or_else(|| rest.strip_prefix("desktop "))
        .or_else(|| rest.strip_prefix("virtual desktop "))?
        .trim();
    let words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    let n = num
        .parse::<u32>()
        .ok()
        .or_else(|| words.iter().position(|w| *w == num).map(|i| i as u32 + 1))?;
    if !(1..=9).contains(&n) {
        return None;
    }
    Some(RawIntent::new("switch_workspace", 0.95, format!("Go to workspace {}", n)).s("target", n.to_string()))
}

fn parse_windows(t: &str) -> Option<RawIntent> {
    match t {
        "show desktop" | "show the desktop" | "minimize everything" | "minimise everything" | "minimize all" | "minimise all"
        | "hide all windows" | "clear the screen" => return Some(RawIntent::new("show_desktop", 0.95, "Show the desktop")),
        "tile windows" | "tile all windows" | "tile everything" | "arrange windows" | "arrange my windows" | "organize windows"
        | "organise windows" | "tidy windows" | "tidy up windows" => {
            return Some(RawIntent::new("arrange_windows", 0.9, "Tile the open windows").s("layout", "smart-group"))
        }
        _ => {}
    }
    let layouts = [
        ("grid", "grid"),
        ("thirds", "thirds"),
        ("three columns", "thirds"),
        ("split", "split"),
        ("split screen", "split"),
        ("side by side", "split"),
        ("focus stack", "focus-stack"),
        ("stack", "focus-stack"),
    ];
    for (name, id) in layouts {
        if t == format!("{} layout", name) || t == format!("tile {}", name) || t == format!("{} windows", name) || t == format!("windows {}", name) || t == format!("use {} layout", name) || (name == "split screen" && t == name) || (name == "side by side" && t == name) {
            return Some(RawIntent::new("arrange_windows", 0.92, format!("Arrange windows: {}", name)).s("layout", id));
        }
    }
    let slots = [
        ("top left", "top-left"),
        ("top right", "top-right"),
        ("bottom left", "bottom-left"),
        ("bottom right", "bottom-right"),
        ("left", "left"),
        ("right", "right"),
        ("top", "top"),
        ("bottom", "bottom"),
        ("center", "center"),
        ("centre", "center"),
        ("middle", "center"),
    ];
    let verbs = ["snap ", "tile ", "move ", "put ", "send ", "dock "];
    if verbs.iter().any(|v| t.starts_with(v)) {
        for (name, slot) in slots {
            let pats = [
                format!(" {}", name),
                format!(" to the {}", name),
                format!(" to {}", name),
                format!(" on the {}", name),
                format!(" {} half", name),
                format!(" to the {} half", name),
            ];
            if pats.iter().any(|p| t.ends_with(p.as_str())) {
                return Some(RawIntent::new("snap_window", 0.93, format!("Snap the window to the {}", name)).s("slot", slot));
            }
        }
    }
    match t {
        "maximize" | "maximise" | "maximize this" | "maximise this" | "maximize window" | "maximise window" | "full screen this"
        | "make it bigger" => return Some(RawIntent::new("snap_window", 0.9, "Maximise the window").s("slot", "maximize")),
        "center window" | "centre window" | "center this" | "centre this" => {
            return Some(RawIntent::new("snap_window", 0.9, "Centre the window").s("slot", "center"))
        }
        _ => {}
    }
    None
}

fn parse_settings(t: &str) -> Option<RawIntent> {
    let rest = strip_any(t, &["open ", "show me ", "show ", "go to ", "take me to "])
        .or(if t.ends_with(" settings") { Some(t) } else { None })?;
    let rest = rest.trim_start_matches("the ").trim_start_matches("my ").trim();
    let name = rest
        .strip_suffix(" settings")
        .or_else(|| rest.strip_suffix(" setting"))
        .or_else(|| rest.strip_suffix(" options"))
        .or_else(|| rest.strip_prefix("settings for "))
        .or_else(|| rest.strip_prefix("settings "))
        .or(if rest == "settings" || rest == "control center" || rest == "control centre" { Some("settings") } else { None })?
        .trim();
    let page = find_settings_page(name)?;
    let shown = if page == "home" { "Lens settings".to_string() } else if page.starts_with("ms-") { format!("Windows {} settings", name) } else { format!("Lens {} settings", name) };
    Some(RawIntent::new("open_settings_page", 0.93, format!("Open {}", shown)).s("page", page))
}

fn parse_apps(t: &str) -> Option<RawIntent> {
    // Lens's own panels are opened by the UI, not launched as apps.
    if ["notifications", "notification center", "quick settings", "calendar", "the dock", "the launcher"]
        .iter()
        .any(|n| t.ends_with(n) && (t.starts_with("open ") || t.starts_with("show ")))
    {
        return None;
    }
    if let Some(rest) = strip_any(t, &["close ", "quit ", "exit ", "kill ", "shut down "]) {
        if rest == "this" || rest == "window" || rest == "this window" || rest == "it" {
            return Some(RawIntent::new("close_app", 0.8, "Close the focused window").s("name", "focused"));
        }
        let name = clean_app_name(rest)?;
        return Some(RawIntent::new("close_app", 0.88, format!("Close {}", title_case(&name))).s("name", name));
    }
    if let Some(rest) = strip_any(t, &["switch to ", "go to ", "focus on ", "focus ", "bring up ", "show me ", "show ", "back to ", "jump to "]) {
        let name = clean_app_name(rest)?;
        return Some(RawIntent::new("switch_app", 0.85, format!("Switch to {}", title_case(&name))).s("name", name));
    }
    if let Some(rest) = strip_any(t, &["open up ", "open ", "launch ", "start ", "run ", "fire up ", "load "]) {
        let name = clean_app_name(rest)?;
        // "open a new tab" etc. are in-app actions, not app names.
        if name.starts_with("a ") || name.starts_with("an ") || name.starts_with("new ") {
            return None;
        }
        return Some(RawIntent::new("open_app", 0.88, format!("Open {}", title_case(&name))).s("name", name));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// (phrase, expected action, one expected arg as "key=value" or "")
    const TABLE: &[(&str, &str, &str)] = &[
        // apps
        ("open spotify", "open_app", "name=spotify"),
        ("Open Spotify please", "open_app", "name=spotify"),
        ("launch visual studio code", "open_app", "name=visual studio code"),
        ("can you start discord", "open_app", "name=discord"),
        ("hey lens, fire up steam", "open_app", "name=steam"),
        ("run the calculator app", "open_app", "name=calculator"),
        ("switch to chrome", "switch_app", "name=chrome"),
        ("go to slack", "switch_app", "name=slack"),
        ("focus on firefox", "switch_app", "name=firefox"),
        ("bring up outlook", "switch_app", "name=outlook"),
        ("close notepad", "close_app", "name=notepad"),
        ("quit spotify", "close_app", "name=spotify"),
        ("close this window", "close_app", "name=focused"),
        // colour mode
        ("dark mode", "set_color_mode", "mode=dark"),
        ("switch to light mode", "set_color_mode", "mode=light"),
        ("Turn on dark mode.", "set_color_mode", "mode=dark"),
        ("make it light", "set_color_mode", "mode=light"),
        ("toggle dark mode", "set_color_mode", "mode=toggle"),
        // theme packs
        ("apply tokyo night", "set_theme_pack", "id=tokyo-night"),
        ("use the nord theme", "set_theme_pack", "id=nord-frost"),
        ("switch theme to rose pine", "set_theme_pack", "id=rose-pine"),
        ("dracula theme", "set_theme_pack", "id=dracula-glass"),
        ("theme catppuccin", "set_theme_pack", "id=catppuccin-mocha"),
        ("switch to the gruvbox theme", "set_theme_pack", "id=gruvbox-warm"),
        ("use windows mesh", "set_theme_pack", "id=windows-mesh"),
        // window arrangement
        ("snap left", "snap_window", "slot=left"),
        ("tile this to the right", "snap_window", "slot=right"),
        ("move window to the top left", "snap_window", "slot=top-left"),
        ("maximize", "snap_window", "slot=maximize"),
        ("tile windows", "arrange_windows", "layout=smart-group"),
        ("grid layout", "arrange_windows", "layout=grid"),
        ("side by side", "arrange_windows", "layout=split"),
        ("show desktop", "show_desktop", ""),
        // focus / dnd / night light
        ("focus mode on", "set_focus_mode", "enabled=true"),
        ("turn off focus mode", "set_focus_mode", "enabled=false"),
        ("help me focus", "set_focus_mode", "enabled=true"),
        ("do not disturb", "set_dnd", "enabled=true"),
        ("turn off do not disturb", "set_dnd", "enabled=false"),
        ("dnd on for 30 minutes", "set_dnd", "minutes=30"),
        ("mute notifications", "set_dnd", "enabled=true"),
        ("resume notifications", "set_dnd", "enabled=false"),
        ("night light on", "set_night_light", "enabled=true"),
        ("turn off the night light", "set_night_light", "enabled=false"),
        // volume / brightness
        ("volume 40", "set_volume", "level=40"),
        ("set volume to 75%", "set_volume", "level=75"),
        ("turn the volume to max", "set_volume", "level=100"),
        ("louder", "change_volume", "delta=10"),
        ("turn it down", "change_volume", "delta=-10"),
        ("mute", "set_mute", "muted=true"),
        ("unmute", "set_mute", "muted=false"),
        ("brightness 60", "set_brightness", "level=60"),
        ("set brightness to 5", "set_brightness", "level=10"),
        ("dim the screen", "change_brightness", "delta=-10"),
        // workspaces
        ("workspace 3", "switch_workspace", "target=3"),
        ("go to desktop two", "switch_workspace", "target=2"),
        ("next workspace", "switch_workspace", "target=next"),
        ("previous workspace", "switch_workspace", "target=prev"),
        // search
        ("find budget.xlsx", "search_files", "query=budget.xlsx"),
        ("search for tax return", "search_files", "query=tax return"),
        ("where is my resume", "search_files", "query=my resume"),
        // timers
        ("timer 5 minutes", "start_timer", "seconds=300"),
        ("set a timer for 90 seconds", "start_timer", "seconds=90"),
        ("10 minute timer", "start_timer", "seconds=600"),
        ("remind me in 20 minutes to stretch", "start_timer", "label=stretch"),
        ("pomodoro", "start_timer", "seconds=1500"),
        ("set a timer for 1h30m", "start_timer", "seconds=5400"),
        // maths and units
        ("what's 12*7", "calculate", "result=84"),
        ("2^10", "calculate", "result=1024"),
        ("calculate 15% of 80", "calculate", "result=12"),
        ("= (3 + 4) * 2", "calculate", "result=14"),
        ("5 km in miles", "convert", "to=mi"),
        ("convert 100 f to c", "convert", "to=°C"),
        ("how many cm in 3 feet", "convert", "to=cm"),
        ("10 lb to kg", "convert", "to=kg"),
        // settings
        ("open display settings", "open_settings_page", "page=ms-display"),
        ("bluetooth settings", "open_settings_page", "page=ms-bluetooth"),
        ("open dock settings", "open_settings_page", "page=dock"),
        ("show me the theme settings", "open_settings_page", "page=theme"),
        ("open settings", "open_settings_page", "page=home"),
        // notes
        ("take a note: buy milk", "create_note", "text=buy milk"),
        ("note call the dentist", "create_note", "text=call the dentist"),
    ];

    fn arg_matches(i: &RawIntent, spec: &str) -> bool {
        if spec.is_empty() {
            return true;
        }
        let (k, v) = spec.split_once('=').unwrap();
        match i.args.iter().find(|(n, _)| *n == k) {
            Some((_, ArgV::S(s))) => s == v,
            Some((_, ArgV::N(n))) => calc::format_number(*n) == v,
            Some((_, ArgV::B(b))) => b.to_string() == v,
            None => false,
        }
    }

    #[test]
    fn phrase_table() {
        assert!(TABLE.len() >= 60, "need at least 60 phrasings, have {}", TABLE.len());
        let mut failures = Vec::new();
        for (phrase, action, arg) in TABLE {
            match parse(phrase) {
                Some(i) if i.action == *action && arg_matches(&i, arg) => {
                    assert!(ACTIONS.contains(&i.action), "{} not in ACTIONS", i.action);
                    assert!(!i.summary.is_empty());
                    assert!((0.0..=1.0).contains(&i.confidence));
                }
                other => failures.push(format!("{:?} → {:?}", phrase, other.map(|i| (i.action, i.args)))),
            }
        }
        assert!(failures.is_empty(), "intent failures:\n{}", failures.join("\n"));
    }

    #[test]
    fn not_commands() {
        for p in [
            "",
            "   ",
            "why is the sky blue",
            "write me a poem about autumn",
            "summarize this page",
            "what do you think about rust",
            "explain quantum computing simply",
            "open a new tab",
            "open notifications",
            &"x".repeat(500),
        ] {
            assert_eq!(parse(p).map(|i| i.action), None, "{:?} should not be a command", p);
        }
    }

    #[test]
    fn ambiguous_names_stay_apps() {
        // A bare generic pack name without the word "theme" is treated as an app.
        assert_eq!(parse("switch to windows").map(|i| i.action), Some("switch_app"));
        assert_eq!(parse("use the windows theme").map(|i| i.action), Some("set_theme_pack"));
        assert_eq!(parse("open paper").map(|i| i.action), Some("open_app"));
    }

    #[test]
    fn normalizes_filler() {
        assert_eq!(normalize("  Hey Lens, could you please Open Spotify for me?! "), "open spotify");
        assert_eq!(normalize("/dark mode"), "dark mode");
    }

    #[test]
    fn pack_ids_are_kebab() {
        for (aliases, id) in PACK_ALIASES {
            assert!(!aliases.is_empty());
            assert!(id.bytes().all(|b| b.is_ascii_lowercase() || b == b'-'));
            assert_eq!(find_pack(id), Some(*id));
        }
    }
}
