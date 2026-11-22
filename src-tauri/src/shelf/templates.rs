//! Slash-command prompt templates (`%APPDATA%\LensUI\commands.json`).
//!
//! A template is plain text with placeholders:
//! `{selection}` `{clipboard}` `{shelf}` `{page}` `{lang}` `{input}` `{title}` `{url}` `{date}`
//! and modifiers, chained with `|`: `trim`, `upper`, `lower`, `first:N` (first N characters),
//! `oneline`, `default:"text"`. Example: `{selection | trim | first:4000}`.
//! An unknown placeholder is left as written so mistakes are visible. An empty variable becomes
//! its default (or nothing).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandTemplate {
    /// The slash name, without `/`: lowercase letters, digits and `-`.
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Empty for built-in actions that are not prompts (/clip, /shelf, /theme, /focus, /note).
    #[serde(default)]
    pub template: String,
    /// "default" | "script" | "local" | "claude". Built-ins default to local.
    #[serde(default = "default_provider")]
    pub provider: String,
    /// What the command acts on first: "selection" | "clipboard" | "shelf" | "page" | "input".
    #[serde(default)]
    pub input: String,
    /// Optional choices shown as chips (e.g. tones for /rewrite).
    #[serde(default)]
    pub options: Vec<String>,
    /// Where the result goes by default: "thread" | "shelf" | "paste".
    #[serde(default = "default_output")]
    pub output: String,
    #[serde(default)]
    pub builtin: bool,
    #[serde(default = "yes")]
    pub enabled: bool,
}

fn default_provider() -> String {
    "local".into()
}
fn default_output() -> String {
    "thread".into()
}
fn yes() -> bool {
    true
}

fn t(id: &str, name: &str, description: &str, input: &str, template: &str, options: &[&str], output: &str) -> CommandTemplate {
    CommandTemplate {
        id: id.into(),
        name: name.into(),
        description: description.into(),
        template: template.into(),
        provider: "local".into(),
        input: input.into(),
        options: options.iter().map(|s| s.to_string()).collect(),
        output: output.into(),
        builtin: true,
        enabled: true,
    }
}

/// The commands Lens ships. User files override by `id`; `enabled: false` hides one.
pub fn builtin_templates() -> Vec<CommandTemplate> {
    vec![
        t("summarise", "Summarise", "Key points, a TL;DR or a headline", "selection",
          "Summarise the following as {option | default:\"key points\"}. Keep it short and faithful; no new facts.\n\n{selection | trim | first:24000}",
          &["key points", "tl;dr", "headline"], "thread"),
        t("explain", "Explain", "Explain simply, with an example", "selection",
          "Explain this in plain words for a smart non-expert, with one short example.\n\n{selection | trim | first:16000}", &[], "thread"),
        t("translate", "Translate", "Translate into another language", "selection",
          "Translate into {lang | default:\"English\"}. Keep formatting, names and numbers. Reply with the translation only.\n\n{selection | trim | first:16000}", &[], "thread"),
        t("rewrite", "Rewrite", "Shorter, friendlier or more formal", "selection",
          "Rewrite this to be {option | default:\"shorter\"}. Keep the meaning. Reply with the rewritten text only.\n\n{selection | trim | first:16000}",
          &["shorter", "friendlier", "formal", "clearer"], "paste"),
        t("fix", "Fix spelling & grammar", "Corrects mistakes and changes nothing else", "selection",
          "Fix spelling, grammar and punctuation. Change nothing else. Reply with the corrected text only.\n\n{selection | first:16000}", &[], "paste"),
        t("todo", "Make a to-do list", "Turn notes into checkboxes", "selection",
          "Turn this into a short Markdown checklist of concrete actions (\"- [ ] …\"). No preamble.\n\n{selection | trim | first:16000}", &[], "shelf"),
        t("extract", "Extract", "Pull out links, dates, emails or tables", "selection",
          "Extract every {option | default:\"link\"} from the text below as a Markdown list. Reply with the list only.\n\n{selection | first:24000}",
          &["link", "date", "email", "table", "number"], "shelf"),
        t("compare", "Compare", "Compare two Shelf items", "shelf",
          "Compare the items below: what they agree on, where they differ, and which is stronger and why. Use short headings.\n\n{shelf | first:48000}", &[], "thread"),
        t("ask-page", "Ask this page", "Ask a question about the current page", "page",
          "Answer the question using only the page below. Quote short phrases when useful. If the page doesn't say, say so.\n\nQuestion: {input}\n\nPage: {title} ({url})\n\n{page | first:48000}", &[], "thread"),
        t("transcribe", "Transcribe", "Transcribe an audio or video file", "input", "", &[], "shelf"),
        t("note", "Note", "Save what you typed to the Shelf", "input", "", &[], "shelf"),
        t("clip", "Clipboard", "Search clipboard history", "input", "", &[], "thread"),
        t("shelf", "Shelf", "Open the Shelf", "input", "", &[], "thread"),
        t("theme", "Theme", "Switch theme or accent", "input", "", &[], "thread"),
        t("focus", "Focus", "Start a focus session", "input", "", &[], "thread"),
    ]
}

