//! "Recent" share targets: the apps and share destinations the user picked from Lens Snip before,
//! shown as one-click chips. A chip only *prepares* the target (image on the clipboard, app in
//! front, or the share sheet open); the user always presses Send themselves.

use serde::{Deserialize, Serialize};

pub const MAX_RECENT: usize = 6;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentTarget {
    /// Stable id: `app:<exe lowercased>` or `share` or `claude-desktop`.
    pub id: String,
    /// app | share | claude
    pub kind: String,
    pub label: String,
    /// Full path of the app's exe, for kind = app.
    pub exe: Option<String>,
    pub last_ms: u64,
    pub count: u32,
}

/// Records a use: moves the target to the front (merging counts) and caps the list.
pub fn touch(list: &mut Vec<RecentTarget>, mut t: RecentTarget, now_ms: u64) {
    if let Some(pos) = list.iter().position(|x| x.id == t.id) {
        let old = list.remove(pos);
        t.count = old.count.saturating_add(1);
        if t.exe.is_none() {
            t.exe = old.exe;
        }
    } else {
        t.count = 1;
    }
    t.last_ms = now_ms;
    list.insert(0, t);
    list.truncate(MAX_RECENT);
}

/// Builds the id for an app target from its exe path.
pub fn app_id(exe: &str) -> String {
    let name = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    format!("app:{}", name.to_ascii_lowercase())
}

/// A friendly label from an exe path ("Discord.exe" → "Discord").
pub fn app_label(exe: &str) -> String {
    let name = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    let stem = name.strip_suffix(".exe").or_else(|| name.strip_suffix(".EXE")).unwrap_or(name);
    let mut c = stem.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => "App".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(id: &str) -> RecentTarget {
        RecentTarget { id: id.into(), kind: "app".into(), label: id.into(), exe: None, last_ms: 0, count: 0 }
    }

    #[test]
    fn moves_to_front_and_caps() {
        let mut l = Vec::new();
        for i in 0..8 {
            touch(&mut l, t(&format!("app:{i}")), i);
        }
        assert_eq!(l.len(), MAX_RECENT);
        assert_eq!(l[0].id, "app:7");
        touch(&mut l, t("app:4"), 100);
        assert_eq!(l[0].id, "app:4");
        assert_eq!(l[0].count, 2);
        assert_eq!(l[0].last_ms, 100);
        assert_eq!(l.iter().filter(|x| x.id == "app:4").count(), 1);
    }

    #[test]
    fn ids_and_labels() {
        assert_eq!(app_id("C:\\Users\\u\\AppData\\Local\\Discord\\app-1.0\\Discord.exe"), "app:discord.exe");
        assert_eq!(app_label("C:\\x\\slack.exe"), "Slack");
        assert_eq!(app_label(""), "App");
    }
}
