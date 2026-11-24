//! Self-test and training-data commands.

use crate::*;

#[tauri::command]
pub(crate) fn record_dpo_pair_cmd(
    prompt: String,
    chosen: String,
    rejected: String,
    source: String,
) -> Result<DpoPair, String> {
    record_dpo_pair(prompt, chosen, rejected, source)
}

#[tauri::command]
pub(crate) fn get_training_stats_cmd() -> TrainingStats {
    get_training_stats()
}

#[tauri::command]
pub(crate) fn save_workflow_macro_cmd(macro_item: WorkflowMacro) -> Result<Vec<WorkflowMacro>, String> {
    save_workflow_macro(macro_item)
}

#[tauri::command]
pub(crate) fn delete_workflow_macro_cmd(id: String) -> Result<Vec<WorkflowMacro>, String> {
    delete_workflow_macro(&id)
}

#[tauri::command]
pub(crate) fn open_training_folder_cmd() -> Result<(), String> {
    let dir = training_dir();
    launch_path(&dir.to_string_lossy())
}

/// Windows version as "DisplayVersion (build CurrentBuild.UBR)", read from the registry. Read-only.
#[cfg(windows)]
pub(crate) fn windows_build_string() -> String {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegGetValueW(
            hkey: isize,
            sub_key: *const u16,
            value: *const u16,
            flags: u32,
            ty: *mut u32,
            data: *mut core::ffi::c_void,
            cb: *mut u32,
        ) -> i32;
    }
    const HKLM: isize = 0x8000_0002u32 as i32 as isize;
    const RRF_RT_REG_SZ: u32 = 0x0000_0002;
    const RRF_RT_REG_DWORD: u32 = 0x0000_0010;
    let key: Vec<u16> = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\0".encode_utf16().collect();
    let read_sz = |name: &str| -> Option<String> {
        let n: Vec<u16> = format!("{}\0", name).encode_utf16().collect();
        let mut buf = [0u16; 128];
        let mut cb = (buf.len() * 2) as u32;
        let rc = unsafe {
            RegGetValueW(HKLM, key.as_ptr(), n.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buf.as_mut_ptr() as *mut _, &mut cb)
        };
        if rc != 0 {
            return None;
        }
        let len = (cb as usize / 2).saturating_sub(1).min(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    };
    let read_dw = |name: &str| -> Option<u32> {
        let n: Vec<u16> = format!("{}\0", name).encode_utf16().collect();
        let mut v: u32 = 0;
        let mut cb = 4u32;
        let rc = unsafe {
            RegGetValueW(HKLM, key.as_ptr(), n.as_ptr(), RRF_RT_REG_DWORD, std::ptr::null_mut(), &mut v as *mut u32 as *mut _, &mut cb)
        };
        if rc == 0 { Some(v) } else { None }
    };
    format!(
        "{} {} (build {}.{})",
        read_sz("ProductName").unwrap_or_else(|| "Windows".into()),
        read_sz("DisplayVersion").unwrap_or_default(),
        read_sz("CurrentBuild").unwrap_or_else(|| "?".into()),
        read_dw("UBR").map(|u| u.to_string()).unwrap_or_else(|| "?".into())
    )
}

#[cfg(not(windows))]
pub(crate) fn windows_build_string() -> String {
    "not Windows".into()
}

