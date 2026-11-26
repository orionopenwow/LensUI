//! The change registry: every change Lens makes outside its own data folder, and how to undo it.
//!
//! One table, `CHANGES`. Each row names a kind of change, what it writes (HKCU keys and values,
//! files), which source files contain the writer, and the function that undoes it. "Remove all
//! Lens changes" (`remove_all`) walks the table in order; nothing else decides what gets undone.
//!
//! Adding a writer:
//!   1. Write the undo next to the writer (restore from a backup taken before the first write).
//!   2. Add a row here. List the writer's file in `sources` and what it touches in `writes`.
//!   3. `node tools/changes/check.mjs` (CI runs it) fails while a source file calls a
//!      registry-, settings- or hook-writing API and is not listed in a row or in `NOT_CHANGES`.
//!
//! `writes` grammar (read by tests/e2e/remove-all.mjs, which snapshots each entry before applying
//! features and compares after Remove all):
//!   `HKCU\Key\Path`            the whole key, every value and subkey
//!   `HKCU\Key\Path::Value`     one value
//!   `%VAR%\path\file`          one file (exists + content hash); environment variables expanded
//! Lens never writes HKLM, and nothing here may name it.
//!
//! Documented in docs/brain/ARCHITECTURE.md › Change registry.

use crate::config::LensConfig;
use crate::win_uninstall::UninstallStep;
use serde::Serialize;

/// How long a change lasts if Lens just exits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Scope {
    /// Stays after Lens exits (registry, files). Must be undone and is checked on CI.
    Persistent,
    /// Lives in the running process or in other windows' state; undone on quit as well.
    Session,
    /// Kept inside %APPDATA%\LensUI only.
    LensData,
}

pub type Undo = fn(&mut LensConfig) -> Result<String, String>;

pub struct Change {
    /// Stable id, kebab-case.
    pub id: &'static str,
    /// The line shown in the Remove-all report.
    pub label: &'static str,
    pub scope: Scope,
    pub writes: &'static [&'static str],
    /// Files under src-tauri/src that contain the writer. Read by tools/changes/check.mjs.
    #[allow(dead_code)]
    pub sources: &'static [&'static str],
    pub undo: Undo,
}

/// Source files that call an OS-writing API and leave nothing to undo, with the reason.
#[allow(dead_code)] // read by tools/changes/check.mjs
pub const NOT_CHANGES: &[(&str, &str)] = &[
    ("win_events.rs", "SetWinEventHook, out of context: read-only listener that ends with the process"),
    ("win_tiler.rs", "SetWinEventHook, out of context: read-only listener that ends with the process"),
    ("win_caption_engine.rs", "SetWinEventHook, out of context: read-only listener that ends with the process"),
    ("snip/win.rs", "HKCU DWORD helpers; their callers are registered (print-screen, windows-accent)"),
    ("bridge/reg.rs", "HKCU key helpers; their callers are registered (browser-bridge, url-scheme, explorer-verbs, cleaner-verb)"),
];

