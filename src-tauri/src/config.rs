use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

fn default_font_family() -> String {
    "rounded-arial".into()
}

fn default_ui_scale() -> u32 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    pub preset: String,
    pub accent_mode: String, // "windows" | "custom"
    pub custom_accent: String,
    pub glass_opacity: f32,
    pub blur_px: u32,
    pub border_radius: u32,
    pub accent_tint_strength: f32,
    pub custom_css: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_ui_scale")]
    pub ui_scale: u32,
    /// Solid surface base of the active theme pack ("" = stock obsidian). Drives native titlebar color.
    #[serde(default)]
    pub surface_hex: String,
    /// "system" | "reduce" | "full"
    #[serde(default = "default_system")]
    pub motion: String,
    /// "system" | "high"
    #[serde(default = "default_system")]
    pub contrast: String,
    /// "auto" | "en" | "es" | "de"
    #[serde(default = "default_auto")]
    pub locale: String,
    /// "classic" | "expressive" | "dotmatrix": shape style layered on the colour pack.
    #[serde(default = "default_shape_style")]
    pub shape_style: String,
}

fn default_shape_style() -> String {
    "classic".into()
}

fn default_system() -> String {
    "system".into()
}

fn default_auto() -> String {
    "auto".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedApp {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedFolder {
    pub id: String,
    pub name: String,
    pub path: String,
    pub theme: String, // "obsidian" | "accent" | "cobalt" | "emerald" | "amber" | "rose"
    pub view_mode: String, // "grid" | "list" | "fan"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockConfig {
    pub grounded_margin_bottom: u32,
    pub icon_size: u32,
    pub hover_scale: f32,
    pub hover_lift: u32,
    pub auto_hide: String, // "never" | "smart" | "always"
    pub show_top_bar: bool,
    pub pinned_apps: Vec<PinnedApp>,
    pub pinned_folders: Vec<PinnedFolder>,
    /// Screen edge: "bottom" (default) | "top" | "left" | "right"
    #[serde(default = "default_dock_position")]
    pub position: String,
    /// Locked: no drag-reorder, unpin or remove from the Dock.
    #[serde(default)]
    pub locked: bool,
    /// Pinned app ids followed by a user separator.
    #[serde(default)]
    pub separators_after: Vec<String>,
    /// Live window thumbnails in the Dock hover card. Off by default.
    #[serde(default)]
    pub live_previews: bool,
    /// Dock shape: "floating" | "slim" | "taskbar" | "studio" | "minimal" | "split".
    #[serde(default = "default_dock_style")]
    pub style: String,
    /// Icon alignment for the Taskbar style: "center" | "left".
    #[serde(default = "default_dock_alignment")]
    pub alignment: String,
    /// Where the clock and system icons live: "auto" | "dock" | "topbar".
    #[serde(default = "default_dock_system_area")]
    pub system_area: String,
    /// Hover magnification: "off" (today's gentle hover) | "subtle" | "classic".
    #[serde(default = "default_dock_magnification")]
    pub magnification: String,
    /// How many neighbouring icons on each side the magnification reaches (1-4).
    #[serde(default = "default_dock_magnification_range")]
    pub magnification_range: u32,
    /// Click/launch animation: "none" | "lift" (today's) | "bounce" | "jelly".
    #[serde(default = "default_dock_launch_animation")]
    pub launch_animation: String,
    /// Short pulse on an app's icon when one of its windows is minimised or restored.
    #[serde(default)]
    pub minimize_feedback: bool,
    /// Icon size per Dock style, e.g. {"slim": 28}. Missing = the style's own size.
    #[serde(default)]
    pub icon_sizes: std::collections::HashMap<String, u32>,
    /// App names next to (Taskbar/Studio) or under (other styles) the app icons.
    #[serde(default)]
    pub show_labels: bool,
    /// Dropping files on a Dock app opens them with that app.
    #[serde(default)]
    pub file_drop_open: bool,
    /// Mouse wheel over an app icon cycles through that app's windows.
    #[serde(default)]
    pub scroll_cycles_windows: bool,
    /// Suggest 1-3 apps you usually open at this time (local predictor, no AI model). OFF by default.
    #[serde(default)]
    pub suggested_apps: bool,
    /// Set once the person reorders Dock pins in Lens. Until then, pins mirrored from the
    /// Windows taskbar follow Windows' own pin order (B-22).
    #[serde(default)]
    pub pins_user_ordered: bool,
}

fn default_dock_magnification() -> String {
    "off".into()
}

fn default_dock_magnification_range() -> u32 {
    2
}

fn default_dock_launch_animation() -> String {
    "lift".into()
}

fn default_dock_style() -> String {
    "floating".into()
}

fn default_dock_alignment() -> String {
    "center".into()
}

fn default_dock_system_area() -> String {
    "auto".into()
}

fn default_dock_position() -> String {
    "bottom".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FuncConfig {
    pub hide_native_taskbar: bool, // OFF by default
    pub run_on_startup: bool,      // ON by default
    pub palette_hotkey: String,
    pub widgets_hotkey: String,
    pub gaming_pause: bool,
    pub middle_click_new_instance: bool,
    /// Legacy in-process styling: loads lens_dwm_hook.dll into every app. OFF by default —
    /// windows are styled from outside via win_events.rs instead.
    #[serde(default)]
    pub injected_hook: bool,
    /// Lens hosts system tray icons itself (Top Bar strip). OFF by default — experimental.
    /// Alt+1..9 activates the Nth Dock app. OFF by default (takes the keys from other apps).
    #[serde(default)]
    pub dock_number_hotkeys: bool,
    #[serde(default)]
    pub tray_host: bool,
    /// Global keyboard-tiling hotkeys. OFF by default — they take these keys away from every app.
    #[serde(default)]
    pub tiling_hotkeys: bool,
    /// Clipboard history (text only, memory only). OFF by default.
    #[serde(default)]
    pub clipboard_history: bool,
    /// Which monitor the bars live on: "primary" / "" or a monitor id like \\.\DISPLAY2.
    #[serde(default)]
    pub target_monitor: String,
    /// Create Control Center, Palette, Widgets, Quick Settings, Launcher and Overview only when first
    /// opened (saves WebView2 memory). OFF by default; takes effect after restarting Lens UI.
    #[serde(default)]
    pub lazy_windows: bool,
    /// Tap the Win key to open the Lens Launcher. OFF by default.
    #[serde(default)]
    pub win_key_launcher: bool,
    /// Alt+Tab opens Lens Overview. OFF by default.
    #[serde(default)]
    pub alt_tab_overview: bool,
    /// One Top Bar per monitor. OFF by default; applies after restart.
    #[serde(default)]
    pub per_monitor_bars: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowControlsConfig {
    pub enabled: bool,
    pub style: String,    // "traffic-classic" | "traffic-muted" | "minimal-dots" | "accent-pills"
    pub order: String,    // "yellow-green-red" (default) | "green-yellow-red" | "red-yellow-green"
    pub position: String, // "top-right" | "top-left"
    #[serde(default = "default_true")]
    pub frame_border_enabled: bool,
    #[serde(default = "default_frame_style")]
    pub frame_style: String, // "accent-glow" | "obsidian-hairline" | "neon" | "none"
    pub excluded_processes: Vec<String>,
}

fn default_true() -> bool {
    true
}

fn default_frame_style() -> String {
    "accent-glow".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconStyleConfig {
    pub theme: String, // "obsidian-squircle" | "frosted-glass" | "monochrome" | "accent-duotone" | "native"
    pub shape: String, // "squircle" | "rounded" | "circle" | "borderless"
}

impl Default for IconStyleConfig {
    fn default() -> Self {
        Self {
            theme: "obsidian-squircle".into(),
            shape: "squircle".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStyleConfig {
    pub theme: String, // "accent" | "obsidian" | "cobalt" | "emerald" | "amber" | "rose" | "minimal" | "neon"
    pub global_explorer_override: bool,
}

impl Default for FolderStyleConfig {
    fn default() -> Self {
        Self {
            theme: "accent".into(),
            global_explorer_override: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSession {
    pub id: String,
    pub name: String,
    pub color: String,
    pub apps: Vec<String>,
    /// Tiling layout to restore with this session.
    #[serde(default)]
    pub layout: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetsConfig {
    pub enabled_widgets: Vec<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyledFolderRecord {
    pub path: String,
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopBarConfig {
    pub enabled: bool,
    pub auto_hide: String, // "overlap" | "never" | "always"
    pub reveal_delay_ms: u64,
    pub hide_delay_ms: u64,
    pub height: u32,
    pub floating: bool,
    #[serde(default)]
    pub show_media_controls: bool,
}

impl Default for TopBarConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_hide: "overlap".into(),
            reveal_delay_ms: 100,
            hide_delay_ms: 350,
            height: 34,
            floating: false,
            show_media_controls: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ThemeScheduleConfig {
    pub enabled: bool,
    pub mode: String, // "fixed" | "sun"
    pub day_pack: String,
    pub night_pack: String,
    pub day_start: String, // "HH:MM"
    pub night_start: String,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LensConfig {
    pub theme: ThemeConfig,
    pub dock: DockConfig,
    #[serde(default)]
    pub top_bar: TopBarConfig,
    pub func: FuncConfig,
    pub window_controls: WindowControlsConfig,
    #[serde(default)]
    pub icon_style: IconStyleConfig,
    #[serde(default)]
    pub folder_style: FolderStyleConfig,
    pub sessions: Vec<SavedSession>,
    pub active_session_id: String,
    pub widgets: WidgetsConfig,
    pub styled_folders: Vec<StyledFolderRecord>,
    #[serde(default)]
    pub onboarding_completed: bool,
    /// Settings hub detail level: "simple" (core settings with visual previews) or "advanced"
    /// (everything). Empty until chosen: new users start Simple, existing users Advanced.
    #[serde(default)]
    pub settings_mode: String,
    #[serde(default)]
    pub theme_schedule: Option<ThemeScheduleConfig>,
    #[serde(default)]
    pub tiling: crate::win_tiler::TilingConfig,
    #[serde(default)]
    pub workspaces: crate::win_workspaces::WorkspacesConfig,
    /// Desktop groups ("fences") — validated by src/utils/desktopGroups.ts.
    #[serde(default)]
    pub desktop_groups: Option<serde_json::Value>,
    #[serde(default)]
    pub config_version: u32,
    #[serde(default)]
    pub mcp: crate::win_mcp::McpConfig,
    #[serde(default)]
    pub hot_corners: crate::win_hotcorners::HotCornersConfig,
    #[serde(default)]
    pub alt_drag: crate::win_altdrag::AltDragConfig,
    #[serde(default)]
    pub app_summon: crate::win_summon::AppSummonConfig,
    #[serde(default)]
    pub dnd_schedule: crate::win_notifications::DndSchedule,
    /// Lens Intelligence (off by default). API keys are never stored here.
    #[serde(default)]
    pub ai: crate::ai::AiConfig,
    /// Lens Command / Mini / Edge Shelf settings. The frontend owns the shape
    /// (src/command/settings.ts); the backend only reads `enabled` and `edge.enabled`.
    #[serde(default)]
    pub command: serde_json::Value,
    /// Tester mode: TEST BUILD badge and the Ctrl+Alt+M mark-moment hotkey. Off by default.
    #[serde(default)]
    pub tester: TesterConfig,
}

impl Default for LensConfig {
    fn default() -> Self {
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".into());
        Self {
            theme: ThemeConfig {
                preset: "obsidian".into(),
                accent_mode: "custom".into(),
                custom_accent: "#FAFAFA".into(),
                glass_opacity: 0.96,
                blur_px: 20,
                border_radius: 8,
                accent_tint_strength: 0.0,
                custom_css: String::new(),
                font_family: "rounded-arial".into(),
                ui_scale: 100,
                surface_hex: String::new(),
                motion: "system".into(),
                contrast: "system".into(),
                locale: "auto".into(),
                shape_style: default_shape_style(),
            },
            dock: DockConfig {
                grounded_margin_bottom: 0,
                icon_size: 40,
                hover_scale: 1.24,
                hover_lift: 8,
                auto_hide: "never".into(),
                show_top_bar: true,
                pinned_apps: vec![
                    PinnedApp {
                        id: "explorer".into(),
                        name: "File Explorer".into(),
                        path: "C:\\Windows\\explorer.exe".into(),
                        icon_hint: Some("folder".into()),
                    },
                    PinnedApp {
                        id: "terminal".into(),
                        name: "Terminal".into(),
                        path: "wt.exe".into(),
                        icon_hint: Some("terminal".into()),
                    },
                    PinnedApp {
                        id: "notepad".into(),
                        name: "Notepad".into(),
                        path: "notepad.exe".into(),
                        icon_hint: Some("file-text".into()),
                    },
                ],
                pinned_folders: vec![
                    PinnedFolder {
                        id: "downloads".into(),
                        name: "Downloads".into(),
                        path: format!("{}\\Downloads", user_profile),
                        theme: "accent".into(),
                        view_mode: "grid".into(),
                    },
                    PinnedFolder {
                        id: "desktop".into(),
                        name: "Desktop".into(),
                        path: format!("{}\\Desktop", user_profile),
                        theme: "obsidian".into(),
                        view_mode: "grid".into(),
                    },
                ],
                position: "bottom".into(),
                locked: false,
                separators_after: vec![],
                live_previews: false,
                style: default_dock_style(),
                alignment: default_dock_alignment(),
                system_area: default_dock_system_area(),
                magnification: default_dock_magnification(),
                magnification_range: default_dock_magnification_range(),
                launch_animation: default_dock_launch_animation(),
                minimize_feedback: false,
                icon_sizes: std::collections::HashMap::new(),
                show_labels: false,
                file_drop_open: false,
                scroll_cycles_windows: false,
                suggested_apps: false,
                pins_user_ordered: false,
            },
            top_bar: TopBarConfig::default(),
            func: FuncConfig {
                hide_native_taskbar: true,
                run_on_startup: true,
                palette_hotkey: "Alt+Space".into(),
                widgets_hotkey: "Alt+W".into(),
                gaming_pause: true,
                middle_click_new_instance: true,
                injected_hook: false,
                tray_host: false,
                dock_number_hotkeys: false,
                tiling_hotkeys: false,
                clipboard_history: false,
                target_monitor: "primary".into(),
                lazy_windows: false,
                win_key_launcher: false,
                alt_tab_overview: false,
                per_monitor_bars: false,
            },
            window_controls: WindowControlsConfig {
                enabled: true,
                style: "traffic-classic".into(),
                order: "yellow-green-red".into(),
                position: "top-right".into(),
                frame_border_enabled: true,
                frame_style: "obsidian-hairline".into(),
                excluded_processes: vec![
                    "SearchHost.exe".into(),
                    "ShellExperienceHost.exe".into(),
                    "StartMenuExperienceHost.exe".into(),
                    "lens-ui.exe".into(),
                ],
            },
            icon_style: IconStyleConfig::default(),
            folder_style: FolderStyleConfig::default(),
            sessions: vec![
                SavedSession {
                    id: "main".into(),
                    name: "Main".into(),
                    color: "#2D7D9A".into(),
                    apps: vec![],
                    layout: None,
                },
                SavedSession {
                    id: "focus".into(),
                    name: "Focus".into(),
                    color: "#22C55E".into(),
                    apps: vec![],
                    layout: None,
                },
                SavedSession {
                    id: "creative".into(),
                    name: "Creative".into(),
                    color: "#EAB308".into(),
                    apps: vec![],
                    layout: None,
                },
            ],
            active_session_id: "main".into(),
            widgets: WidgetsConfig {
                enabled_widgets: vec![
                    "clock".into(),
                    "telemetry".into(),
                    "notes".into(),
                    "quick-actions".into(),
                ],
                notes: "Welcome to Lens UI.\nPress Alt+Space for Command Palette.".into(),
            },
            styled_folders: vec![],
            onboarding_completed: false,
            settings_mode: String::new(),
            theme_schedule: None,
            tiling: Default::default(),
            workspaces: Default::default(),
            desktop_groups: None,
            config_version: crate::win_backup::CURRENT_CONFIG_VERSION,
            mcp: Default::default(),
            hot_corners: Default::default(),
            alt_drag: Default::default(),
            app_summon: Default::default(),
            dnd_schedule: Default::default(),
            ai: Default::default(),
            command: serde_json::Value::Null,
            tester: TesterConfig::default(),
        }
    }
}

pub fn config_dir() -> PathBuf {
    // Unit tests never touch the real %APPDATA%\LensUI: every test build gets its own
    // per-process scratch directory instead.
    #[cfg(test)]
    {
        std::env::temp_dir()
            .join(format!("lensui-test-{}", std::process::id()))
            .join("LensUI")
    }
    #[cfg(not(test))]
    {
        let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
        PathBuf::from(base).join("LensUI")
    }
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn scan_windows_taskbar_pins() -> Vec<PinnedApp> {
    let mut pins = Vec::new();
    let Ok(appdata) = std::env::var("APPDATA") else {
        return pins;
    };
    let taskbar_dir = PathBuf::from(appdata)
        .join("Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar");
    let Ok(entries) = fs::read_dir(&taskbar_dir) else {
        return pins;
    };
    // read_dir is alphabetical on NTFS, not the taskbar's order (B-22): start from pin time
    // (oldest first), then apply Explorer's own order from Taskband\Favorites.
    let mut paths: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .map(|e| {
            let t = e
                .metadata()
                .and_then(|m| m.created().or_else(|_| m.modified()))
                .unwrap_or(std::time::UNIX_EPOCH);
            (t, e.path())
        })
        .collect();
    paths.sort_by(|a, b| a.0.cmp(&b.0));
    let stems: Vec<String> = paths
        .iter()
        .filter_map(|(_, p)| p.file_stem().and_then(|s| s.to_str()).map(str::to_string))
        .collect();
    let order = match crate::win_pin_order::read_favorites_blob() {
        Some(blob) => crate::win_pin_order::order_by_favorites(&stems, &blob),
        None => stems,
    };
    paths.sort_by_key(|(_, p)| {
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        order.iter().position(|o| o == stem).unwrap_or(usize::MAX)
    });
    for (_, path) in paths {
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !ext.eq_ignore_ascii_case("lnk") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if stem.starts_with('.') {
            continue;
        }
        let id = format!(
            "tb-{}",
            stem.to_lowercase()
                .chars()
                .map(|c| if c.is_alphanumeric() { c } else { '-' })
                .collect::<String>()
        );
        pins.push(PinnedApp {
            id,
            name: stem.to_string(),
            path: path.to_string_lossy().to_string(),
            icon_hint: None,
        });
    }
    pins
}

pub fn merge_windows_taskbar_pins(cfg: &mut LensConfig) -> bool {
    let tb_pins = scan_windows_taskbar_pins();
    let order: Vec<String> = tb_pins.iter().map(|p| p.name.clone()).collect();
    let mut changed = false;
    for tp in tb_pins {
        let tp_lower = tp.name.to_lowercase();
        let already = cfg.dock.pinned_apps.iter().any(|a| {
            let a_name = a.name.to_lowercase();
            let a_stem = std::path::Path::new(&a.path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            a_name == tp_lower
                || a_stem == tp_lower
                || (tp_lower.contains("explorer") && a_stem == "explorer")
                || (tp_lower.contains("terminal") && (a_stem == "wt" || a_stem == "windowsterminal"))
        });
        if !already {
            cfg.dock.pinned_apps.push(tp);
            changed = true;
        }
    }
    // Until the person reorders pins in Lens, mirrored Windows pins follow Windows' order.
    // Lens never writes Windows' own pin data (B-22).
    if !cfg.dock.pins_user_ordered {
        if crate::win_pin_order::apply_order(
            &mut cfg.dock.pinned_apps,
            |a| a.id.starts_with("tb-"),
            |a| a.name.clone(),
            &order,
        ) {
            changed = true;
        }
    }
    changed
}

/// Keeps a copy of a config file Lens could not load as written, so nothing the person had is
/// lost when parts (or all) of it fall back to defaults.
fn keep_unreadable_copy(path: &std::path::Path) {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let _ = fs::copy(path, config_dir().join(format!("config.json.unreadable-{}", ms)));
}

/// Loads `config.json`. Never fails and never panics (docs/FAILSAFE.md §7):
///
/// * a file that loads is used as it is;
/// * a file with some unusable values keeps everything else: only the damaged values (or, if
///   that is not enough, the damaged sections) fall back to their defaults, a copy of the old
///   file is kept, and the person is told once;
/// * a file that is not JSON at all is copied aside and defaults are used.
pub fn load_config() -> LensConfig {
    use crate::failsafe::{config_check, notify_once};
    let path = config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        let document = serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| e.to_string())
            .and_then(crate::win_backup::migrate_config_value);
        match document {
            Ok((doc, from)) => match serde_json::from_value::<LensConfig>(doc.clone()) {
                Ok(mut cfg) => {
                    let migrated = from < crate::win_backup::CURRENT_CONFIG_VERSION;
                    if merge_windows_taskbar_pins(&mut cfg) || migrated {
                        let _ = save_config(&cfg);
                    }
                    return cfg;
                }
                Err(e) => {
                    keep_unreadable_copy(&path);
                    let defaults = serde_json::to_value(LensConfig::default()).unwrap_or(serde_json::Value::Null);
                    if let Some(repaired) = config_check::load_repaired::<LensConfig>(doc, &defaults) {
                        eprintln!(
                            "[Lens Config] config.json had values Lens could not use ({}); kept a copy and reset only: {}.",
                            e,
                            repaired.reset.join(", ")
                        );
                        config_check::set_last_repairs(&repaired.reset);
                        notify_once("config-repaired", "info", &config_check::repair_message(&repaired.reset));
                        let mut cfg = repaired.config;
                        let _ = merge_windows_taskbar_pins(&mut cfg);
                        let _ = save_config(&cfg);
                        return cfg;
                    }
                    eprintln!("[Lens Config] config.json could not be repaired ({}); kept a copy, using defaults.", e);
                    config_reset_notice();
                }
            },
            Err(e) => {
                // Keep the unreadable file instead of silently overwriting it with defaults.
                keep_unreadable_copy(&path);
                eprintln!("[Lens Config] config.json could not be loaded ({}); kept a copy, using defaults.", e);
                config_reset_notice();
            }
        }
    }
    let mut default_cfg = LensConfig::default();
    let _ = merge_windows_taskbar_pins(&mut default_cfg);
    let _ = save_config(&default_cfg);
    default_cfg
}

fn config_reset_notice() {
    crate::failsafe::config_check::set_last_repairs(&["everything".to_string()]);
    crate::failsafe::notify_once(
        "config-reset",
        "error",
        "Lens could not read its settings file and started with default settings. A copy of the old file is in the Lens data folder.",
    );
}

/// [`load_config`] with this run's kill switches and Safe Mode applied (docs/FAILSAFE.md §5).
/// The switched-off values live in memory only: [`save_config`] writes the stored values back.
pub fn load_config_for_run() -> LensConfig {
    let cfg = load_config();
    let Ok(mut doc) = serde_json::to_value(&cfg) else {
        return cfg;
    };
    crate::failsafe::features::apply_at_startup(&mut doc, &config_dir());
    if !crate::failsafe::features::overrides_active() {
        return cfg;
    }
    serde_json::from_value(doc).unwrap_or(cfg)
}

pub fn save_config(cfg: &LensConfig) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = if crate::failsafe::features::overrides_active() {
        // Safe Mode or features.json is holding some switches off for this run. What is written
        // keeps the person's stored choice for those switches, not the held-off value.
        let mut doc = serde_json::to_value(cfg).map_err(|e| e.to_string())?;
        let stored = fs::read_to_string(config_path())
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
        if let Some(stored) = stored {
            crate::failsafe::features::keep_disk_values(&mut doc, &stored);
        }
        serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?
    } else {
        serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?
    };
    write_config_file(&config_path(), json.as_bytes())
}

/// **The one place `config.json` is written.** Everything that changes the stored settings ends
/// here: [`save_config`] (every command, the control plane, plugins) and restoring a backup.
/// `src-tauri/src/tests/config_writer.rs` fails the build if another module writes the file itself.
///
/// * The text is checked first (docs/FAILSAFE.md §7): it must be a JSON object that Lens can read
///   back as settings. Something Lens could not load is refused, never written.
/// * One writer at a time, so two saves cannot share the temporary file.
/// * Written beside the target and renamed over it, so a crash mid-write leaves the old file.
pub fn write_config_file(path: &Path, json: &[u8]) -> Result<(), String> {
    static WRITING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let doc: serde_json::Value = serde_json::from_slice(json).map_err(|e| format!("Settings were not saved: not valid JSON ({e})."))?;
    if !doc.is_object() {
        return Err("Settings were not saved: not a settings object.".into());
    }
    // Same test as loading: readable as written, or after the per-setting repair. (A restored
    // backup may hold a value this version no longer accepts; loading repairs exactly that.)
    let defaults = serde_json::to_value(LensConfig::default()).unwrap_or(serde_json::Value::Null);
    if crate::failsafe::config_check::load_repaired::<LensConfig>(doc, &defaults).is_none() {
        return Err("Settings were not saved: Lens could not read them back.".into());
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let _one_at_a_time = WRITING.lock().unwrap_or_else(|p| p.into_inner());
    crate::win_backup::write_atomic(path, json)
}

impl LensConfig {
    /// Lens Command (hotkey, Mini, Edge Shelf) is off until the user turns it on.
    pub fn command_enabled(&self) -> bool {
        self.command.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false)
    }
    /// The Edge Shelf tab is a separate opt-in inside Lens Command.
    pub fn edge_shelf_enabled(&self) -> bool {
        self.command_enabled()
            && self
                .command
                .get("edge")
                .and_then(|e| e.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TesterConfig {
    /// Shows the "TEST BUILD <sha>" badge and enables the Mark-moment hotkey.
    pub enabled: bool,
}

#[cfg(test)]
#[path = "tests/config_writer.rs"]
mod config_writer_tests;
