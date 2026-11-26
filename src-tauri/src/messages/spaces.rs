//! Which messenger a browser tab belongs to and how many unread each messenger shows, summed over
//! its open tabs (two Slack workspaces are two tabs). Fed by the Lens Browser's title-change
//! watcher. Only the count is kept: the title text is parsed and dropped. Std-only.

use super::{badges, catalogue};
use std::collections::HashMap;

fn host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.split('@').last().unwrap_or("");
    let host = host.split(':').next().unwrap_or("").to_ascii_lowercase();
    (!host.is_empty()).then_some(host)
}

/// The web-app messenger a page belongs to, if any. The app whose own start page is on this host
/// wins (mail.google.com is Gmail, chat.google.com is Google Chat); otherwise the first app that
/// lists the host. https only, so a look-alike on http or another host never counts.
pub fn app_for_url(url: &str) -> Option<&'static catalogue::App> {
    let host = host_of(url)?;
    let web = || catalogue::APPS.iter().filter(|a| a.route == catalogue::Route::WebSpace);
    web().find(|a| host_of(a.open_url).as_deref() == Some(host.as_str())).or_else(|| web().find(|a| catalogue::allowed_in_space(a, url)))
}

/// Unread per tab, so closing or leaving one tab takes only its share away.
#[derive(Default)]
pub struct SpaceTitles {
    tabs: HashMap<String, (&'static str, u32)>,
}

impl SpaceTitles {
    /// A tab's title or address changed. Returns the apps whose total changed.
    pub fn report(&mut self, tab: &str, url: &str, title: &str) -> Vec<&'static str> {
        let next = app_for_url(url).and_then(|a| badges::unread_from_title(a.id, title).map(|n| (a.id, n)));
        let prev = match next {
            Some(v) => self.tabs.insert(tab.to_string(), v),
            None => self.tabs.remove(tab),
        };
        if prev == next {
            return Vec::new();
        }
        let mut changed: Vec<&'static str> = prev.iter().chain(next.iter()).map(|(a, _)| *a).collect();
        changed.dedup();
        changed
    }

    /// The tab closed or went to sleep.
    pub fn forget(&mut self, tab: &str) -> Vec<&'static str> {
        self.tabs.remove(tab).map(|(a, _)| vec![a]).unwrap_or_default()
    }

    /// Drops every tab of apps that are no longer turned on.
    pub fn retain_apps(&mut self, keep: impl Fn(&str) -> bool) {
        self.tabs.retain(|_, (a, _)| keep(a));
    }

    pub fn total(&self, app: &str) -> u32 {
        self.tabs.values().filter(|(a, _)| *a == app).fold(0u32, |s, (_, n)| s.saturating_add(*n))
    }

    pub fn has(&self, app: &str) -> bool {
        self.tabs.values().any(|(a, _)| *a == app)
    }
}