/// Undo order matters in two places: the tray host stops before the taskbar comes back (they
/// share a window class), and window styling is reset before the hooks go.
pub const CHANGES: &[Change] = &[
    Change {
        id: "workspaces",
        label: "Workspaces",
        scope: Scope::Session,
        writes: &[],
        sources: &["win_workspaces.rs"],
        undo: undo_workspaces,
    },
    Change {
        id: "wallpaper-switcher",
        label: "Wallpaper Switcher",
        scope: Scope::LensData,
        writes: &[],
        sources: &["wallpapers/mod.rs", "commands/wallpapers.rs"],
        undo: undo_wallpaper_switcher,
    },
    Change {
        id: "wallpaper",
        label: "Live wallpaper",
        scope: Scope::Session,
        writes: &[],
        sources: &["win_wallpaper.rs"],
        undo: undo_wallpaper,
    },
    Change {
        id: "folder-icons",
        label: "Folder icons",
        scope: Scope::Persistent,
        writes: &[
            "%USERPROFILE%\\Desktop\\desktop.ini",
            "%USERPROFILE%\\Documents\\desktop.ini",
            "%USERPROFILE%\\Downloads\\desktop.ini",
            "%USERPROFILE%\\Pictures\\desktop.ini",
            "%USERPROFILE%\\Music\\desktop.ini",
            "%USERPROFILE%\\Videos\\desktop.ini",
        ],
        sources: &["win_folders.rs"],
        undo: undo_folder_icons,
    },
    Change {
        id: "explorer-folder-icons",
        label: "Explorer folder icons",
        scope: Scope::Persistent,
        writes: &["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Icons"],
        sources: &["win_folders.rs"],
        undo: undo_explorer_folder_icons,
    },
    Change {
        id: "shell-mode",
        label: "Shell mode",
        scope: Scope::Persistent,
        writes: &["HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon::Shell"],
        sources: &["win_shell.rs"],
        undo: undo_shell_mode,
    },
    Change {
        id: "windows-settings",
        label: "Windows settings changed in Lens",
        scope: Scope::Persistent,
        writes: &[
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
            // Animation effects (SPI_SETCLIENTAREAANIMATION) live in this mask.
            "HKCU\\Control Panel\\Desktop::UserPreferencesMask",
        ],
        sources: &["syssettings/mod.rs"],
        undo: undo_windows_settings,
    },
    Change {
        id: "run-on-startup",
        label: "Start with Windows",
        scope: Scope::Persistent,
        writes: &["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run::LensUI"],
        sources: &["win_taskbar.rs"],
        undo: undo_run_on_startup,
    },
    Change {
        id: "tray-host",
        label: "System tray host",
        scope: Scope::Session,
        writes: &[],
        sources: &["win_tray.rs"],
        undo: undo_tray_host,
    },
    Change {
        id: "taskbar",
        label: "Taskbar and desktop icons",
        scope: Scope::Session,
        writes: &[],
        sources: &["win_taskbar.rs"],
        undo: undo_taskbar,
    },
    Change {
        id: "window-styling",
        label: "Window styling",
        scope: Scope::Session,
        writes: &[],
        sources: &["win_dwm_engine.rs"],
        undo: undo_window_styling,
    },
    Change {
        id: "windhawk-mod",
        label: "Windhawk mod",
        scope: Scope::Persistent,
        writes: &["%ProgramData%\\Windhawk\\ModsSource\\lens-window-style.wh.cpp"],
        sources: &["win_windhawk.rs"],
        undo: undo_windhawk_mod,
    },
    Change {
        id: "cursors",
        label: "Mouse pointers",
        scope: Scope::Persistent,
        writes: &[
            "HKCU\\Control Panel\\Cursors",
            "HKCU\\Control Panel\\Mouse",
            "HKCU\\Control Panel\\Desktop::WheelScrollLines",
            "HKCU\\Control Panel\\Desktop::WheelScrollChars",
        ],
        sources: &["win_cursors.rs", "win_cursor_fx.rs"],
        undo: undo_cursors,
    },
    Change {
        id: "focus-overlays",
        label: "Pinned windows and focus overlays",
        scope: Scope::Session,
        writes: &[],
        sources: &["win_focus_dim.rs"],
        undo: undo_focus_overlays,
    },
    Change {
        id: "input-hooks",
        label: "Keyboard and mouse hooks",
        scope: Scope::Session,
        writes: &[],
        sources: &[
            "input.rs",
            "win_keyhook.rs",
            "win_altdrag.rs",
            "win_desktop_input.rs",
            "magic/win.rs",
            "voice/keyhold.rs",
            "clip/uia.rs",
        ],
        undo: undo_input_hooks,
    },
    Change {
        id: "agent-keys",
        label: "Agent stop key, approval hotkey and pause hotkey",
        scope: Scope::Session,
        writes: &[],
        sources: &["presence/esc.rs", "presence/win.rs"],
        undo: undo_agent_keys,
    },
    Change {
        id: "browser-bridge",
        label: "Browser extension bridge",
        scope: Scope::Persistent,
        // The parents are watched too: a key Lens created on the way must not be left empty.
        writes: &[
            "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
            "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
            "HKCU\\Software\\BraveSoftware",
            "HKCU\\Software\\Chromium",
            "HKCU\\Software\\Mozilla\\NativeMessagingHosts",
        ],
        sources: &["commands/bridge.rs", "bridge/manifest.rs"],
        undo: undo_browser_bridge,
    },
    Change {
        id: "url-scheme",
        label: "lens:// links",
        scope: Scope::Persistent,
        writes: &["HKCU\\Software\\Classes\\lens"],
        sources: &["commands/bridge.rs", "bridge/manifest.rs"],
        undo: undo_url_scheme,
    },
    Change {
        id: "explorer-verbs",
        label: "File Explorer right-click",
        scope: Scope::Persistent,
        writes: &[
            "HKCU\\Software\\Classes\\*",
            "HKCU\\Software\\Classes\\Directory\\shell",
            "HKCU\\Software\\Classes\\Directory\\Background\\shell",
            "HKCU\\Software\\Classes\\Drive\\shell\\LensUI",
            "HKCU\\Software\\Classes\\DesktopBackground",
            "HKCU\\Software\\Classes\\SystemFileAssociations",
        ],
        sources: &["commands/bridge.rs", "bridge/manifest.rs"],
        undo: undo_explorer_verbs,
    },
    Change {
        id: "cleaner-verb",
        label: "Lens Cleaner drive menu",
        scope: Scope::Persistent,
        writes: &["HKCU\\Software\\Classes\\Drive"],
        sources: &["commands/cleaner.rs"],
        undo: undo_cleaner_verb,
    },
    Change {
        id: "claude-desktop",
        label: "Claude Desktop connection",
        scope: Scope::Persistent,
        writes: &["%APPDATA%\\Claude\\claude_desktop_config.json"],
        sources: &["bridge/claude_config.rs"],
        undo: undo_claude_desktop,
    },
    Change {
        id: "spicetify-theme",
        label: "Spotify theme (Spicetify)",
        scope: Scope::Persistent,
        writes: &[
            "%APPDATA%\\spicetify\\Themes\\Lens\\color.ini",
            "%APPDATA%\\spicetify\\Themes\\Lens\\user.css",
        ],
        sources: &["music/spicetify.rs"],
        undo: undo_spicetify,
    },
    Change {
        id: "equalizer-apo-preset",
        label: "Equalizer APO preset (Lens Music)",
        scope: Scope::Persistent,
        writes: &[
            "%ProgramFiles%\\EqualizerAPO\\config\\config.txt",
            "%ProgramFiles%\\EqualizerAPO\\config\\lens-music.txt",
        ],
        sources: &["music/eq.rs", "commands/music.rs"],
        undo: undo_equalizer_apo,
    },
    Change {
        id: "print-screen",
        label: "Print Screen key",
        scope: Scope::Persistent,
        writes: &["HKCU\\Control Panel\\Keyboard::PrintScreenKeyForSnippingEnabled"],
        sources: &["commands/snip.rs", "snip/printscreen.rs"],
        undo: undo_print_screen,
    },
    Change {
        id: "windows-accent",
        label: "Windows accent colour",
        scope: Scope::Persistent,
        writes: &[
            "HKCU\\Software\\Microsoft\\Windows\\DWM::AccentColor",
            "HKCU\\Software\\Microsoft\\Windows\\DWM::ColorizationColor",
            "HKCU\\Software\\Microsoft\\Windows\\DWM::ColorPrevalence",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent::AccentColorMenu",
        ],
        sources: &["win_theme.rs"],
        undo: undo_windows_accent,
    },
    Change {
        id: "app-recipes",
        label: "Lens Apps setup",
        scope: Scope::LensData,
        writes: &[],
        sources: &["commands/apps.rs", "apps/recipe.rs"],
        undo: undo_app_recipes,
    },
];

