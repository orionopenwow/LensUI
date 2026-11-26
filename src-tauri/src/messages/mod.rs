//! Lens Messages: one slim inbox over the messengers you already use, done the legitimate way.
//!
//! * **Web-app spaces** (the Ferdium model): each messenger's official web app runs in its own
//!   sandboxed Lens Browser space. Lens reads only the unread count the app already shows in its
//!   page title (or favicon badge) — never message content.
//! * **Windows notification mirror**: toasts from installed messenger apps (via the existing
//!   `UserNotificationListener` path in `win_notifications`) raise badges and mention alerts.
//! * **Matrix** (optional, advanced): a real client for the user's own homeserver, including
//!   any bridges *they* run (the Beeper model). Read rooms, unread counts, and send — with approval.
//!
//! Never: selfbots, scraping message content from web apps, unofficial APIs. See docs/MESSAGES.md.

pub mod badges;
pub mod catalogue;
pub mod focus;
pub mod matrix;
pub mod spaces;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    /// "space:<app>", "matrix", "toast:<app>".
    pub source: String,
    pub app: String,
    pub title: String,
    pub unread: u32,
    pub mentions: u32,
    /// Only where the source legitimately provides it (Matrix, Windows toast text).
    pub last_preview: Option<String>,
    pub last_ts: i64,
    /// What "Open" does: a Lens Browser space url, a desktop deep link, or a Matrix room.
    pub url: String,
    pub vip: bool,
    /// Quick reply is offered only for Matrix (official client-server API).
    pub can_reply: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MessagesSettings {
    pub enabled: bool,
    /// Catalogue ids the user turned on ("discord", "slack", …).
    pub apps: Vec<String>,
    pub vip: Vec<String>,
    pub keywords: Vec<String>,
    pub mirror_toasts: bool,
    pub show_previews: bool,
    pub dock_badges: bool,
    pub matrix_homeserver: Option<String>,
    pub matrix_user: Option<String>,
}

impl Default for MessagesSettings {
    fn default() -> Self {
        MessagesSettings {
            enabled: false,
            apps: Vec::new(),
            vip: Vec::new(),
            keywords: Vec::new(),
            mirror_toasts: false,
            show_previews: true,
            dock_badges: true,
            matrix_homeserver: None,
            matrix_user: None,
        }
    }
}

impl MessagesSettings {
    pub fn sanitize(mut self) -> Self {
        self.apps.retain(|a| catalogue::get(a).is_some());
        self.apps.dedup();
        self.vip.retain(|v| !v.trim().is_empty() && v.len() <= 80);
        self.vip.truncate(100);
        self.keywords.retain(|k| !k.trim().is_empty() && k.len() <= 60);
        self.keywords.truncate(100);
        if let Some(h) = &self.matrix_homeserver {
            if crate::feeds::model::safe_url(h).filter(|u| u.starts_with("https://")).is_none() {
                self.matrix_homeserver = None;
            }
        }
        self
    }
}

pub struct State {
    pub settings: MessagesSettings,
    /// Badge counts per app from web-app space titles.
    pub space_unread: std::collections::HashMap<String, (u32, i64)>,
    /// Per-tab counts behind `space_unread` (the browser's title watcher).
    pub space_tabs: spaces::SpaceTitles,
    pub matrix_rooms: Vec<Conversation>,
    pub matrix_since: Option<String>,
    pub focus: focus::Focus,
}

pub fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| {
        let settings: MessagesSettings = crate::feeds::read_json(&crate::feeds::dir().join("messages.json")).unwrap_or_default();
        Mutex::new(State {
            settings: settings.sanitize(),
            space_unread: Default::default(),
            space_tabs: Default::default(),
            matrix_rooms: Vec::new(),
            matrix_since: None,
            focus: focus::Focus::default(),
        })
    })
}

impl State {
    fn watches(&self, app: &str) -> bool {
        self.settings.enabled && self.settings.apps.iter().any(|a| a == app)
    }

    fn refresh_space(&mut self, app: &'static str, now_ms: i64) {
        if self.space_tabs.has(app) {
            self.space_unread.insert(app.to_string(), (self.space_tabs.total(app), now_ms));
        } else {
            self.space_unread.remove(app);
        }
    }

