//! Messengers Lens can host as web-app spaces, and what each one legitimately allows.
//! `route` is the honest integration method (see docs/FEEDS_RESEARCH.md matrix).

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Route {
    /// Official web app in a sandboxed Lens Browser space; unread from the page title.
    WebSpace,
    /// No web app or no personal API: open the desktop app; badges from Windows toasts only.
    DesktopOnly,
}

#[derive(Clone, Copy, Debug)]
pub struct App {
    pub id: &'static str,
    pub name: &'static str,
    pub route: Route,
    /// Web app URL (WebSpace) or desktop deep link (DesktopOnly).
    pub open_url: &'static str,
    /// Hostnames the space is allowed to stay on (navigations elsewhere open outside).
    pub hosts: &'static [&'static str],
    /// Display names Windows uses for the app's toasts.
    pub toast_names: &'static [&'static str],
    pub note: &'static str,
}

pub const APPS: &[App] = &[
    App { id: "discord", name: "Discord", route: Route::WebSpace, open_url: "https://discord.com/app", hosts: &["discord.com"], toast_names: &["Discord"], note: "Web app. Bots can't read your DMs and self-bots break Discord's terms, so Lens only shows the badge." },
    App { id: "slack", name: "Slack", route: Route::WebSpace, open_url: "https://app.slack.com/client", hosts: &["app.slack.com", "slack.com"], toast_names: &["Slack"], note: "Web app per workspace." },
    App { id: "telegram", name: "Telegram", route: Route::WebSpace, open_url: "https://web.telegram.org/a/", hosts: &["web.telegram.org"], toast_names: &["Telegram Desktop", "Telegram"], note: "Telegram Web. A native client via TDLib with your own api_id is possible later (Unofficial client rules apply)." },
    App { id: "whatsapp", name: "WhatsApp", route: Route::WebSpace, open_url: "https://web.whatsapp.com/", hosts: &["web.whatsapp.com"], toast_names: &["WhatsApp"], note: "WhatsApp Web. There is no API for personal accounts." },
    App { id: "messenger", name: "Messenger", route: Route::WebSpace, open_url: "https://www.messenger.com/", hosts: &["www.messenger.com", "messenger.com"], toast_names: &["Messenger"], note: "messenger.com web app." },
    App { id: "instagram", name: "Instagram DMs", route: Route::WebSpace, open_url: "https://www.instagram.com/direct/inbox/", hosts: &["www.instagram.com"], toast_names: &["Instagram"], note: "Web inbox." },
    App { id: "teams", name: "Microsoft Teams", route: Route::WebSpace, open_url: "https://teams.microsoft.com/v2/", hosts: &["teams.microsoft.com", "teams.live.com"], toast_names: &["Microsoft Teams", "Teams"], note: "Teams web." },
    App { id: "gmail", name: "Gmail", route: Route::WebSpace, open_url: "https://mail.google.com/mail/", hosts: &["mail.google.com"], toast_names: &["Gmail"], note: "Unread from the tab title." },
    App { id: "outlook", name: "Outlook", route: Route::WebSpace, open_url: "https://outlook.live.com/mail/", hosts: &["outlook.live.com", "outlook.office.com"], toast_names: &["Outlook", "Mail"], note: "Outlook on the web." },
    App { id: "googlechat", name: "Google Chat", route: Route::WebSpace, open_url: "https://chat.google.com/", hosts: &["chat.google.com", "mail.google.com"], toast_names: &["Google Chat"], note: "Web app." },
    App { id: "linkedin", name: "LinkedIn messages", route: Route::WebSpace, open_url: "https://www.linkedin.com/messaging/", hosts: &["www.linkedin.com"], toast_names: &["LinkedIn"], note: "Web messaging." },
    App { id: "signal", name: "Signal", route: Route::DesktopOnly, open_url: "sgnl://", hosts: &[], toast_names: &["Signal"], note: "Signal has no web app or API for personal accounts: Lens opens Signal Desktop and badges from its notifications." },
];

pub fn get(id: &str) -> Option<&'static App> {
    APPS.iter().find(|a| a.id == id)
}

pub fn from_toast_app(display_name: &str) -> Option<&'static App> {
    let n = display_name.trim();
    APPS.iter().find(|a| a.toast_names.iter().any(|t| t.eq_ignore_ascii_case(n)))
}

/// A navigation inside a space must stay on the app's own hosts; anything else opens outside.
pub fn allowed_in_space(app: &App, url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("").to_ascii_lowercase();
    let host = host.split('@').last().unwrap_or("");
    let host = host.split(':').next().unwrap_or("");
    app.hosts.iter().any(|h| host == *h || host.ends_with(&format!(".{}", h)))
}
