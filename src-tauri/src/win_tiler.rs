use crate::win_windows::list_running_windows;

#[cfg(windows)]
fn classify_window(process_name: &str, title: &str) -> &'static str {
    let p = process_name.to_lowercase();
    let t = title.to_lowercase();
    if p.contains("code")
        || p.contains("cursor")
        || p.contains("antigravity")
        || p.contains("windsurf")
        || p.contains("terminal")
        || p.contains("powershell")
        || p.contains("cmd")
        || p.contains("wt.exe")
        || p.contains("pycharm")
        || p.contains("idea")
        || p.contains("devenv")
        || p.contains("sublime")
        || p.contains("notepad")
    {
        return "Coding";
    }
    if p.contains("chrome")
        || p.contains("msedge")
        || p.contains("firefox")
        || p.contains("brave")
        || p.contains("opera")
        || p.contains("arc")
        || p.contains("zen")
    {
        return "Browser";
    }
    if p.contains("spotify")
        || p.contains("discord")
        || p.contains("slack")
        || p.contains("teams")
        || p.contains("telegram")
        || p.contains("whatsapp")
        || p.contains("vlc")
        || t.contains("spotify")
    {
        return "Media & Comms";
    }
    if p.contains("explorer") {
        return "Files";
    }
    "Workspace"
}

#[cfg(windows)]
fn place_window(hwnd_raw: isize, x: i32, y: i32, w: i32, h: i32) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, ShowWindow, SWP_NOACTIVATE, SWP_NOZORDER, SW_RESTORE,
    };
    let hwnd = HWND(hwnd_raw as *mut _);
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = SetWindowPos(
            hwnd,
            HWND::default(),
            x,
            y,
            w.max(240),
            h.max(180),
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

#[cfg(windows)]
pub fn tile_windows(
    layout: &str,
    work_x: i32,
    work_y: i32,
    work_w: i32,
    work_h: i32,
) -> Result<String, String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_MINIMIZE};

    let all = list_running_windows();
    let mut active: Vec<_> = all.into_iter().filter(|w| !w.is_minimized).collect();
    if active.is_empty() {
        return Err("No open desktop windows available to tile.".into());
    }

    // Put focused window first so it always takes the primary/master slot
    active.sort_by_key(|w| if w.is_focused { 0 } else { 1 });

    let gap = 8;
    let x0 = work_x + gap;
    let y0 = work_y + gap;
    let avail_w = (work_w - gap * 2).max(400);
    let avail_h = (work_h - gap * 2).max(300);

    match layout.to_lowercase().as_str() {
        "split" | "left-right" => {
            let count = active.len().min(2);
            if count == 1 {
                place_window(active[0].hwnd, x0, y0, avail_w, avail_h);
                return Ok("Snapped 1 active window to full workspace.".into());
            }
            let half_w = (avail_w - gap) / 2;
            place_window(active[0].hwnd, x0, y0, half_w, avail_h);
            place_window(active[1].hwnd, x0 + half_w + gap, y0, avail_w - half_w - gap, avail_h);
            Ok(format!(
                "Tiled {} & {} side-by-side (50/50 Split).",
                active[0].process_name.trim_end_matches(".exe"),
                active[1].process_name.trim_end_matches(".exe")
            ))
        }
        "thirds" | "columns" => {
            let count = active.len().min(3);
            let col_w = (avail_w - gap * (count as i32 - 1)) / count as i32;
            for (i, w) in active.iter().take(count).enumerate() {
                place_window(w.hwnd, x0 + (i as i32) * (col_w + gap), y0, col_w, avail_h);
            }
            Ok(format!("Tiled {} windows into equal columns.", count))
        }
        "grid" | "quad" => {
            let count = active.len().min(4);
            if count <= 2 {
                return tile_windows("split", work_x, work_y, work_w, work_h);
            }
            let half_w = (avail_w - gap) / 2;
            let half_h = (avail_h - gap) / 2;
            let slots = [
                (x0, y0, half_w, half_h),
                (x0 + half_w + gap, y0, avail_w - half_w - gap, half_h),
                (x0, y0 + half_h + gap, half_w, avail_h - half_h - gap),
                (
                    x0 + half_w + gap,
                    y0 + half_h + gap,
                    avail_w - half_w - gap,
                    avail_h - half_h - gap,
                ),
            ];
            for (w, (sx, sy, sw, sh)) in active.iter().take(count).zip(slots.iter()) {
                place_window(w.hwnd, *sx, *sy, *sw, *sh);
            }
            Ok(format!("Tiled {} windows into a 2×2 Quad Grid.", count))
        }
        "smart-group" | "organize" => {
            // Focus on the category of the currently focused window (or Coding/Browser if available)
            let primary_cat = classify_window(&active[0].process_name, &active[0].title);
            let mut group_wins = Vec::new();
            let mut other_wins = Vec::new();
            for w in active {
                if classify_window(&w.process_name, &w.title) == primary_cat {
                    group_wins.push(w);
                } else {
                    other_wins.push(w);
                }
            }
            // Minimize unrelated clutter windows if we have >= 2 in our focus group
            let mut minimized = 0usize;
            if group_wins.len() >= 1 && !other_wins.is_empty() {
                for ow in &other_wins {
                    unsafe {
                        let _ = ShowWindow(HWND(ow.hwnd as *mut _), SW_MINIMIZE);
                    }
                    minimized += 1;
                }
            }
            let count = group_wins.len().min(4);
            if count == 1 {
                place_window(group_wins[0].hwnd, x0, y0, avail_w, avail_h);
            } else {
                let master_w = ((avail_w as f64) * 0.62) as i32;
                let stack_w = avail_w - master_w - gap;
                let stack_count = (count - 1) as i32;
                let stack_h = (avail_h - gap * (stack_count - 1)) / stack_count;
                place_window(group_wins[0].hwnd, x0, y0, master_w, avail_h);
                for (idx, w) in group_wins.iter().skip(1).take(count - 1).enumerate() {
                    place_window(
                        w.hwnd,
                        x0 + master_w + gap,
                        y0 + (idx as i32) * (stack_h + gap),
                        stack_w,
                        stack_h,
                    );
                }
            }
            Ok(format!(
                "Smart Organized '{}' group ({} tiled, {} minimized).",
                primary_cat, count, minimized
            ))
        }
        _ => {
            // Default: "focus-stack" (65% Left Master + 35% Right Stacked Secondary)
            let count = active.len().min(4);
            if count == 1 {
                place_window(active[0].hwnd, x0, y0, avail_w, avail_h);
                return Ok("Snapped 1 active window to full workspace.".into());
            }
            let master_w = ((avail_w as f64) * 0.64) as i32;
            let stack_w = avail_w - master_w - gap;
            let stack_count = (count - 1) as i32;
            let stack_h = (avail_h - gap * (stack_count - 1)) / stack_count;
            place_window(active[0].hwnd, x0, y0, master_w, avail_h);
            for (idx, w) in active.iter().skip(1).take(count - 1).enumerate() {
                place_window(
                    w.hwnd,
                    x0 + master_w + gap,
                    y0 + (idx as i32) * (stack_h + gap),
                    stack_w,
                    stack_h,
                );
            }
            Ok(format!("Tiled {} windows in Master-Stack layout.", count))
        }
    }
}

#[cfg(not(windows))]
pub fn tile_windows(
    _layout: &str,
    _work_x: i32,
    _work_y: i32,
    _work_w: i32,
    _work_h: i32,
) -> Result<String, String> {
    Err("Window tiling is only supported on Windows.".into())
}

// ======================================================================================
// Keyboard tiling: geometry (pure, unit-tested) + thin Win32 wrappers
// ======================================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TileRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Target rectangle for snapping one window inside the work area (the screen minus Top Bar and
/// Dock), using the same 8px gutters as the multi-window layouts above.
/// Slots: "left" "right" "top" "bottom" "top-left" "top-right" "bottom-left" "bottom-right"
/// "maximize" "center".
pub fn snap_rect(slot: &str, work: TileRect, gap: i32) -> Option<TileRect> {
    let x0 = work.x + gap;
    let y0 = work.y + gap;
    let aw = (work.w - gap * 2).max(400);
    let ah = (work.h - gap * 2).max(300);
    let lw = (aw - gap) / 2; // left column width
    let rw = aw - lw - gap; // right column width
    let th = (ah - gap) / 2; // top row height
    let bh = ah - th - gap; // bottom row height
    let rx = x0 + lw + gap;
    let by = y0 + th + gap;
    let rect = |x, y, w, h| Some(TileRect { x, y, w, h });
    match slot {
        "left" => rect(x0, y0, lw, ah),
        "right" => rect(rx, y0, rw, ah),
        "top" => rect(x0, y0, aw, th),
        "bottom" => rect(x0, by, aw, bh),
        "top-left" => rect(x0, y0, lw, th),
        "top-right" => rect(rx, y0, rw, th),
        "bottom-left" => rect(x0, by, lw, bh),
        "bottom-right" => rect(rx, by, rw, bh),
        "maximize" => rect(x0, y0, aw, ah),
        "center" => {
            let w = aw * 2 / 3;
            let h = ah * 4 / 5;
            rect(x0 + (aw - w) / 2, y0 + (ah - h) / 2, w, h)
        }
        _ => None,
    }
}

