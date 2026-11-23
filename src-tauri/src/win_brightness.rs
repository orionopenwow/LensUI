//! Per-monitor brightness. External screens are driven over DDC/CI through the Windows
//! monitor-configuration API (dxva2: GetPhysicalMonitorsFromHMONITOR / Get|SetMonitorBrightness);
//! a laptop's own panel goes through WMI (WmiMonitorBrightnessMethods). A screen that accepts
//! neither is reported as `supported: false`, so the UI can say so instead of showing a dead slider.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorBrightness {
    /// `internal`, or `ext:<device>:<index>` for an external screen (stable while connected).
    pub id: String,
    /// Display 1, Display 2 … (matches the order Windows lists them).
    pub name: String,
    /// "internal" | "external"
    pub kind: String,
    pub supported: bool,
    /// 0–100 when supported.
    pub brightness: Option<u32>,
    /// Plain-words reason when not supported.
    pub note: String,
}

/// Maps a monitor's own range to 0–100.
pub fn to_percent(min: u32, cur: u32, max: u32) -> u32 {
    if max <= min {
        return 0;
    }
    let c = cur.clamp(min, max);
    (((c - min) as f64 / (max - min) as f64) * 100.0).round() as u32
}

/// Maps 0–100 back into a monitor's own range.
pub fn from_percent(level: u32, min: u32, max: u32) -> u32 {
    if max <= min {
        return min;
    }
    let l = level.min(100) as f64 / 100.0;
    min + ((max - min) as f64 * l).round() as u32
}

/// `ext:\\.\DISPLAY2:0` → (`\\.\DISPLAY2`, 0)
pub fn parse_external_id(id: &str) -> Option<(String, usize)> {
    let rest = id.strip_prefix("ext:")?;
    let (dev, idx) = rest.rsplit_once(':')?;
    Some((dev.to_string(), idx.parse().ok()?))
}

pub const NOT_SUPPORTED: &str = "Not supported by this monitor (DDC/CI is off or unavailable).";

#[cfg(windows)]
mod ffi {
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct PhysicalMonitor {
        pub handle: isize,
        pub description: [u16; 128],
    }
    #[link(name = "dxva2")]
    extern "system" {
        pub fn GetNumberOfPhysicalMonitorsFromHMONITOR(hmon: isize, count: *mut u32) -> i32;
        pub fn GetPhysicalMonitorsFromHMONITOR(hmon: isize, count: u32, array: *mut PhysicalMonitor) -> i32;
        pub fn GetMonitorBrightness(h: isize, min: *mut u32, cur: *mut u32, max: *mut u32) -> i32;
        pub fn SetMonitorBrightness(h: isize, value: u32) -> i32;
        pub fn DestroyPhysicalMonitors(count: u32, array: *const PhysicalMonitor) -> i32;
    }
}

/// Opens the physical monitors behind one HMONITOR, runs `f` on each (index, handle), then closes them.
#[cfg(windows)]
fn with_physical<R>(hmon: isize, mut f: impl FnMut(usize, isize) -> Option<R>) -> Vec<R> {
    let mut out = Vec::new();
    unsafe {
        let mut n = 0u32;
        if ffi::GetNumberOfPhysicalMonitorsFromHMONITOR(hmon, &mut n) == 0 || n == 0 || n > 16 {
            return out;
        }
        let mut arr = vec![ffi::PhysicalMonitor { handle: 0, description: [0; 128] }; n as usize];
        if ffi::GetPhysicalMonitorsFromHMONITOR(hmon, n, arr.as_mut_ptr()) == 0 {
            return out;
        }
        for (i, pm) in arr.iter().enumerate() {
            if let Some(r) = f(i, pm.handle) {
                out.push(r);
            }
        }
        let _ = ffi::DestroyPhysicalMonitors(n, arr.as_ptr());
    }
    out
}

#[cfg(windows)]
fn internal_brightness() -> Option<u32> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let o = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    String::from_utf8_lossy(&o.stdout).trim().parse::<u32>().ok().map(|v| v.min(100))
}

#[cfg(windows)]
fn set_internal(level: u32) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let cmd = format!(
        "$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue | Select-Object -First 1; if ($m) {{ Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{{ Timeout = 0; Brightness = {} }} | Out-Null; 'ok' }}",
        level.min(100)
    );
    let o = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &cmd])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if String::from_utf8_lossy(&o.stdout).contains("ok") {
        Ok(())
    } else {
        Err("This PC's built-in screen didn't accept the change.".into())
    }
}

