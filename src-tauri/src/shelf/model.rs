//! The Shelf: named collections of context items that stay until the user removes them.
//! Pure model; persistence lives in `service.rs`.

use serde::{Deserialize, Serialize};

pub const DEFAULT_SHELF: &str = "default";
pub const MAX_ITEMS_PER_SHELF: usize = 1000;
pub const MAX_ITEM_CHARS: usize = 400_000;
pub const MAX_SHELVES: usize = 50;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShelfKind {
    Text,
    Page,
    Selection,
    File,
    Image,
    Transcript,
    Answer,
}

impl ShelfKind {
    pub fn label(self) -> &'static str {
        match self {
            ShelfKind::Text => "Text",
            ShelfKind::Page => "Page",
            ShelfKind::Selection => "Selection",
            ShelfKind::File => "File",
            ShelfKind::Image => "Image",
            ShelfKind::Transcript => "Transcript",
            ShelfKind::Answer => "Answer",
        }
    }
}

/// What callers send to `shelf_add` (the fixed contract).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ShelfItemInput {
    pub kind: Option<ShelfKind>,
    pub title: Option<String>,
    pub text: Option<String>,
    pub html: Option<String>,
    pub url: Option<String>,
    pub path: Option<String>,
    pub source_app: Option<String>,
    pub tags: Option<Vec<String>>,
    /// Never send to a cloud provider (e.g. it came from a clip marked "do not sync").
    pub local_only: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShelfItem {
    pub id: String,
    pub shelf: String,
    pub kind: ShelfKind,
    pub title: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub html: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub source_app: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub local_only: bool,
    pub created_ms: u64,
    pub updated_ms: u64,
    /// Position within its shelf (lower first, after pinned).
    #[serde(default)]
    pub order: i64,
    pub chars: usize,
    pub approx_tokens: usize,
}

/// Editable fields for `shelf_update`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ShelfItemPatch {
    pub title: Option<String>,
    pub text: Option<String>,
    pub tags: Option<Vec<String>>,
    /// Move to another shelf.
    pub shelf: Option<String>,
    /// New position within the shelf.
    pub order: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShelfInfo {
    pub id: String,
    pub name: String,
    pub created_ms: u64,
    #[serde(default)]
    pub item_count: usize,
    #[serde(default)]
    pub approx_tokens: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ShelfDb {
    pub shelves: Vec<ShelfInfo>,
    pub items: Vec<ShelfItem>,
    pub next_id: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShelfContext {
    pub text: String,
    pub approx_tokens: usize,
    /// Item ids that were shortened to fit.
    pub trimmed: Vec<String>,
    /// True when any included item must stay on this PC.
    pub local_only: bool,
    pub item_count: usize,
}

/// Token estimate without a tokenizer: ~4 characters per token for Latin script, ~1 per character
/// for CJK and other wide scripts. Good enough to warn before a context window is exceeded.
pub fn approx_tokens(text: &str) -> usize {
    let mut ascii = 0usize;
    let mut wide = 0usize;
    for c in text.chars() {
        if (c as u32) < 0x2E80 {
            ascii += 1;
        } else {
            wide += 1;
        }
    }
    ascii.div_ceil(4) + wide
}

fn slug(name: &str) -> String {
    let s: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "shelf".into() } else { s.chars().take(40).collect() }
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t = t.trim().trim_start_matches('#').to_lowercase();
        if !t.is_empty() && t.len() <= 32 && !out.contains(&t) {
            out.push(t);
        }
        if out.len() >= 12 {
            break;
        }
    }
    out
}

fn derive_title(kind: ShelfKind, input: &ShelfItemInput, text: &str) -> String {
    if let Some(t) = input.title.as_ref().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        return t.chars().take(160).collect();
    }
    if let Some(p) = &input.path {
        if let Some(name) = p.rsplit(['\\', '/']).next().filter(|n| !n.is_empty()) {
            return name.to_string();
        }
    }
    let first = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    if !first.is_empty() {
        let mut t: String = first.chars().take(80).collect();
        if first.chars().count() > 80 {
            t.push('…');
        }
        return t;
    }
    if let Some(u) = &input.url {
        return u.clone();
    }
    kind.label().to_string()
}