    /// A browser tab's title or address changed. Counts only messengers the person turned on in
    /// Messages; anything else is forgotten. Returns true when a badge changed.
    pub fn space_title(&mut self, tab: &str, url: &str, title: &str, now_ms: i64) -> bool {
        let watched = spaces::app_for_url(url).map(|a| self.watches(a.id)).unwrap_or(false);
        let changed = if watched { self.space_tabs.report(tab, url, title) } else { self.space_tabs.forget(tab) };
        for app in &changed {
            self.refresh_space(*app, now_ms);
        }
        !changed.is_empty()
    }

    /// The tab closed or went to sleep: its share of the badge goes.
    pub fn space_tab_gone(&mut self, tab: &str, now_ms: i64) -> bool {
        let changed = self.space_tabs.forget(tab);
        for app in &changed {
            self.refresh_space(*app, now_ms);
        }
        !changed.is_empty()
    }

    /// After a settings change: counts of messengers that were turned off are dropped.
    pub fn prune_spaces(&mut self) {
        let on = self.settings.enabled;
        let apps = self.settings.apps.clone();
        self.space_tabs.retain_apps(|a| on && apps.iter().any(|x| x == a));
        self.space_unread.retain(|a, _| on && apps.iter().any(|x| x == a));
    }
}

/// Why the notification mirror shows nothing, in plain words ("" when it is working). `status` and
/// `detail` come from `win_notifications` ("ok" | "needs-access" | "denied" | "unavailable").
pub fn mirror_note(status: &str, detail: &str) -> String {
    match status {
        "ok" => String::new(),
        "needs-access" => "Windows hasn't given Lens access to notifications yet. Badges still come from each messenger's page title.".into(),
        "denied" => "Notification access for Lens is turned off in Windows Settings \u{203a} Privacy & security \u{203a} Notifications. Badges still come from each messenger's page title.".into(),
        _ => {
            let d = detail.trim();
            let tail = if d.is_empty() { String::new() } else { format!(" ({})", crate::feeds::model::clip(d, 160)) };
            format!("Needs the packaged build: Windows only lets packaged apps read notifications, and this build of Lens isn't one yet. Badges still come from each messenger's page title.{tail}")
        }
    }
}

/// Builds the unified inbox: one row per enabled web-app space (with its badge), Matrix rooms,
/// and recent messenger toasts. Sorted: mentions/VIP first, then unread, then recent.
pub fn inbox(st: &State, toasts: &[(String, String, String, i64)]) -> Vec<Conversation> {
    let mut out = Vec::new();
    for app in &st.settings.apps {
        let Some(c) = catalogue::get(app) else { continue };
        let (unread, ts) = st.space_unread.get(app).copied().unwrap_or((0, 0));
        out.push(Conversation {
            id: format!("space:{}", c.id),
            source: format!("space:{}", c.id),
            app: c.id.into(),
            title: c.name.into(),
            unread,
            mentions: 0,
            last_preview: None,
            last_ts: ts,
            url: c.open_url.into(),
            vip: st.settings.vip.iter().any(|v| v.eq_ignore_ascii_case(c.name)),
            can_reply: false,
        });
    }
    out.extend(st.matrix_rooms.iter().cloned().map(|mut r| {
        r.vip = st.settings.vip.iter().any(|v| v.eq_ignore_ascii_case(&r.title));
        r
    }));
    if st.settings.mirror_toasts {
        // (app, title, body, ts) from Windows toasts of known messenger apps.
        for (app_name, title, body, ts) in toasts.iter().take(50) {
            let Some(c) = catalogue::from_toast_app(app_name) else { continue };
            if !st.settings.apps.iter().any(|a| a == c.id) {
                continue;
            }
            let mention = badges::mentions(&format!("{} {}", title, body), &st.settings.keywords);
            if let Some(row) = out.iter_mut().find(|r| r.app == c.id && r.source.starts_with("space:")) {
                row.last_ts = row.last_ts.max(*ts);
                row.mentions += mention as u32;
                if st.settings.show_previews {
                    row.last_preview = Some(crate::feeds::model::clip(&format!("{}: {}", title, body), 140));
                }
            }
        }
    }
    out.sort_by(|a, b| {
        let pa = (a.mentions > 0 || a.vip) as u8;
        let pb = (b.mentions > 0 || b.vip) as u8;
        pb.cmp(&pa).then((b.unread > 0).cmp(&(a.unread > 0))).then(b.last_ts.cmp(&a.last_ts))
    });
    out
}