/// What Remove all deliberately leaves alone, said in the report so nobody has to wonder.
pub const NOT_CHANGED: &[(&str, &str)] = &[(
    "Not changed: apps you installed",
    "Apps installed through Lens Apps are yours and stay installed. Remove them from Windows Settings if you no longer want them.",
)];

/// One row of the registry without its undo, for the UI and the CI check.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeInfo {
    pub id: String,
    pub label: String,
    pub scope: Scope,
    pub writes: Vec<String>,
}

pub fn manifest() -> Vec<ChangeInfo> {
    CHANGES
        .iter()
        .map(|c| ChangeInfo {
            id: c.id.to_string(),
            label: c.label.to_string(),
            scope: c.scope,
            writes: c.writes.iter().map(|w| w.to_string()).collect(),
        })
        .collect()
}

/// Runs each undo in order. Every step is independent and reported separately: one failure never
/// stops the rest.
pub fn run(changes: &[Change], config: &mut LensConfig) -> Vec<UninstallStep> {
    let mut steps: Vec<UninstallStep> = changes
        .iter()
        .map(|c| {
            let (ok, detail) = match (c.undo)(config) {
                Ok(d) => (true, d),
                Err(e) => (false, e),
            };
            UninstallStep { step: c.label.to_string(), ok, detail }
        })
        .collect();
    for (step, detail) in NOT_CHANGED {
        steps.push(UninstallStep { step: step.to_string(), ok: true, detail: detail.to_string() });
    }
    steps
}

