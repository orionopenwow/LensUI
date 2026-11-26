//! Magic waves (docs/plans/MAGIC_WAVES.md), wave M0 scaffold. Pure state and contracts only:
//! nothing here applies a cursor, installs a hook, opens a window or touches the network. Later
//! waves call into these from commands, each behind its `config.magicWaves` flag (all off).
#![allow(dead_code)]

pub mod cursor_art;
pub mod dashboard;
pub mod gesture;
pub mod mouse;
#[cfg(windows)]
pub mod mouse_win;
pub mod widgets;

#[cfg(test)]
mod tests;