/// Merges user templates over the built-ins (same `id` replaces; new ids are appended).
pub fn merge(user: Vec<CommandTemplate>) -> Vec<CommandTemplate> {
    let mut out = builtin_templates();
    for mut u in user {
        if !valid_id(&u.id) {
            continue;
        }
        u.builtin = false;
        match out.iter_mut().find(|b| b.id == u.id) {
            Some(slot) => {
                u.builtin = true;
                *slot = u;
            }
            None => out.push(u),
        }
    }
    out
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 32 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn apply_modifier(value: String, modifier: &str) -> String {
    let m = modifier.trim();
    if let Some(n) = m.strip_prefix("first:") {
        let n: usize = n.trim().parse().unwrap_or(usize::MAX);
        if value.chars().count() > n {
            let mut s: String = value.chars().take(n).collect();
            s.push_str("\n[…]");
            return s;
        }
        return value;
    }
    if let Some(d) = m.strip_prefix("default:") {
        if value.trim().is_empty() {
            return d.trim().trim_matches('"').to_string();
        }
        return value;
    }
    match m {
        "trim" => value.trim().to_string(),
        "upper" => value.to_uppercase(),
        "lower" => value.to_lowercase(),
        "oneline" => value.split_whitespace().collect::<Vec<_>>().join(" "),
        _ => value,
    }
}

/// Expands `{name | modifier | …}` placeholders from `vars`.
pub fn expand(template: &str, vars: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        let Some(close) = after.find('}') else {
            out.push_str(&rest[open..]);
            return out;
        };
        let inner = &after[..close];
        let mut parts = split_pipes(inner);
        let name = parts.remove(0).trim().to_string();
        let known = matches!(
            name.as_str(),
            "selection" | "clipboard" | "shelf" | "page" | "lang" | "input" | "title" | "url" | "date" | "option"
        ) || vars.contains_key(&name);
        if name.is_empty() || !known || name.contains(char::is_whitespace) {
            out.push('{');
            out.push_str(inner);
            out.push('}');
        } else {
            let mut value = vars.get(&name).cloned().unwrap_or_default();
            for m in parts {
                value = apply_modifier(value, &m);
            }
            out.push_str(&value);
        }
        rest = &after[close + 1..];
    }
    out.push_str(rest);
    out
}

/// Splits on `|` outside double quotes.
fn split_pipes(s: &str) -> Vec<String> {
    let mut parts = vec![String::new()];
    let mut quoted = false;
    for c in s.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                parts.last_mut().unwrap().push(c);
            }
            '|' if !quoted => parts.push(String::new()),
            _ => parts.last_mut().unwrap().push(c),
        }
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn expands_variables_and_modifiers() {
        let v = vars(&[("selection", "  Hello World  "), ("lang", "")]);
        assert_eq!(expand("[{selection}]", &v), "[  Hello World  ]");
        assert_eq!(expand("[{selection | trim | upper}]", &v), "[HELLO WORLD]");
        assert_eq!(expand("{lang | default:\"French\"}", &v), "French");
        assert_eq!(expand("{clipboard}", &v), "");
        assert_eq!(expand("{selection | trim | first:5}", &v), "Hello\n[…]");
        assert_eq!(expand("{selection|oneline|lower}", &vars(&[("selection", "A\n  B")])), "a b");
    }

    #[test]
    fn leaves_unknown_and_broken_placeholders_visible() {
        let v = vars(&[]);
        assert_eq!(expand("keep {unknown} and {json: 1}", &v), "keep {unknown} and {json: 1}");
        assert_eq!(expand("open { never closed", &v), "open { never closed");
        assert_eq!(expand("{}", &v), "{}");
    }

    #[test]
    fn pipes_inside_quotes_are_literal() {
        let v = vars(&[("option", "")]);
        assert_eq!(expand("{option | default:\"a|b\"}", &v), "a|b");
    }

    #[test]
    fn builtins_are_valid_and_expand() {
        let all = builtin_templates();
        assert!(all.len() >= 15);
        assert!(all.iter().all(|t| valid_id(&t.id) && t.provider == "local"));
        let s = all.iter().find(|t| t.id == "summarise").unwrap();
        let out = expand(&s.template, &vars(&[("selection", "Text body")]));
        assert!(out.contains("as key points"));
        assert!(out.ends_with("Text body"));
    }

    #[test]
    fn user_templates_override_and_append() {
        let mut fix = builtin_templates().into_iter().find(|t| t.id == "fix").unwrap();
        fix.provider = "claude".into();
        let custom = CommandTemplate { id: "tweet".into(), name: "Tweet".into(), template: "{selection}".into(), builtin: true, ..fix.clone() };
        let bad = CommandTemplate { id: "Bad Id".into(), ..fix.clone() };
        let merged = merge(vec![fix, custom, bad]);
        assert_eq!(merged.iter().find(|t| t.id == "fix").unwrap().provider, "claude");
        let tweet = merged.iter().find(|t| t.id == "tweet").unwrap();
        assert!(!tweet.builtin);
        assert!(!merged.iter().any(|t| t.id == "Bad Id"));
    }
}