/// "Remove all Lens changes": walks the whole registry. `config` is updated in place so a later
/// start of Lens does not re-apply anything; the caller saves it.
pub fn remove_all(config: &mut LensConfig) -> Vec<UninstallStep> {
    run(CHANGES, config)
}

// ---------------------------------------------------------------------------------------------
// Undo functions, one per row
// ---------------------------------------------------------------------------------------------

fn undo_workspaces(_: &mut LensConfig) -> Result<String, String> {
    crate::win_workspaces::restore_all_windows();
    Ok("Windows hidden on other workspaces are shown again.".to_string())
}

/// The switcher never writes the Windows wallpaper: it only chooses what the Lens host shows.
/// Undo stops automatic changes and puts back what the host showed before its first change;
/// the `wallpaper` row right after this one detaches the host.
fn undo_wallpaper_switcher(_: &mut LensConfig) -> Result<String, String> {
    crate::wallpapers::undo()
}

fn undo_wallpaper(_: &mut LensConfig) -> Result<String, String> {
    crate::win_wallpaper::detach_wallpaper_window();
    Ok("Your own Windows wallpaper is showing.".to_string())
}

fn undo_folder_icons(config: &mut LensConfig) -> Result<String, String> {
    let recorded: Vec<String> = config.styled_folders.iter().map(|r| r.path.clone()).collect();
    let mut reverted = 0usize;
    let mut failed: Vec<String> = Vec::new();
    for folder in crate::win_uninstall::folders_to_check(&recorded, &crate::win_folders::user_core_folders()) {
        let was_recorded = recorded.iter().any(|r| r.eq_ignore_ascii_case(&folder));
        if was_recorded || crate::win_uninstall::folder_has_lens_icon(&folder) {
            match crate::win_folders::revert_folder_theme(&folder) {
                Ok(()) => reverted += 1,
                Err(e) => failed.push(format!("{}: {}", folder, e)),
            }
        }
    }
    config.styled_folders.clear();
    if failed.is_empty() {
        Ok(format!("{} folder(s) restored.", reverted))
    } else {
        Err(format!("{} restored; failed: {}", reverted, failed.join("; ")))
    }
}

fn undo_explorer_folder_icons(config: &mut LensConfig) -> Result<String, String> {
    config.folder_style.global_explorer_override = false;
    crate::win_folders::revert_global_explorer_folder_theme()
        .map(|_| "Windows default folder icons restored.".to_string())
}

fn undo_shell_mode(_: &mut LensConfig) -> Result<String, String> {
    if crate::win_shell::get_shell_mode_status().enabled {
        crate::win_shell::disable_shell_mode()
            .map(|_| "Windows Explorer is the shell again from the next sign-in.".to_string())
    } else {
        Ok("Was not enabled.".to_string())
    }
}

fn undo_windows_settings(_: &mut LensConfig) -> Result<String, String> {
    crate::syssettings::restore_all()
}

fn undo_run_on_startup(config: &mut LensConfig) -> Result<String, String> {
    config.func.run_on_startup = false;
    crate::win_taskbar::set_run_on_startup(false).map(|_| "Removed from startup.".to_string())
}

fn undo_tray_host(config: &mut LensConfig) -> Result<String, String> {
    crate::win_tray::stop_tray_host();
    config.func.tray_host = false;
    Ok("Stopped.".to_string())
}

fn undo_taskbar(config: &mut LensConfig) -> Result<String, String> {
    crate::win_taskbar::set_native_taskbar_hidden(false);
    crate::win_taskbar::set_desktop_icons_hidden(false);
    config.func.hide_native_taskbar = false;
    Ok("Windows taskbar and desktop icons shown.".to_string())
}

fn undo_window_styling(config: &mut LensConfig) -> Result<String, String> {
    // Also removes the experimental in-app hook and ends its thread (stop_dwm_hook_engine).
    crate::win_dwm_engine::revert_dwm_theme();
    config.func.injected_hook = false;
    Ok("Open windows reset to Windows defaults; the in-app styling helper is removed.".to_string())
}

