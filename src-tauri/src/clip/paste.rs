//! "Paste as" renderers. All local, no AI.

use serde::{Deserialize, Serialize};

use super::history::{ClipItem, ClipKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PasteAs {
    /// Exactly what was copied: text plus its HTML, when there was some.
    Original,
    /// Text only, no formatting.
    Plain,
    /// HTML converted to Markdown (falls back to the text).
    Markdown,
    /// Whitespace collapsed and trimmed, line structure kept.
    Trimmed,
}

/// What to put on the clipboard for a paste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rendered {
    pub text: String,
    pub html: Option<String>,
}

pub fn render(item: &ClipItem, mode: PasteAs) -> Rendered {
    let text = item.text.clone();
    match mode {
        PasteAs::Original => Rendered { text, html: item.html.clone() },
        PasteAs::Plain => Rendered { text, html: None },
        PasteAs::Markdown => {
            let md = match (&item.html, item.kind) {
                (Some(h), ClipKind::Text) => html_to_markdown(h),
                (_, ClipKind::Link) => {
                    let url = item.text.trim();
                    match &item.title {
                        Some(t) => format!("[{t}]({url})"),
                        None => format!("<{url}>"),
                    }
                }
                (_, ClipKind::Files) => item.files.iter().map(|f| format!("- `{f}`")).collect::<Vec<_>>().join("\n"),
                _ => text,
            };
            Rendered { text: md, html: None }
        }
        PasteAs::Trimmed => Rendered { text: trim_text(&text), html: None },
    }
}

/// Trims every line, collapses runs of spaces, and keeps at most one blank line in a row.
pub fn trim_text(s: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut blank = false;
    for line in s.lines() {
        let l = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if l.is_empty() {
            if !blank && !out.is_empty() {
                out.push(String::new());
            }
            blank = true;
        } else {
            out.push(l);
            blank = false;
        }
    }
    while out.last().is_some_and(|l| l.is_empty()) {
        out.pop();
    }
    out.join("\n")
}

/// Extracts the fragment from a Windows "HTML Format" clipboard payload
/// (`Version:… StartFragment:… <!--StartFragment-->…<!--EndFragment-->`). Returns the input when
/// there are no markers.
pub fn cf_html_fragment(payload: &str) -> String {
    let start = payload.find("<!--StartFragment-->").map(|i| i + "<!--StartFragment-->".len());
    let end = payload.find("<!--EndFragment-->");
    match (start, end) {
        (Some(s), Some(e)) if e >= s => payload[s..e].to_string(),
        _ => payload.to_string(),
    }
}

/// Wraps an HTML fragment in the Windows "HTML Format" envelope with correct byte offsets.
pub fn build_cf_html(fragment: &str) -> String {
    const HEADER_LEN: usize = 105; // fixed by the 10-digit fields below
    let prefix = "<html><body><!--StartFragment-->";
    let suffix = "<!--EndFragment--></body></html>";
    let start_html = HEADER_LEN;
    let start_frag = start_html + prefix.len();
    let end_frag = start_frag + fragment.len();
    let end_html = end_frag + suffix.len();
    let header = format!(
        "Version:0.9\r\nStartHTML:{start_html:010}\r\nEndHTML:{end_html:010}\r\nStartFragment:{start_frag:010}\r\nEndFragment:{end_frag:010}\r\n"
    );
    debug_assert_eq!(header.len(), HEADER_LEN);
    format!("{header}{prefix}{fragment}{suffix}")
}

/// The `SourceURL:` header of a Windows "HTML Format" payload, if present.
pub fn cf_html_source_url(payload: &str) -> Option<String> {
    payload
        .lines()
        .take(12)
        .find_map(|l| l.strip_prefix("SourceURL:"))
        .map(|u| u.trim().to_string())
        .filter(|u| u.starts_with("http://") || u.starts_with("https://"))
}

fn decode_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let key = format!("{name}=");
    let i = lower.find(&key)? + key.len();
    let rest = &tag[i..];
    let (quote, rest) = match rest.chars().next()? {
        q @ ('"' | '\'') => (Some(q), &rest[1..]),
        _ => (None, rest),
    };
    let end = match quote {
        Some(q) => rest.find(q)?,
        None => rest.find(|c: char| c.is_whitespace() || c == '>').unwrap_or(rest.len()),
    };
    Some(decode_entities(&rest[..end]))
}

