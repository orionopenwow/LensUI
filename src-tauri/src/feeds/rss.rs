//! RSS 2.0, RSS 1.0 (RDF), Atom and YouTube channel feeds → [`FeedItem`]s, plus OPML import.
//! Std-only (uses the local XML reader). JSON Feed lives in `api.rs` (needs serde_json).

use super::model::{clip, html_to_text, parse_date, safe_url, FeedItem, Kind, Media, Source};
use super::xml::{self, Element};

/// Titles are plain text in RSS/Atom (entities already decoded by the XML reader): only collapse
/// whitespace, never strip "tags" (a title can legitimately say "<post>").
fn plain(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub struct ParsedFeed {
    pub title: String,
    pub site: Option<String>,
    pub items: Vec<FeedItem>,
}

/// `feed` is the user's connector id (stored on each item). `now_ms` stamps items with no date.
pub fn parse_feed(body: &str, feed: &str, now_ms: i64) -> Result<ParsedFeed, String> {
    let doc = xml::parse(body)?;
    let root = doc.children.iter().find(|c| !c.name.starts_with('#')).ok_or("Empty feed")?;
    match root.name.as_str() {
        "rss" => Ok(parse_rss(root.child("channel").ok_or("RSS feed has no channel")?, root, feed, now_ms)),
        "rdf" => Ok(parse_rss(root.child("channel").unwrap_or(root), root, feed, now_ms)),
        "feed" => Ok(parse_atom(root, feed, now_ms)),
        other => Err(format!("Not a feed (root element <{}>).", other)),
    }
}

fn parse_rss(channel: &Element, root: &Element, feed: &str, now_ms: i64) -> ParsedFeed {
    let title = channel.child_text("title").unwrap_or_else(|| "Untitled feed".into());
    let site = channel.child_text("link").and_then(|l| safe_url(&l));
    // RSS 2.0 puts items in the channel; RSS 1.0 puts them beside it.
    let items_src: Vec<&Element> = channel.children_named("item").chain(root.children_named("item")).collect();
    let mut items = Vec::new();
    for (n, it) in items_src.iter().enumerate() {
        let link = it
            .child_text("link")
            .or_else(|| it.child("guid").filter(|g| g.attr("ispermalink") != Some("false")).map(|g| g.text.trim().to_string()));
        let Some(url) = link.and_then(|l| safe_url(&l)) else { continue };
        let id = it.child_text("guid").unwrap_or_else(|| url.clone());
        let raw = it
            .child_q("content:encoded")
            .map(|c| c.text.clone())
            .or_else(|| it.child_text("description"))
            .unwrap_or_default();
        let ts = it
            .child_text("pubdate")
            .or_else(|| it.child_text("date"))
            .or_else(|| it.child_text("updated"))
            .and_then(|d| parse_date(&d))
            .unwrap_or(now_ms - n as i64);
        let mut media = Vec::new();
        for enc in it.children_named("enclosure") {
            if let Some(u) = enc.attr("url").and_then(safe_url) {
                let ty = enc.attr("type").unwrap_or("");
                let kind = if ty.starts_with("image") { "image" } else if ty.starts_with("video") { "video" } else { "link" };
                media.push(Media { url: u, kind: kind.into(), alt: None });
            }
        }
        if let Some(t) = it.find("thumbnail").and_then(|t| t.attr("url")).and_then(safe_url) {
            media.push(Media { url: t, kind: "image".into(), alt: None });
        }
        let author = it
            .child_text("creator")
            .or_else(|| it.child_text("author"))
            .unwrap_or_else(|| title.clone());
        items.push(FeedItem {
            id,
            source: Source::Rss,
            kind: Kind::News,
            author: clip(&author, 80),
            author_handle: None,
            title: it.child_text("title").map(|t| clip(&plain(&t), 300)),
            text: clip(&html_to_text(&raw), 1200),
            media,
            url,
            ts,
            reply_to: None,
            metrics: None,
            reposted_by: None,
            feed: feed.into(),
        });
    }
    ParsedFeed { title: clip(&plain(&title), 120), site, items }
}

fn atom_link(el: &Element) -> Option<String> {
    let mut alt = None;
    for l in el.children_named("link") {
        let rel = l.attr("rel").unwrap_or("alternate");
        if rel == "alternate" {
            if let Some(h) = l.attr("href") {
                alt = Some(h.to_string());
                break;
            }
        }
    }
    alt.or_else(|| el.child("link").and_then(|l| l.attr("href")).map(|s| s.to_string())).and_then(|u| safe_url(&u))
}

fn parse_atom(root: &Element, feed: &str, now_ms: i64) -> ParsedFeed {
    let title = root.child_text("title").unwrap_or_else(|| "Untitled feed".into());
    let site = atom_link(root);
    let is_youtube = root.child_q("yt:channelid").is_some() || site.as_deref().is_some_and(|s| s.contains("youtube.com"));
    let feed_author = root.child("author").and_then(|a| a.child_text("name"));
    let mut items = Vec::new();
    for (n, e) in root.children_named("entry").enumerate() {
        let Some(url) = atom_link(e) else { continue };
        let id = e.child_text("id").unwrap_or_else(|| url.clone());
        let group = e.child_q("media:group");
        let raw = e
            .child_text("content")
            .or_else(|| e.child_text("summary"))
            .or_else(|| group.and_then(|g| g.child_text("description")))
            .unwrap_or_default();
        let ts = e
            .child_text("published")
            .or_else(|| e.child_text("updated"))
            .and_then(|d| parse_date(&d))
            .unwrap_or(now_ms - n as i64);
        let mut media = Vec::new();
        if let Some(t) = e.find("thumbnail").and_then(|t| t.attr("url")).and_then(safe_url) {
            media.push(Media { url: t, kind: if is_youtube { "video".into() } else { "image".into() }, alt: None });
        }
        let author = e
            .child("author")
            .and_then(|a| a.child_text("name"))
            .or_else(|| feed_author.clone())
            .unwrap_or_else(|| title.clone());
        items.push(FeedItem {
            id,
            source: if is_youtube { Source::YouTube } else { Source::Rss },
            kind: if is_youtube { Kind::Video } else { Kind::News },
            author: clip(&author, 80),
            author_handle: None,
            title: e.child_text("title").map(|t| clip(&plain(&t), 300)),
            text: clip(&html_to_text(&raw), 1200),
            media,
            url,
            ts,
            reply_to: None,
            metrics: None,
            reposted_by: None,
            feed: feed.into(),
        });
    }
    ParsedFeed { title: clip(&plain(&title), 120), site, items }
}

/// The no-key YouTube route: a channel's public uploads feed.
pub fn youtube_channel_feed_url(channel_id: &str) -> Option<String> {
    let ok = channel_id.len() >= 20 && channel_id.len() <= 40 && channel_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    ok.then(|| format!("https://www.youtube.com/feeds/videos.xml?channel_id={}", channel_id))
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpmlFeed {
    pub title: String,
    pub xml_url: String,
    pub html_url: Option<String>,
    /// Folder path from nested outlines ("Tech/Rust").
    pub folder: Option<String>,
}

pub fn parse_opml(body: &str) -> Result<Vec<OpmlFeed>, String> {
    let doc = xml::parse(body)?;
    let opml = doc.find("opml").ok_or("Not an OPML file.")?;
    let b = opml.child("body").ok_or("OPML has no body.")?;
    let mut out = Vec::new();
    fn walk(el: &Element, path: &mut Vec<String>, out: &mut Vec<OpmlFeed>) {
        for o in el.children_named("outline") {
            let title = o.attr("title").or(o.attr("text")).unwrap_or("").to_string();
            if let Some(x) = o.attr("xmlurl").and_then(safe_url) {
                out.push(OpmlFeed {
                    title: if title.is_empty() { x.clone() } else { title },
                    xml_url: x,
                    html_url: o.attr("htmlurl").and_then(safe_url),
                    folder: (!path.is_empty()).then(|| path.join("/")),
                });
            } else {
                path.push(title);
                walk(o, path, out);
                path.pop();
            }
        }
    }
    walk(b, &mut Vec::new(), &mut out);
    if out.len() > 5000 {
        out.truncate(5000);
    }
    Ok(out)
}

pub fn to_opml(feeds: &[OpmlFeed]) -> String {
    fn esc(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
    }
    let mut s = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\"><head><title>Lens feeds</title></head><body>\n");
    for f in feeds {
        s.push_str(&format!("  <outline type=\"rss\" text=\"{0}\" title=\"{0}\" xmlUrl=\"{1}\"", esc(&f.title), esc(&f.xml_url)));
        if let Some(h) = &f.html_url {
            s.push_str(&format!(" htmlUrl=\"{}\"", esc(h)));
        }
        s.push_str("/>\n");
    }
    s.push_str("</body></opml>\n");
    s
}
