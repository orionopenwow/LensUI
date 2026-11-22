//! Clipboard history v2: opt-in, persistent, encrypted at rest.
//!
//! * `history` — the in-memory model: capture rules, retention, pinning, search.
//! * `privacy` — Windows private-clipboard formats and the per-app exclusion list.
//! * `seal`    — DPAPI sealing of everything written to disk (`%APPDATA%\LensUI\clip`).
//! * `paste`   — "paste as" renderers (plain, markdown, trimmed, original) and HTML → Markdown.
//! * `dib`     — CF_DIB → small PNG thumbnail, pure Rust.
//! * `store`   — load/save of the sealed history file.
//! * `win`     — the Windows capture listener and paste (SendInput Ctrl+V after the user picks).
//!
//! Nothing here runs until the user turns clipboard history on. The legacy in-memory history in
//! `win_clipboard.rs` keeps working unchanged; `docs/SHELF.md` says how to retire it.

// Some helpers are used only by tests or by one platform's capture layer.
#![allow(dead_code)]

pub mod dib;
pub mod history;
pub mod paste;
pub mod privacy;
pub mod seal;
pub mod service;
pub mod store;
#[cfg(windows)]
pub mod win;