/// A small, forgiving HTML → Markdown converter for clipboard fragments: headings, bold, italic,
/// code, links, images, lists, line breaks, paragraphs, blockquotes. Scripts and styles are dropped.
pub fn html_to_markdown(html: &str) -> String {
    let html = cf_html_fragment(html);
    let mut out = String::new();
    let mut link_stack: Vec<Option<String>> = Vec::new();
    let mut list_stack: Vec<(bool, usize)> = Vec::new(); // (ordered, counter)
    let mut skip_depth = 0usize;
    let mut in_pre = false;
    let mut rest = html.as_str();

    let ensure_blank = |out: &mut String| {
        let trimmed = out.trim_end_matches(' ');
        let len = trimmed.len();
        out.truncate(len);
        if out.is_empty() {
            return;
        }
        if !out.ends_with("\n\n") {
            if out.ends_with('\n') {
                out.push('\n');
            } else {
                out.push_str("\n\n");
            }
        }
    };

    while !rest.is_empty() {
        if let Some(lt) = rest.find('<') {
            let text = &rest[..lt];
            if skip_depth == 0 && !text.is_empty() {
                let t = decode_entities(text);
                if in_pre {
                    out.push_str(&t);
                } else {
                    let collapsed: String = t.split_whitespace().collect::<Vec<_>>().join(" ");
                    if !collapsed.is_empty() {
                        if t.starts_with(char::is_whitespace) && !out.ends_with([' ', '\n']) && !out.is_empty() {
                            out.push(' ');
                        }
                        out.push_str(&collapsed);
                        if t.ends_with(char::is_whitespace) {
                            out.push(' ');
                        }
                    }
                }
            }
            let Some(gt) = rest[lt..].find('>') else {
                break;
            };
            let tag = &rest[lt + 1..lt + gt];
            rest = &rest[lt + gt + 1..];
            if tag.starts_with("!--") {
                continue;
            }
            let closing = tag.starts_with('/');
            let name: String = tag
                .trim_start_matches('/')
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
                .to_ascii_lowercase();
            match name.as_str() {
                "script" | "style" | "head" => {
                    if closing {
                        skip_depth = skip_depth.saturating_sub(1);
                    } else if !tag.ends_with('/') {
                        skip_depth += 1;
                    }
                }
                _ if skip_depth > 0 => {}
                "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                    ensure_blank(&mut out);
                    if !closing {
                        let level = name[1..].parse::<usize>().unwrap_or(1);
                        out.push_str(&"#".repeat(level));
                        out.push(' ');
                    }
                }
                "p" | "div" | "section" | "article" | "table" | "tr" => ensure_blank(&mut out),
                "br" => out.push('\n'),
                "strong" | "b" => out.push_str("**"),
                "em" | "i" => out.push('*'),
                "code" if !in_pre => out.push('`'),
                "pre" => {
                    if closing {
                        if !out.ends_with('\n') {
                            out.push('\n');
                        }
                        out.push_str("```");
                        in_pre = false;
                        ensure_blank(&mut out);
                    } else {
                        ensure_blank(&mut out);
                        out.push_str("```\n");
                        in_pre = true;
                    }
                }
                "blockquote" => {
                    ensure_blank(&mut out);
                    if !closing {
                        out.push_str("> ");
                    }
                }
                "ul" | "ol" => {
                    if closing {
                        list_stack.pop();
                        if list_stack.is_empty() {
                            ensure_blank(&mut out);
                        }
                    } else {
                        if !out.is_empty() && !out.ends_with('\n') {
                            out.push('\n');
                        }
                        list_stack.push((name == "ol", 0));
                    }
                }
                "li" => {
                    if !closing {
                        if !out.is_empty() && !out.ends_with('\n') {
                            out.push('\n');
                        }
                        let depth = list_stack.len().saturating_sub(1);
                        out.push_str(&"  ".repeat(depth));
                        match list_stack.last_mut() {
                            Some((true, n)) => {
                                *n += 1;
                                out.push_str(&format!("{n}. "));
                            }
                            _ => out.push_str("- "),
                        }
                    }
                }
                "a" => {
                    if closing {
                        if let Some(Some(href)) = link_stack.pop() {
                            out.push_str(&format!("]({href})"));
                        }
                    } else {
                        let href = attr(tag, "href").filter(|h| !h.starts_with("javascript:"));
                        if href.is_some() {
                            out.push('[');
                        }
                        link_stack.push(href);
                    }
                }
                "img" => {
                    if let Some(src) = attr(tag, "src").filter(|s| !s.starts_with("data:")) {
                        let alt = attr(tag, "alt").unwrap_or_default();
                        out.push_str(&format!("![{alt}]({src})"));
                    }
                }
                "td" | "th" if !closing => {
                    if !out.ends_with(['\n', ' ']) && !out.is_empty() {
                        out.push_str(" | ");
                    }
                }
                _ => {}
            }
        } else {
            if skip_depth == 0 {
                out.push_str(&decode_entities(rest));
            }
            break;
        }
    }
    // Tidy: trim line ends, at most one blank line in a row.
    let mut lines: Vec<&str> = Vec::new();
    let mut blank = false;
    for l in out.lines() {
        let l = l.trim_end();
        if l.trim().is_empty() {
            if !blank && !lines.is_empty() {
                lines.push("");
            }
            blank = true;
        } else {
            lines.push(l);
            blank = false;
        }
    }
    while lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    lines.join("\n").replace("** **", " ").replace("****", "")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(text: &str, html: Option<&str>) -> ClipItem {
        ClipItem {
            id: 1,
            kind: ClipKind::Text,
            text: text.into(),
            html: html.map(Into::into),
            files: vec![],
            thumb_png: None,
            image_size: None,
            source_app: None,
            url: None,
            title: None,
            ts_ms: 0,
            pinned: false,
            local_only: false,
        }
    }

    #[test]
    fn markdown_from_html() {
        let md = html_to_markdown(
            "<h2>Title</h2><p>Some <b>bold</b> and <em>soft</em> text with <a href=\"https://x.dev/a?b=1&amp;c=2\">a link</a>.</p><ul><li>one</li><li>two</li></ul><ol><li>first</li><li>second</li></ol>",
        );
        assert!(md.starts_with("## Title\n\nSome **bold** and *soft* text with [a link](https://x.dev/a?b=1&c=2)."), "{md}");
        assert!(md.contains("- one\n- two"), "{md}");
        assert!(md.contains("1. first\n2. second"), "{md}");
    }

    #[test]
    fn markdown_drops_scripts_and_handles_fragment_markers() {
        let payload = "Version:0.9\r\nStartHTML:1\r\nSourceURL:https://example.com/page\r\n<html><body><!--StartFragment--><p>Hi<script>alert(1)</script> there</p><!--EndFragment--></body></html>";
        assert_eq!(html_to_markdown(payload), "Hi there");
        assert_eq!(cf_html_source_url(payload).as_deref(), Some("https://example.com/page"));
        assert_eq!(cf_html_source_url("SourceURL:javascript:x"), None);
    }

    #[test]
    fn cf_html_offsets_are_exact() {
        let frag = "<b>héllo</b>";
        let cf = build_cf_html(frag);
        let field = |name: &str| -> usize {
            let i = cf.find(name).unwrap() + name.len();
            cf[i..i + 10].parse().unwrap()
        };
        let (s, e) = (field("StartFragment:"), field("EndFragment:"));
        assert_eq!(&cf[s..e], frag);
        assert_eq!(field("EndHTML:"), cf.len());
        assert!(cf[field("StartHTML:")..].starts_with("<html>"));
        assert_eq!(cf_html_fragment(&cf), frag);
    }

    #[test]
    fn code_and_images() {
        let md = html_to_markdown("<p>Run <code>bun test</code></p><pre>let x = 1;\nlet y = 2;</pre><img src=\"https://i/a.png\" alt=\"pic\"><img src=\"data:image/png;base64,AAA\">");
        assert!(md.contains("Run `bun test`"), "{md}");
        assert!(md.contains("```\nlet x = 1;\nlet y = 2;\n```"), "{md}");
        assert!(md.contains("![pic](https://i/a.png)"), "{md}");
        assert!(!md.contains("data:"), "{md}");
    }

    #[test]
    fn paste_modes() {
        let i = item("  Hello   world  \n\n\n  next ", Some("<b>Hello</b> world"));
        assert_eq!(render(&i, PasteAs::Original).html.as_deref(), Some("<b>Hello</b> world"));
        assert_eq!(render(&i, PasteAs::Plain).html, None);
        assert_eq!(render(&i, PasteAs::Plain).text, i.text);
        assert_eq!(render(&i, PasteAs::Trimmed).text, "Hello world\n\nnext");
        assert_eq!(render(&i, PasteAs::Markdown).text, "**Hello** world");
        let plain = item("just text", None);
        assert_eq!(render(&plain, PasteAs::Markdown).text, "just text");
    }

    #[test]
    fn link_and_files_markdown() {
        let mut l = item("https://lens.dev", None);
        l.kind = ClipKind::Link;
        assert_eq!(render(&l, PasteAs::Markdown).text, "<https://lens.dev>");
        l.title = Some("Lens".into());
        assert_eq!(render(&l, PasteAs::Markdown).text, "[Lens](https://lens.dev)");
        let mut f = item("C:\\a.txt\nC:\\b.txt", None);
        f.kind = ClipKind::Files;
        f.files = vec!["C:\\a.txt".into(), "C:\\b.txt".into()];
        assert_eq!(render(&f, PasteAs::Markdown).text, "- `C:\\a.txt`\n- `C:\\b.txt`");
    }
}