/// Index of the window to move focus to from `rects[from]` in `direction`
/// ("left" | "right" | "up" | "down"), or `None` if nothing lies that way.
/// Prefers the nearest window, strongly favouring ones that sit in the same row / column.
pub fn neighbor_index(rects: &[TileRect], from: usize, direction: &str) -> Option<usize> {
    let cur = *rects.get(from)?;
    let (ccx, ccy) = (cur.x + cur.w / 2, cur.y + cur.h / 2);
    let horizontal = matches!(direction, "left" | "right");
    if !horizontal && !matches!(direction, "up" | "down") {
        return None;
    }
    let mut best: Option<(i64, usize)> = None;
    for (i, r) in rects.iter().enumerate() {
        if i == from {
            continue;
        }
        let (cx, cy) = (r.x + r.w / 2, r.y + r.h / 2);
        let primary = match direction {
            "left" => ccx - cx,
            "right" => cx - ccx,
            "up" => ccy - cy,
            _ => cy - ccy,
        };
        if primary < 8 {
            continue; // not in that direction
        }
        // Distance across the other axis counts only when the two windows do not share a row/column.
        let (a0, a1, b0, b1, off) = if horizontal {
            (cur.y, cur.y + cur.h, r.y, r.y + r.h, (cy - ccy).abs())
        } else {
            (cur.x, cur.x + cur.w, r.x, r.x + r.w, (cx - ccx).abs())
        };
        let overlaps = a0 < b1 && b0 < a1;
        // A window that shares no row/column only counts if it lies wholly past our edge
        // (so "up" from a tall master window does not jump to the stack beside it).
        let past_edge = match direction {
            "left" => cx < cur.x,
            "right" => cx > cur.x + cur.w,
            "up" => cy < cur.y,
            _ => cy > cur.y + cur.h,
        };
        if !overlaps && !past_edge {
            continue;
        }
        let cross = if overlaps { 0 } else { off };
        let score = primary as i64 + 3 * cross as i64;
        if best.map(|(s, _)| score < s).unwrap_or(true) {
            best = Some((score, i));
        }
    }
    best.map(|(_, i)| i)
}

/// Layout ids accepted by `tile_windows`, in the order the cycle hotkey steps through them.
pub const LAYOUT_CYCLE: [&str; 5] = ["focus-stack", "split", "thirds", "grid", "smart-group"];

/// The layout `step` places after `current` in `LAYOUT_CYCLE` (wraps; unknown ids start the cycle).
pub fn next_layout(current: &str, step: i32) -> &'static str {
    let len = LAYOUT_CYCLE.len() as i32;
    match LAYOUT_CYCLE.iter().position(|l| *l == current) {
        Some(idx) => LAYOUT_CYCLE[(idx as i32 + step).rem_euclid(len) as usize],
        None => LAYOUT_CYCLE[0],
    }
}

/// One keyboard-tiling binding. `action` / `arg` feed `run_tiling_action`.
#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct TilingHotkey {
    pub keys: &'static str,
    pub action: &'static str,
    pub arg: &'static str,
    pub label: &'static str,
}

/// Default bindings. Chosen to stay clear of Alt+Space / Alt+W (Lens), Win+Arrow (Windows snap)
/// and Alt+Tab. Note: Alt+Shift+Arrow and Ctrl+Alt+Arrow are also used inside some editors
/// (VS Code), and a global hotkey wins — which is why registration is opt-in.
pub const TILING_HOTKEYS: [TilingHotkey; 18] = [
    TilingHotkey { keys: "Alt+Shift+Left", action: "focus", arg: "left", label: "Focus window to the left" },
    TilingHotkey { keys: "Alt+Shift+Right", action: "focus", arg: "right", label: "Focus window to the right" },
    TilingHotkey { keys: "Alt+Shift+Up", action: "focus", arg: "up", label: "Focus window above" },
    TilingHotkey { keys: "Alt+Shift+Down", action: "focus", arg: "down", label: "Focus window below" },
    TilingHotkey { keys: "Ctrl+Alt+Left", action: "snap", arg: "left", label: "Snap to left half" },
    TilingHotkey { keys: "Ctrl+Alt+Right", action: "snap", arg: "right", label: "Snap to right half" },
    TilingHotkey { keys: "Ctrl+Alt+Up", action: "snap", arg: "top", label: "Snap to top half" },
    TilingHotkey { keys: "Ctrl+Alt+Down", action: "snap", arg: "bottom", label: "Snap to bottom half" },
    TilingHotkey { keys: "Ctrl+Alt+U", action: "snap", arg: "top-left", label: "Snap to top-left quarter" },
    TilingHotkey { keys: "Ctrl+Alt+I", action: "snap", arg: "top-right", label: "Snap to top-right quarter" },
    TilingHotkey { keys: "Ctrl+Alt+J", action: "snap", arg: "bottom-left", label: "Snap to bottom-left quarter" },
    TilingHotkey { keys: "Ctrl+Alt+K", action: "snap", arg: "bottom-right", label: "Snap to bottom-right quarter" },
    TilingHotkey { keys: "Ctrl+Alt+Enter", action: "snap", arg: "maximize", label: "Fill the work area" },
    TilingHotkey { keys: "Ctrl+Alt+C", action: "snap", arg: "center", label: "Center window" },
    TilingHotkey { keys: "Ctrl+Alt+Space", action: "cycle", arg: "next", label: "Next tiling layout" },
    TilingHotkey { keys: "Ctrl+Alt+Shift+Space", action: "cycle", arg: "prev", label: "Previous tiling layout" },
    TilingHotkey { keys: "Ctrl+Alt+T", action: "tile", arg: "focus-stack", label: "Tile: Master-Stack" },
    TilingHotkey { keys: "Ctrl+Alt+G", action: "tile", arg: "grid", label: "Tile: 2×2 Grid" },
];

static LAYOUT_CURSOR: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[cfg(windows)]
fn window_rect(hwnd_raw: isize) -> Option<TileRect> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let mut rect = RECT::default();
    unsafe {
        if GetWindowRect(HWND(hwnd_raw as *mut _), &mut rect).is_err() {
            return None;
        }
    }
    Some(TileRect {
        x: rect.left,
        y: rect.top,
        w: rect.right - rect.left,
        h: rect.bottom - rect.top,
    })
}

/// Moves keyboard focus to the nearest app window in `direction`.
#[cfg(windows)]
pub fn focus_neighbor(direction: &str) -> Result<String, String> {
    let wins: Vec<_> = list_running_windows()
        .into_iter()
        .filter(|w| !w.is_minimized)
        .filter_map(|w| window_rect(w.hwnd).map(|r| (w, r)))
        .collect();
    let from = wins
        .iter()
        .position(|(w, _)| w.is_focused)
        .ok_or("No focused app window to move from.")?;
    let rects: Vec<TileRect> = wins.iter().map(|(_, r)| *r).collect();
    let target = neighbor_index(&rects, from, direction)
        .ok_or_else(|| format!("No window to the {}.", direction))?;
    let (win, _) = &wins[target];
    crate::win_windows::focus_window(win.hwnd);
    Ok(format!(
        "Focused {}.",
        win.process_name.trim_end_matches(".exe")
    ))
}

/// Snaps the focused app window to a half, quarter, the full work area, or the center.
#[cfg(windows)]
pub fn snap_active_window(
    slot: &str,
    work_x: i32,
    work_y: i32,
    work_w: i32,
    work_h: i32,
) -> Result<String, String> {
    let work = TileRect {
        x: work_x,
        y: work_y,
        w: work_w,
        h: work_h,
    };
    let target = snap_rect(slot, work, 8).ok_or_else(|| format!("Unknown snap slot '{}'.", slot))?;
    let focused = list_running_windows()
        .into_iter()
        .find(|w| w.is_focused && !w.is_minimized)
        .ok_or("No focused app window to snap.")?;
    place_window(focused.hwnd, target.x, target.y, target.w, target.h);
    Ok(format!(
        "Snapped {} to {}.",
        focused.process_name.trim_end_matches(".exe"),
        slot
    ))
}

