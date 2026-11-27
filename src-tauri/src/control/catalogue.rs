//! The settings catalogue: every leaf of every Lens settings store, described.
//!
//! Entries are generated from the serialized defaults of each store (so they always match the real
//! config shape) and decorated by two tables:
//! * [`RULES`] — prefix rules giving category, capability, risk and reversibility. Every leaf must
//!   match one (the completeness test fails otherwise), so a new config field can't silently become
//!   writable by an AI without someone deciding how risky it is.
//! * [`FIELDS`] — per-field labels, descriptions and schema constraints (enums, ranges, formats).

use super::{Capability, Risk};
use serde::Serialize;
use serde_json::{json, Map, Value};

/// The settings stores. `config` paths have no prefix (e.g. `dock.style`); the others are
/// prefixed with the store id (e.g. `wallpaper.scene`).
pub const STORES: [&str; 6] = ["config", "wallpaper", "windowStyling", "cursorFx", "clipboard", "live"];

pub struct Rule {
    pub prefix: &'static str,
    pub category: &'static str,
    pub capability: Capability,
    pub risk: Risk,
    pub reversible: bool,
}

const fn r(prefix: &'static str, category: &'static str, capability: Capability, risk: Risk) -> Rule {
    Rule { prefix, category, capability, risk, reversible: true }
}

use Capability as C;
use Risk::{Blocked as B, Confirm as K, Low as L};

/// Longest matching prefix wins.
pub const RULES: &[Rule] = &[
    // Theme
    r("theme", "Theme", C::ChangeLook, L),
    r("theme.customCss", "Theme", C::ChangeLook, K),
    r("theme.locale", "Behaviour", C::ChangeSettings, L),
    r("themeSchedule", "Theme schedule", C::ChangeLook, L),
    // Dock and bars
    r("dock", "Dock", C::ChangeLook, L),
    r("dock.pinnedApps", "Dock", C::ChangeSettings, K),
    r("dock.pinnedFolders", "Dock", C::ChangeSettings, K),
    r("dock.separatorsAfter", "Dock", C::ChangeSettings, L),
    r("dock.locked", "Dock", C::ChangeSettings, L),
    r("topBar", "Top bar", C::ChangeLook, L),
    // Windows look
    r("windowControls", "Window frames", C::ChangeLook, L),
    r("windowControls.excludedProcesses", "Window frames", C::ChangeSettings, L),
    r("iconStyle", "Icons & folders", C::ChangeLook, L),
    r("folderStyle", "Icons & folders", C::ChangeLook, L),
    r("folderStyle.globalExplorerOverride", "Icons & folders", C::ChangeLook, K),
    // Behaviour
    r("func", "Behaviour", C::ChangeSettings, L),
    r("settingsMode", "Behaviour", C::ChangeSettings, L),
    r("func.hideNativeTaskbar", "Behaviour", C::ChangeSettings, K),
    r("func.runOnStartup", "Behaviour", C::ChangeSettings, K),
    r("func.clipboardHistory", "Clipboard", C::ChangeSettings, K),
    r("func.trayHost", "Behaviour", C::ChangeSettings, K),
    r("func.injectedHook", "Internal", C::Destructive, B),
    r("widgets", "Widgets", C::ChangeSettings, L),
    r("sessions", "Sessions", C::ChangeSettings, K),
    r("activeSessionId", "Sessions", C::ChangeSettings, L),
    r("desktopGroups", "Desktop", C::ChangeSettings, L),
    r("tiling", "Workspaces & tiling", C::ArrangeWindows, L),
    r("workspaces", "Workspaces & tiling", C::ArrangeWindows, L),
    r("hotCorners", "Hot corners", C::ChangeSettings, L),
    r("altDrag", "Alt+drag", C::ChangeSettings, L),
    r("appSummon", "Summon keys", C::ChangeSettings, K),
    r("dndSchedule", "Do Not Disturb", C::QuickSettings, L),
    r("command", "Command & Shelf", C::ChangeSettings, L),
    // Never writable by an AI: its own permissions, AI privacy and keys, bookkeeping.
    r("mcp", "AI access", C::Destructive, B),
    r("ai", "AI access", C::Destructive, B),
    r("styledFolders", "Internal", C::Destructive, B),
    r("configVersion", "Internal", C::Destructive, B),
    r("onboardingCompleted", "Internal", C::Destructive, B),
    r("setupSeenVersion", "Internal", C::Destructive, B),
    // Other stores
    r("wallpaper", "Wallpaper & Playground", C::ChangeLook, L),
    r("wallpaper.accentHex", "Internal", C::Destructive, B),
    r("windowStyling", "Window styling", C::ChangeLook, L),
    r("cursorFx", "Pointer effects", C::ChangeLook, L),
    r("cursorFx.keystrokes", "Pointer effects", C::ChangeSettings, K),
    r("cursorFx.keystrokesAll", "Pointer effects", C::ChangeSettings, K),
    r("clipboard", "Clipboard", C::ChangeSettings, K),
    r("live", "Quick settings", C::QuickSettings, L),
    r("tester", "Testing", C::ChangeSettings, L),
    // Magic waves (docs/plans/MAGIC_WAVES.md): all off by default. The two that change how
    // Windows' pointer and Windows key behave always ask first.
    r("magicWaves", "Magic (preview)", C::ChangeSettings, L),
    r("magicWaves.mouse", "Magic (preview)", C::ChangeSettings, K),
    r("magicWaves.startButton", "Magic (preview)", C::ChangeSettings, K),
    // The Magic selection bar (docs/plans/SELECTION_BAR.md): turning it on lets Lens read finished
    // selections in other apps (through the selection rules), so it asks first; the rest is look
    // and behaviour.
    r("selectionBar", "Selection bar", C::ChangeSettings, L),
    r("selectionBar.enabled", "Selection bar", C::ChangeSettings, K),
    r("selectionBar.hotkeys", "Selection bar", C::ChangeSettings, K),
    r("selectionBar.searchHotkey", "Selection bar", C::ChangeSettings, K),
    r("selectionBar.webResults", "Selection bar", C::ChangeSettings, K),
];

