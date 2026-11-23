//! The Shelf ("standing clipboard"): named, persistent collections of context items, and the
//! slash-command templates used by Lens Command. See `docs/SHELF.md` for the command contract.

#![allow(dead_code)]

pub mod micro;
pub mod model;
pub mod packs;
pub mod service;
pub mod templates;

pub use model::{ShelfDb, ShelfInfo, ShelfItem, ShelfItemInput, ShelfItemPatch, ShelfKind};