/// Steps to the next / previous multi-window layout and applies it.
#[cfg(windows)]
pub fn cycle_layout(
    step: i32,
    work_x: i32,
    work_y: i32,
    work_w: i32,
    work_h: i32,
) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    let cur = LAYOUT_CURSOR.load(Ordering::SeqCst).min(LAYOUT_CYCLE.len() - 1);
    let layout = next_layout(LAYOUT_CYCLE[cur], step);
    let next = LAYOUT_CYCLE.iter().position(|l| *l == layout).unwrap_or(0);
    LAYOUT_CURSOR.store(next, Ordering::SeqCst);
    tile_windows(layout, work_x, work_y, work_w, work_h)
}

#[cfg(not(windows))]
pub fn focus_neighbor(_direction: &str) -> Result<String, String> {
    Err("Window tiling is only supported on Windows.".into())
}

#[cfg(not(windows))]
pub fn snap_active_window(
    _slot: &str,
    _work_x: i32,
    _work_y: i32,
    _work_w: i32,
    _work_h: i32,
) -> Result<String, String> {
    Err("Window tiling is only supported on Windows.".into())
}

#[cfg(not(windows))]
pub fn cycle_layout(
    _step: i32,
    _work_x: i32,
    _work_y: i32,
    _work_w: i32,
    _work_h: i32,
) -> Result<String, String> {
    let _ = &LAYOUT_CURSOR;
    Err("Window tiling is only supported on Windows.".into())
}

/// Single entry point for hotkeys, the command palette and the natural-language router.
/// action: "focus" (arg: left|right|up|down) · "snap" (arg: a `snap_rect` slot) ·
/// "cycle" (arg: next|prev) · "tile" (arg: a `tile_windows` layout id) ·
/// "workspace" (arg: next|prev|1-based number) · "send" (arg: workspace number, groups mode).
/// With automatic tiling on, also: "swap" (direction) · "float" · "monocle" · "stack" ·
/// "stack-next" · "promote" · "resize" (grow|shrink) · "retile" · "layout" (layout id).
pub fn run_tiling_action(
    action: &str,
    arg: &str,
    work_x: i32,
    work_y: i32,
    work_w: i32,
    work_h: i32,
) -> Result<String, String> {
    // With automatic tiling on, layout / swap / float / stack actions go to the tiler.
    if let Some(r) = auto_tiling_action(action, arg) {
        return r;
    }
    match action {
        "workspace" => {
            let target = arg.to_string();
            std::thread::spawn(move || {
                let _ = crate::win_workspaces::switch_workspace(&target);
            });
            Ok(format!("Switching to workspace {}.", arg))
        }
        "send" => crate::win_workspaces::send_focused_to_workspace(arg)
            .map(|_| format!("Moved the window to workspace {}.", arg)),
        "focus" => focus_neighbor(arg),
        "snap" => snap_active_window(arg, work_x, work_y, work_w, work_h),
        "cycle" => cycle_layout(
            if arg == "prev" { -1 } else { 1 },
            work_x,
            work_y,
            work_w,
            work_h,
        ),
        "tile" => tile_windows(arg, work_x, work_y, work_w, work_h),
        other => Err(format!("Unknown tiling action '{}'.", other)),
    }
}
// ======================================================================================
// Automatic tiling engine (opt-in, `tiling.enabled`, default off)
//
// * Pure model (unit-tested): layouts, tile groups (stacks), floating set, drag-to-swap.
// * Win32 side: one out-of-process WinEvent thread (shared with win_workspaces) marks the
//   desktop dirty; a worker re-tiles at most every 50 ms.
// * Never fights the user: maximised, minimised, fullscreen, cloaked (other virtual desktop),
//   non-resizable, owned (dialog) and game / anti-cheat windows are left alone, keep their
//   slot, and rejoin when they come back. A window moved by anything other than Lens (Windows
//   Snap, Win+Arrow, an app resizing itself) is switched to floating instead of being pulled
//   back. Tiling pauses while a fullscreen window is in front.
// ======================================================================================

use std::collections::{HashMap, HashSet};

/// Persisted tiling settings (`LensConfig.tiling`).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TilingConfig {
    pub enabled: bool,
    /// "master-stack" | "columns" | "rows" | "grid" | "dwindle" | "monocle"
    pub layout: String,
    /// Gap between windows and around the work area, in px (0–32).
    pub gap: i32,
    /// Share of the width given to the master window (0.2–0.8).
    pub master_ratio: f32,
    /// Where a newly opened window goes: "end" (bottom of the stack) or "master".
    pub new_window: String,
    /// Process names that always float (e.g. "calculatorapp.exe").
    pub float_apps: Vec<String>,
}

impl Default for TilingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            layout: "master-stack".into(),
            gap: 8,
            master_ratio: 0.6,
            new_window: "end".into(),
            float_apps: vec!["calculatorapp.exe".into(), "taskmgr.exe".into()],
        }
    }
}

/// Every layout the engine knows, in hotkey-cycle order.
pub const AUTO_LAYOUTS: [&str; 6] = [
    "master-stack",
    "columns",
    "rows",
    "grid",
    "dwindle",
    "monocle",
];

/// Maps any layout id (including the older one-shot ids) onto an engine layout.
pub fn canonical_layout(id: &str) -> &'static str {
    match id.trim().to_ascii_lowercase().as_str() {
        "columns" | "split" | "left-right" | "thirds" => "columns",
        "rows" => "rows",
        "grid" | "quad" => "grid",
        "dwindle" | "spiral" => "dwindle",
        "monocle" | "full" => "monocle",
        _ => "master-stack",
    }
}

/// "Chrome.EXE" / "chrome" -> "chrome.exe".
pub fn normalize_app(raw: &str) -> String {
    let base = raw
        .trim()
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if base.is_empty() {
        return base;
    }
    if base.ends_with(".exe") {
        base
    } else {
        format!("{}.exe", base)
    }
}

pub fn sanitize_tiling_config(mut cfg: TilingConfig) -> TilingConfig {
    cfg.layout = canonical_layout(&cfg.layout).to_string();
    cfg.gap = cfg.gap.clamp(0, 32);
    cfg.master_ratio = if cfg.master_ratio.is_finite() {
        cfg.master_ratio.clamp(0.2, 0.8)
    } else {
        0.6
    };
    if cfg.new_window != "master" {
        cfg.new_window = "end".into();
    }
    let mut seen = HashSet::new();
    cfg.float_apps = cfg
        .float_apps
        .iter()
        .map(|a| normalize_app(a))
        .filter(|a| !a.is_empty() && seen.insert(a.clone()))
        .take(64)
        .collect();
    cfg
}

/// Splits `len` px starting at `start` into `parts` spans separated by `gap`, giving the
/// leftover pixels to the first spans so the spans plus gaps cover `len` exactly.
fn split_span(start: i32, len: i32, parts: usize, gap: i32) -> Vec<(i32, i32)> {
    if parts == 0 {
        return Vec::new();
    }
    let p = parts as i32;
    let usable = (len - gap * (p - 1)).max(p);
    let base = usable / p;
    let rem = usable % p;
    let mut out = Vec::with_capacity(parts);
    let mut pos = start;
    for i in 0..p {
        let l = base + if i < rem { 1 } else { 0 };
        out.push((pos, l));
        pos += l + gap;
    }
    out
}