impl ShelfDb {
    pub fn new_with_default(now_ms: u64) -> Self {
        let mut db = ShelfDb::default();
        db.ensure_default(now_ms);
        db
    }

    pub fn ensure_default(&mut self, now_ms: u64) {
        if !self.shelves.iter().any(|s| s.id == DEFAULT_SHELF) {
            self.shelves.insert(
                0,
                ShelfInfo { id: DEFAULT_SHELF.into(), name: "Shelf".into(), created_ms: now_ms, item_count: 0, approx_tokens: 0 },
            );
        }
    }

    fn resolve_shelf(&self, shelf: Option<&str>) -> Result<String, String> {
        let id = shelf.map(str::trim).filter(|s| !s.is_empty()).unwrap_or(DEFAULT_SHELF);
        if self.shelves.iter().any(|s| s.id == id) {
            Ok(id.to_string())
        } else {
            Err(format!("No shelf called \"{id}\"."))
        }
    }

    pub fn shelves(&self) -> Vec<ShelfInfo> {
        self.shelves
            .iter()
            .map(|s| {
                let items = self.items.iter().filter(|i| i.shelf == s.id);
                let (count, tokens) = items.fold((0, 0), |(c, t), i| (c + 1, t + i.approx_tokens));
                ShelfInfo { item_count: count, approx_tokens: tokens, ..s.clone() }
            })
            .collect()
    }

