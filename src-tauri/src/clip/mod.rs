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
//! * `compat`  — the Widget Drawer pane's commands, as thin callers of `service`.
//! * `bar`     — the Magic selection bar's rules: placement, Cut/Copy/Paste, gestures, hiding (pure).
//! * `smart`   — what a selection is (URL, e-mail, maths, colour, path…), for smart actions (pure).
//!
//! This is the only clipboard history in Lens. It records in two modes: the saved history (opt-in,
//! sealed on disk) and the session history (Functions › Clipboard history: the last 50 texts, in
//! memory only). Nothing here runs until one of them is on.

// Some helpers are used only by tests or by one platform's capture layer.
#![allow(dead_code)]

pub mod appctx;
pub mod bar;
pub mod compat;
pub mod dib;
pub mod history;
pub mod paste;
pub mod privacy;
pub mod selection_rules;
pub mod seal;
pub mod service;
pub mod smart;
pub mod store;
#[cfg(windows)]
pub mod uia;
#[cfg(windows)]
pub mod win;

