//! Lens Snip: capture, a pre-save studio, pins, local history, recording and scrolling capture.
//!
//! * `geom`        — region maths in physical virtual-desktop pixels (mixed-DPI safe).
//! * `redact`      — auto-redact suggestions from OCR words (emails, keys, cards, …).
//! * `stitch`      — scrolling-capture stitching (sticky header/footer aware).
//! * `template`    — file names from templates, Windows-safe, never overwriting.
//! * `config`      — settings with defaults (own file, off by default).
//! * `recent`      — "Recent" share targets (prepare, never send).
//! * `printscreen` — optional Print Screen takeover with exact backup/restore.
//! * `record`      — ffmpeg `gdigrab` arguments, trim, GIF, mic list parsing.
//! * `history`     — the sealed local library, search and retention.
//! * `image`       — PNG encode/decode, crop, thumbnails, CF_DIB.
//! * `service`     — in-memory session/snips/pins and on-disk storage.
//! * `ocr`         — Windows OCR (`Windows.Media.Ocr`).
//! * `share`       — the Windows share sheet.
//! * `win`         — capture, windows, UI Automation, clipboard, registry (Windows only).
//!
//! Tauri commands live in `commands/snip.rs`; the UI in `src/snip/`. See docs/SNIP.md.

// Pure helpers keep a few functions used only by tests or by one platform's layer.
#![allow(dead_code)]

pub mod config;
pub mod geom;
pub mod history;
pub mod image;
pub mod ocr;
pub mod printscreen;
pub mod recent;
pub mod record;
pub mod redact;
pub mod service;
pub mod share;
pub mod stitch;
pub mod template;
#[cfg(windows)]
pub mod win;