/// Every screen, with its brightness or why it can't be changed.
#[cfg(windows)]
pub fn list() -> Vec<MonitorBrightness> {
    let mut out = Vec::new();
    if let Some(v) = internal_brightness() {
        out.push(MonitorBrightness {
            id: "internal".into(),
            name: "Built-in screen".into(),
            kind: "internal".into(),
            supported: true,
            brightness: Some(v),
            note: String::new(),
        });
    }
    for (n, (hmon, dev)) in crate::win_monitors::monitor_handles().into_iter().enumerate() {
        let found = with_physical(hmon, |i, h| unsafe {
            let (mut lo, mut cur, mut hi) = (0u32, 0u32, 0u32);
            let ok = ffi::GetMonitorBrightness(h, &mut lo, &mut cur, &mut hi) != 0 && hi > lo;
            Some(MonitorBrightness {
                id: format!("ext:{dev}:{i}"),
                name: format!("Display {}", n + 1),
                kind: "external".into(),
                supported: ok,
                brightness: ok.then(|| to_percent(lo, cur, hi)),
                note: if ok { String::new() } else { NOT_SUPPORTED.into() },
            })
        });
        // A laptop panel has no DDC/CI; it is already listed as "Built-in screen" when WMI answers.
        let has_internal = out.iter().any(|m| m.kind == "internal");
        for m in found {
            if !m.supported && has_internal && n == 0 {
                continue;
            }
            out.push(m);
        }
    }
    out
}

#[cfg(not(windows))]
pub fn list() -> Vec<MonitorBrightness> {
    Vec::new()
}

/// Sets one screen by id.
#[cfg(windows)]
pub fn set(id: &str, level: u32) -> Result<(), String> {
    if id == "internal" {
        return set_internal(level);
    }
    let (dev, idx) = parse_external_id(id).ok_or("Unknown screen.")?;
    let hmon = crate::win_monitors::monitor_handles()
        .into_iter()
        .find(|(_, d)| *d == dev)
        .map(|(h, _)| h)
        .ok_or("That screen is no longer connected.")?;
    let done = with_physical(hmon, |i, h| unsafe {
        if i != idx {
            return None;
        }
        let (mut lo, mut cur, mut hi) = (0u32, 0u32, 0u32);
        if ffi::GetMonitorBrightness(h, &mut lo, &mut cur, &mut hi) == 0 || hi <= lo {
            return Some(false);
        }
        Some(ffi::SetMonitorBrightness(h, from_percent(level, lo, hi)) != 0)
    });
    match done.first() {
        Some(true) => Ok(()),
        _ => Err(NOT_SUPPORTED.into()),
    }
}

#[cfg(not(windows))]
pub fn set(_id: &str, _level: u32) -> Result<(), String> {
    Ok(())
}

/// Sets every screen that accepts brightness. Errors only when none did.
pub fn set_all(level: u32) -> Result<(), String> {
    let screens = list();
    let mut any = false;
    for m in screens.iter().filter(|m| m.supported) {
        if set(&m.id, level).is_ok() {
            any = true;
        }
    }
    if any || cfg!(not(windows)) {
        Ok(())
    } else {
        Err("No screen here accepts brightness changes from Windows. External monitors need DDC/CI turned on in their own menu.".into())
    }
}

/// First supported screen's brightness (primary panel first).
pub fn first_level() -> Option<u32> {
    list().into_iter().find(|m| m.supported).and_then(|m| m.brightness)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_round_trips_on_odd_ranges() {
        assert_eq!(to_percent(0, 50, 100), 50);
        assert_eq!(to_percent(10, 10, 90), 0);
        assert_eq!(to_percent(10, 90, 90), 100);
        assert_eq!(to_percent(0, 200, 100), 100);
        assert_eq!(to_percent(5, 5, 5), 0);
        assert_eq!(from_percent(50, 0, 100), 50);
        assert_eq!(from_percent(100, 10, 90), 90);
        assert_eq!(from_percent(0, 10, 90), 10);
        assert_eq!(from_percent(150, 0, 100), 100);
        for p in [0, 13, 50, 77, 100] {
            assert_eq!(to_percent(20, from_percent(p, 20, 220), 220), p);
        }
    }

    #[test]
    fn external_ids_parse() {
        assert_eq!(parse_external_id(r"ext:\\.\DISPLAY2:0"), Some((r"\\.\DISPLAY2".into(), 0)));
        assert_eq!(parse_external_id("ext:X:3"), Some(("X".into(), 3)));
        assert_eq!(parse_external_id("internal"), None);
        assert_eq!(parse_external_id("ext:nope"), None);
    }
}
