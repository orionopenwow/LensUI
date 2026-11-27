//! The Lens running on this PC, as Mission Control shows it: running state, the session log, the
//! lens.log tail, crash reports, the settings (redacted, read through the same state the one
//! settings writer keeps), feature flags with their defaults, and the change registry (the
//! "Remove all" dry run: what it would undo, without running anything).

use crate::app::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

fn started_ms() -> u64 {
    static T: std::sync::OnceLock<u64> = std::sync::OnceLock::new();
    *T.get_or_init(super::now_ms)
}

/// Every boolean (and small number) switch in a settings section, with its default.
fn flag_rows(section: &str, current: &Value, defaults: &Value) -> Vec<Value> {
    let (Some(c), Some(d)) = (current.get(section).and_then(Value::as_object), defaults.get(section).and_then(Value::as_object)) else { return vec![] };
    d.iter()
        .filter(|(_, v)| v.is_boolean())
        .map(|(k, dv)| json!({ "path": format!("{section}.{k}"), "value": c.get(k).cloned().unwrap_or(Value::Null), "default": dv }))
        .collect()
}

pub fn snapshot(app: &AppHandle) -> Value {
    let _ = started_ms();
    let st = app.state::<AppState>();
    let cfg = st.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let current = serde_json::to_value(&cfg).unwrap_or(Value::Null);
    let defaults = serde_json::to_value(crate::config::LensConfig::default()).unwrap_or(Value::Null);
    let profile = crate::tester::user_profile();
    let config_text = crate::tester::redact_config_json(&current.to_string(), profile.as_deref());
    let mut flags: Vec<Value> = Vec::new();
    for section in ["magicWaves", "func", "tester"] {
        flags.extend(flag_rows(section, &current, &defaults));
    }
    let killed = crate::failsafe::features::killed();
    let switches: Vec<Value> = crate::failsafe::features::switch_list()
        .into_iter()
        .map(|(id, label)| json!({ "id": id, "label": label, "killed": killed.contains(&id) }))
        .collect();
    let lens_log = std::fs::read_to_string(crate::win_crash::log_path()).unwrap_or_default();
    let log_tail: Vec<String> = crate::win_crash::tail_lines(&lens_log, 200).into_iter().map(|l| crate::tester::redact_text(&l, profile.as_deref())).collect();
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "pid": std::process::id(),
        "startedMs": started_ms(),
        "safeMode": crate::failsafe::features::safe_mode(),
        "safeReason": crate::failsafe::features::safe_reason(),
        "windows": app.webview_windows().keys().cloned().collect::<Vec<_>>(),
        "config": config_text,
        "flags": flags,
        "killSwitches": switches,
        "changes": crate::changes::manifest(),
        "notChanged": crate::changes::NOT_CHANGED.iter().map(|(a, b)| json!({ "what": a, "why": b })).collect::<Vec<_>>(),
        "crashReports": crate::win_crash::list_crash_reports(),
        "lensLog": log_tail,
        "logPath": crate::tester::redact_text(&crate::win_crash::log_path().display().to_string(), profile.as_deref()),
        "crashDir": crate::tester::redact_text(&crate::win_crash::crashes_dir().display().to_string(), profile.as_deref()),
    })
}

/// Session log lines after `after` (already redacted by the ring).
pub fn log_since(after: u64, limit: usize) -> Vec<Value> {
    let ring = crate::tester::ring().lock().unwrap_or_else(|e| e.into_inner());
    ring.since(after, limit.clamp(1, 1000))
        .into_iter()
        .map(|l| json!({ "seq": l.seq, "atMs": l.at_ms, "level": l.level, "area": l.area, "message": l.message }))
        .collect()
}

/// One crash report's text (scrubbed when written).
pub fn crash(name: &str) -> Result<String, String> {
    crate::win_crash::read_crash_report(name)
}

/// Sets `path` (dot separated, camelCase as in config.json) in a copy of the current settings.
/// Fails if the result is no longer valid settings.
pub fn with_setting(app: &AppHandle, path: &str, value_json: &str) -> Result<crate::config::LensConfig, String> {
    let value: Value = serde_json::from_str(value_json).map_err(|_| "The new value isn't valid JSON.".to_string())?;
    let st = app.state::<AppState>();
    let cfg = st.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let mut doc = serde_json::to_value(&cfg).map_err(|e| e.to_string())?;
    let mut cur = &mut doc;
    let parts: Vec<&str> = path.split('.').collect();
    for (i, p) in parts.iter().enumerate() {
        let obj = cur.as_object_mut().ok_or("That setting isn't inside a section.")?;
        if !obj.contains_key(*p) {
            return Err(format!("There's no setting called {path}."));
        }
        if i + 1 == parts.len() {
            obj.insert(p.to_string(), value.clone());
            break;
        }
        cur = obj.get_mut(*p).ok_or("missing")?;
    }
    serde_json::from_value(doc).map_err(|e| format!("Lens wouldn't accept that value ({e})."))
}
