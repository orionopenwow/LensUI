//! Lens Browser — a light browser built into Lens (docs/LENS_BROWSER.md).
//!
//! * `model`  — spaces, folders, tabs, sleeping, history, bookmarks, the address bar (pure).
//! * `gating` — the agent's approval rules (pure).
//! * `filter` — a small top-level navigation block list (pure), always part of `blocklist`.
//! * `blocklist` — "Lens blocks ads and trackers": filter lists on every request a page makes.
//! * `icons`  — real favicons, fetched by the core and handed to the frame as data URLs.
//! * `net`    — the only way Lens Browser's own code reaches the network (lists, icons).
//! * `store`  — files under %APPDATA%\LensUI\browser\.
//! * `host`   — the frame window, WebView2 child webviews and the page agent bridge.
//! * `permissions` — site permissions (camera, microphone, location…) and their prompt.
//! * `import` — bookmarks, history, tabs and Arc spaces from other browsers (never passwords).

pub mod blocklist;
pub mod filter;
pub mod gating;
pub mod host;
pub mod icons;
pub mod import;
pub mod model;
pub mod net;
pub mod permissions;
pub mod store;
pub mod titles;

#[cfg(test)]
mod tests;
