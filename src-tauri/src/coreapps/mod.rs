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
    /// SVG path data on a 24×24 grid, stroked.
    pub glyph: &'static str,
    /// Two-stop tint for the icon tile.
    pub tint: (&'static str, &'static str),
}

pub const APPS: &[CoreApp] = &[
    CoreApp {
        id: "monitor",
        title: "Lens Monitor",
        names: &["monitor", "system monitor", "lens monitor", "resource monitor lens", "whats slowing my pc", "what's slowing my pc"],
        size: (920.0, 680.0),
        glyph: "M3 12h4l3-8 4 16 3-8h4",
        tint: ("#3B82F6", "#1E3A8A"),
    },
    CoreApp {
        id: "startup",
        title: "Lens Startup & Uninstall",
        names: &["startup apps", "startup", "lens startup", "uninstall", "uninstaller", "lens uninstall", "uninstall apps"],
        size: (900.0, 680.0),
        glyph: "M12 3v9M7.5 6.5a7 7 0 1 0 9 0",
        tint: ("#F97316", "#9A3412"),
    },
    CoreApp {
        id: "timer",
        title: "Lens Timer",
        names: &["timer", "timers", "lens timer", "stopwatch", "pomodoro", "alarm", "alarms", "lens alarms"],
        size: (760.0, 620.0),
        glyph: "M12 8v5l3 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
        tint: ("#EF4444", "#7F1D1D"),
    },
    CoreApp {
        id: "calculator",
        title: "Lens Calculator",
        names: &["lens calculator", "lens calc", "unit converter", "converter", "programmer calculator"],
        size: (760.0, 640.0),
        glyph: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h1M12 12h1M16 12h0M8 16h1M12 16h1M16 16h0",
        tint: ("#64748B", "#1E293B"),
    },
    CoreApp {
        id: "color",
        title: "Lens Color",
        names: &["color picker", "colour picker", "lens color", "lens colour", "eyedropper", "contrast checker"],
        size: (760.0, 640.0),
        glyph: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-.8-1.4-.8-2.3 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3zM7.5 11.5h0M10 7.5h0M14.5 7.5h0",
        tint: ("#A855F7", "#581C87"),
    },
    CoreApp {
        id: "notes",
        title: "Lens Notes",
        names: &["lens notes", "lens note", "lens todo", "lens to do", "lens to-do", "to do list", "todo list"],
        size: (820.0, 640.0),
        glyph: "M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5",
        tint: ("#EAB308", "#713F12"),
    },
    CoreApp {
        id: "power",
        title: "Lens Power",
        names: &["power", "battery", "battery health", "lens power", "lens battery"],
        size: (820.0, 640.0),
        glyph: "M4 8h14v8H4zM18 11h2v2h-2M9 9.5 7.5 12h3L9 14.5",
        tint: ("#22C55E", "#14532D"),
    },
    CoreApp {
        id: "network",
        title: "Lens Network",
        names: &["network", "lens network", "who's using my internet", "whos using my internet", "connections", "wi-fi details", "wifi details"],
        size: (860.0, 660.0),
        glyph: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h0",
        tint: ("#06B6D4", "#164E63"),
    },
    CoreApp {
        id: "clipboard",
        title: "Lens Clipboard",
        names: &["clipboard", "clipboard history", "lens clipboard"],
        size: (760.0, 640.0),
        glyph: "M9 3h6v3H9zM7 5H5v16h14V5h-2M8 11h8M8 15h6",
        tint: ("#14B8A6", "#134E4A"),
    },
    CoreApp {
        id: "feeds",
        title: "Lens Feeds",
        names: &["lens feeds", "feeds", "news feed", "my feeds"],
        size: (440.0, 720.0),
        glyph: "M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14M6 18h0",
        tint: ("#F59E0B", "#78350F"),
    },
    CoreApp {
        id: "messages",
        title: "Lens Messages",
        names: &["lens messages", "lens inbox", "unified inbox"],
        size: (440.0, 720.0),
        glyph: "M4 5h16v11H9l-5 4z",
        tint: ("#6366F1", "#312E81"),
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

/// The app icon as an SVG data URL (Dock, Launcher, window badge).
pub fn icon_svg(id: &str) -> Option<String> {
    let a = by_id(id)?;
    Some(format!(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='{a}'/><stop offset='1' stop-color='{b}'/></linearGradient></defs><rect x='2' y='2' width='60' height='60' rx='16' fill='url(#g)'/><rect x='2.5' y='2.5' width='59' height='59' rx='15.5' fill='none' stroke='white' stroke-opacity='.18'/><g transform='translate(14 14) scale(1.5)' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='{p}'/></g></svg>",
        a = a.tint.0,
        b = a.tint.1,
        p = a.glyph
    ))
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

/// Minutes east of UTC on this PC right now, daylight saving included. `None` when Windows can't
/// say (and on other systems, where the tests run): callers then leave times as they are.
#[cfg(windows)]
pub fn local_offset_min() -> Option<i32> {
    #[repr(C)]
    #[allow(dead_code)]
    struct SystemTime {
        fields: [u16; 8],
    }
    /// `TIME_ZONE_INFORMATION` (timezoneapi.h).
    #[repr(C)]
    #[allow(dead_code)]
    struct TimeZoneInformation {
        bias: i32,
        standard_name: [u16; 32],
        standard_date: SystemTime,
        standard_bias: i32,
        daylight_name: [u16; 32],
        daylight_date: SystemTime,
        daylight_bias: i32,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetTimeZoneInformation(info: *mut TimeZoneInformation) -> u32;
    }
    const TIME_ZONE_ID_STANDARD: u32 = 1;
    const TIME_ZONE_ID_DAYLIGHT: u32 = 2;
    const TIME_ZONE_ID_INVALID: u32 = u32::MAX;

    let mut info = std::mem::MaybeUninit::<TimeZoneInformation>::zeroed();
    // SAFETY: `info` is a writable TIME_ZONE_INFORMATION of the right size and layout; the call
    // only fills it in.
    let id = unsafe { GetTimeZoneInformation(info.as_mut_ptr()) };
    if id == TIME_ZONE_ID_INVALID {
        return None;
    }
    // SAFETY: zero-initialised above and every field is a plain integer, so any bit pattern is valid.
    let info = unsafe { info.assume_init() };
    Some(offset_from_bias(info.bias, info.standard_bias, info.daylight_bias, id == TIME_ZONE_ID_STANDARD, id == TIME_ZONE_ID_DAYLIGHT))
}

#[cfg(not(windows))]
pub fn local_offset_min() -> Option<i32> {
    None
}

/// Windows gives "minutes to add to local time to get UTC" (west is positive) plus a correction
/// for the season in force; Lens keeps minutes east of UTC.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn offset_from_bias(bias: i32, standard_bias: i32, daylight_bias: i32, standard: bool, daylight: bool) -> i32 {
    let season = if daylight {
        daylight_bias
    } else if standard {
        standard_bias
    } else {
        0
    };
    (-(bias + season)).clamp(-14 * 60, 14 * 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_bias_becomes_minutes_east() {
        // Phoenix: UTC-7 all year (bias 420, no daylight time).
        assert_eq!(offset_from_bias(420, 0, 0, false, false), -420);
        // Berlin: bias -60; summer adds the daylight bias of -60.
        assert_eq!(offset_from_bias(-60, 0, -60, true, false), 60);
        assert_eq!(offset_from_bias(-60, 0, -60, false, true), 120);
        // New York in summer.
        assert_eq!(offset_from_bias(300, 0, -60, false, true), -240);
        // Nonsense from the OS stays inside the range the timer store accepts.
        assert_eq!(offset_from_bias(-5000, 0, 0, false, false), 14 * 60);
    }

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