    pub fn create(&mut self, name: &str, now_ms: u64) -> Result<ShelfInfo, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Give the shelf a name.".into());
        }
        if self.shelves.len() >= MAX_SHELVES {
            return Err(format!("You can have up to {MAX_SHELVES} shelves."));
        }
        if self.shelves.iter().any(|s| s.name.eq_ignore_ascii_case(name)) {
            return Err(format!("There is already a shelf called \"{name}\"."));
        }
        let base = slug(name);
        let mut id = base.clone();
        let mut n = 2;
        while self.shelves.iter().any(|s| s.id == id) {
            id = format!("{base}-{n}");
            n += 1;
        }
        let info = ShelfInfo { id, name: name.chars().take(60).collect(), created_ms: now_ms, item_count: 0, approx_tokens: 0 };
        self.shelves.push(info.clone());
        Ok(info)
    }

    pub fn rename(&mut self, id: &str, name: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Give the shelf a name.".into());
        }
        if self.shelves.iter().any(|s| s.id != id && s.name.eq_ignore_ascii_case(name)) {
            return Err(format!("There is already a shelf called \"{name}\"."));
        }
        let s = self.shelves.iter_mut().find(|s| s.id == id).ok_or("No such shelf.")?;
        s.name = name.chars().take(60).collect();
        Ok(())
    }

    /// Deletes a shelf and its items. The default shelf can be emptied but not deleted.
    pub fn delete_shelf(&mut self, id: &str) -> Result<usize, String> {
        if id == DEFAULT_SHELF {
            return Err("The main Shelf can be cleared but not deleted.".into());
        }
        let before = self.shelves.len();
        self.shelves.retain(|s| s.id != id);
        if before == self.shelves.len() {
            return Err("No such shelf.".into());
        }
        let n = self.items.len();
        self.items.retain(|i| i.shelf != id);
        Ok(n - self.items.len())
    }

    pub fn add(&mut self, input: ShelfItemInput, shelf: Option<&str>, now_ms: u64) -> Result<String, String> {
        let shelf = self.resolve_shelf(shelf)?;
        if self.items.iter().filter(|i| i.shelf == shelf).count() >= MAX_ITEMS_PER_SHELF {
            return Err(format!("This shelf is full ({MAX_ITEMS_PER_SHELF} items)."));
        }
        let kind = input.kind.unwrap_or(if input.path.is_some() { ShelfKind::File } else { ShelfKind::Text });
        let text = input.text.clone().unwrap_or_default();
        if text.trim().is_empty() && input.url.is_none() && input.path.is_none() {
            return Err("Nothing to add.".into());
        }
        if text.chars().count() > MAX_ITEM_CHARS {
            return Err(format!("That is too long for one Shelf item ({MAX_ITEM_CHARS} characters max)."));
        }
        self.next_id += 1;
        let id = format!("s{}", self.next_id);
        let order = self.items.iter().filter(|i| i.shelf == shelf).map(|i| i.order).min().unwrap_or(0) - 1;
        let title = derive_title(kind, &input, &text);
        let chars = text.chars().count();
        self.items.push(ShelfItem {
            id: id.clone(),
            shelf,
            kind,
            title,
            approx_tokens: approx_tokens(&text),
            chars,
            text,
            html: input.html,
            url: input.url,
            path: input.path,
            source_app: input.source_app,
            tags: clean_tags(input.tags.unwrap_or_default()),
            pinned: false,
            local_only: input.local_only.unwrap_or(false),
            created_ms: now_ms,
            updated_ms: now_ms,
            order,
        });
        Ok(id)
    }

    pub fn get(&self, id: &str) -> Option<&ShelfItem> {
        self.items.iter().find(|i| i.id == id)
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let n = self.items.len();
        self.items.retain(|i| i.id != id);
        n != self.items.len()
    }

    pub fn pin(&mut self, id: &str, pinned: bool) -> bool {
        match self.items.iter_mut().find(|i| i.id == id) {
            Some(i) => {
                i.pinned = pinned;
                true
            }
            None => false,
        }
    }

    pub fn update(&mut self, id: &str, patch: ShelfItemPatch, now_ms: u64) -> Result<(), String> {
        if let Some(s) = &patch.shelf {
            self.resolve_shelf(Some(s))?;
        }
        let item = self.items.iter_mut().find(|i| i.id == id).ok_or("No such Shelf item.")?;
        if let Some(t) = patch.title {
            let t = t.trim();
            if !t.is_empty() {
                item.title = t.chars().take(160).collect();
            }
        }
        if let Some(text) = patch.text {
            if text.chars().count() > MAX_ITEM_CHARS {
                return Err("That is too long for one Shelf item.".into());
            }
            item.chars = text.chars().count();
            item.approx_tokens = approx_tokens(&text);
            item.text = text;
            item.html = None;
        }
        if let Some(tags) = patch.tags {
            item.tags = clean_tags(tags);
        }
        if let Some(s) = patch.shelf {
            item.shelf = s;
        }
        if let Some(o) = patch.order {
            item.order = o;
        }
        item.updated_ms = now_ms;
        Ok(())
    }

    /// Moves `id` to `index` within its shelf's visible order and renumbers that shelf.
    pub fn reorder(&mut self, id: &str, index: usize) -> Result<(), String> {
        let shelf = self.get(id).ok_or("No such Shelf item.")?.shelf.clone();
        let mut ids: Vec<String> = self.list(Some(&shelf)).into_iter().filter(|i| !i.pinned).map(|i| i.id).collect();
        let pinned: Vec<String> = self.list(Some(&shelf)).into_iter().filter(|i| i.pinned).map(|i| i.id).collect();
        if pinned.contains(&id.to_string()) {
            return Err("Unpin the item to move it.".into());
        }
        ids.retain(|x| x != id);
        ids.insert(index.min(ids.len()), id.to_string());
        for (n, item_id) in ids.iter().enumerate() {
            if let Some(i) = self.items.iter_mut().find(|i| &i.id == item_id) {
                i.order = n as i64;
            }
        }
        Ok(())
    }

    /// Clears a shelf. Pinned items stay unless `include_pinned`.
    pub fn clear(&mut self, shelf: &str, include_pinned: bool) -> usize {
        let n = self.items.len();
        self.items.retain(|i| !(i.shelf == shelf && (include_pinned || !i.pinned)));
        n - self.items.len()
    }

    /// Items of one shelf (or all, when `None`): pinned first, then by order, then newest.
    pub fn list(&self, shelf: Option<&str>) -> Vec<ShelfItem> {
        let mut v: Vec<ShelfItem> = self.items.iter().filter(|i| shelf.is_none_or(|s| i.shelf == s)).cloned().collect();
        v.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(a.order.cmp(&b.order)).then(b.created_ms.cmp(&a.created_ms)));
        v
    }

    /// Builds one context block from the given items (in the order given). Each item is capped
    /// at `per_item_tokens`, and the whole block at `max_tokens`; anything shortened is listed.
    pub fn as_context(&self, ids: &[String], max_tokens: usize, per_item_tokens: usize) -> ShelfContext {
        let mut text = String::new();
        let mut used = 0usize;
        let mut trimmed = Vec::new();
        let mut local_only = false;
        let mut count = 0usize;
        for id in ids {
            let Some(item) = self.get(id) else { continue };
            if used >= max_tokens {
                trimmed.push(item.id.clone());
                continue;
            }
            let mut header = format!("### {} — {}", item.kind.label(), item.title);
            if let Some(u) = &item.url {
                header.push_str(&format!("\nSource: {u}"));
            } else if let Some(p) = &item.path {
                header.push_str(&format!("\nFile: {p}"));
            }
            let budget = per_item_tokens.min(max_tokens - used);
            let mut body = item.text.clone();
            if approx_tokens(&body) > budget {
                // ~4 chars per token; cut on a char boundary and say so.
                let keep: String = body.chars().take(budget.saturating_mul(4)).collect();
                body = format!("{keep}\n[… trimmed to fit]");
                trimmed.push(item.id.clone());
            }
            if !text.is_empty() {
                text.push_str("\n\n");
            }
            text.push_str(&header);
            if !body.trim().is_empty() {
                text.push_str("\n\n");
                text.push_str(body.trim_end());
            }
            used = approx_tokens(&text);
            local_only |= item.local_only;
            count += 1;
        }
        ShelfContext { approx_tokens: approx_tokens(&text), text, trimmed, local_only, item_count: count }
    }

    pub fn export_markdown(&self, shelf: &str) -> Result<String, String> {
        let info = self.shelves.iter().find(|s| s.id == shelf).ok_or("No such shelf.")?;
        let mut out = format!("# {}\n", info.name);
        for item in self.list(Some(shelf)) {
            out.push_str(&format!("\n## {}\n\n", item.title));
            let mut meta = vec![format!("*{}*", item.kind.label())];
            if let Some(u) = &item.url {
                meta.push(format!("<{u}>"));
            }
            if let Some(p) = &item.path {
                meta.push(format!("`{p}`"));
            }
            if !item.tags.is_empty() {
                meta.push(item.tags.iter().map(|t| format!("#{t}")).collect::<Vec<_>>().join(" "));
            }
            out.push_str(&meta.join(" · "));
            out.push('\n');
            if !item.text.trim().is_empty() {
                out.push('\n');
                out.push_str(item.text.trim_end());
                out.push('\n');
            }
        }
        Ok(out)
    }

    pub fn export_json(&self, shelf: &str) -> Result<String, String> {
        let info = self.shelves.iter().find(|s| s.id == shelf).ok_or("No such shelf.")?;
        let doc = serde_json::json!({ "lensShelf": 1, "shelf": info, "items": self.list(Some(shelf)) });
        serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(text: &str) -> ShelfItemInput {
        ShelfItemInput { text: Some(text.into()), ..Default::default() }
    }

    #[test]
    fn token_estimate() {
        assert_eq!(approx_tokens(""), 0);
        assert_eq!(approx_tokens("abcd"), 1);
        assert_eq!(approx_tokens("abcde"), 2);
        assert_eq!(approx_tokens("日本語"), 3);
        assert_eq!(approx_tokens(&"a".repeat(4000)), 1000);
    }

    #[test]
    fn crud_and_default_shelf() {
        let mut db = ShelfDb::new_with_default(1);
        let a = db.add(input("First line\nmore"), None, 10).unwrap();
        let b = db.add(ShelfItemInput { kind: Some(ShelfKind::Page), url: Some("https://x.dev".into()), text: Some("page".into()), title: Some("X".into()), ..Default::default() }, Some("default"), 11).unwrap();
        assert_eq!(db.get(&a).unwrap().title, "First line");
        assert_eq!(db.get(&b).unwrap().kind, ShelfKind::Page);
        assert!(db.add(input("  "), None, 12).is_err());
        assert!(db.add(input("x"), Some("nope"), 12).is_err());
        // newest added goes first
        assert_eq!(db.list(None)[0].id, b);
        db.update(&a, ShelfItemPatch { title: Some("Renamed".into()), tags: Some(vec!["#Work".into(), "work".into(), " ".into()]), ..Default::default() }, 20).unwrap();
        assert_eq!(db.get(&a).unwrap().title, "Renamed");
        assert_eq!(db.get(&a).unwrap().tags, vec!["work"]);
        assert!(db.pin(&a, true));
        assert_eq!(db.list(None)[0].id, a, "pinned first");
        assert!(db.remove(&b));
        assert!(!db.remove(&b));
        assert_eq!(db.shelves()[0].item_count, 1);
    }

    #[test]
    fn shelves_create_rename_delete() {
        let mut db = ShelfDb::new_with_default(1);
        let r = db.create("Research", 2).unwrap();
        assert_eq!(r.id, "research");
        assert!(db.create("research", 3).is_err());
        let r2 = db.create("Research!!", 3);
        assert!(r2.is_ok());
        assert_eq!(r2.unwrap().id, "research-2");
        db.add(input("x"), Some("research"), 4).unwrap();
        db.rename("research", "Papers").unwrap();
        assert!(db.rename("research", "Shelf").is_err());
        assert_eq!(db.delete_shelf("research").unwrap(), 1);
        assert!(db.delete_shelf(DEFAULT_SHELF).is_err());
        assert!(db.create("", 5).is_err());
    }

    #[test]
    fn move_between_shelves_and_reorder() {
        let mut db = ShelfDb::new_with_default(1);
        db.create("Work", 1).unwrap();
        let a = db.add(input("a"), None, 1).unwrap();
        let b = db.add(input("b"), None, 2).unwrap();
        let c = db.add(input("c"), None, 3).unwrap();
        // visible order: c, b, a
        db.reorder(&a, 0).unwrap();
        let ids: Vec<String> = db.list(Some(DEFAULT_SHELF)).into_iter().map(|i| i.id).collect();
        assert_eq!(ids, vec![a.clone(), c.clone(), b.clone()]);
        db.update(&c, ShelfItemPatch { shelf: Some("work".into()), ..Default::default() }, 5).unwrap();
        assert_eq!(db.list(Some("work")).len(), 1);
        assert!(db.update(&c, ShelfItemPatch { shelf: Some("nope".into()), ..Default::default() }, 5).is_err());
    }

    #[test]
    fn clear_keeps_pinned() {
        let mut db = ShelfDb::new_with_default(1);
        let a = db.add(input("a"), None, 1).unwrap();
        db.add(input("b"), None, 2).unwrap();
        db.pin(&a, true);
        assert_eq!(db.clear(DEFAULT_SHELF, false), 1);
        assert_eq!(db.list(None).len(), 1);
        assert_eq!(db.clear(DEFAULT_SHELF, true), 1);
    }

    #[test]
    fn context_block_estimates_and_trims() {
        let mut db = ShelfDb::new_with_default(1);
        let a = db.add(ShelfItemInput { kind: Some(ShelfKind::Page), title: Some("Doc".into()), url: Some("https://d".into()), text: Some("a".repeat(400)), ..Default::default() }, None, 1).unwrap();
        let b = db.add(ShelfItemInput { text: Some("short note".into()), local_only: Some(true), ..Default::default() }, None, 2).unwrap();
        let ctx = db.as_context(&[a.clone(), b.clone(), "missing".into()], 10_000, 50);
        assert_eq!(ctx.item_count, 2);
        assert!(ctx.text.starts_with("### Page — Doc\nSource: https://d"));
        assert!(ctx.text.contains("[… trimmed to fit]"));
        assert_eq!(ctx.trimmed, vec![a.clone()]);
        assert!(ctx.local_only);
        assert_eq!(ctx.approx_tokens, approx_tokens(&ctx.text));
        let full = db.as_context(&[b.clone()], 10_000, 10_000);
        assert!(full.text.ends_with("short note"));
        assert!(full.trimmed.is_empty());
    }

    #[test]
    fn exports() {
        let mut db = ShelfDb::new_with_default(1);
        db.add(ShelfItemInput { title: Some("Note".into()), text: Some("Body".into()), tags: Some(vec!["idea".into()]), ..Default::default() }, None, 1).unwrap();
        let md = db.export_markdown(DEFAULT_SHELF).unwrap();
        assert_eq!(md, "# Shelf\n\n## Note\n\n*Text* · #idea\n\nBody\n");
        let json: serde_json::Value = serde_json::from_str(&db.export_json(DEFAULT_SHELF).unwrap()).unwrap();
        assert_eq!(json["lensShelf"], 1);
        assert_eq!(json["items"][0]["title"], "Note");
        assert!(db.export_markdown("nope").is_err());
    }
}
