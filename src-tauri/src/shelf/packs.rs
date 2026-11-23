//! Context packs: named, ordered bundles of Shelf items with a token budget, ready to hand to
//! Claude (copy as Markdown, send through Lens AI, or attach in Claude Desktop/Code over MCP as
//! `lens://pack/<id>`). Pure model + a small sealed store under `%APPDATA%\LensUI\shelf`.
//!
//! Auto-trim: when a pack is over budget, `plan_trim` picks one per-item cap so the pack fits,
//! shrinking only the largest items. The UI summarises those items with the local model first;
//! `head_trim` is the no-model fallback (cut at a paragraph boundary with a visible marker).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::model::{approx_tokens, ShelfDb, ShelfItem};

pub const MAX_PACKS: usize = 100;
pub const MAX_ITEMS_PER_PACK: usize = 200;
pub const DEFAULT_BUDGET_TOKENS: usize = 24_000;
pub const MIN_BUDGET_TOKENS: usize = 500;
pub const MAX_BUDGET_TOKENS: usize = 1_000_000;
/// Trimming never cuts an item below this.
pub const TRIM_FLOOR_TOKENS: usize = 64;
pub const TRIM_MARKER: &str = "\n\n… (trimmed to fit the pack)";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pack {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub item_ids: Vec<String>,
    pub budget_tokens: usize,
    #[serde(default)]
    pub auto_trim: bool,
    pub created_ms: u64,
    pub updated_ms: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PackDb {
    pub packs: Vec<Pack>,
    /// The pack Lens Command attaches automatically (shown as a chip).
    #[serde(default)]
    pub active: Option<String>,
    #[serde(default)]
    pub next_id: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PackItemView {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub url: Option<String>,
    pub path: Option<String>,
    pub approx_tokens: usize,
    pub local_only: bool,
    /// The Shelf item was removed since it was added to the pack.
    pub missing: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrimStep {
    pub id: String,
    pub from_tokens: usize,
    pub to_tokens: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PackView {
    pub pack: Pack,
    pub items: Vec<PackItemView>,
    pub total_tokens: usize,
    pub over_budget: bool,
    pub active: bool,
    pub local_only: bool,
    pub trim_plan: Vec<TrimStep>,
}

fn clean_name(name: &str) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty() {
        return Err("Give the pack a name.".into());
    }
    Ok(n.chars().take(60).collect())
}

impl PackDb {
    pub fn get(&self, id: &str) -> Option<&Pack> {
        self.packs.iter().find(|p| p.id == id)
    }

    fn get_mut(&mut self, id: &str) -> Result<&mut Pack, String> {
        self.packs.iter_mut().find(|p| p.id == id).ok_or_else(|| "No such pack.".to_string())
    }

    pub fn create(&mut self, name: &str, now_ms: u64) -> Result<Pack, String> {
        let name = clean_name(name)?;
        if self.packs.len() >= MAX_PACKS {
            return Err(format!("You can keep up to {MAX_PACKS} packs."));
        }
        if self.packs.iter().any(|p| p.name.eq_ignore_ascii_case(&name)) {
            return Err(format!("There is already a pack called \"{name}\"."));
        }
        self.next_id += 1;
        let p = Pack {
            id: format!("p{}", self.next_id),
            name,
            item_ids: Vec::new(),
            budget_tokens: DEFAULT_BUDGET_TOKENS,
            auto_trim: false,
            created_ms: now_ms,
            updated_ms: now_ms,
        };
        self.packs.push(p.clone());
        Ok(p)
    }

    pub fn rename(&mut self, id: &str, name: &str, now_ms: u64) -> Result<(), String> {
        let name = clean_name(name)?;
        if self.packs.iter().any(|p| p.id != id && p.name.eq_ignore_ascii_case(&name)) {
            return Err(format!("There is already a pack called \"{name}\"."));
        }
        let p = self.get_mut(id)?;
        p.name = name;
        p.updated_ms = now_ms;
        Ok(())
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        let n = self.packs.len();
        self.packs.retain(|p| p.id != id);
        if n == self.packs.len() {
            return Err("No such pack.".into());
        }
        if self.active.as_deref() == Some(id) {
            self.active = None;
        }
        Ok(())
    }

    /// Replaces the item list (keeps order, drops duplicates).
    pub fn set_items(&mut self, id: &str, ids: Vec<String>, now_ms: u64) -> Result<(), String> {
        let mut out: Vec<String> = Vec::new();
        for i in ids {
            if !i.is_empty() && !out.contains(&i) {
                out.push(i);
            }
        }
        if out.len() > MAX_ITEMS_PER_PACK {
            return Err(format!("A pack holds up to {MAX_ITEMS_PER_PACK} items."));
        }
        let p = self.get_mut(id)?;
        p.item_ids = out;
        p.updated_ms = now_ms;
        Ok(())
    }

    /// Appends items not already in the pack. Returns how many were added.
    pub fn add_items(&mut self, id: &str, ids: &[String], now_ms: u64) -> Result<usize, String> {
        let p = self.get_mut(id)?;
        let mut added = 0;
        for i in ids {
            if !i.is_empty() && !p.item_ids.contains(i) {
                if p.item_ids.len() >= MAX_ITEMS_PER_PACK {
                    return Err(format!("A pack holds up to {MAX_ITEMS_PER_PACK} items."));
                }
                p.item_ids.push(i.clone());
                added += 1;
            }
        }
        p.updated_ms = now_ms;
        Ok(added)
    }

    pub fn remove_item(&mut self, id: &str, item: &str, now_ms: u64) -> Result<(), String> {
        let p = self.get_mut(id)?;
        p.item_ids.retain(|i| i != item);
        p.updated_ms = now_ms;
        Ok(())
    }

    pub fn set_budget(&mut self, id: &str, budget_tokens: usize, auto_trim: bool, now_ms: u64) -> Result<(), String> {
        let p = self.get_mut(id)?;
        p.budget_tokens = budget_tokens.clamp(MIN_BUDGET_TOKENS, MAX_BUDGET_TOKENS);
        p.auto_trim = auto_trim;
        p.updated_ms = now_ms;
        Ok(())
    }

    pub fn set_active(&mut self, id: Option<&str>) -> Result<(), String> {
        if let Some(id) = id {
            self.get(id).ok_or("No such pack.")?;
        }
        self.active = id.map(str::to_string);
        Ok(())
    }

    /// Drops ids of Shelf items that no longer exist. Returns how many were dropped.
    pub fn prune(&mut self, shelf: &ShelfDb) -> usize {
        let mut n = 0;
        for p in &mut self.packs {
            let before = p.item_ids.len();
            p.item_ids.retain(|i| shelf.get(i).is_some());
            n += before - p.item_ids.len();
        }
        n
    }
}

fn kind_name(i: &ShelfItem) -> String {
    i.kind.label().to_lowercase()
}

/// One per-item cap so that the pack fits `budget`. Only items above the cap shrink; the floor
/// keeps every item recognisable (a pack of many tiny items can stay over budget).
pub fn plan_trim(items: &[(String, usize)], budget: usize) -> Vec<TrimStep> {
    let total: usize = items.iter().map(|(_, t)| *t).sum();
    if total <= budget || items.is_empty() {
        return Vec::new();
    }
    let max = items.iter().map(|(_, t)| *t).max().unwrap_or(0);
    let fits = |cap: usize| items.iter().map(|(_, t)| (*t).min(cap)).sum::<usize>() <= budget;
    // Largest cap that fits (binary search between floor and the largest item).
    let (mut lo, mut hi) = (TRIM_FLOOR_TOKENS, max);
    let cap = if !fits(TRIM_FLOOR_TOKENS) {
        TRIM_FLOOR_TOKENS
    } else {
        while lo < hi {
            let mid = lo + (hi - lo).div_ceil(2);
            if fits(mid) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        lo
    };
    items
        .iter()
        .filter(|(_, t)| *t > cap)
        .map(|(id, t)| TrimStep { id: id.clone(), from_tokens: *t, to_tokens: cap })
        .collect()
}

/// No-model fallback: keep whole paragraphs up to ~`tokens`, then a visible marker.
pub fn head_trim(text: &str, tokens: usize) -> String {
    if approx_tokens(text) <= tokens {
        return text.to_string();
    }
    let mut out = String::new();
    for para in text.split("\n\n") {
        let next = if out.is_empty() { para.to_string() } else { format!("{out}\n\n{para}") };
        if approx_tokens(&next) > tokens {
            break;
        }
        out = next;
    }
    if out.is_empty() {
        // One huge paragraph: cut by characters (~4 per token), on a char boundary.
        out = text.chars().take(tokens.saturating_mul(4)).collect();
    }
    format!("{}{}", out.trim_end(), TRIM_MARKER)
}

pub fn view(packs: &PackDb, id: &str, shelf: &ShelfDb) -> Result<PackView, String> {
    let pack = packs.get(id).ok_or("No such pack.")?.clone();
    let items: Vec<PackItemView> = pack
        .item_ids
        .iter()
        .map(|iid| match shelf.get(iid) {
            Some(i) => PackItemView {
                id: i.id.clone(),
                title: i.title.clone(),
                kind: kind_name(i),
                url: i.url.clone(),
                path: i.path.clone(),
                approx_tokens: i.approx_tokens,
                local_only: i.local_only,
                missing: false,
            },
            None => PackItemView {
                id: iid.clone(),
                title: "(removed from the Shelf)".into(),
                kind: "missing".into(),
                url: None,
                path: None,
                approx_tokens: 0,
                local_only: false,
                missing: true,
            },
        })
        .collect();
    let total_tokens = items.iter().map(|i| i.approx_tokens).sum();
    let sizes: Vec<(String, usize)> = items.iter().filter(|i| !i.missing).map(|i| (i.id.clone(), i.approx_tokens)).collect();
    Ok(PackView {
        over_budget: total_tokens > pack.budget_tokens,
        trim_plan: plan_trim(&sizes, pack.budget_tokens),
        active: packs.active.as_deref() == Some(id),
        local_only: items.iter().any(|i| i.local_only),
        total_tokens,
        items,
        pack,
    })
}

/// The pack as Markdown with sources. `replacements` holds trimmed or summarised text per item
/// id (from the UI's local summaries); with `auto_trim` and no replacement, `head_trim` applies.
pub fn markdown(packs: &PackDb, id: &str, shelf: &ShelfDb, replacements: &HashMap<String, String>) -> Result<String, String> {
    let v = view(packs, id, shelf)?;
    let caps: HashMap<&str, usize> = v.trim_plan.iter().map(|s| (s.id.as_str(), s.to_tokens)).collect();
    let mut out = format!("# {}\n", v.pack.name);
    for it in v.items.iter().filter(|i| !i.missing) {
        let Some(item) = shelf.get(&it.id) else { continue };
        out.push_str(&format!("\n## {}\n", item.title));
        let mut src = Vec::new();
        if let Some(u) = &item.url {
            src.push(format!("<{u}>"));
        }
        if let Some(p) = &item.path {
            src.push(format!("`{p}`"));
        }
        if let Some(a) = item.source_app.as_deref().filter(|a| !a.is_empty()) {
            src.push(a.to_string());
        }
        if !src.is_empty() {
            out.push_str(&format!("Source: {}\n", src.join(" · ")));
        }
        let body = match (replacements.get(&it.id), caps.get(it.id.as_str())) {
            (Some(r), _) => r.clone(),
            (None, Some(cap)) if v.pack.auto_trim => head_trim(&item.text, *cap),
            _ => item.text.clone(),
        };
        if !body.trim().is_empty() {
            out.push('\n');
            out.push_str(body.trim_end());
            out.push('\n');
        }
    }
    Ok(out)
}

pub fn export_json(packs: &PackDb, id: &str, shelf: &ShelfDb) -> Result<String, String> {
    let v = view(packs, id, shelf)?;
    let items: Vec<&ShelfItem> = v.pack.item_ids.iter().filter_map(|i| shelf.get(i)).collect();
    serde_json::to_string_pretty(&serde_json::json!({ "kind": "lens-context-pack", "version": 1, "pack": v.pack, "items": items }))
        .map_err(|e| e.to_string())
}

/// The MCP resource URI for a pack.
pub fn resource_uri(id: &str) -> String {
    format!("lens://pack/{id}")
}

/// Parses `lens://pack/<id>` (for the MCP `resources/read` snippet).
pub fn parse_resource_uri(uri: &str) -> Option<&str> {
    let id = uri.strip_prefix("lens://pack/")?;
    if !id.is_empty() && id.len() <= 32 && id.chars().all(|c| c.is_ascii_alphanumeric()) {
        Some(id)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

pub mod store {
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};

    use super::PackDb;
    use crate::clip::seal::{platform_sealer, Sealer};

    static DB: OnceLock<Mutex<PackDb>> = OnceLock::new();
    static SEALER: OnceLock<Box<dyn Sealer + Send + Sync>> = OnceLock::new();

    fn sealer() -> &'static dyn Sealer {
        SEALER.get_or_init(platform_sealer).as_ref()
    }

    pub fn path() -> PathBuf {
        crate::clip::store::data_dir("shelf").join("packs.bin")
    }

    fn db() -> &'static Mutex<PackDb> {
        DB.get_or_init(|| {
            let db = match crate::clip::store::load_sealed::<PackDb>(sealer(), &path()) {
                Ok(Some(db)) => db,
                Ok(None) => PackDb::default(),
                Err(e) => {
                    eprintln!("[Lens packs] packs unreadable ({e}); starting empty and keeping the old file aside.");
                    crate::clip::store::quarantine(&path());
                    PackDb::default()
                }
            };
            Mutex::new(db)
        })
    }

    pub fn with<R>(f: impl FnOnce(&mut PackDb) -> (R, bool)) -> R {
        let mut g = db().lock().unwrap_or_else(|p| p.into_inner());
        let (r, changed) = f(&mut g);
        if changed {
            if let Err(e) = crate::clip::store::save_sealed(sealer(), &path(), &*g) {
                eprintln!("[Lens packs] could not save: {e}");
            }
        }
        r
    }

    pub fn read<R>(f: impl FnOnce(&PackDb) -> R) -> R {
        let g = db().lock().unwrap_or_else(|p| p.into_inner());
        f(&g)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shelf::model::ShelfItemInput;

    fn shelf_with(texts: &[&str]) -> (ShelfDb, Vec<String>) {
        let mut db = ShelfDb::new_with_default(1);
        let ids = texts
            .iter()
            .enumerate()
            .map(|(n, t)| {
                db.add(
                    ShelfItemInput { text: Some(t.to_string()), title: Some(format!("Item {n}")), url: Some(format!("https://x.com/{n}")), ..Default::default() },
                    None,
                    2,
                )
                .unwrap()
            })
            .collect();
        (db, ids)
    }

    #[test]
    fn crud_and_active() {
        let mut p = PackDb::default();
        let a = p.create("Research", 1).unwrap();
        assert!(p.create("research", 1).is_err());
        assert!(p.create("  ", 1).is_err());
        let b = p.create("Work", 1).unwrap();
        p.rename(&b.id, "Work notes", 2).unwrap();
        assert!(p.rename(&b.id, "Research", 2).is_err());
        p.set_active(Some(&a.id)).unwrap();
        assert!(p.set_active(Some("p999")).is_err());
        p.delete(&a.id).unwrap();
        assert_eq!(p.active, None);
        assert!(p.delete(&a.id).is_err());
        p.set_budget(&b.id, 10, true, 3).unwrap();
        assert_eq!(p.get(&b.id).unwrap().budget_tokens, MIN_BUDGET_TOKENS);
    }

    #[test]
    fn items_keep_order_without_duplicates() {
        let mut p = PackDb::default();
        let a = p.create("A", 1).unwrap();
        p.set_items(&a.id, vec!["s2".into(), "s1".into(), "s2".into()], 2).unwrap();
        assert_eq!(p.get(&a.id).unwrap().item_ids, vec!["s2", "s1"]);
        assert_eq!(p.add_items(&a.id, &["s1".into(), "s3".into()], 3).unwrap(), 1);
        p.remove_item(&a.id, "s2", 4).unwrap();
        assert_eq!(p.get(&a.id).unwrap().item_ids, vec!["s1", "s3"]);
    }

    #[test]
    fn trim_plan_shrinks_only_the_largest() {
        let items = vec![("a".to_string(), 100), ("b".to_string(), 5_000), ("c".to_string(), 3_000)];
        assert!(plan_trim(&items, 10_000).is_empty());
        let plan = plan_trim(&items, 4_000);
        let total: usize = items.iter().map(|(id, t)| plan.iter().find(|s| &s.id == id).map(|s| s.to_tokens).unwrap_or(*t)).sum();
        assert!(total <= 4_000, "{total}");
        assert!(plan.iter().all(|s| s.id != "a"));
        assert_eq!(plan.len(), 2);
        assert_eq!(plan[0].to_tokens, plan[1].to_tokens);
        // Cannot fit even at the floor: everything over the floor is cut to the floor.
        let many: Vec<(String, usize)> = (0..10).map(|n| (format!("i{n}"), 500)).collect();
        let p = plan_trim(&many, 100);
        assert_eq!(p.len(), 10);
        assert!(p.iter().all(|s| s.to_tokens == TRIM_FLOOR_TOKENS));
    }

    #[test]
    fn head_trim_keeps_paragraphs() {
        let text = format!("{}\n\n{}\n\n{}", "a".repeat(40), "b".repeat(40), "c".repeat(400));
        let t = head_trim(&text, 25);
        assert!(t.starts_with(&"a".repeat(40)));
        assert!(t.contains(&"b".repeat(40)));
        assert!(!t.contains("ccc"));
        assert!(t.ends_with(TRIM_MARKER));
        assert_eq!(head_trim("short", 100), "short");
        let one = head_trim(&"é".repeat(1000), 10);
        assert!(one.ends_with(TRIM_MARKER));
    }

    #[test]
    fn view_markdown_and_export() {
        let (shelf, ids) = shelf_with(&["Short note.", &"word ".repeat(4000)]);
        let mut p = PackDb::default();
        let a = p.create("Brief", 1).unwrap();
        p.set_items(&a.id, vec![ids[0].clone(), ids[1].clone(), "s404".into()], 2).unwrap();
        p.set_budget(&a.id, 1_000, true, 3).unwrap();
        let v = view(&p, &a.id, &shelf).unwrap();
        assert_eq!(v.items.len(), 3);
        assert!(v.items[2].missing);
        assert!(v.over_budget);
        assert_eq!(v.trim_plan.len(), 1);
        assert_eq!(v.trim_plan[0].id, ids[1]);
        let md = markdown(&p, &a.id, &shelf, &HashMap::new()).unwrap();
        assert!(md.starts_with("# Brief\n"));
        assert!(md.contains("## Item 0\nSource: <https://x.com/0>\n\nShort note."));
        assert!(md.contains(TRIM_MARKER));
        let mut rep = HashMap::new();
        rep.insert(ids[1].clone(), "A local summary.".to_string());
        let md2 = markdown(&p, &a.id, &shelf, &rep).unwrap();
        assert!(md2.contains("A local summary.") && !md2.contains(TRIM_MARKER));
        let json: serde_json::Value = serde_json::from_str(&export_json(&p, &a.id, &shelf).unwrap()).unwrap();
        assert_eq!(json["kind"], "lens-context-pack");
        assert_eq!(json["items"].as_array().unwrap().len(), 2);
        let mut p2 = p.clone();
        assert_eq!(p2.prune(&shelf), 1);
    }

    #[test]
    fn resource_uris() {
        assert_eq!(resource_uri("p3"), "lens://pack/p3");
        assert_eq!(parse_resource_uri("lens://pack/p3"), Some("p3"));
        assert_eq!(parse_resource_uri("lens://pack/../x"), None);
        assert_eq!(parse_resource_uri("lens://shelf/p3"), None);
    }
}
