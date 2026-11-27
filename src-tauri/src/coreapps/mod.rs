//! Lens core apps: small companion windows (Monitor, Startup & Uninstall, Timer, Calculator,
//! Color, Notes, Power, Network, Clipboard) built on backends Lens already has.
//! See docs/CORE_APPS.md.
//!
//! Everything in this module is pure (tested on any OS); the Windows calls live in
//! `commands/coreapps.rs` and in the `#[cfg(windows)]` blocks of the submodules.

pub mod battery;
pub mod color;
pub mod monitor;
pub mod net;
pub mod timers;
pub mod uninstall;

/// One core app: its id (window label `coreapp-<id>`, route `?surface=coreapp&app=<id>`),
/// its name, the words voice and Command accept for it, and its icon glyph.
pub struct CoreApp {
    pub id: &'static str,
    pub title: &'static str,
    /// Spoken / typed names. Names that collide with a Windows app (calculator, notes) are only
    /// listed with the "lens" prefix, so "open calculator" still opens Windows Calculator.
    pub names: &'static [&'static str],
    /// Default window size (logical px).
    pub size: (f64, f64),
    /// SVG path data on a 24×24 grid, stroked (src/icons/lensApps.ts `LENS_APP_GLYPHS`).
    pub glyph: &'static str,
}

pub const APPS: &[CoreApp] = &[
    CoreApp {
        id: "monitor",
        title: "Lens Monitor",
        names: &["monitor", "system monitor", "lens monitor", "resource monitor lens", "whats slowing my pc", "what's slowing my pc"],
        size: (920.0, 680.0),
        glyph: "M3 12h4l2.5-6 5 12 2.5-6H21",
    },
    CoreApp {
        id: "startup",
        title: "Lens Startup & Uninstall",
        names: &["startup apps", "startup", "lens startup", "uninstall", "uninstaller", "lens uninstall", "uninstall apps"],
        size: (900.0, 680.0),
        glyph: "M12 16V4M7 9l5-5 5 5M5 20h14",
    },
    CoreApp {
        id: "timer",
        title: "Lens Timer",
        names: &["timer", "timers", "lens timer", "stopwatch", "pomodoro", "alarm", "alarms", "lens alarms"],
        size: (760.0, 620.0),
        glyph: "M19 14a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM12 14v-3.5M10 3h4",
    },
    CoreApp {
        id: "calculator",
        title: "Lens Calculator",
        names: &["lens calculator", "lens calc", "unit converter", "converter", "programmer calculator"],
        size: (760.0, 640.0),
        glyph: "M7 4v6M4 7h6M14 7h6M14 15h6M14 19h6M5 15l4 4M9 15l-4 4",
    },
    CoreApp {
        id: "color",
        title: "Lens Color",
        names: &["color picker", "colour picker", "lens color", "lens colour", "eyedropper", "contrast checker"],
        size: (760.0, 640.0),
        glyph: "M12 3.5c3 3.5 6 6.9 6 10.5a6 6 0 0 1-12 0c0-3.6 3-7 6-10.5z",
    },
    CoreApp {
        id: "notes",
        title: "Lens Notes",
        names: &["lens notes", "lens note", "lens todo", "lens to do", "lens to-do", "to do list", "todo list"],
        size: (820.0, 640.0),
        glyph: "M13 20h7M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z",
    },
    CoreApp {
        id: "power",
        title: "Lens Power",
        names: &["power", "battery", "battery health", "lens power", "lens battery"],
        size: (820.0, 640.0),
        glyph: "M5 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM21 10.5v3",
    },
    CoreApp {
        id: "network",
        title: "Lens Network",
        names: &["network", "lens network", "who's using my internet", "whos using my internet", "connections", "wi-fi details", "wifi details"],
        size: (860.0, 660.0),
        glyph: "M3.5 9.5a12 12 0 0 1 17 0M7 13.2a7 7 0 0 1 10 0M12 18h.01",
    },
    CoreApp {
        id: "clipboard",
        title: "Lens Clipboard",
        names: &["clipboard", "clipboard history", "lens clipboard"],
        size: (760.0, 640.0),
        glyph: "M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1M9 3h6v4H9z",
    },
    CoreApp {
        id: "feeds",
        title: "Lens Feeds",
        names: &["lens feeds", "feeds", "news feed", "my feeds"],
        size: (440.0, 720.0),
        glyph: "M5 11a8 8 0 0 1 8 8M5 4a15 15 0 0 1 15 15M5.5 18.5h.01",
    },
    CoreApp {
        id: "messages",
        title: "Lens Messages",
        names: &["lens messages", "lens inbox", "unified inbox"],
        size: (440.0, 720.0),
        glyph: "M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z",
    },
];

