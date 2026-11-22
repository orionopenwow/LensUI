//! Shared raw Win32 declarations used by more than one Lens module.
//!
//! Several modules declare Win32 functions with hand-written `extern "system"` blocks instead of
//! the `windows` crate. When two modules declared the same function with structurally different
//! argument types (for example a `MSG` with and without its trailing `lPrivate` field),
//! `clashing_extern_declarations` rejected the build. Functions that take one of the structs below
//! are therefore declared exactly once, here, with the layouts from the Windows SDK headers.
//!
//! Handles (`HWND`, `HINSTANCE`, `HMENU`, `HMONITOR`, `HCURSOR`, …) are `isize`; `BOOL` is `i32`;
//! `WPARAM` is `usize`; `LPARAM` and `LRESULT` are `isize`; `ATOM` is `u16`.
#![cfg(windows)]
#![allow(non_snake_case, dead_code)]

use std::ffi::c_void;

/// `POINT` (windef.h).
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

/// `RECT` (windef.h).
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// `MSG` (winuser.h). 48 bytes on x64, including the trailing `lPrivate`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct Msg {
    pub hwnd: isize,
    pub message: u32,
    pub wparam: usize,
    pub lparam: isize,
    pub time: u32,
    pub pt: Point,
    pub lprivate: u32,
}

/// `WNDPROC`.
pub type WndProc = unsafe extern "system" fn(isize, u32, usize, isize) -> isize;

/// `WNDCLASSW` (winuser.h).
#[repr(C)]
pub struct WndClassW {
    pub style: u32,
    pub wnd_proc: Option<WndProc>,
    pub cls_extra: i32,
    pub wnd_extra: i32,
    pub instance: isize,
    pub icon: isize,
    pub cursor: isize,
    pub background: isize,
    pub menu_name: *const u16,
    pub class_name: *const u16,
}

/// `MONITORINFO` (winuser.h). `MONITORINFOEXW` starts with this layout; callers that want the
/// device name pass a `MonitorInfoExW` cast to `*mut MonitorInfo` with `cb_size` set to its size.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct MonitorInfo {
    pub cb_size: u32,
    pub rc_monitor: Rect,
    pub rc_work: Rect,
    pub flags: u32,
}

/// `MONITORINFOEXW` (winuser.h).
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct MonitorInfoExW {
    pub info: MonitorInfo,
    pub device: [u16; 32],
}

impl Default for MonitorInfoExW {
    fn default() -> Self {
        Self {
            info: MonitorInfo {
                cb_size: std::mem::size_of::<MonitorInfoExW>() as u32,
                ..Default::default()
            },
            device: [0; 32],
        }
    }
}

#[link(name = "user32")]
extern "system" {
    pub fn RegisterClassW(class: *const WndClassW) -> u16;
    pub fn CreateWindowExW(
        ex_style: u32,
        class_name: *const u16,
        window_name: *const u16,
        style: u32,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        parent: isize,
        menu: isize,
        instance: isize,
        param: *mut c_void,
    ) -> isize;
    pub fn DefWindowProcW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
    pub fn GetMessageW(msg: *mut Msg, hwnd: isize, filter_min: u32, filter_max: u32) -> i32;
    pub fn TranslateMessage(msg: *const Msg) -> i32;
    pub fn DispatchMessageW(msg: *const Msg) -> isize;
    pub fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfo) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sizes from the Windows SDK headers on x64.
    #[test]
    fn layouts_match_windows_sdk() {
        assert_eq!(std::mem::size_of::<Point>(), 8);
        assert_eq!(std::mem::size_of::<Rect>(), 16);
        assert_eq!(std::mem::size_of::<Msg>(), 48);
        assert_eq!(std::mem::size_of::<WndClassW>(), 72);
        assert_eq!(std::mem::size_of::<MonitorInfo>(), 40);
        assert_eq!(std::mem::size_of::<MonitorInfoExW>(), 104);
        assert_eq!(MonitorInfoExW::default().info.cb_size, 104);
    }
}