/// Rectangles for `n` tiles inside `work` (the screen minus Top Bar and Dock).
pub fn layout_rects(layout: &str, n: usize, work: TileRect, gap: i32, ratio: f32) -> Vec<TileRect> {
    if n == 0 {
        return Vec::new();
    }
    let g = gap.clamp(0, 64);
    let area = TileRect {
        x: work.x + g,
        y: work.y + g,
        w: (work.w - 2 * g).max(200),
        h: (work.h - 2 * g).max(150),
    };
    let layout = canonical_layout(layout);
    if layout == "monocle" {
        return vec![area; n];
    }
    if n == 1 {
        return vec![area];
    }
    let ratio = if ratio.is_finite() {
        ratio.clamp(0.2, 0.8)
    } else {
        0.6
    };
    match layout {
        "columns" => split_span(area.x, area.w, n, g)
            .into_iter()
            .map(|(x, w)| TileRect {
                x,
                y: area.y,
                w,
                h: area.h,
            })
            .collect(),
        "rows" => split_span(area.y, area.h, n, g)
            .into_iter()
            .map(|(y, h)| TileRect {
                x: area.x,
                y,
                w: area.w,
                h,
            })
            .collect(),
        "grid" => {
            let cols = (n as f64).sqrt().ceil() as usize;
            let rows = (n + cols - 1) / cols;
            let mut out = Vec::with_capacity(n);
            for (r, (y, h)) in split_span(area.y, area.h, rows, g).into_iter().enumerate() {
                let in_row = if r == rows - 1 {
                    n - cols * (rows - 1)
                } else {
                    cols
                };
                for (x, w) in split_span(area.x, area.w, in_row, g) {
                    out.push(TileRect { x, y, w, h });
                }
            }
            out
        }
        "dwindle" => {
            let mut out = Vec::with_capacity(n);
            let mut rest = area;
            for i in 0..n {
                if i == n - 1 {
                    out.push(rest);
                    break;
                }
                let share = if i == 0 { ratio } else { 0.5 };
                if i % 2 == 0 {
                    let w1 = (((rest.w - g) as f32) * share).round() as i32;
                    out.push(TileRect { w: w1, ..rest });
                    rest = TileRect {
                        x: rest.x + w1 + g,
                        w: rest.w - w1 - g,
                        ..rest
                    };
                } else {
                    let h1 = (((rest.h - g) as f32) * share).round() as i32;
                    out.push(TileRect { h: h1, ..rest });
                    rest = TileRect {
                        y: rest.y + h1 + g,
                        h: rest.h - h1 - g,
                        ..rest
                    };
                }
            }
            out
        }
        _ => {
            // master-stack
            let mw = (((area.w - g) as f32) * ratio).round() as i32;
            let mut out = vec![TileRect { w: mw, ..area }];
            for (y, h) in split_span(area.y, area.h, n - 1, g) {
                out.push(TileRect {
                    x: area.x + mw + g,
                    y,
                    w: area.w - mw - g,
                    h,
                });
            }
            out
        }
    }
}

/// Which tiles hold which windows. A group with more than one window is a stack: its windows
/// share one tile and the first one is in front.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TileState {
    pub groups: Vec<Vec<isize>>,
    pub floating: HashSet<isize>,
}

impl TileState {
    pub fn group_of(&self, h: isize) -> Option<usize> {
        self.groups.iter().position(|g| g.contains(&h))
    }

    pub fn tiled_count(&self) -> usize {
        self.groups.iter().map(|g| g.len()).sum()
    }

    /// Drops windows that closed and adds new ones. `auto_float(h)` decides whether a newly
    /// seen window starts floating. Returns true when anything changed.
    pub fn sync(
        &mut self,
        present: &[isize],
        new_as_master: bool,
        auto_float: &dyn Fn(isize) -> bool,
    ) -> bool {
        let live: HashSet<isize> = present.iter().copied().collect();
        let before = self.clone();
        for g in self.groups.iter_mut() {
            g.retain(|h| live.contains(h));
        }
        self.groups.retain(|g| !g.is_empty());
        self.floating.retain(|h| live.contains(h));
        for &h in present {
            if self.floating.contains(&h) || self.group_of(h).is_some() {
                continue;
            }
            if auto_float(h) {
                self.floating.insert(h);
            } else if new_as_master {
                self.groups.insert(0, vec![h]);
            } else {
                self.groups.push(vec![h]);
            }
        }
        *self != before
    }

    pub fn swap_groups(&mut self, a: usize, b: usize) -> bool {
        if a == b || a >= self.groups.len() || b >= self.groups.len() {
            return false;
        }
        self.groups.swap(a, b);
        true
    }

    /// Moves the window's tile to the master slot.
    pub fn promote(&mut self, h: isize) -> bool {
        match self.group_of(h) {
            Some(0) | None => false,
            Some(i) => {
                let g = self.groups.remove(i);
                self.groups.insert(0, g);
                true
            }
        }
    }

    /// Floats a tiled window, or tiles a floating one (at the end). Returns the new floating state.
    pub fn toggle_float(&mut self, h: isize) -> bool {
        if self.floating.remove(&h) {
            self.groups.push(vec![h]);
            false
        } else {
            if let Some(i) = self.group_of(h) {
                self.groups[i].retain(|x| *x != h);
                if self.groups[i].is_empty() {
                    self.groups.remove(i);
                }
            }
            self.floating.insert(h);
            true
        }
    }

    /// Alone in its tile: joins the previous tile's stack (or the next one when it is first).
    /// Already stacked: leaves the stack and gets its own tile right after it.
    pub fn toggle_stack(&mut self, h: isize) -> bool {
        let Some(i) = self.group_of(h) else {
            return false;
        };
        if self.groups[i].len() > 1 {
            self.groups[i].retain(|x| *x != h);
            self.groups.insert(i + 1, vec![h]);
            return true;
        }
        if self.groups.len() < 2 {
            return false;
        }
        self.groups.remove(i);
        let target = if i == 0 { 0 } else { i - 1 };
        self.groups[target].insert(0, h);
        true
    }

    /// Brings the next window of the stack holding `h` to the front; returns that window.
    pub fn cycle_stack(&mut self, h: isize) -> Option<isize> {
        let i = self.group_of(h)?;
        let g = &mut self.groups[i];
        if g.len() < 2 {
            return None;
        }
        g.rotate_left(1);
        Some(g[0])
    }

    /// Target rectangle for every tiled window. Windows in `skip` (maximised, minimised,
    /// fullscreen, on another desktop) keep their place in the order but take no space.
    /// The bool is true for the window in front of its stack.
    pub fn assignments(
        &self,
        layout: &str,
        work: TileRect,
        gap: i32,
        ratio: f32,
        skip: &HashSet<isize>,
    ) -> Vec<(isize, TileRect, bool)> {
        let visible: Vec<Vec<isize>> = self
            .groups
            .iter()
            .map(|g| {
                g.iter()
                    .copied()
                    .filter(|h| !skip.contains(h))
                    .collect::<Vec<_>>()
            })
            .filter(|g: &Vec<isize>| !g.is_empty())
            .collect();
        let rects = layout_rects(layout, visible.len(), work, gap, ratio);
        let mut out = Vec::new();
        for (g, r) in visible.iter().zip(rects) {
            for (k, h) in g.iter().enumerate() {
                out.push((*h, r, k == 0));
            }
        }
        out
    }

    /// Index of the visible tile group that holds `h`, plus the tile rectangles, for keyboard moves.
    pub fn visible_tiles(
        &self,
        layout: &str,
        work: TileRect,
        gap: i32,
        ratio: f32,
        skip: &HashSet<isize>,
    ) -> Vec<(usize, TileRect)> {
        let idx: Vec<usize> = (0..self.groups.len())
            .filter(|i| self.groups[*i].iter().any(|h| !skip.contains(h)))
            .collect();
        let rects = layout_rects(layout, idx.len(), work, gap, ratio);
        idx.into_iter().zip(rects).collect()
    }
}

/// Tile under a dropped window's centre (drag-to-swap), excluding its own tile.
pub fn drop_target(tiles: &[(usize, TileRect)], own: usize, cx: i32, cy: i32) -> Option<usize> {
    tiles
        .iter()
        .find(|(g, r)| *g != own && cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h)
        .map(|(g, _)| *g)
}

/// True when two rectangles differ by more than `tol` px on any edge.
pub fn rect_differs(a: TileRect, b: TileRect, tol: i32) -> bool {
    (a.x - b.x).abs() > tol
        || (a.y - b.y).abs() > tol
        || ((a.x + a.w) - (b.x + b.w)).abs() > tol
        || ((a.y + a.h) - (b.y + b.h)).abs() > tol
}

/// Processes the tiler never touches (anti-cheat and competitive games), matching the
/// DWM engine's exclusions.
pub const NEVER_TILE: [&str; 10] = [
    "lens-ui.exe",
    "easyanticheat",
    "beservice",
    "vgc.exe",
    "valorant",
    "cs2.exe",
    "fortnite",
    "searchhost.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
];

/// Window classes that are never tiles (shell surfaces, dialogs, IME and overflow popups).
pub const NEVER_TILE_CLASSES: [&str; 9] = [
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "Progman",
    "WorkerW",
    "#32770",
    "Windows.UI.Core.CoreWindow",
    "TopLevelWindowForOverflowXamlIsland",
    "XamlExplorerHostIslandWindow",
    "ForegroundStaging",
];

pub fn process_never_tiled(path_or_name: &str) -> bool {
    let p = path_or_name.to_ascii_lowercase();
    NEVER_TILE.iter().any(|s| p.contains(s))
}

