//! Title watcher for tab webviews. WebView2 tells Lens when a page's title changes; Lens Messages
//! turns the title of a messenger's web app ("(3) Discord", "* Slack") into an unread badge.
//! Nothing inside the page is read, and the title text is dropped as soon as the count is parsed
//! (`messages::spaces`). Pages that aren't a messenger the person turned on are ignored there.

use std::sync::OnceLock;
use tauri::AppHandle;

static APP: OnceLock<AppHandle> = OnceLock::new();

/// A tab's webview closed or went to sleep: its share of the badge goes.
pub fn gone(tab_id: &str) {
    if let Some(app) = APP.get() {
        crate::commands::messages::space_tab_gone(app, tab_id);
    }
}

/// Installs the watcher on a tab's webview.
pub fn attach(app: &AppHandle, view: &tauri::Webview, tab_id: String) {
    let _ = APP.set(app.clone());
    #[cfg(windows)]
    win::attach(app, view, tab_id);
    #[cfg(not(windows))]
    let _ = (view, tab_id);
}

/// Reads the current title of a tab once (after Messages settings change, so a messenger that was
/// just turned on shows its badge without waiting for the next title change).
pub fn report(app: &AppHandle, view: &tauri::Webview, tab_id: String) {
    #[cfg(windows)]
    win::report(app, view, tab_id);
    #[cfg(not(windows))]
    let _ = (app, view, tab_id);
}

#[cfg(windows)]
mod win {
    use tauri::{AppHandle, Webview};
    use webview2_com::DocumentTitleChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;

    /// (address, title) of the page as WebView2 itself reports them.
    fn read(core: &ICoreWebView2) -> Option<(String, String)> {
        let mut source = windows_core::PWSTR::null();
        unsafe { core.Source(&mut source) }.ok()?;
        let url = webview2_com::take_pwstr(source);
        let mut title = windows_core::PWSTR::null();
        unsafe { core.DocumentTitle(&mut title) }.ok()?;
        Some((url, webview2_com::take_pwstr(title)))
    }

    pub fn attach(app: &AppHandle, view: &Webview, tab_id: String) {
        let app = app.clone();
        let _ = view.with_webview(move |pv| {
            let Ok(core) = (unsafe { pv.controller().CoreWebView2() }) else { return };
            let handler = DocumentTitleChangedEventHandler::create(Box::new(move |sender, _args| {
                crate::failsafe::guard::ffi_guard("browser.title_changed", Ok(()), || {
                    if let Some((url, title)) = sender.as_ref().and_then(read) {
                        crate::commands::messages::space_title_changed(&app, &tab_id, &url, &title);
                    }
                    Ok(())
                })
            }));
            let mut token = 0i64;
            let _ = unsafe { core.add_DocumentTitleChanged(&handler, &mut token) };
        });
    }

    pub fn report(app: &AppHandle, view: &Webview, tab_id: String) {
        let app = app.clone();
        let _ = view.with_webview(move |pv| {
            let Ok(core) = (unsafe { pv.controller().CoreWebView2() }) else { return };
            if let Some((url, title)) = read(&core) {
                crate::commands::messages::space_title_changed(&app, &tab_id, &url, &title);
            }
        });
    }
}
