//! Magic waves (docs/plans/MAGIC_WAVES.md). State and contracts, called from commands, each behind
//! its `config.magicWaves` flag (all off). Nothing here applies a cursor, installs a hook or opens
//! a window. The only network path is `widgets::fetch_checked` (wave M2), reached through
//! `commands::widgets::widgets_fetch` after `widgets::check` approves the address.
#![allow(dead_code)]

pub mod cursor_art;
pub mod dashboard;
pub mod desktop_widgets;
pub mod gesture;
pub mod mouse;
#[cfg(windows)]
pub mod mouse_win;
pub mod widgets;

#[cfg(test)]
mod tests;