/// Live status for the Control Center card and the Top Bar.
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TilingStatus {
    pub enabled: bool,
    pub layout: String,
    /// True when the layout comes from the active workspace rather than the global setting.
    pub layout_from_workspace: bool,
    pub gap: i32,
    pub master_ratio: f32,
    pub monocle: bool,
    pub tiled: usize,
    pub floating: usize,
    /// Tiling is paused because a fullscreen window (game, video) is in front.
    pub paused: bool,
}

// ---------------------------------------------------------------------------------------
// Engine state shared by the event thread, the worker and the commands
// ---------------------------------------------------------------------------------------

struct Engine {
    cfg: TilingConfig,
    state: TileState,
    /// Rectangle Lens last gave each tiled window (visible frame, not the invisible borders).
    assigned: HashMap<isize, TileRect>,
    /// When Lens last moved each window; moves shortly after are the app settling, not the user.
    placed_at: HashMap<isize, std::time::Instant>,
    zoomed: HashSet<isize>,
    runtime_layout: Option<String>,
    runtime_ratio: Option<f32>,
    monocle: bool,
    moving: Option<isize>,
    paused: bool,
    settle_until: Option<std::time::Instant>,
}

type WorkAreaFn = Box<dyn Fn() -> Option<TileRect> + Send + Sync>;
type StatusFn = Box<dyn Fn(TilingStatus) + Send + Sync>;

static ENGINE: std::sync::OnceLock<std::sync::Mutex<Engine>> = std::sync::OnceLock::new();
static WORK_AREA: std::sync::OnceLock<WorkAreaFn> = std::sync::OnceLock::new();
static ON_STATUS: std::sync::OnceLock<StatusFn> = std::sync::OnceLock::new();
static TILING_ON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static TILE_DIRTY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static EVENT_THREAD_STARTED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

fn engine() -> std::sync::MutexGuard<'static, Engine> {
    ENGINE
        .get_or_init(|| {
            std::sync::Mutex::new(Engine {
                cfg: TilingConfig::default(),
                state: TileState::default(),
                assigned: HashMap::new(),
                placed_at: HashMap::new(),
                zoomed: HashSet::new(),
                runtime_layout: None,
                runtime_ratio: None,
                monocle: false,
                moving: None,
                paused: false,
                settle_until: None,
            })
        })
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Lens' work area provider (screen minus Top Bar and Dock). Call once from setup().
pub fn set_work_area_provider<F>(f: F)
where
    F: Fn() -> Option<TileRect> + Send + Sync + 'static,
{
    let _ = WORK_AREA.set(Box::new(f));
}

/// Receives a status update whenever tiling changes. Call once from setup().
pub fn set_tiling_status_listener<F>(f: F)
where
    F: Fn(TilingStatus) + Send + Sync + 'static,
{
    let _ = ON_STATUS.set(Box::new(f));
}

pub fn is_auto_tiling() -> bool {
    TILING_ON.load(std::sync::atomic::Ordering::SeqCst)
}

fn effective_layout(e: &Engine) -> (String, bool) {
    if e.monocle {
        return ("monocle".into(), false);
    }
    if let Some(l) = &e.runtime_layout {
        return (l.clone(), false);
    }
    if let Some(l) = crate::win_workspaces::active_layout() {
        return (canonical_layout(&l).to_string(), true);
    }
    (canonical_layout(&e.cfg.layout).to_string(), false)
}

fn status_of(e: &Engine) -> TilingStatus {
    let (layout, from_ws) = effective_layout(e);
    TilingStatus {
        enabled: TILING_ON.load(std::sync::atomic::Ordering::SeqCst),
        layout,
        layout_from_workspace: from_ws,
        gap: e.cfg.gap,
        master_ratio: e.runtime_ratio.unwrap_or(e.cfg.master_ratio),
        monocle: e.monocle,
        tiled: e.state.tiled_count(),
        floating: e.state.floating.len(),
        paused: e.paused,
    }
}

pub fn get_tiling_status() -> TilingStatus {
    status_of(&engine())
}

fn emit_status() {
    let st = get_tiling_status();
    if let Some(f) = ON_STATUS.get() {
        f(st);
    }
}

/// Marks the desktop as changed; the worker re-tiles shortly after.
pub fn request_retile() {
    TILE_DIRTY.store(true, std::sync::atomic::Ordering::SeqCst);
}

/// Applies saved settings. Turning tiling on starts the event thread (once); turning it off
/// leaves every window where it is.
pub fn apply_tiling_config(cfg: TilingConfig) {
    let cfg = sanitize_tiling_config(cfg);
    let enabled = cfg.enabled;
    {
        let mut e = engine();
        if e.cfg.layout != cfg.layout {
            e.runtime_layout = None;
        }
        if (e.cfg.master_ratio - cfg.master_ratio).abs() > 0.001 {
            e.runtime_ratio = None;
        }
        e.cfg = cfg;
        if !enabled {
            e.state = TileState::default();
            e.assigned.clear();
            e.placed_at.clear();
            e.monocle = false;
        }
    }
    TILING_ON.store(enabled, std::sync::atomic::Ordering::SeqCst);
    if enabled {
        ensure_event_thread();
        request_retile();
    }
    emit_status();
}

/// Keyboard / palette actions for the automatic tiler. Returns None when the action is not
/// an auto-tiling action (or tiling is off), so the caller falls back to one-shot tiling.
pub fn auto_tiling_action(action: &str, arg: &str) -> Option<Result<String, String>> {
    if !is_auto_tiling() {
        return None;
    }
    let res = auto_tiling_action_inner(action, arg)?;
    request_retile();
    emit_status();
    Some(res)
}

fn auto_tiling_action_inner(action: &str, arg: &str) -> Option<Result<String, String>> {
    let fg = foreground_window();
    let mut e = engine();
    let r = match action {
        "tile" | "layout" => {
            let l = canonical_layout(arg).to_string();
            e.monocle = false;
            e.runtime_layout = Some(l.clone());
            crate::win_workspaces::set_active_layout(&l);
            Ok(format!("Layout: {}.", l))
        }
        "cycle" => {
            let (cur, _) = effective_layout(&e);
            let len = AUTO_LAYOUTS.len() as i32;
            let pos = AUTO_LAYOUTS.iter().position(|l| *l == cur).unwrap_or(0) as i32;
            let step = if arg == "prev" { -1 } else { 1 };
            let next = AUTO_LAYOUTS[(pos + step).rem_euclid(len) as usize].to_string();
            e.monocle = false;
            e.runtime_layout = Some(next.clone());
            crate::win_workspaces::set_active_layout(&next);
            Ok(format!("Layout: {}.", next))
        }
        "monocle" => {
            e.monocle = !e.monocle;
            Ok(if e.monocle {
                "Monocle on.".into()
            } else {
                "Monocle off.".into()
            })
        }
        "resize" => {
            let cur = e.runtime_ratio.unwrap_or(e.cfg.master_ratio);
            let next = (cur + if arg == "shrink" { -0.05 } else { 0.05 }).clamp(0.2, 0.8);
            e.runtime_ratio = Some(next);
            Ok(format!("Master width {}%.", (next * 100.0).round()))
        }
        "retile" => Ok("Re-tiled.".into()),
        "float" => match fg {
            Some(h) => {
                let now_floating = e.state.toggle_float(h);
                e.assigned.remove(&h);
                Ok(if now_floating {
                    "Window floating.".into()
                } else {
                    "Window tiled.".into()
                })
            }
            None => Err("No app window in front.".into()),
        },
        "promote" => match fg {
            Some(h) if e.state.promote(h) => Ok("Moved to master.".into()),
            Some(_) => Ok("Already the master window.".into()),
            None => Err("No app window in front.".into()),
        },
        "stack" => match fg {
            Some(h) if e.state.toggle_stack(h) => Ok("Stack changed.".into()),
            Some(_) => Err("Nothing to stack with.".into()),
            None => Err("No app window in front.".into()),
        },
        "stack-next" => match fg.and_then(|h| e.state.cycle_stack(h)) {
            Some(next) => {
                drop(e);
                crate::win_windows::focus_window(next);
                return Some(Ok("Next window in stack.".into()));
            }
            None => Err("This window is not in a stack.".into()),
        },
        "swap" => {
            let Some(h) = fg else {
                return Some(Err("No app window in front.".into()));
            };
            let Some(work) = WORK_AREA.get().and_then(|f| f()) else {
                return Some(Err("Work area unavailable.".into()));
            };
            let (layout, _) = effective_layout(&e);
            let ratio = e.runtime_ratio.unwrap_or(e.cfg.master_ratio);
            let skip = e.zoomed.clone();
            let tiles = e
                .state
                .visible_tiles(&layout, work, e.cfg.gap, ratio, &skip);
            let Some(own) = e.state.group_of(h) else {
                return Some(Err("The window in front is not tiled.".into()));
            };
            let Some(from) = tiles.iter().position(|(g, _)| *g == own) else {
                return Some(Err("The window in front is not tiled.".into()));
            };
            let rects: Vec<TileRect> = tiles.iter().map(|(_, r)| *r).collect();
            match neighbor_index(&rects, from, arg) {
                Some(to) => {
                    e.state.swap_groups(own, tiles[to].0);
                    Ok(format!("Swapped {}.", arg))
                }
                None => Err(format!("No tile to the {}.", arg)),
            }
        }
        _ => return None,
    };
    Some(r)
}