fn undo_windhawk_mod(_: &mut LensConfig) -> Result<String, String> {
    // Only the file Lens itself placed there.
    let wh = std::path::Path::new(r"C:\ProgramData\Windhawk\ModsSource\lens-window-style.wh.cpp");
    if wh.exists() {
        std::fs::remove_file(wh)
            .map(|_| "Removed lens-window-style from Windhawk's mod folder.".to_string())
            .map_err(|e| format!("Could not remove {}: {}", wh.display(), e))
    } else {
        Ok("Not installed.".to_string())
    }
}

fn undo_cursors(_: &mut LensConfig) -> Result<String, String> {
    crate::win_cursor_fx::stop();
    // Restored from the backup Lens took before its first change.
    let mut done: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();
    for (step, res) in crate::win_cursors::uninstall_restore() {
        match res {
            Ok(d) => done.push(format!("{step}: {d}")),
            Err(e) => failed.push(format!("{step}: {e}")),
        }
    }
    if failed.is_empty() {
        Ok(if done.is_empty() { "Nothing to restore.".to_string() } else { done.join(" ") })
    } else {
        Err(failed.join("; "))
    }
}

fn undo_focus_overlays(_: &mut LensConfig) -> Result<String, String> {
    crate::win_focus_dim::shutdown();
    Ok("Unpinned windows Lens pinned and removed the dimming and border overlays.".to_string())
}

fn undo_agent_keys(_: &mut LensConfig) -> Result<String, String> {
    // The Esc claim on the input service (held only while an agent runs), the global hotkey that
    // opens the approval window, and the presence pause hotkey (Ctrl+Alt+Pause by default).
    crate::presence::esc::undo();
    #[cfg(windows)]
    crate::presence::win::release_hotkey();
    Ok("Esc watcher released; the approval and pause hotkeys unregistered.".to_string())
}

fn undo_input_hooks(config: &mut LensConfig) -> Result<String, String> {
    // Features first (each stops its own workers and state), then every claim on the shared
    // input service, so both low-level hooks are gone whatever state a feature was in.
    crate::win_keyhook::stop_keyhook();
    crate::win_altdrag::stop_alt_drag();
    crate::win_desktop_input::stop();
    crate::input::release_all();
    config.func.win_key_launcher = false;
    config.func.alt_tab_overview = false;
    Ok("Win key, Alt+Tab, Alt+drag, desktop input and every other keyboard and mouse hook removed.".to_string())
}

// The next four remove only keys Lens marked as its own (docs/BROWSER_BRIDGE.md, docs/SNIP.md).
fn undo_browser_bridge(_: &mut LensConfig) -> Result<String, String> {
    crate::commands::bridge::bridge_uninstall().map(|x| x.message)
}

fn undo_url_scheme(_: &mut LensConfig) -> Result<String, String> {
    crate::commands::bridge::url_scheme_uninstall().map(|x| x.message)
}

fn undo_explorer_verbs(_: &mut LensConfig) -> Result<String, String> {
    crate::commands::bridge::explorer_verbs_uninstall().map(|x| x.message)
}

fn undo_cleaner_verb(_: &mut LensConfig) -> Result<String, String> {
    crate::commands::cleaner::uninstall_verb()
}

fn undo_claude_desktop(_: &mut LensConfig) -> Result<String, String> {
    crate::bridge::claude_config::remove_for_uninstall()
}

fn undo_spicetify(_: &mut LensConfig) -> Result<String, String> {
    match crate::music::spicetify::detect().1 {
        Some(themes) => crate::music::spicetify::remove_installed_theme(&themes),
        None => Ok("Not exported to Spicetify.".to_string()),
    }
}

fn undo_equalizer_apo(_: &mut LensConfig) -> Result<String, String> {
    crate::music::eq::undo()
}

fn undo_print_screen(_: &mut LensConfig) -> Result<String, String> {
    crate::commands::snip::restore_print_screen();
    Ok("Restored to how it was before Lens Snip.".to_string())
}

fn undo_windows_accent(_: &mut LensConfig) -> Result<String, String> {
    // A theme change made just before can still have its Windows accent write queued (theme
    // writes wait for things to settle); cancel it so it can't land after the restore.
    let _io = crate::app::theme_apply::cancel_accent_writes();
    let r = crate::win_theme::restore_windows_accent();
    crate::app::theme_apply::forget_written_accent();
    r
}

fn undo_app_recipes(_: &mut LensConfig) -> Result<String, String> {
    crate::commands::apps::revert_all_recipes().map(|(message, _)| message)
}

#[cfg(test)]
#[path = "tests/changes.rs"]
mod tests;
