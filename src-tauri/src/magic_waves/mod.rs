//! Magic waves (docs/plans/MAGIC_WAVES.md), wave M0 scaffold. Pure state and contracts only:
//! nothing here applies a cursor, installs a hook, opens a window or touches the network. Later
//! waves call into these from commands, each behind its `config.magicWaves` flag (all off).
#![allow(dead_code)]

pub mod dashboard;
pub mod mouse;
pub mod widgets;

#[cfg(test)]
mod tests;