/// Read-only health report. Changes nothing; the text is meant to be pasted into a bug report.
#[tauri::command]
pub(crate) async fn run_self_test_cmd(app: AppHandle) -> serde_json::Value {
    let cfg = app
        .state::<AppState>()
        .config
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut lines: Vec<String> = Vec::new();
        let mut problems: Vec<String> = Vec::new();
        let mut row = |k: &str, v: String| lines.push(format!("{:<28}{}", format!("{}:", k), v));

        row("Lens", env!("CARGO_PKG_VERSION").to_string());
        row("Windows", windows_build_string());
        row(
            "WebView2",
            tauri::webview_version().unwrap_or_else(|e| format!("unknown ({})", e)),
        );

        // Config on disk parses and migrates, without saving anything.
        let config_status = match std::fs::read_to_string(config::config_path()) {
            Err(e) => format!("not readable ({})", e),
            Ok(text) => match serde_json::from_str::<serde_json::Value>(&text)
                .map_err(|e| e.to_string())
                .and_then(win_backup::migrate_config_value)
                .and_then(|(v, from)| {
                    serde_json::from_value::<LensConfig>(v)
                        .map(|_| from)
                        .map_err(|e| e.to_string())
                }) {
                Ok(from) => format!("ok (file version {})", from),
                Err(e) => {
                    problems.push("config.json does not load".into());
                    format!("PROBLEM: {}", e)
                }
            },
        };
        row("Config", config_status);

        // The native taskbar can come back: Explorer's real taskbar window exists.
        let tray_hwnd = win_tray::real_shell_tray_hwnd();
        if tray_hwnd == 0 {
            problems.push("Explorer taskbar window not found".into());
        }
        row(
            "Native taskbar",
            format!(
                "{} · hidden by Lens: {} · on screen: {}",
                if tray_hwnd != 0 { "found (restorable)" } else { "NOT FOUND" },
                win_taskbar::taskbar_hidden_by_lens(),
                win_taskbar::native_taskbar_visible()
            ),
        );

        let shell = win_shell::get_shell_mode_status();
        row("Shell mode", format!("{}", if shell.enabled { "ON" } else { "off" }));
        let wallpaper = win_wallpaper::current_state();
        row(
            "Wallpaper",
            format!(
                "{} · attached: {}",
                if wallpaper.settings.enabled { "on" } else { "off" },
                wallpaper.attached
            ),
        );
        let flag = |b: bool| if b { "on" } else { "off" };
        let json_enabled = |v: serde_json::Value| {
            v.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false)
        };
        row(
            "Opt-in features",
            format!(
                "tray host {} (running {}), clipboard {}, tiling keys {}, dock Alt+1-9 {}, injected hook {}, lazy windows {}",
                flag(cfg.func.tray_host),
                win_tray::tray_host_hwnd() != 0,
                flag(cfg.func.clipboard_history),
                flag(cfg.func.tiling_hotkeys),
                flag(cfg.func.dock_number_hotkeys),
                flag(cfg.func.injected_hook),
                flag(cfg.func.lazy_windows)
            ),
        );
        row(
            "Auto-tiling / workspaces",
            format!(
                "{} / {}",
                flag(json_enabled(serde_json::to_value(&cfg.tiling).unwrap_or_default())),
                flag(json_enabled(serde_json::to_value(&cfg.workspaces).unwrap_or_default()))
            ),
        );
        row(
            "Theme",
            format!(
                "{} · radius {} · opacity {:.0}%",
                cfg.theme.preset,
                cfg.theme.border_radius,
                cfg.theme.glass_opacity * 100.0
            ),
        );

        let (own, tree, procs) = sys_telemetry::lens_process_tree_memory();
        let tree_mb = tree as f64 / 1_048_576.0;
        if tree_mb > 250.0 {
            problems.push(format!("memory {:.0} MB is over the 250 MB idle budget", tree_mb));
        }
        row(
            "Memory",
            format!(
                "{:.0} MB total in {} processes (Lens {:.0} MB + WebView2)",
                tree_mb,
                procs,
                own as f64 / 1_048_576.0
            ),
        );

        match app.available_monitors() {
            Ok(mons) => {
                for (i, m) in mons.iter().enumerate() {
                    let (p, s) = (m.position(), m.size());
                    row(
                        &format!("Monitor {}", i + 1),
                        format!(
                            "{} · {}x{} at {},{} · scale {:.2} ({} DPI)",
                            m.name().cloned().unwrap_or_default(),
                            s.width,
                            s.height,
                            p.x,
                            p.y,
                            m.scale_factor(),
                            (m.scale_factor() * 96.0).round()
                        ),
                    );
                }
            }
            Err(e) => row("Monitors", format!("unknown ({})", e)),
        }

        let windows: Vec<&str> = [
            "dock", "topbar", "settings", "palette", "widgets", "quicksettings", "notifications",
            "desktopfolder", "launcher", "overview", "wallpaper",
        ]
        .into_iter()
        .filter(|l| app.get_webview_window(l).is_some())
        .collect();
        row("Windows created", format!("{} of 11: {}", windows.len(), windows.join(", ")));

        row(
            "Result",
            if problems.is_empty() {
                "no problems found".into()
            } else {
                format!("{} problem(s): {}", problems.len(), problems.join("; "))
            },
        );
        serde_json::json!({ "ok": problems.is_empty(), "problems": problems, "text": lines.join("\n") })
    })
    .await
    .unwrap_or_else(|e| serde_json::json!({ "ok": false, "problems": [e.to_string()], "text": e.to_string() }))
}