/// (path, label, description, extra schema). Schema keys are merged into the inferred schema.
pub const FIELDS: &[(&str, &str, &str, &str)] = &[
    ("magicWaves.dashboard", "Magic Dashboard", "Turns on the Magic Dashboard, opened from a Top Bar button and Command.", r#"{}"#),
    ("magicWaves.widgets", "Dashboard widgets", "Shows the Widgets lane on the Magic Dashboard; Lens fetches only sources you approve.", r#"{}"#),
    ("magicWaves.mouse", "Magic Mouse", "Turns on Magic Mouse: the Lens pointer and hold-then-drag to grab part of the screen.", r#"{}"#),
    ("magicWaves.mouseHoldMs", "Magic Mouse hold time", "How long to hold the left button before a drag becomes a Magic grab, in milliseconds.", r#"{"minimum":200,"maximum":1200}"#),
    ("magicWaves.startButton", "Magic button", "Makes a Windows-key tap open Lens Magic Start; Ctrl+Esc still opens Windows Start.", r#"{}"#),
    ("magicWaves.shelfNotes", "Shelf to Notes", "Turns on making a note from the Shelf and exporting it.", r#"{}"#),
    ("magicWaves.studioV2", "Lens Studio v2", "Turns on the new Dock, Theme and Desktop studio with undo.", r#"{}"#),
    ("magicWaves.desktopWidgets", "Desktop widgets", "Pins widgets on the desktop, above the wallpaper and below your windows; local data only.", r#"{}"#),
    ("magicWaves.learn", "Learned ordering", "Lets the Dashboard reorder cards from how you use it, on this PC only, with a reason on each.", r#"{}"#),
    ("selectionBar.enabled", "Selection bar", "Shows the Magic selection bar after you select text: Cut, Copy, Paste, Magic Search and your actions. Off by default.", r#"{}"#),
    ("selectionBar.labels", "Button labels", "Icons only, labels on hover, or always labels on the selection bar.", r#"{"enum":["off","hover","always"]}"#),
    ("selectionBar.showCut", "Cut button", "Shows Cut on the selection bar when the text can be edited.", r#"{}"#),
    ("selectionBar.showCopy", "Copy button", "Shows Copy on the selection bar.", r#"{}"#),
    ("selectionBar.showPaste", "Paste button", "Shows Paste on the selection bar when the text can be edited and there is text to paste.", r#"{}"#),
    ("selectionBar.showSearch", "Magic Search button", "Shows Magic Search on the selection bar.", r#"{}"#),
    ("selectionBar.actions", "Your actions", "The actions on the selection bar, in order (ids from the action catalogue).", r#"{"maxItems":9}"#),
    ("selectionBar.maxActions", "Actions before More", "How many of your actions the bar shows before More.", r#"{"minimum":3,"maximum":9}"#),
    ("selectionBar.hotkeys", "Action hotkeys", "A global hotkey per selection-bar action (none by default); checked against Windows, Lens and app keys.", r#"{}"#),
    ("selectionBar.searchHotkey", "Magic Search hotkey", "A global hotkey for Magic Search on the current selection (none by default).", r#"{"maxLength":40}"#),
    ("selectionBar.triggerDrag", "Open after a drag", "A drag that selects text opens the bar.", r#"{}"#),
    ("selectionBar.triggerDoubleClick", "Open after a double click", "Double-clicking a word opens the bar.", r#"{}"#),
    ("selectionBar.triggerTripleClick", "Open after a triple click", "Triple-clicking a line or paragraph opens the bar.", r#"{}"#),
    ("selectionBar.delayMs", "Selection bar delay", "How long after you let go of the mouse the bar appears, in milliseconds.", r#"{"minimum":0,"maximum":600}"#),
    ("selectionBar.minChars", "Minimum characters", "Shorter selections don't open the bar.", r#"{"minimum":1,"maximum":50}"#),
    ("selectionBar.placement", "Bar placement", "Below the selection, above it, or at the pointer.", r#"{"enum":["below","above","pointer"]}"#),
    ("selectionBar.autoHideMs", "Auto-hide", "The bar hides on its own after this many milliseconds (0 = never).", r#"{"minimum":0,"maximum":30000}"#),
    ("selectionBar.hideDistancePx", "Hide distance", "The bar hides when the pointer moves this many pixels away.", r#"{"minimum":40,"maximum":600}"#),
    ("selectionBar.smart", "Smart actions", "Recognises links, e-mail addresses, sums, units, colours, paths and code, and shows a one-line preview. Local only.", r#"{}"#),
    ("selectionBar.smartOff", "Smart kinds off", "Smart kinds that are turned off.", r#"{"maxItems":12}"#),
    ("selectionBar.learn", "Learn from use", "Floats the actions you use most up the bar, from counts kept on this PC.", r#"{}"#),
    ("selectionBar.perApp", "Per-app actions", "An action set of its own for some apps (app → actions).", r#"{}"#),
    ("selectionBar.providers", "AI per action", "Which AI answers each action: local, default or Claude.", r#"{}"#),
    ("selectionBar.webResults", "Web results", "Magic Search shows web results from your search engine; the selection is sent to it only when you press Magic Search.", r#"{}"#),
    ("selectionBar.localResults", "Results from my files", "Magic Search also looks in your Shelf, clipboard history, notes and recent files, on this PC only.", r#"{}"#),
    ("theme.preset", "Theme pack", "The theme pack that sets colours, surfaces and window frames together.", r#"{"pattern":"pack"}"#),
    ("theme.accentMode", "Accent source", "Use the Windows accent colour or your own.", r#"{"enum":["windows","custom"]}"#),
    ("theme.customAccent", "Accent colour", "Your own accent colour, used when the accent source is custom.", r#"{"format":"hex-color"}"#),
    ("theme.glassOpacity", "Glass opacity", "How solid Lens surfaces are, from see-through glass (0.4) to solid (1.0).", r#"{"minimum":0.4,"maximum":1.0}"#),
    ("theme.blurPx", "Glass blur", "How much the background behind glass surfaces is blurred, in pixels.", r#"{"minimum":0,"maximum":40}"#),
    ("theme.borderRadius", "Roundness", "Corner radius of Lens surfaces and window frames, in pixels.", r#"{"minimum":0,"maximum":20}"#),
    ("theme.accentTintStrength", "Accent tint", "How strongly surfaces are tinted with the accent colour (0 = none, 1 = full).", r#"{"minimum":0,"maximum":1}"#),
    ("theme.customCss", "Custom CSS", "Extra CSS applied to Lens surfaces; risky, so it always asks first.", r#"{"maxLength":20000}"#),
    ("theme.fontFamily", "Font", "The font Lens surfaces use.", r#"{"maxLength":60}"#),
    ("theme.uiScale", "Interface scale", "Size of Lens text and controls, in percent.", r#"{"minimum":80,"maximum":150}"#),
    ("theme.surfaceHex", "Surface colour", "Solid base colour of the theme, used for native title bars (empty = default).", r#"{"format":"hex-color-or-empty"}"#),
    ("theme.motion", "Motion", "Follow Windows, reduce, or allow full animation.", r#"{"enum":["system","reduce","full"]}"#),
    ("theme.contrast", "Contrast", "Follow Windows or force high contrast.", r#"{"enum":["system","high"]}"#),
    ("theme.accentStrength", "Accent strength", "How much of your accent colour Lens's own surfaces show: switches, marks and focus rings (subtle), also selected items and main buttons (balanced), or stronger tints (vivid).", r#"{"enum":["subtle","balanced","vivid"]}"#),
    ("theme.locale", "Language", "Lens interface language.", r#"{"enum":["auto","en","es","de"]}"#),
    ("dock.style", "Dock style", "The Dock's shape: floating, slim, taskbar, studio, minimal, split, islands or unified.", r#"{"enum":["floating","slim","taskbar","studio","minimal","split","islands","unified"]}"#),
    ("dock.position", "Dock edge", "Which screen edge the Dock sits on.", r#"{"enum":["bottom","top","left","right"]}"#),
    ("dock.alignment", "Dock alignment", "Centre or left-align apps in the Taskbar style.", r#"{"enum":["center","left"]}"#),
    ("dock.systemArea", "Clock and system icons", "Whether the clock and system icons live in the Dock or the top bar.", r#"{"enum":["auto","dock","topbar"]}"#),
    ("dock.magnification", "Magnification", "How icons grow under the pointer: off, subtle or classic.", r#"{"enum":["off","subtle","classic"]}"#),
    ("dock.magnificationRange", "Magnification reach", "How many neighbouring icons grow with the hovered one.", r#"{"minimum":1,"maximum":4}"#),
    ("dock.launchAnimation", "Launch animation", "How an icon reacts when you open an app.", r#"{"enum":["none","lift","bounce","jelly"]}"#),
    ("dock.pinsUserOrdered", "Keep my Dock order", "On once you reorder Dock pins in Lens. Off: pins from the Windows taskbar follow its order.", "{}"),
    ("dock.autoHide", "Dock auto-hide", "Never hide, hide when a window overlaps, or always hide.", r#"{"enum":["never","smart","always"]}"#),
    ("dock.iconSize", "Dock icon size", "Size of Dock icons in pixels.", r#"{"minimum":24,"maximum":96}"#),
    ("dock.hoverScale", "Hover scale", "How much an icon grows on hover.", r#"{"minimum":1,"maximum":2}"#),
    ("dock.hoverLift", "Hover lift", "How far an icon rises on hover, in pixels.", r#"{"minimum":0,"maximum":24}"#),
    ("dock.groundedMarginBottom", "Dock gap", "Space between the Dock and the screen edge, in pixels.", r#"{"minimum":0,"maximum":48}"#),
    ("dock.pinnedApps", "Pinned apps", "The apps pinned to the Dock (names and paths).", "{}"),
    ("topBar.autoHide", "Top bar auto-hide", "When the top bar hides.", r#"{"enum":["overlap","never","always"]}"#),
    ("topBar.height", "Top bar height", "Height of the top bar in pixels.", r#"{"minimum":24,"maximum":64}"#),
    ("topBar.pointerHalo", "Pointer halo", "A see-through ring at the pointer where clicks pass through the top bar. Never shown while Windows' transparency effects are off.", "{}"),
    ("windowControls.style", "Window button style", "The look of window buttons, in Lens windows and over other apps: classic, soft, small dots or pills.", r#"{"enum":["traffic-classic","traffic-muted","minimal-dots","accent-pills"]}"#),
    ("settingsMode", "Settings detail", "Simple shows the core settings with previews; Advanced shows every option.", r#"{"enum":["","simple","advanced"]}"#),
    ("windowControls.order", "Window button order", "Order of the window buttons.", r#"{"enum":["yellow-green-red","green-yellow-red","red-yellow-green"]}"#),
    ("windowControls.position", "Window button side", "Which side window buttons sit on. Left is used where a title bar is free there; apps with tabs or tools in the title bar keep them on the right.", r#"{"enum":["top-right","top-left"]}"#),
    ("windowControls.excludedProcesses", "Apps without window buttons", "Apps Lens never draws its window buttons over, by file name (notepad.exe). Anti-cheat games and fullscreen apps are always left alone.", "{}"),
    ("windowControls.frameStyle", "Window frame", "The frame style drawn around app windows.", r#"{"enum":["accent-glow","obsidian-hairline","neon","none"]}"#),
    ("iconStyle.theme", "Icon style", "How app icons are styled.", r#"{"enum":["obsidian-squircle","frosted-glass","monochrome","accent-duotone","native"]}"#),
    ("iconStyle.shape", "Icon shape", "The shape of icon backplates.", r#"{"enum":["squircle","rounded","circle","borderless"]}"#),
    ("folderStyle.theme", "Folder colour", "Colour theme for folder icons.", r#"{"enum":["accent","obsidian","cobalt","emerald","amber","rose","minimal","neon"]}"#),
    ("folderStyle.globalExplorerOverride", "Style all Explorer folders", "Applies the folder theme to every folder in File Explorer (reversible, asks first).", "{}"),
    ("func.hideNativeTaskbar", "Hide Windows taskbar", "Hides the Windows taskbar while Lens runs (restored when Lens quits).", "{}"),
    ("func.runOnStartup", "Start with Windows", "Starts Lens when you sign in.", "{}"),
    ("func.clipboardHistory", "Clipboard history", "Keeps a private clipboard history on this PC.", "{}"),
    ("func.popoutCloseDelay", "Pop-out close delay", "How long Quick Settings and Settings on the Dock wait before closing when the pointer leaves.", r#"{"enum":["short","normal","long"]}"#),
    ("wallpaper.scene", "Playground scene", "The living wallpaper scene (empty = show the wallpaper image).", r#"{"enum":["","sand","ink","flow","constellation","aurora","rain","starfield","sky-clock"]}"#),
    ("wallpaper.fit", "Wallpaper fit", "How the wallpaper image fills the screen.", r#"{"enum":["cover","contain","fill","center"]}"#),
    ("wallpaper.blur", "Wallpaper blur", "Blur applied to the wallpaper, in pixels.", r#"{"minimum":0,"maximum":40}"#),
    ("wallpaper.dim", "Wallpaper dim", "Darkening over the wallpaper, in percent.", r#"{"minimum":0,"maximum":80}"#),
    ("wallpaper.saturation", "Wallpaper saturation", "Colour saturation of the wallpaper, in percent.", r#"{"minimum":0,"maximum":200}"#),
    ("wallpaper.fps", "Scene frame rate", "Frame cap for Playground scenes.", r#"{"enum":[30,60]}"#),
    ("wallpaper.idleMinutes", "Idle mode delay", "Minutes without input before idle mode shows a scene.", r#"{"minimum":1,"maximum":120}"#),
    ("wallpaper.calm", "Calm", "Freezes the scene into a still picture and stops following the pointer.", "{}"),
    ("windowStyling.dimInactive", "Dim inactive windows", "Darkens windows behind the focused one, 0–40 %.", r#"{"minimum":0,"maximum":40}"#),
    ("windowStyling.peekDelayMs", "Hover peek delay", "How long a Dock preview is hovered before peek starts, in ms.", r#"{"minimum":200,"maximum":2000}"#),
    ("windowStyling.skipFullscreen", "Leave fullscreen apps alone", "Never dims or borders fullscreen windows such as games and videos.", "{}"),
    ("cursorFx.spotlightRadius", "Spotlight size", "Radius of the presenter spotlight, in pixels.", r#"{"minimum":60,"maximum":400}"#),
    ("cursorFx.color", "Effect colour", "Colour of pointer effects: accent or #rrggbb.", r#"{"format":"accent-or-hex"}"#),
    ("cursorFx.keystrokes", "Show shortcuts on screen", "Shows pressed shortcuts on screen (never saved).", "{}"),
    ("cursorFx.keystrokesAll", "Show every key", "Shows every key including letters; off by default for privacy.", "{}"),
    ("live.volume", "Volume", "Master volume, 0–100 %.", r#"{"minimum":0,"maximum":100}"#),
    ("live.brightness", "Brightness", "Built-in display brightness, 10–100 %.", r#"{"minimum":10,"maximum":100}"#),
    ("live.muted", "Mute", "Mutes or unmutes the sound.", "{}"),
    ("live.nightLight", "Night light", "Warm night light on or off.", "{}"),
    ("live.dnd", "Do Not Disturb", "Pauses notification pop-ups.", "{}"),
    ("clipboard.enabled", "Clipboard history", "Keeps an encrypted clipboard history on this PC.", "{}"),
    ("clipboard.maxItems", "Clipboard size", "How many clips to keep.", r#"{"minimum":10,"maximum":10000}"#),
    ("clipboard.maxDays", "Clipboard retention", "Days to keep clips (0 = until the size limit).", r#"{"minimum":0,"maximum":3650}"#),
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub store: String,
    pub label: String,
    pub description: String,
    /// A ready-to-use `lens_set` example.
    pub example: String,
    pub category: String,
    pub capability: Capability,
    pub risk: Risk,
    pub reversible: bool,
    pub schema: Value,
    pub default: Value,
}

/// Settings whose defaults are read from this PC.
pub const MACHINE_DEFAULTS: [&str; 2] = ["dock.pinnedApps", "dock.pinnedFolders"];

pub fn rule_for(path: &str) -> Option<&'static Rule> {
    RULES
        .iter()
        .filter(|r| path == r.prefix || path.starts_with(&format!("{}.", r.prefix)))
        .max_by_key(|r| r.prefix.len())
}

fn field(path: &str) -> Option<&'static (&'static str, &'static str, &'static str, &'static str)> {
    FIELDS.iter().find(|f| f.0 == path)
}

/// Splits a catalogue path into (store, path inside the store).
pub fn split_store(path: &str) -> (&'static str, String) {
    for s in STORES.iter().skip(1) {
        if path == *s {
            return (s, String::new());
        }
        if let Some(rest) = path.strip_prefix(&format!("{}.", s)) {
            return (s, rest.to_string());
        }
    }
    ("config", path.to_string())
}

/// Joins a store id and an inner path back into a catalogue path.
pub fn join_store(store: &str, inner: &str) -> String {
    if store == "config" {
        inner.to_string()
    } else if inner.is_empty() {
        store.to_string()
    } else {
        format!("{}.{}", store, inner)
    }
}

/// Leaf paths of a JSON value. Arrays, empty objects and nulls are leaves (set as a whole).
pub fn leaves(v: &Value, prefix: &str, out: &mut Vec<(String, Value)>) {
    match v {
        Value::Object(m) if !m.is_empty() && !is_free_map(prefix) => {
            for (k, child) in m {
                let p = if prefix.is_empty() { k.clone() } else { format!("{}.{}", prefix, k) };
                leaves(child, &p, out);
            }
        }
        _ => out.push((prefix.to_string(), v.clone())),
    }
}

/// Maps whose keys are data, not fields (set as a whole).
fn is_free_map(path: &str) -> bool {
    matches!(
        path,
        "dock.iconSizes" | "wallpaper.workspaceScenes" | "wallpaper.sceneOptions" | "command" | "desktopGroups" | "selectionBar.hotkeys" | "selectionBar.perApp" | "selectionBar.providers"
    )
}

/// "dock.magnificationRange" → "Magnification range".
pub fn auto_label(path: &str) -> String {
    let last = path.rsplit('.').next().unwrap_or(path);
    let mut out = String::new();
    for (i, ch) in last.chars().enumerate() {
        if ch.is_uppercase() && i > 0 {
            out.push(' ');
            out.extend(ch.to_lowercase());
        } else if i == 0 {
            out.extend(ch.to_uppercase());
        } else {
            out.push(ch);
        }
    }
    out
}

fn infer_schema(v: &Value) -> Value {
    match v {
        Value::Bool(_) => json!({ "type": "boolean" }),
        Value::Number(n) if n.is_f64() => json!({ "type": "number" }),
        Value::Number(_) => json!({ "type": "integer" }),
        Value::String(_) => json!({ "type": "string", "maxLength": 400 }),
        Value::Array(_) => json!({ "type": "array", "maxItems": 200 }),
        Value::Object(_) => json!({ "type": "object" }),
        Value::Null => json!({}),
    }
}

fn example_value(schema: &Value, default: &Value) -> Value {
    if let Some(e) = schema.get("enum").and_then(Value::as_array) {
        if let Some(other) = e.iter().find(|x| *x != default && !(x.is_string() && x.as_str() == Some(""))) {
            return other.clone();
        }
    }
    match default {
        Value::Bool(b) => Value::Bool(!b),
        Value::Number(n) => {
            let max = schema.get("maximum").and_then(Value::as_f64);
            let min = schema.get("minimum").and_then(Value::as_f64);
            if n.is_f64() {
                let x = n.as_f64().unwrap_or(0.0);
                let mid = match (min, max) {
                    (Some(a), Some(b)) => ((a + b) / 2.0 * 100.0).round() / 100.0,
                    _ => x,
                };
                json!(if (mid - x).abs() < f64::EPSILON { x } else { mid })
            } else {
                let x = n.as_i64().unwrap_or(0);
                let mid = match (min, max) {
                    (Some(a), Some(b)) => ((a + b) / 2.0).round() as i64,
                    _ => x + 1,
                };
                json!(if mid == x { x + 1 } else { mid })
            }
        }
        _ => default.clone(),
    }
}

/// Builds the catalogue from each store's default value.
pub fn build(defaults: &[(&str, Value)]) -> Vec<Entry> {
    let mut out = Vec::new();
    for (store, v) in defaults {
        let mut ls = Vec::new();
        leaves(v, "", &mut ls);
        for (inner, default) in ls {
            if inner.is_empty() {
                continue;
            }
            let path = join_store(store, &inner);
            let Some(rule) = rule_for(&path) else { continue };
            // Defaults that come from this PC (user folders, taskbar pins) are not part of the
            // catalogue: they differ per machine and would leak user paths into the export.
            let default = if MACHINE_DEFAULTS.contains(&path.as_str()) && default.is_array() { Value::Array(vec![]) } else { default };
            let mut schema = infer_schema(&default);
            let (label, description) = match field(&path) {
                Some((_, label, desc, extra)) => {
                    if let (Value::Object(base), Ok(Value::Object(more))) = (&mut schema, serde_json::from_str::<Value>(extra)) {
                        for (k, v) in more {
                            base.insert(k, v);
                        }
                    }
                    (label.to_string(), desc.to_string())
                }
                None => {
                    let l = auto_label(&path);
                    let d = format!("Sets the {} option under {}.", l.to_lowercase(), rule.category);
                    (l, d)
                }
            };
            let ex = example_value(&schema, &default);
            let example = json!({ "tool": "lens_set", "args": { "changes": { path.clone(): ex } } }).to_string();
            out.push(Entry {
                path,
                store: store.to_string(),
                label,
                description,
                example,
                category: rule.category.to_string(),
                capability: rule.capability,
                risk: rule.risk,
                reversible: rule.reversible,
                schema,
                default,
            });
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

/// Leaves with no rule (the completeness test asserts this is empty).
#[cfg_attr(not(test), allow(dead_code))]
pub fn unregistered(defaults: &[(&str, Value)]) -> Vec<String> {
    let mut missing = Vec::new();
    for (store, v) in defaults {
        let mut ls = Vec::new();
        leaves(v, "", &mut ls);
        for (inner, _) in ls {
            let path = join_store(store, &inner);
            if !inner.is_empty() && rule_for(&path).is_none() {
                missing.push(path);
            }
        }
    }
    missing
}

/// Case-insensitive search over path, label, description and category.
pub fn search<'a>(entries: &'a [Entry], query: &str, limit: usize) -> Vec<&'a Entry> {
    let q = query.trim().to_lowercase();
    let words: Vec<&str> = q.split_whitespace().collect();
    let mut scored: Vec<(usize, &Entry)> = entries
        .iter()
        .filter_map(|e| {
            if words.is_empty() {
                return Some((0, e));
            }
            let hay = format!("{} {} {} {}", e.path, e.label, e.description, e.category).to_lowercase();
            if !words.iter().all(|w| hay.contains(w)) {
                return None;
            }
            let score = if e.path.to_lowercase() == q { 0 } else if e.label.to_lowercase().contains(&q) { 1 } else { 2 };
            Some((score, e))
        })
        .collect();
    scored.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.path.cmp(&b.1.path)));
    scored.into_iter().take(limit).map(|(_, e)| e).collect()
}

fn is_hex(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Validates a value against an entry's schema (the subset the catalogue produces).
pub fn validate_value(e: &Entry, v: &Value) -> Result<(), String> {
    let s = &e.schema;
    let label = &e.label;
    if let Some(t) = s.get("type").and_then(Value::as_str) {
        let ok = match t {
            "boolean" => v.is_boolean(),
            "integer" => v.as_i64().is_some() || v.as_u64().is_some(),
            "number" => v.is_number(),
            "string" => v.is_string(),
            "array" => v.is_array(),
            "object" => v.is_object(),
            _ => true,
        };
        if !ok {
            return Err(format!("{} must be a {}.", label, t));
        }
    }
    if let Some(e) = s.get("enum").and_then(Value::as_array) {
        if !e.contains(v) {
            let opts: Vec<String> = e.iter().map(|x| x.to_string()).collect();
            return Err(format!("{} must be one of {}.", label, opts.join(", ")));
        }
    }
    if let Some(x) = v.as_f64() {
        if let Some(min) = s.get("minimum").and_then(Value::as_f64) {
            if x < min {
                return Err(format!("{} must be at least {}.", label, min));
            }
        }
        if let Some(max) = s.get("maximum").and_then(Value::as_f64) {
            if x > max {
                return Err(format!("{} must be at most {}.", label, max));
            }
        }
    }
    if let Some(st) = v.as_str() {
        if let Some(max) = s.get("maxLength").and_then(Value::as_u64) {
            if st.chars().count() as u64 > max {
                return Err(format!("{} is too long.", label));
            }
        }
        if st.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
            return Err(format!("{} contains control characters.", label));
        }
        match s.get("format").and_then(Value::as_str) {
            Some("hex-color") if !is_hex(st) => return Err(format!("{} must be a colour like #3b82f6.", label)),
            Some("hex-color-or-empty") if !st.is_empty() && !is_hex(st) => {
                return Err(format!("{} must be a colour like #1e1e2e or empty.", label))
            }
            Some("accent-or-hex") if st != "accent" && !is_hex(st) => {
                return Err(format!("{} must be \"accent\" or a colour like #3b82f6.", label))
            }
            _ => {}
        }
        if s.get("pattern").and_then(Value::as_str) == Some("pack")
            && (st.is_empty() || st.len() > 48 || !st.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'))
        {
            return Err(format!("{} must be a theme pack id such as \"nord-frost\".", label));
        }
    }
    if let Some(a) = v.as_array() {
        if let Some(max) = s.get("maxItems").and_then(Value::as_u64) {
            if a.len() as u64 > max {
                return Err(format!("{} has too many items.", label));
            }
        }
    }
    if v.to_string().len() > 64 * 1024 {
        return Err(format!("{} is too large.", label));
    }
    Ok(())
}

/// The catalogue as the JSON document exported to src/control/catalogue.json.
pub fn export_json(entries: &[Entry]) -> Value {
    let mut cats: Map<String, Value> = Map::new();
    for e in entries {
        let n = cats.get(&e.category).and_then(Value::as_u64).unwrap_or(0);
        cats.insert(e.category.clone(), json!(n + 1));
    }
    json!({
        "generatedBy": "src-tauri/src/control (cargo test export_catalogue)",
        "count": entries.len(),
        "categories": cats,
        "capabilities": super::Capability::ALL.iter().map(|c| json!({ "id": c.id(), "label": c.label() })).collect::<Vec<_>>(),
        "tools": super::tools::TOOLS.iter().map(|t| json!({ "name": t.name, "description": t.description, "capability": t.capability.id() })).collect::<Vec<_>>(),
        "entries": entries,
    })
}
