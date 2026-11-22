//! Real DWM glass (Windows 11 22H2+ system backdrop) for rectangular Lens flyouts.
//! Raw FFI only. OFF unless `func.realGlass` is enabled — see docs/CORE_PATCH_PLAN.md (patch G1)
//! for the limits: the backdrop always fills the whole window rectangle, so it cannot follow
//! CSS-shaped corners, and it must never be applied to the Dock (a full-width transparent window).

#![allow(dead_code)]

use std::sync::atomic::{AtomicBool, Ordering};

/// DWM_SYSTEMBACKDROP_TYPE values.
pub const BACKDROP_NONE: u32 = 1;
pub const BACKDROP_MICA: u32 = 2;
pub const BACKDROP_ACRYLIC: u32 = 3;

static REAL_GLASS_ENABLED: AtomicBool = AtomicBool::new(false);

pub fn set_real_glass_enabled(enabled: bool) {
    REAL_GLASS_ENABLED.store(enabled, Ordering::SeqCst);
}

pub fn real_glass_enabled() -> bool {
    REAL_GLASS_ENABLED.load(Ordering::SeqCst)
}

#[cfg(windows)]
mod ffi {
    #[repr(C)]
    pub struct Margins {
        pub left: i32,
        pub right: i32,
        pub top: i32,
        pub bottom: i32,
    }

    pub const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    pub const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
    pub const DWMWCP_ROUND: u32 = 2;

    #[link(name = "dwmapi")]
    extern "system" {
        /// Returns an HRESULT (0 = S_OK).
        pub fn DwmSetWindowAttribute(
            hwnd: isize,
            attribute: u32,
            value: *const core::ffi::c_void,
            size: u32,
        ) -> i32;
        /// Returns an HRESULT (0 = S_OK).
        pub fn DwmExtendFrameIntoClientArea(hwnd: isize, margins: *const Margins) -> i32;
    }
}

/// Puts a system backdrop behind the whole window and lets DWM round its corners (8px — the only
/// radius DWM offers). Returns false when Windows refuses (older than Windows 11 22H2).
/// The web content must be translucent for the backdrop to show through.
#[cfg(windows)]
pub fn apply_system_backdrop(hwnd: isize, kind: u32) -> bool {
    if hwnd == 0 {
        return false;
    }
    unsafe {
        let margins = ffi::Margins {
            left: -1,
            right: -1,
            top: -1,
            bottom: -1,
        };
        let _ = ffi::DwmExtendFrameIntoClientArea(hwnd, &margins);
        let hr = ffi::DwmSetWindowAttribute(
            hwnd,
            ffi::DWMWA_SYSTEMBACKDROP_TYPE,
            &kind as *const u32 as *const core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        if hr != 0 {
            return false;
        }
        let corner = ffi::DWMWCP_ROUND;
        let _ = ffi::DwmSetWindowAttribute(
            hwnd,
            ffi::DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner as *const u32 as *const core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        true
    }
}

#[cfg(not(windows))]
pub fn apply_system_backdrop(_hwnd: isize, _kind: u32) -> bool {
    false
}
