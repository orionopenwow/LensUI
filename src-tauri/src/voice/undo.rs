//! "Undo" for voice: before a reversible command runs, Lens snapshots what it will change and
//! works out the inverse here. Pure; the runtime fills the snapshot and performs the step.

use crate::ai::intent::ArgV;

/// What things looked like before the command ran. `None` = unknown (no undo offered).
#[derive(Debug, Clone, Default)]
pub struct Snapshot {
    pub volume: Option<u32>,
    pub muted: Option<bool>,
    pub brightness: Option<u32>,
    pub dnd: Option<bool>,
    pub night_light: Option<bool>,
    pub color_mode: Option<String>,
    pub theme_pack: Option<String>,
    pub accent: Option<String>,
    pub dock_style: Option<String>,
    pub workspace: Option<String>,
    /// The window the command targets, and its state.
    pub hwnd: Option<isize>,
    pub minimized: Option<bool>,
    pub maximized: Option<bool>,
    pub topmost: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Step {
    /// Run a registry tool with these arguments.
    Tool(&'static str, Vec<(&'static str, ArgV)>),
    /// Window state changes on a specific window (the focus may have moved since).
    Window(isize, &'static str),
}

impl Step {
    pub fn label(&self) -> String {
        match self {
            Step::Window(_, "restore") => "Restore the window".into(),
            Step::Window(_, "minimize") => "Minimise the window".into(),
            Step::Window(_, "maximize") => "Maximise the window".into(),
            Step::Window(_, "pin") => "Pin the window".into(),
            Step::Window(_, "unpin") => "Unpin the window".into(),
            Step::Window(_, other) => format!("Window: {}", other),
            Step::Tool(tool, _) => format!("Undo {}", tool.replace('_', " ")),
        }
    }
}

fn s(args: &[(&'static str, ArgV)], k: &str) -> Option<String> {
    args.iter().find(|(n, _)| *n == k).and_then(|(_, v)| match v {
        ArgV::S(s) => Some(s.clone()),
        _ => None,
    })
}

/// The step that undoes `tool(args)`, given the state before it ran.
pub fn inverse(tool: &str, args: &[(&'static str, ArgV)], snap: &Snapshot) -> Option<Step> {
    match tool {
        "window_action" => {
            let hwnd = snap.hwnd?;
            match s(args, "action")?.as_str() {
                "minimize" if snap.minimized == Some(false) => Some(Step::Window(hwnd, "restore")),
                "maximize" if snap.maximized == Some(false) => Some(Step::Window(hwnd, "restore")),
                "restore" if snap.minimized == Some(true) => Some(Step::Window(hwnd, "minimize")),
                "restore" if snap.maximized == Some(true) => Some(Step::Window(hwnd, "maximize")),
                "pin" if snap.topmost == Some(false) => Some(Step::Window(hwnd, "unpin")),
                "unpin" if snap.topmost == Some(true) => Some(Step::Window(hwnd, "pin")),
                _ => None,
            }
        }
        "snap_window" if s(args, "slot").as_deref() == Some("maximize") && snap.maximized == Some(false) => {
            snap.hwnd.map(|h| Step::Window(h, "restore"))
        }
        "set_volume" => snap.volume.map(|v| Step::Tool("set_volume", vec![("level", ArgV::N(v as f64))])),
        "set_mute" => snap.muted.map(|m| Step::Tool("set_mute", vec![("muted", ArgV::B(m))])),
        "set_brightness" => snap.brightness.map(|v| Step::Tool("set_brightness", vec![("level", ArgV::N(v.max(10) as f64))])),
        "set_dnd" => snap.dnd.map(|d| Step::Tool("set_dnd", vec![("enabled", ArgV::B(d))])),
        "set_night_light" => snap.night_light.map(|d| Step::Tool("set_night_light", vec![("enabled", ArgV::B(d))])),
        "set_color_mode" => snap.color_mode.clone().filter(|m| m == "dark" || m == "light").map(|m| Step::Tool("set_color_mode", vec![("mode", ArgV::S(m))])),
        "set_theme_pack" => snap.theme_pack.clone().map(|p| Step::Tool("set_theme_pack", vec![("id", ArgV::S(p))])),
        "set_accent" => snap.accent.clone().map(|c| Step::Tool("set_accent", vec![("color", ArgV::S(c))])),
        "set_dock_style" => snap.dock_style.clone().map(|d| Step::Tool("set_dock_style", vec![("style", ArgV::S(d))])),
        "switch_workspace" => snap.workspace.clone().map(|w| Step::Tool("switch_workspace", vec![("target", ArgV::S(w))])),
        // Launching, closing, locking, moving, notes and timers aren't undone by voice.
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inverses() {
        let snap = Snapshot {
            volume: Some(35),
            muted: Some(false),
            brightness: Some(5),
            theme_pack: Some("obsidian".into()),
            color_mode: Some("dark".into()),
            hwnd: Some(42),
            minimized: Some(false),
            maximized: Some(false),
            topmost: Some(false),
            ..Default::default()
        };
        let a = |k: &'static str, v: &str| vec![(k, ArgV::S(v.into()))];
        assert_eq!(inverse("window_action", &a("action", "minimize"), &snap), Some(Step::Window(42, "restore")));
        assert_eq!(inverse("window_action", &a("action", "pin"), &snap), Some(Step::Window(42, "unpin")));
        assert_eq!(inverse("window_action", &a("action", "restore"), &snap), None); // was already restored
        assert_eq!(inverse("snap_window", &a("slot", "maximize"), &snap), Some(Step::Window(42, "restore")));
        assert_eq!(inverse("set_volume", &[("delta", ArgV::N(10.0))], &snap), Some(Step::Tool("set_volume", vec![("level", ArgV::N(35.0))])));
        assert_eq!(inverse("set_mute", &[("muted", ArgV::B(true))], &snap), Some(Step::Tool("set_mute", vec![("muted", ArgV::B(false))])));
        assert_eq!(inverse("set_brightness", &[], &snap), Some(Step::Tool("set_brightness", vec![("level", ArgV::N(10.0))])));
        assert_eq!(inverse("set_theme_pack", &a("id", "nord-frost"), &snap), Some(Step::Tool("set_theme_pack", vec![("id", ArgV::S("obsidian".into()))])));
        assert_eq!(inverse("set_color_mode", &a("mode", "light"), &snap), Some(Step::Tool("set_color_mode", vec![("mode", ArgV::S("dark".into()))])));
        assert_eq!(inverse("set_accent", &a("color", "#ef4444"), &snap), None); // accent unknown
        assert_eq!(inverse("launch_app", &a("name", "spotify"), &snap), None);
        assert_eq!(inverse("close_app", &a("name", "focused"), &snap), None);
        let minimised = Snapshot { minimized: Some(true), ..snap.clone() };
        assert_eq!(inverse("window_action", &a("action", "restore"), &minimised), Some(Step::Window(42, "minimize")));
        assert_eq!(Step::Window(1, "restore").label(), "Restore the window");
    }
}
