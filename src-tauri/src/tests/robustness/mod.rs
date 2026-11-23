//! Robustness suite (docs/TESTING.md): property tests and fuzz-style tables over Lens's pure
//! logic. These never touch Windows APIs, so they run on every platform in `cargo test --lib`.
//!
//! * geometry   — Dock flyouts, hot corners, Lens Mini placement, Alt+drag maths, border rings
//! * input      — intent parser and native-messaging protocol never panic, reject cleanly
//! * config     — config.json from random or partial JSON never panics and keeps what it can
//!
//! Case counts are kept modest so the suite stays under a few seconds; raise them locally with
//! `PROPTEST_CASES=5000 cargo test --lib robustness`.

mod config_fuzz;
mod geometry;
mod input_fuzz;
