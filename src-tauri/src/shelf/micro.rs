//! Micro-saves: instant, tiny captures onto the Shelf (Ctrl+Alt+S, Alt+Shift+S in browsers,
//! right-click → Micro-save). Pure logic on `ShelfDb`:
//!
//! * the same text from the same source is saved once (a repeat returns the existing item);
//! * consecutive saves from the same page within `MERGE_WINDOW_MS` become one item holding
//!   several quotes, so a reading session is one tidy item instead of twenty;
//! * items are tagged automatically by site / app, plus `micro`.

use serde::{Deserialize, Serialize};

use super::model::{approx_tokens, ShelfDb, ShelfItemInput, ShelfKind, DEFAULT_SHELF, MAX_ITEM_CHARS};

pub const MERGE_WINDOW_MS: u64 = 10 * 60 * 1000;
pub const MICRO_TAG: &str = "micro";
pub const MAX_NOTE_CHARS: usize = 500;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct MicroInput {
    pub kind: Option<ShelfKind>,
    pub text: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    pub path: Option<String>,
    pub source_app: Option<String>,
    /// Optional one-line note typed in the toast.
    pub note: Option<String>,
    pub local_only: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MicroSaved {
    pub id: String,
    pub shelf: String,
    pub title: String,
    /// Appended to an earlier save from the same page.
    pub merged: bool,
    /// Already on the Shelf; nothing changed.
    pub duplicate: bool,
    pub approx_tokens: usize,
    pub quotes: usize,
}

/// Lower-case, single-spaced, quote markers removed: what "the same text" means.
pub fn normalize(s: &str) -> String {
    s.lines()
        .map(|l| l.trim().trim_start_matches('>').trim())
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// `> ` on every line, so several captures read as separate quotes.
pub fn quote(text: &str) -> String {
    text.trim().lines().map(|l| if l.trim().is_empty() { ">".to_string() } else { format!("> {}", l.trim_end()) }).collect::<Vec<_>>().join("\n")
}

pub fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://").map(|(_, r)| r)?;
    let host = rest.split(['/', '?', '#']).next()?.rsplit('@').next()?.split(':').next()?.to_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    if host.is_empty() { None } else { Some(host) }
}

fn app_tag(app: &str) -> Option<String> {
    let name = app.rsplit(['\\', '/']).next().unwrap_or(app);
    let name = name.strip_suffix(".exe").or_else(|| name.strip_suffix(".EXE")).unwrap_or(name);
    let t: String = name.trim().to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect();
    let t = t.trim_matches('-').to_string();
    if t.is_empty() || t.len() > 32 { None } else { Some(t) }
}

/// Tags from where the save came from: the site (`github.com`) or app (`code`), plus `micro`.
pub fn auto_tags(url: Option<&str>, source_app: Option<&str>) -> Vec<String> {
    let mut tags = vec![MICRO_TAG.to_string()];
    if let Some(h) = url.and_then(host_of) {
        tags.push(h);
    } else if let Some(a) = source_app.and_then(app_tag) {
        tags.push(a);
    }
    tags
}

fn note_suffix(note: Option<&str>) -> String {
    match note.map(str::trim).filter(|n| !n.is_empty()) {
        Some(n) => format!("\n\n_Note: {}_", n.chars().take(MAX_NOTE_CHARS).collect::<String>()),
        None => String::new(),
    }
}

fn count_quotes(text: &str) -> usize {
    let mut n = 0;
    let mut in_quote = false;
    for l in text.lines() {
        let q = l.starts_with('>');
        if q && !in_quote {
            n += 1;
        }
        in_quote = q;
    }
    n.max(1)
}

/// Saves (or merges, or recognises) one micro-save. Returns what happened for the toast.
pub fn micro_save(db: &mut ShelfDb, input: MicroInput, shelf: Option<&str>, now_ms: u64) -> Result<MicroSaved, String> {
    let shelf_id = shelf.map(str::trim).filter(|s| !s.is_empty()).unwrap_or(DEFAULT_SHELF).to_string();
    if !db.shelves.iter().any(|s| s.id == shelf_id) {
        return Err(format!("No shelf called \"{shelf_id}\"."));
    }
    let text = input.text.clone().unwrap_or_default();
    let text = text.trim().to_string();
    if text.is_empty() && input.url.is_none() && input.path.is_none() {
        return Err("Nothing to save — select something first.".into());
    }
    let norm = normalize(&text);
    let same_source = |i: &super::model::ShelfItem| -> bool {
        match (&input.url, &input.path) {
            (Some(u), _) => i.url.as_deref() == Some(u.as_str()),
            (None, Some(p)) => i.path.as_deref().is_some_and(|x| x.eq_ignore_ascii_case(p)),
            (None, None) => i.url.is_none() && i.path.is_none(),
        }
    };

    // 1) Duplicate: same source, and the text is already there (or there is no text and the
    //    source itself is already saved).
    if let Some(dup) = db.items.iter().find(|i| {
        i.shelf == shelf_id
            && same_source(i)
            && if norm.is_empty() { i.tags.iter().any(|t| t == MICRO_TAG) || i.text.is_empty() } else { normalize(&i.text).contains(&norm) }
    }) {
        return Ok(MicroSaved {
            id: dup.id.clone(),
            shelf: shelf_id,
            title: dup.title.clone(),
            merged: false,
            duplicate: true,
            approx_tokens: dup.approx_tokens,
            quotes: count_quotes(&dup.text),
        });
    }

    // 2) Merge: the newest micro-save on this shelf is from the same page and recent.
    let is_selection = !text.is_empty() && input.url.is_some() && input.path.is_none();
    if is_selection {
        let newest = db
            .items
            .iter_mut()
            .filter(|i| i.shelf == shelf_id && i.tags.iter().any(|t| t == MICRO_TAG))
            .max_by_key(|i| i.updated_ms);
        if let Some(item) = newest {
            let recent = now_ms.saturating_sub(item.updated_ms) <= MERGE_WINDOW_MS;
            if recent && item.url == input.url && matches!(item.kind, ShelfKind::Selection | ShelfKind::Text) {
                let merged = format!("{}\n\n{}{}", item.text.trim_end(), quote(&text), note_suffix(input.note.as_deref()));
                if merged.chars().count() <= MAX_ITEM_CHARS {
                    item.chars = merged.chars().count();
                    item.approx_tokens = approx_tokens(&merged);
                    item.text = merged;
                    item.updated_ms = now_ms;
                    return Ok(MicroSaved {
                        id: item.id.clone(),
                        shelf: shelf_id,
                        title: item.title.clone(),
                        merged: true,
                        duplicate: false,
                        approx_tokens: item.approx_tokens,
                        quotes: count_quotes(&item.text),
                    });
                }
            }
        }
    }

    // 3) A new item.
    let kind = input.kind.unwrap_or(if input.path.is_some() {
        ShelfKind::File
    } else if is_selection {
        ShelfKind::Selection
    } else {
        ShelfKind::Text
    });
    let body = if is_selection { quote(&text) } else { text.clone() };
    let body = format!("{}{}", body, note_suffix(input.note.as_deref()));
    let title = input.title.clone().or_else(|| input.url.as_deref().and_then(host_of));
    let id = db.add(
        ShelfItemInput {
            kind: Some(kind),
            title,
            text: Some(body),
            html: None,
            url: input.url.clone(),
            path: input.path.clone(),
            source_app: input.source_app.clone(),
            tags: Some(auto_tags(input.url.as_deref(), input.source_app.as_deref())),
            local_only: input.local_only,
        },
        Some(&shelf_id),
        now_ms,
    )?;
    let item = db.get(&id).ok_or("Lost the saved item.")?;
    Ok(MicroSaved {
        id: id.clone(),
        shelf: shelf_id,
        title: item.title.clone(),
        merged: false,
        duplicate: false,
        approx_tokens: item.approx_tokens,
        quotes: if is_selection { 1 } else { 0 },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sel(text: &str, url: &str) -> MicroInput {
        MicroInput { text: Some(text.into()), url: Some(url.into()), title: Some("Page".into()), ..Default::default() }
    }

    #[test]
    fn helpers() {
        assert_eq!(normalize("> Hello\n>   World  "), "hello world");
        assert_eq!(quote("a\n\nb"), "> a\n>\n> b");
        assert_eq!(host_of("https://www.GitHub.com/x?y").as_deref(), Some("github.com"));
        assert_eq!(host_of("https://user@site.org:8080/p").as_deref(), Some("site.org"));
        assert_eq!(host_of("nope"), None);
        assert_eq!(auto_tags(Some("https://docs.rs/a"), Some("chrome.exe")), vec!["micro", "docs.rs"]);
        assert_eq!(auto_tags(None, Some("C:\\Apps\\Code.exe")), vec!["micro", "code"]);
        assert_eq!(auto_tags(None, None), vec!["micro"]);
    }

    #[test]
    fn first_save_is_a_quoted_tagged_item() {
        let mut db = ShelfDb::new_with_default(1);
        let r = micro_save(&mut db, sel("Calm tools stay in the periphery.", "https://calmtech.com/p"), None, 10).unwrap();
        assert!(!r.merged && !r.duplicate);
        let it = db.get(&r.id).unwrap();
        assert_eq!(it.kind, ShelfKind::Selection);
        assert_eq!(it.text, "> Calm tools stay in the periphery.");
        assert!(it.tags.contains(&"micro".to_string()) && it.tags.contains(&"calmtech.com".to_string()));
        assert!(r.approx_tokens > 0);
    }

    #[test]
    fn identical_save_is_recognised() {
        let mut db = ShelfDb::new_with_default(1);
        let a = micro_save(&mut db, sel("Same words here", "https://x.com/a"), None, 10).unwrap();
        let b = micro_save(&mut db, sel("  same   WORDS here ", "https://x.com/a"), None, 20).unwrap();
        assert!(b.duplicate);
        assert_eq!(a.id, b.id);
        assert_eq!(db.items.len(), 1);
        // Same words from another page is a new save.
        let c = micro_save(&mut db, sel("Same words here", "https://y.com/b"), None, 30).unwrap();
        assert!(!c.duplicate && !c.merged);
        assert_eq!(db.items.len(), 2);
    }

    #[test]
    fn consecutive_saves_from_one_page_merge_into_quotes() {
        let mut db = ShelfDb::new_with_default(1);
        let a = micro_save(&mut db, sel("First point.", "https://x.com/a"), None, 1_000).unwrap();
        let b = micro_save(&mut db, MicroInput { note: Some("check this".into()), ..sel("Second point.", "https://x.com/a") }, None, 2_000).unwrap();
        assert!(b.merged);
        assert_eq!(a.id, b.id);
        assert_eq!(b.quotes, 2);
        let it = db.get(&a.id).unwrap();
        assert_eq!(it.text, "> First point.\n\n> Second point.\n\n_Note: check this_");
        assert_eq!(it.updated_ms, 2_000);
        // A quote that is already inside the merged item is a duplicate.
        assert!(micro_save(&mut db, sel("second point.", "https://x.com/a"), None, 2_500).unwrap().duplicate);
        // After the window closes, a new item starts.
        let c = micro_save(&mut db, sel("Third.", "https://x.com/a"), None, 2_000 + MERGE_WINDOW_MS + 1).unwrap();
        assert!(!c.merged);
        assert_eq!(db.items.len(), 2);
        // A save from another page in between breaks the run.
        let d = micro_save(&mut db, sel("Elsewhere.", "https://z.com"), None, 2_000 + MERGE_WINDOW_MS + 2).unwrap();
        let e = micro_save(&mut db, sel("Back.", "https://x.com/a"), None, 2_000 + MERGE_WINDOW_MS + 3).unwrap();
        assert!(!d.merged && !e.merged);
    }

    #[test]
    fn files_and_apps_and_errors() {
        let mut db = ShelfDb::new_with_default(1);
        let f = MicroInput { path: Some("C:\\docs\\plan.pdf".into()), source_app: Some("File Explorer".into()), ..Default::default() };
        let r = micro_save(&mut db, f.clone(), None, 5).unwrap();
        assert_eq!(db.get(&r.id).unwrap().kind, ShelfKind::File);
        assert_eq!(db.get(&r.id).unwrap().title, "plan.pdf");
        assert!(micro_save(&mut db, f, None, 6).unwrap().duplicate);
        let app = MicroInput { text: Some("fn main() {}".into()), source_app: Some("Code.exe".into()), ..Default::default() };
        let r = micro_save(&mut db, app, None, 7).unwrap();
        assert!(db.get(&r.id).unwrap().tags.contains(&"code".to_string()));
        assert!(micro_save(&mut db, MicroInput::default(), None, 8).is_err());
        assert!(micro_save(&mut db, sel("x", "https://x.com"), Some("nope"), 9).is_err());
    }
}