/// Dock pins for core apps use this pseudo-path ("lens-app:timer"); `launch_app_cmd` opens the
/// window instead of asking Windows to run it.
pub const PIN_PREFIX: &str = "lens-app:";

pub fn by_id(id: &str) -> Option<&'static CoreApp> {
    APPS.iter().find(|a| a.id == id)
}

/// The core app a Dock pin points at, if it is one.
pub fn pin_target(path: &str) -> Option<&'static str> {
    let id = path.trim().strip_prefix(PIN_PREFIX)?;
    by_id(id).map(|a| a.id)
}

pub fn window_label(id: &str) -> String {
    format!("coreapp-{id}")
}

/// Lowercase, punctuation-free, without a leading "the"/"my" or a trailing "app"/"window".
pub fn normalise_name(name: &str) -> String {
    let lower: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '\'' || c == '-' || c == ' ' { c } else { ' ' })
        .collect();
    let mut words: Vec<&str> = lower.split_whitespace().collect();
    while matches!(words.first(), Some(&"the") | Some(&"my")) {
        words.remove(0);
    }
    while matches!(words.last(), Some(&"app") | Some(&"window") | Some(&"please")) {
        words.pop();
    }
    words.join(" ")
}

/// The core app a spoken or typed name means ("Lens, open timer" → "timer").
/// `None` hands the name to the normal Start-menu lookup.
pub fn voice_target(name: &str) -> Option<&'static str> {
    let n = normalise_name(name);
    if n.is_empty() {
        return None;
    }
    APPS.iter().find(|a| a.names.iter().any(|x| *x == n) || n == a.id && !matches!(a.id, "calculator" | "notes")).map(|a| a.id)
}

/// Lens's own app-icon tile around one glyph: a plain matte tile, a faint hairline and a bold white
/// stroke (DESIGN.md §6). Identical to `TILE_OPEN` / `TILE_CLOSE` in src/icons/lensApps.ts (a bun
/// test compares them).
pub const ICON_OPEN: &str = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect x='2' y='2' width='60' height='60' rx='15' fill='#18181B'/><rect x='2.5' y='2.5' width='59' height='59' rx='14.5' fill='none' stroke='white' stroke-opacity='.1'/><g transform='translate(12.5 12.5) scale(1.625)' fill='none' stroke='#FAFAFA' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'>";
pub const ICON_CLOSE: &str = "</g></svg>";

/// The app icon as SVG (Dock, Launcher, window badge).
pub fn icon_svg(id: &str) -> Option<String> {
    let a = by_id(id)?;
    Some(format!("{ICON_OPEN}<path d='{}'/>{ICON_CLOSE}", a.glyph))
}

pub fn icon_data_url(id: &str) -> Option<String> {
    icon_svg(id).map(|svg| format!("data:image/svg+xml,{}", percent_encode(&svg)))
}

fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3 / 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b' ' | b'\'' | b'=' | b'/' | b':' | b',' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_labels_fit_the_capability_pattern() {
        let mut ids: Vec<_> = APPS.iter().map(|a| a.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), APPS.len());
        for a in APPS {
            assert!(window_label(a.id).starts_with("coreapp-"));
            assert!(a.id.chars().all(|c| c.is_ascii_lowercase()));
        }
    }

    #[test]
    fn pins_resolve_only_known_apps() {
        assert_eq!(pin_target("lens-app:timer"), Some("timer"));
        assert_eq!(pin_target("lens-app:nope"), None);
        assert_eq!(pin_target("C:\\Windows\\notepad.exe"), None);
    }

    #[test]
    fn voice_names() {
        assert_eq!(voice_target("timer"), Some("timer"));
        assert_eq!(voice_target("the Timer app"), Some("timer"));
        assert_eq!(voice_target("Lens Monitor"), Some("monitor"));
        assert_eq!(voice_target("battery health"), Some("power"));
        // Names Windows owns stay with Windows unless "lens" is said.
        assert_eq!(voice_target("calculator"), None);
        assert_eq!(voice_target("notes"), None);
        assert_eq!(voice_target("lens calculator"), Some("calculator"));
        assert_eq!(voice_target("spotify"), None);
        assert_eq!(voice_target(""), None);
    }

    #[test]
    fn icons_are_data_urls_without_raw_hashes() {
        for a in APPS {
            let u = icon_data_url(a.id).unwrap();
            assert!(u.starts_with("data:image/svg+xml,"));
            assert!(!u.contains('#'), "a raw # would end the data URL early");
            assert!(!u.contains('<'));
        }
    }
}
