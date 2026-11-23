//! Lens Browser — a light browser built into Lens (docs/LENS_BROWSER.md).
//!
//! * `model`  — spaces, folders, tabs, sleeping, history, bookmarks, the address bar (pure).
//! * `gating` — the agent's approval rules (pure).
//! * `filter` — a small top-level navigation block list (pure).
//! * `store`  — files under %APPDATA%\LensUI\browser\.
//! * `host`   — the frame window, WebView2 child webviews and the page agent bridge.

pub mod filter;
pub mod gating;
pub mod host;
pub mod model;
pub mod store;

#[cfg(test)]
mod tests;