// ---------------------------------------------------------------------------------------
// Win32 (raw FFI so the whole engine type-checks without the `windows` crate)
// ---------------------------------------------------------------------------------------

#[cfg(windows)]
pub(crate) mod ffi {
    // Structs and the message loop are shared with other modules (see crate::ffi).
    pub use crate::ffi::{
        DispatchMessageW, GetMessageW, GetMonitorInfoW, MonitorInfo, Msg, Rect, TranslateMessage,
    };

    pub type WinEventProc = unsafe extern "system" fn(isize, u32, isize, i32, i32, u32, u32);
    pub type EnumProc = unsafe extern "system" fn(isize, isize) -> i32;

    #[link(name = "user32")]
    extern "system" {
        pub fn EnumWindows(cb: EnumProc, lparam: isize) -> i32;
        pub fn IsWindow(h: isize) -> i32;
        pub fn IsWindowVisible(h: isize) -> i32;
        pub fn IsIconic(h: isize) -> i32;
        pub fn IsZoomed(h: isize) -> i32;
        pub fn GetAncestor(h: isize, flags: u32) -> isize;
        pub fn GetWindow(h: isize, cmd: u32) -> isize;
        pub fn GetWindowLongW(h: isize, index: i32) -> i32;
        pub fn GetWindowTextLengthW(h: isize) -> i32;
        pub fn GetClassNameW(h: isize, buf: *mut u16, max: i32) -> i32;
        pub fn GetWindowThreadProcessId(h: isize, pid: *mut u32) -> u32;
        pub fn GetWindowRect(h: isize, r: *mut Rect) -> i32;
        pub fn SetWindowPos(
            h: isize,
            after: isize,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        pub fn ShowWindowAsync(h: isize, cmd: i32) -> i32;
        pub fn GetForegroundWindow() -> isize;
        pub fn MonitorFromWindow(h: isize, flags: u32) -> isize;
        pub fn SetWinEventHook(
            min: u32,
            max: u32,
            hmod: isize,
            cb: WinEventProc,
            pid: u32,
            tid: u32,
            flags: u32,
        ) -> isize;
    }
    #[link(name = "dwmapi")]
    extern "system" {
        pub fn DwmGetWindowAttribute(
            h: isize,
            attr: u32,
            out: *mut core::ffi::c_void,
            size: u32,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        pub fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        pub fn QueryFullProcessImageNameW(
            h: isize,
            flags: u32,
            buf: *mut u16,
            size: *mut u32,
        ) -> i32;
        pub fn CloseHandle(h: isize) -> i32;
    }

    pub const GA_ROOT: u32 = 2;
    pub const GW_OWNER: u32 = 4;
    pub const GWL_STYLE: i32 = -16;
    pub const GWL_EXSTYLE: i32 = -20;
    pub const WS_CHILD: u32 = 0x4000_0000;
    pub const WS_THICKFRAME: u32 = 0x0004_0000;
    pub const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
    pub const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
    pub const WS_EX_APPWINDOW: u32 = 0x0004_0000;
    pub const DWMWA_EXTENDED_FRAME_BOUNDS: u32 = 9;
    pub const DWMWA_CLOAKED: u32 = 14;
    pub const MONITOR_DEFAULTTONEAREST: u32 = 2;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOZORDER: u32 = 0x0004;
    pub const SWP_NOACTIVATE: u32 = 0x0010;
    pub const SWP_NOOWNERZORDER: u32 = 0x0200;
    /// Never block Lens on a hung app: the move is queued to the app's own thread.
    pub const SWP_ASYNCWINDOWPOS: u32 = 0x4000;
    pub const HWND_TOP: isize = 0;
    pub const SW_MINIMIZE: i32 = 6;
    pub const SW_SHOWNOACTIVATE: i32 = 4;
    pub const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    pub const WINEVENT_OUTOFCONTEXT: u32 = 0;
    pub const OBJID_WINDOW: i32 = 0;

    pub const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
    pub const EVENT_SYSTEM_MOVESIZESTART: u32 = 0x000A;
    pub const EVENT_SYSTEM_MOVESIZEEND: u32 = 0x000B;
    pub const EVENT_SYSTEM_MINIMIZESTART: u32 = 0x0016;
    pub const EVENT_SYSTEM_MINIMIZEEND: u32 = 0x0017;
    pub const EVENT_OBJECT_DESTROY: u32 = 0x8001;
    pub const EVENT_OBJECT_SHOW: u32 = 0x8002;
    pub const EVENT_OBJECT_HIDE: u32 = 0x8003;
    pub const EVENT_OBJECT_LOCATIONCHANGE: u32 = 0x800B;
    pub const EVENT_OBJECT_CLOAKED: u32 = 0x8017;
    pub const EVENT_OBJECT_UNCLOAKED: u32 = 0x8018;
}

/// A top-level app window as the tiler and the workspace manager see it.
#[derive(Debug, Clone)]
pub struct DesktopWindow {
    pub hwnd: isize,
    /// Lower-case executable name, e.g. "chrome.exe".
    pub process: String,
    /// Visible frame (no invisible resize borders).
    pub frame: TileRect,
    pub minimized: bool,
    pub maximized: bool,
    pub cloaked: bool,
    pub fullscreen: bool,
    /// Resizable, unowned, not a dialog class: may take a tile.
    pub tileable: bool,
}

#[cfg(windows)]
fn to_tile(r: ffi::Rect) -> TileRect {
    TileRect {
        x: r.left,
        y: r.top,
        w: r.right - r.left,
        h: r.bottom - r.top,
    }
}

#[cfg(windows)]
unsafe fn frame_of(h: isize) -> Option<TileRect> {
    let mut r = ffi::Rect::default();
    if ffi::DwmGetWindowAttribute(
        h,
        ffi::DWMWA_EXTENDED_FRAME_BOUNDS,
        &mut r as *mut _ as *mut _,
        std::mem::size_of::<ffi::Rect>() as u32,
    ) != 0
        && ffi::GetWindowRect(h, &mut r) == 0
    {
        return None;
    }
    Some(to_tile(r))
}

#[cfg(windows)]
unsafe fn process_name_of(h: isize) -> Option<String> {
    let mut pid = 0u32;
    ffi::GetWindowThreadProcessId(h, &mut pid);
    if pid == 0 || pid == std::process::id() {
        return None;
    }
    let ph = ffi::OpenProcess(ffi::PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if ph == 0 {
        return Some(String::new());
    }
    let mut buf = [0u16; 512];
    let mut len = buf.len() as u32;
    let ok = ffi::QueryFullProcessImageNameW(ph, 0, buf.as_mut_ptr(), &mut len) != 0;
    ffi::CloseHandle(ph);
    if !ok {
        return Some(String::new());
    }
    Some(normalize_app(&String::from_utf16_lossy(
        &buf[..len as usize],
    )))
}

/// Describes one window, or None for anything that is not an app window the user sees
/// (children, tool windows, invisible, untitled, Lens' own windows).
#[cfg(windows)]
pub(crate) unsafe fn describe_window(h: isize) -> Option<DesktopWindow> {
    if h == 0 || ffi::IsWindowVisible(h) == 0 || ffi::GetAncestor(h, ffi::GA_ROOT) != h {
        return None;
    }
    let style = ffi::GetWindowLongW(h, ffi::GWL_STYLE) as u32;
    let ex = ffi::GetWindowLongW(h, ffi::GWL_EXSTYLE) as u32;
    if style & ffi::WS_CHILD != 0 || ex & ffi::WS_EX_NOACTIVATE != 0 {
        return None;
    }
    if ex & ffi::WS_EX_TOOLWINDOW != 0 && ex & ffi::WS_EX_APPWINDOW == 0 {
        return None;
    }
    if ffi::GetWindowTextLengthW(h) == 0 {
        return None;
    }
    let process = process_name_of(h)?;
    let mut class_buf = [0u16; 128];
    let n = ffi::GetClassNameW(h, class_buf.as_mut_ptr(), class_buf.len() as i32).max(0) as usize;
    let class = String::from_utf16_lossy(&class_buf[..n]);
    if matches!(
        class.as_str(),
        "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Progman" | "WorkerW"
    ) {
        return None;
    }
    let mut cloaked_val = 0u32;
    let cloaked = ffi::DwmGetWindowAttribute(
        h,
        ffi::DWMWA_CLOAKED,
        &mut cloaked_val as *mut _ as *mut _,
        4,
    ) == 0
        && cloaked_val != 0;
    let frame = frame_of(h)?;
    let minimized = ffi::IsIconic(h) != 0;
    let maximized = ffi::IsZoomed(h) != 0;
    let mut fullscreen = false;
    if !minimized {
        let mut mi = ffi::MonitorInfo {
            cb_size: std::mem::size_of::<ffi::MonitorInfo>() as u32,
            ..Default::default()
        };
        if ffi::GetMonitorInfoW(
            ffi::MonitorFromWindow(h, ffi::MONITOR_DEFAULTTONEAREST),
            &mut mi,
        ) != 0
        {
            let m = mi.rc_monitor;
            let mut wr = ffi::Rect::default();
            ffi::GetWindowRect(h, &mut wr);
            fullscreen = wr.left <= m.left
                && wr.top <= m.top
                && wr.right >= m.right
                && wr.bottom >= m.bottom;
        }
    }
    let owned = ffi::GetWindow(h, ffi::GW_OWNER) != 0;
    let tileable = style & ffi::WS_THICKFRAME != 0
        && !owned
        && !NEVER_TILE_CLASSES.contains(&class.as_str())
        && !process.is_empty()
        && !process_never_tiled(&process)
        && frame.w >= 200
        && frame.h >= 150;
    Some(DesktopWindow {
        hwnd: h,
        process,
        frame,
        minimized,
        maximized,
        cloaked,
        fullscreen,
        tileable,
    })
}

/// All app windows in Z-order (front first).
#[cfg(windows)]
pub(crate) fn desktop_windows() -> Vec<DesktopWindow> {
    unsafe extern "system" fn cb(h: isize, lp: isize) -> i32 {
        // A panic must not cross into Windows (docs/FAILSAFE.md §3).
        crate::failsafe::guard::ffi_guard("tiler.cb", 1, || cb_guarded(h, lp))
    }

    unsafe fn cb_guarded(h: isize, lp: isize) -> i32 {
        let out = &mut *(lp as *mut Vec<DesktopWindow>);
        if let Some(w) = describe_window(h) {
            out.push(w);
        }
        1
    }
    let mut out: Vec<DesktopWindow> = Vec::new();
    unsafe {
        ffi::EnumWindows(cb, &mut out as *mut Vec<DesktopWindow> as isize);
    }
    out
}

#[cfg(not(windows))]
pub(crate) fn desktop_windows() -> Vec<DesktopWindow> {
    Vec::new()
}

#[cfg(windows)]
fn foreground_window() -> Option<isize> {
    unsafe {
        let h = ffi::GetForegroundWindow();
        describe_window(h).map(|w| w.hwnd)
    }
}

#[cfg(not(windows))]
fn foreground_window() -> Option<isize> {
    None
}

/// Moves a window so its visible frame lands exactly on `target` (compensating for the
/// invisible resize borders Windows 10/11 add around most windows).
#[cfg(windows)]
unsafe fn place_frame(h: isize, target: TileRect) {
    let mut wr = ffi::Rect::default();
    if ffi::GetWindowRect(h, &mut wr) == 0 {
        return;
    }
    let fr = frame_of(h).unwrap_or(to_tile(wr));
    let dl = fr.x - wr.left;
    let dt = fr.y - wr.top;
    let dr = wr.right - (fr.x + fr.w);
    let db = wr.bottom - (fr.y + fr.h);
    ffi::SetWindowPos(
        h,
        0,
        target.x - dl,
        target.y - dt,
        target.w + dl + dr,
        target.h + dt + db,
        ffi::SWP_NOZORDER | ffi::SWP_NOACTIVATE | ffi::SWP_NOOWNERZORDER | ffi::SWP_ASYNCWINDOWPOS,
    );
}

/// Recomputes and applies the layout. Runs on the worker thread.
#[cfg(windows)]
fn retile_now() {
    use std::time::Instant;
    if !is_auto_tiling() {
        return;
    }
    let Some(work) = WORK_AREA.get().and_then(|f| f()) else {
        return;
    };
    let wins = desktop_windows();

    // Pause entirely while a fullscreen window (game, video) is in front.
    let fg = unsafe { ffi::GetForegroundWindow() };
    let paused = wins.iter().any(|w| w.hwnd == fg && w.fullscreen);

    // Windows on the Lens monitor only (centre inside the work area, with slack for the bars).
    let on_monitor = |w: &DesktopWindow| {
        let cx = w.frame.x + w.frame.w / 2;
        let cy = w.frame.y + w.frame.h / 2;
        cx >= work.x && cx < work.x + work.w && cy >= work.y - 200 && cy < work.y + work.h + 200
    };
    let candidates: Vec<&DesktopWindow> = wins
        .iter()
        .filter(|w| w.tileable && (on_monitor(w) || w.minimized || w.cloaked))
        .collect();
    let present: Vec<isize> = candidates.iter().map(|w| w.hwnd).collect();
    let skip: HashSet<isize> = candidates
        .iter()
        .filter(|w| w.minimized || w.maximized || w.cloaked || w.fullscreen)
        .map(|w| w.hwnd)
        .collect();
    let procs: HashMap<isize, String> = candidates
        .iter()
        .map(|w| (w.hwnd, w.process.clone()))
        .collect();

    let mut moves: Vec<(isize, TileRect)> = Vec::new();
    let mut fronts: Vec<isize> = Vec::new();
    {
        let mut e = engine();
        e.paused = paused;
        if paused
            || e.moving.is_some()
            || e.settle_until.map(|t| Instant::now() < t).unwrap_or(false)
        {
            drop(e);
            if paused {
                emit_status();
            }
            return;
        }
        let float_apps = e.cfg.float_apps.clone();
        let new_as_master = e.cfg.new_window == "master";
        let auto_float = |h: isize| {
            let p = procs.get(&h).map(|s| s.as_str()).unwrap_or("");
            float_apps.iter().any(|a| a == p) || crate::win_workspaces::is_float_app(p)
        };
        e.state.sync(&present, new_as_master, &auto_float);
        e.zoomed = candidates
            .iter()
            .filter(|w| w.maximized)
            .map(|w| w.hwnd)
            .collect();
        let (layout, _) = effective_layout(&e);
        let ratio = e.runtime_ratio.unwrap_or(e.cfg.master_ratio);
        let gap = e.cfg.gap;
        let frames: HashMap<isize, TileRect> =
            candidates.iter().map(|w| (w.hwnd, w.frame)).collect();
        let now = Instant::now();
        let live: HashSet<isize> = present.iter().copied().collect();
        e.assigned.retain(|h, _| live.contains(h));
        e.placed_at.retain(|h, _| live.contains(h));
        for (h, rect, front) in e.state.assignments(&layout, work, gap, ratio, &skip) {
            let current = frames.get(&h).copied();
            if current.map(|c| rect_differs(c, rect, 2)).unwrap_or(true) {
                moves.push((h, rect));
                e.placed_at.insert(h, now);
            }
            e.assigned.insert(h, rect);
            if front {
                fronts.push(h);
            }
        }
    }
    unsafe {
        for (h, r) in &moves {
            place_frame(*h, *r);
        }
        // Keep the front window of each stack above the others in that stack.
        if !moves.is_empty() {
            for h in fronts.iter().rev() {
                if engine()
                    .state
                    .groups
                    .iter()
                    .any(|g| g.len() > 1 && g[0] == *h)
                {
                    ffi::SetWindowPos(
                        *h,
                        ffi::HWND_TOP,
                        0,
                        0,
                        0,
                        0,
                        ffi::SWP_NOMOVE | ffi::SWP_NOSIZE | ffi::SWP_NOACTIVATE,
                    );
                }
            }
        }
    }
    emit_status();
}

/// The user finished dragging / resizing a tiled window: drop it on another tile to swap,
/// widen the master to change the split, anything else snaps back.
#[cfg(windows)]
fn on_user_move_end(h: isize) {
    use std::time::{Duration, Instant};
    let Some(frame) = (unsafe { frame_of(h) }) else {
        return;
    };
    let Some(work) = WORK_AREA.get().and_then(|f| f()) else {
        return;
    };
    let mut e = engine();
    e.moving = None;
    e.settle_until = Some(Instant::now() + Duration::from_millis(260));
    let Some(old) = e.assigned.get(&h).copied() else {
        return;
    };
    let Some(own) = e.state.group_of(h) else {
        return;
    };
    let (layout, _) = effective_layout(&e);
    let ratio = e.runtime_ratio.unwrap_or(e.cfg.master_ratio);
    let skip = e.zoomed.clone();
    let tiles = e
        .state
        .visible_tiles(&layout, work, e.cfg.gap, ratio, &skip);
    let resized = (frame.w - old.w).abs() > 24 || (frame.h - old.h).abs() > 24;
    if resized {
        if layout == "master-stack" && tiles.first().map(|(g, _)| *g == own).unwrap_or(false) {
            let area_w = (work.w - 2 * e.cfg.gap).max(200) - e.cfg.gap;
            e.runtime_ratio = Some((frame.w as f32 / area_w.max(1) as f32).clamp(0.2, 0.8));
        }
    } else if let Some(target) =
        drop_target(&tiles, own, frame.x + frame.w / 2, frame.y + frame.h / 2)
    {
        e.state.swap_groups(own, target);
    }
    e.assigned.remove(&h); // force a re-place
    drop(e);
    request_retile();
}

#[cfg(windows)]
unsafe extern "system" fn tiler_event_cb(
    _hook: isize,
    event: u32,
    h: isize,
    id_object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    // A panic must not cross into Windows (docs/FAILSAFE.md §3).
    crate::failsafe::guard::ffi_guard("tiler.tiler_event_cb", (), || tiler_event_cb_guarded(_hook, event, h, id_object, _child, _thread, _time))
}

#[cfg(windows)]
unsafe fn tiler_event_cb_guarded(
    _hook: isize,
    event: u32,
    h: isize,
    id_object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    use std::time::{Duration, Instant};
    if id_object != ffi::OBJID_WINDOW || h == 0 {
        return;
    }
    // Workspaces see every new / closed window, tiling or not.
    if event == ffi::EVENT_OBJECT_SHOW || event == ffi::EVENT_OBJECT_DESTROY {
        crate::win_workspaces::on_window_event(h, event == ffi::EVENT_OBJECT_SHOW);
    }
    if !is_auto_tiling() {
        return;
    }
    match event {
        ffi::EVENT_SYSTEM_MOVESIZESTART => {
            let mut e = engine();
            if e.assigned.contains_key(&h) {
                e.moving = Some(h);
            }
        }
        ffi::EVENT_SYSTEM_MOVESIZEEND => {
            let tracked = engine().assigned.contains_key(&h);
            if tracked {
                on_user_move_end(h);
            } else {
                engine().moving = None;
            }
        }
        ffi::EVENT_OBJECT_LOCATIONCHANGE => {
            let mut e = engine();
            let Some(assigned) = e.assigned.get(&h).copied() else {
                return;
            };
            if e.moving.is_some() {
                return;
            }
            let zoomed = ffi::IsZoomed(h) != 0;
            if zoomed != e.zoomed.contains(&h) {
                drop(e);
                request_retile();
                return;
            }
            let Some(frame) = frame_of(h) else { return };
            if !rect_differs(frame, assigned, 24) {
                return;
            }
            let recent = e
                .placed_at
                .get(&h)
                .map(|t| t.elapsed() < Duration::from_millis(700))
                .unwrap_or(false);
            if recent {
                // The app adjusted the size Lens gave it (minimum size etc.): accept it.
                e.assigned.insert(h, frame);
            } else if ffi::IsIconic(h) == 0 && !zoomed {
                // Moved by something else (Windows Snap, Win+Arrow, the app): let it float.
                if let Some(i) = e.state.group_of(h) {
                    e.state.groups[i].retain(|x| *x != h);
                    if e.state.groups[i].is_empty() {
                        e.state.groups.remove(i);
                    }
                }
                e.state.floating.insert(h);
                e.assigned.remove(&h);
                e.settle_until = Some(Instant::now() + Duration::from_millis(200));
                drop(e);
                request_retile();
            }
        }
        ffi::EVENT_OBJECT_SHOW
        | ffi::EVENT_OBJECT_DESTROY
        | ffi::EVENT_OBJECT_HIDE
        | ffi::EVENT_SYSTEM_MINIMIZESTART
        | ffi::EVENT_SYSTEM_MINIMIZEEND
        | ffi::EVENT_OBJECT_CLOAKED
        | ffi::EVENT_OBJECT_UNCLOAKED
        | ffi::EVENT_SYSTEM_FOREGROUND => request_retile(),
        _ => {}
    }
}

/// Starts the shared WinEvent thread and the re-tile worker (once). Used by tiling and by
/// workspaces; does nothing on its own while both are off.
pub fn ensure_event_thread() {
    use std::sync::atomic::Ordering;
    if EVENT_THREAD_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    #[cfg(windows)]
    {
        std::thread::spawn(|| unsafe {
            let ranges: [(u32, u32); 6] = [
                (ffi::EVENT_SYSTEM_FOREGROUND, ffi::EVENT_SYSTEM_FOREGROUND),
                (
                    ffi::EVENT_SYSTEM_MOVESIZESTART,
                    ffi::EVENT_SYSTEM_MOVESIZEEND,
                ),
                (
                    ffi::EVENT_SYSTEM_MINIMIZESTART,
                    ffi::EVENT_SYSTEM_MINIMIZEEND,
                ),
                (ffi::EVENT_OBJECT_DESTROY, ffi::EVENT_OBJECT_HIDE),
                (
                    ffi::EVENT_OBJECT_LOCATIONCHANGE,
                    ffi::EVENT_OBJECT_LOCATIONCHANGE,
                ),
                (ffi::EVENT_OBJECT_CLOAKED, ffi::EVENT_OBJECT_UNCLOAKED),
            ];
            let mut hooked = 0;
            for (lo, hi) in ranges {
                if ffi::SetWinEventHook(lo, hi, 0, tiler_event_cb, 0, 0, ffi::WINEVENT_OUTOFCONTEXT)
                    != 0
                {
                    hooked += 1;
                }
            }
            eprintln!("[Lens Tiling] Event thread active ({} hooks).", hooked);
            let mut msg = ffi::Msg::default();
            while ffi::GetMessageW(&mut msg, 0, 0, 0) > 0 {
                ffi::TranslateMessage(&msg);
                ffi::DispatchMessageW(&msg);
            }
        });
        std::thread::spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if TILE_DIRTY.swap(false, Ordering::SeqCst) {
                retile_now();
            }
        });
    }
}

/// Extra bindings for the automatic tiler and workspaces (registered by lib.rs only when
/// `tiling.enabled` or `workspaces.enabled`; see TilingCard for the list shown to users).
pub const AUTO_TILING_HOTKEYS: [TilingHotkey; 15] = [
    TilingHotkey {
        keys: "Ctrl+Alt+Shift+Left",
        action: "swap",
        arg: "left",
        label: "Swap with the tile to the left",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+Shift+Right",
        action: "swap",
        arg: "right",
        label: "Swap with the tile to the right",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+Shift+Up",
        action: "swap",
        arg: "up",
        label: "Swap with the tile above",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+Shift+Down",
        action: "swap",
        arg: "down",
        label: "Swap with the tile below",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+F",
        action: "float",
        arg: "",
        label: "Float / tile the window in front",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+M",
        action: "monocle",
        arg: "",
        label: "Monocle (one window fills the screen)",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+S",
        action: "stack",
        arg: "",
        label: "Stack with the neighbouring tile / unstack",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+N",
        action: "stack-next",
        arg: "",
        label: "Next window in the stack",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+P",
        action: "promote",
        arg: "",
        label: "Move to the master tile",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+Equal",
        action: "resize",
        arg: "grow",
        label: "Widen the master tile",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+Minus",
        action: "resize",
        arg: "shrink",
        label: "Narrow the master tile",
    },
    TilingHotkey {
        keys: "Ctrl+Alt+R",
        action: "retile",
        arg: "",
        label: "Re-tile now",
    },
    TilingHotkey {
        keys: "Alt+Shift+1",
        action: "workspace",
        arg: "1",
        label: "Workspace 1",
    },
    TilingHotkey {
        keys: "Alt+Shift+2",
        action: "workspace",
        arg: "2",
        label: "Workspace 2",
    },
    TilingHotkey {
        keys: "Alt+Shift+3",
        action: "workspace",
        arg: "3",
        label: "Workspace 3",
    },
];

#[cfg(test)]
#[path = "tests/win_tiler.rs"]
mod tests;
