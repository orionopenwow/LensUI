//! Every voice command Lens understands: shown by "Lens, help", listed (and switchable) in the
//! Voice settings card, and used for "did you mean" suggestions. Standard library only.

pub struct CommandInfo {
    /// Stable id: the intent action, or a voice-only command id.
    pub id: &'static str,
    pub group: &'static str,
    pub title: &'static str,
    /// What to say (the first one is shown in help).
    pub examples: &'static [&'static str],
    /// "low" runs straight away, "confirm" asks first, "guarded" runs only into safe targets.
    pub risk: &'static str,
}

#[cfg(test)]
pub const GROUPS: &[&str] = &["Windows", "Apps", "Desktop", "Look", "System", "Shelf & clipboard", "Ask & Command", "Voice"];

pub const COMMANDS: &[CommandInfo] = &[
    // Windows
    CommandInfo { id: "window_action", group: "Windows", title: "Minimise, restore, maximise, pin", examples: &["minimise this", "restore", "maximise this", "pin this on top", "unpin this window", "minimise chrome"], risk: "low" },
    CommandInfo { id: "close_app", group: "Windows", title: "Close a window or app", examples: &["close this window", "close notepad"], risk: "confirm" },
    CommandInfo { id: "snap_window", group: "Windows", title: "Snap the window", examples: &["snap left", "snap right", "move window to the top left", "centre this"], risk: "low" },
    CommandInfo { id: "move_window", group: "Windows", title: "Move to another monitor or workspace", examples: &["move this to the next monitor", "move this window to workspace two"], risk: "low" },
    CommandInfo { id: "arrange_windows", group: "Windows", title: "Arrange windows", examples: &["arrange windows", "grid layout", "side by side"], risk: "low" },
    CommandInfo { id: "show_desktop", group: "Windows", title: "Show the desktop", examples: &["show desktop", "minimise everything"], risk: "low" },
    // Apps
    CommandInfo { id: "open_app", group: "Apps", title: "Open an app", examples: &["open spotify", "launch visual studio code"], risk: "low" },
    CommandInfo { id: "switch_app", group: "Apps", title: "Switch to an app", examples: &["switch to chrome", "go to slack"], risk: "low" },
    CommandInfo { id: "search_files", group: "Apps", title: "Find files and apps", examples: &["find budget", "where is my resume"], risk: "low" },
    // Desktop
    CommandInfo { id: "switch_workspace", group: "Desktop", title: "Switch workspace", examples: &["workspace two", "next workspace", "previous workspace"], risk: "low" },
    CommandInfo { id: "open_overview", group: "Desktop", title: "Overview", examples: &["overview", "show all windows"], risk: "low" },
    CommandInfo { id: "next_wallpaper", group: "Desktop", title: "Next wallpaper", examples: &["next wallpaper"], risk: "low" },
    CommandInfo { id: "set_wallpaper_scene", group: "Desktop", title: "Living wallpaper scene", examples: &["show the aurora scene", "falling sand"], risk: "low" },
    CommandInfo { id: "set_calm_mode", group: "Desktop", title: "Calm mode", examples: &["calm mode", "calm mode off"], risk: "low" },
    // Look
    CommandInfo { id: "set_color_mode", group: "Look", title: "Dark or light mode", examples: &["dark mode", "light mode"], risk: "low" },
    CommandInfo { id: "set_theme_pack", group: "Look", title: "Theme", examples: &["theme tokyo night", "use the nord theme"], risk: "low" },
    CommandInfo { id: "set_accent", group: "Look", title: "Accent colour", examples: &["accent purple", "change the accent colour to teal"], risk: "low" },
    CommandInfo { id: "set_dock_style", group: "Look", title: "Dock style", examples: &["make the dock slim", "switch the dock to taskbar"], risk: "low" },
    // System
    CommandInfo { id: "set_volume", group: "System", title: "Volume", examples: &["volume thirty percent", "louder", "turn it down"], risk: "low" },
    CommandInfo { id: "set_mute", group: "System", title: "Mute sound", examples: &["mute", "unmute"], risk: "low" },
    CommandInfo { id: "set_brightness", group: "System", title: "Brightness", examples: &["brightness sixty", "dim the screen"], risk: "low" },
    CommandInfo { id: "set_dnd", group: "System", title: "Do Not Disturb", examples: &["do not disturb", "do not disturb for thirty minutes"], risk: "low" },
    CommandInfo { id: "set_focus_mode", group: "System", title: "Focus mode", examples: &["focus mode on", "help me focus"], risk: "low" },
    CommandInfo { id: "set_night_light", group: "System", title: "Night light", examples: &["night light on"], risk: "low" },
    CommandInfo { id: "start_timer", group: "System", title: "Timers", examples: &["timer for five minutes", "pomodoro"], risk: "low" },
    CommandInfo { id: "open_settings_page", group: "System", title: "Open settings", examples: &["open display settings", "open dock settings"], risk: "low" },
    CommandInfo { id: "lock_screen", group: "System", title: "Lock the PC", examples: &["lock the screen"], risk: "confirm" },
    CommandInfo { id: "create_note", group: "System", title: "Take a note", examples: &["take a note buy milk"], risk: "confirm" },
    CommandInfo { id: "calculate", group: "System", title: "Maths and units", examples: &["what's twelve times seven", "five km in miles"], risk: "low" },
    // Shelf & clipboard
    CommandInfo { id: "shelf_add", group: "Shelf & clipboard", title: "Add the selection to the Shelf", examples: &["add this to the shelf"], risk: "low" },
    CommandInfo { id: "shelf_open", group: "Shelf & clipboard", title: "Open the Shelf", examples: &["open the shelf"], risk: "low" },
    CommandInfo { id: "shelf_clear", group: "Shelf & clipboard", title: "Clear the Shelf", examples: &["clear the shelf"], risk: "confirm" },
    CommandInfo { id: "paste_last_clip", group: "Shelf & clipboard", title: "Paste the last clip", examples: &["paste the last clip"], risk: "guarded" },
    CommandInfo { id: "dictate", group: "Shelf & clipboard", title: "Type what you say", examples: &["type see you at five"], risk: "guarded" },
    // Ask & Command
    CommandInfo { id: "summarize", group: "Ask & Command", title: "Summarise", examples: &["summarise this page", "summarise the selection"], risk: "low" },
    CommandInfo { id: "ask", group: "Ask & Command", title: "Ask a question", examples: &["ask what's a good name for a cat", "why is the sky blue"], risk: "low" },
    CommandInfo { id: "read_back", group: "Ask & Command", title: "Read the answer aloud", examples: &["read that back"], risk: "low" },
    // Voice
    CommandInfo { id: "help", group: "Voice", title: "What can I say?", examples: &["help", "what can I say"], risk: "low" },
    CommandInfo { id: "undo", group: "Voice", title: "Undo the last action", examples: &["undo", "undo that"], risk: "low" },
    CommandInfo { id: "confirm", group: "Voice", title: "Answer a question", examples: &["yes", "no", "cancel"], risk: "low" },
    CommandInfo { id: "stop_listening", group: "Voice", title: "Stop listening", examples: &["stop listening", "mute the mic"], risk: "low" },
];

/// The catalog id a parsed intent action belongs to (volume up/down share "set_volume", …).
pub fn id_for_action(action: &str) -> &str {
    match action {
        "change_volume" => "set_volume",
        "change_brightness" => "set_brightness",
        "convert" => "calculate",
        other => other,
    }
}

/// Every example phrase, for "did you mean".
pub fn all_examples() -> Vec<&'static str> {
    COMMANDS.iter().flat_map(|c| c.examples.iter().copied()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_unique_and_grouped() {
        let mut ids: Vec<&str> = COMMANDS.iter().map(|c| c.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), COMMANDS.len());
        for c in COMMANDS {
            assert!(GROUPS.contains(&c.group), "{}", c.id);
            assert!(!c.examples.is_empty(), "{}", c.id);
            assert!(["low", "confirm", "guarded"].contains(&c.risk), "{}", c.id);
        }
        assert!(all_examples().len() > 60);
    }
}
