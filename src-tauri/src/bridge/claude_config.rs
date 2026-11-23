//! "Connect to Claude": adds (or removes) the Lens MCP server in Claude Desktop's
//! `claude_desktop_config.json`, and builds the `claude mcp add` line for Claude Code.
//!
//! The edit is surgical: Lens rewrites only the `mcpServers["lens-ui"]` member and leaves every
//! other byte of the user's file (order, spacing, other servers) as it was. The result is
//! re-parsed and compared with the original minus that one member; if anything else would
//! change, Lens refuses. The UI shows a diff first, the write needs the hash of the file the
//! user previewed (so a file changed in between isn't clobbered), and a timestamped backup is
//! kept next to the original.

use crate::media::sha256::sha256_hex;
use crate::win_mcp::{SERVER_NAME, STDIO_FLAG};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------------------------
// A minimal JSON span scanner (strings, escapes, nesting) — enough to locate object members.
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Member {
    key: String,
    key_start: usize,
    value_start: usize,
    value_end: usize,
}

fn skip_ws(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && matches!(b[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }
    i
}

fn skip_string(b: &[u8], mut i: usize) -> Result<usize, String> {
    // b[i] == '"'
    i += 1;
    while i < b.len() {
        match b[i] {
            b'\\' => i += 2,
            b'"' => return Ok(i + 1),
            _ => i += 1,
        }
    }
    Err("Unterminated string.".into())
}

fn skip_value(b: &[u8], i: usize) -> Result<usize, String> {
    let i = skip_ws(b, i);
    if i >= b.len() {
        return Err("Unexpected end of JSON.".into());
    }
    match b[i] {
        b'"' => skip_string(b, i),
        b'{' | b'[' => {
            let mut depth = 0i32;
            let mut j = i;
            while j < b.len() {
                match b[j] {
                    b'"' => {
                        j = skip_string(b, j)?;
                        continue;
                    }
                    b'{' | b'[' => depth += 1,
                    b'}' | b']' => {
                        depth -= 1;
                        if depth == 0 {
                            return Ok(j + 1);
                        }
                    }
                    _ => {}
                }
                j += 1;
            }
            Err("Unbalanced brackets.".into())
        }
        _ => {
            let mut j = i;
            while j < b.len() && !matches!(b[j], b',' | b'}' | b']' | b' ' | b'\t' | b'\n' | b'\r') {
                j += 1;
            }
            Ok(j)
        }
    }
}

/// Members of the object whose '{' is at `open`; returns (members, index of the closing '}').
fn members(text: &str, open: usize) -> Result<(Vec<Member>, usize), String> {
    let b = text.as_bytes();
    if b.get(open) != Some(&b'{') {
        return Err("Expected an object.".into());
    }
    let mut out = Vec::new();
    let mut i = skip_ws(b, open + 1);
    if b.get(i) == Some(&b'}') {
        return Ok((out, i));
    }
    loop {
        if b.get(i) != Some(&b'"') {
            return Err("Expected a key.".into());
        }
        let key_end = skip_string(b, i)?;
        let key: String = serde_json::from_str(&text[i..key_end]).map_err(|e| e.to_string())?;
        let colon = skip_ws(b, key_end);
        if b.get(colon) != Some(&b':') {
            return Err("Expected ':'.".into());
        }
        let value_start = skip_ws(b, colon + 1);
        let value_end = skip_value(b, value_start)?;
        out.push(Member { key, key_start: i, value_start, value_end });
        let next = skip_ws(b, value_end);
        match b.get(next) {
            Some(b',') => i = skip_ws(b, next + 1),
            Some(b'}') => return Ok((out, next)),
            _ => return Err("Expected ',' or '}'.".into()),
        }
    }
}

fn line_indent(text: &str, pos: usize) -> String {
    let line_start = text[..pos].rfind('\n').map(|p| p + 1).unwrap_or(0);
    text[line_start..].chars().take_while(|c| *c == ' ' || *c == '\t').collect()
}

fn render(value: &Value, indent: &str) -> String {
    let pretty = serde_json::to_string_pretty(value).unwrap_or_default();
    pretty.lines().enumerate().map(|(n, l)| if n == 0 { l.to_string() } else { format!("{}{}", indent, l) }).collect::<Vec<_>>().join("\n")
}

/// Inserts `"key": value` into the object spanning `open..=close`.
fn insert_member(text: &str, open: usize, close: usize, ms: &[Member], key: &str, value: &Value) -> String {
    let key_json = serde_json::to_string(key).unwrap_or_default();
    if let Some(last) = ms.last() {
        let indent = line_indent(text, ms[0].key_start);
        format!("{},\n{}{}: {}{}", &text[..last.value_end], indent, key_json, render(value, &indent), &text[last.value_end..])
    } else {
        let outer = line_indent(text, open);
        let indent = format!("{}  ", outer);
        format!("{}{{\n{}{}: {}\n{}}}{}", &text[..open], indent, key_json, render(value, &indent), outer, &text[close + 1..])
    }
}

fn remove_member(text: &str, open: usize, close: usize, ms: &[Member], idx: usize) -> String {
    if ms.len() == 1 {
        return format!("{}{{}}{}", &text[..open], &text[close + 1..]);
    }
    if idx + 1 < ms.len() {
        format!("{}{}", &text[..ms[idx].key_start], &text[ms[idx + 1].key_start..])
    } else {
        format!("{}{}", &text[..ms[idx - 1].value_end], &text[ms[idx].value_end..])
    }
}

pub fn lens_server_value(command: &str) -> Value {
    json!({ "command": command, "args": [STDIO_FLAG] })
}

/// The document with Lens's entry removed and an empty `mcpServers` dropped, so "added the
/// whole mcpServers block" and "removed the last server" both compare as unchanged.
fn without_lens(v: &Value) -> Value {
    let mut c = v.clone();
    if let Some(obj) = c.as_object_mut() {
        let empty = match obj.get_mut("mcpServers").and_then(Value::as_object_mut) {
            Some(s) => {
                s.remove(SERVER_NAME);
                s.is_empty()
            }
            None => false,
        };
        if empty {
            obj.remove("mcpServers");
        }
    }
    c
}

/// Returns the new file text, or None when nothing would change.
pub fn merge_lens_server(original: &str, command: &str) -> Result<Option<String>, String> {
    let desired = lens_server_value(command);
    let trimmed = original.trim_start_matches('\u{feff}');
    if trimmed.trim().is_empty() {
        let fresh = json!({ "mcpServers": { SERVER_NAME: desired } });
        return Ok(Some(format!("{}\n", serde_json::to_string_pretty(&fresh).unwrap_or_default())));
    }
    let parsed: Value = serde_json::from_str(trimmed).map_err(|_| "Claude's config isn't valid JSON, so Lens won't touch it. Fix or remove it first.".to_string())?;
    if !parsed.is_object() {
        return Err("Claude's config isn't a JSON object.".into());
    }
    if let Some(s) = parsed.get("mcpServers") {
        if !s.is_object() {
            return Err("\"mcpServers\" in Claude's config isn't an object.".into());
        }
        if s.get(SERVER_NAME) == Some(&desired) {
            return Ok(None);
        }
    }
    let bom = &original[..original.len() - trimmed.len()];
    let text = trimmed;
    let open = skip_ws(text.as_bytes(), 0);
    let (root, root_close) = members(text, open)?;
    let new_text = match root.iter().find(|m| m.key == "mcpServers") {
        None => insert_member(text, open, root_close, &root, "mcpServers", &json!({ SERVER_NAME: desired })),
        Some(m) => {
            let (srv, srv_close) = members(text, m.value_start)?;
            match srv.iter().find(|x| x.key == SERVER_NAME) {
                Some(x) => {
                    let indent = line_indent(text, x.key_start);
                    format!("{}{}{}", &text[..x.value_start], render(&desired, &indent), &text[x.value_end..])
                }
                None => insert_member(text, m.value_start, srv_close, &srv, SERVER_NAME, &desired),
            }
        }
    };
    // Verify: only lens-ui changed, and it now holds exactly the desired value.
    let after: Value = serde_json::from_str(&new_text).map_err(|_| "Lens's edit didn't produce valid JSON; nothing was written.".to_string())?;
    if without_lens(&after) != without_lens(&parsed) || after["mcpServers"][SERVER_NAME] != desired {
        return Err("Lens's edit would have changed more than its own entry; nothing was written.".into());
    }
    Ok(Some(format!("{}{}", bom, new_text)))
}

/// Returns the new text without Lens's entry, or None if it isn't there.
pub fn remove_lens_server(original: &str) -> Result<Option<String>, String> {
    let trimmed = original.trim_start_matches('\u{feff}');
    if trimmed.trim().is_empty() {
        return Ok(None);
    }
    let parsed: Value = serde_json::from_str(trimmed).map_err(|_| "Claude's config isn't valid JSON, so Lens won't touch it.".to_string())?;
    if parsed.get("mcpServers").and_then(|s| s.get(SERVER_NAME)).is_none() {
        return Ok(None);
    }
    let bom = &original[..original.len() - trimmed.len()];
    let open = skip_ws(trimmed.as_bytes(), 0);
    let (root, _) = members(trimmed, open)?;
    let m = root.iter().find(|m| m.key == "mcpServers").ok_or("mcpServers vanished")?;
    let (srv, srv_close) = members(trimmed, m.value_start)?;
    let idx = srv.iter().position(|x| x.key == SERVER_NAME).ok_or("lens-ui vanished")?;
    let new_text = remove_member(trimmed, m.value_start, srv_close, &srv, idx);
    let after: Value = serde_json::from_str(&new_text).map_err(|_| "Lens's edit didn't produce valid JSON; nothing was written.".to_string())?;
    if without_lens(&after) != without_lens(&parsed) || after.get("mcpServers").and_then(|s| s.get(SERVER_NAME)).is_some() {
        return Err("Removing Lens's entry would have changed more; nothing was written.".into());
    }
    Ok(Some(format!("{}{}", bom, new_text)))
}

// ---------------------------------------------------------------------------------------------
// Diff preview
// ---------------------------------------------------------------------------------------------

/// A unified-style line diff ("+ ", "- ", "  ") with 3 lines of context.
pub fn line_diff(a: &str, b: &str) -> String {
    let x: Vec<&str> = a.lines().collect();
    let y: Vec<&str> = b.lines().collect();
    if x.len() * y.len() > 4_000_000 {
        return format!("(file too large to diff: {} → {} lines)", x.len(), y.len());
    }
    let (n, m) = (x.len(), y.len());
    let mut lcs = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[i][j] = if x[i] == y[j] { lcs[i + 1][j + 1] + 1 } else { lcs[i + 1][j].max(lcs[i][j + 1]) };
        }
    }
    let mut ops: Vec<(char, &str)> = Vec::new();
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && x[i] == y[j] {
            ops.push((' ', x[i]));
            i += 1;
            j += 1;
        } else if j < m && (i == n || lcs[i][j + 1] >= lcs[i + 1][j]) {
            ops.push(('+', y[j]));
            j += 1;
        } else {
            ops.push(('-', x[i]));
            i += 1;
        }
    }
    let changed: Vec<usize> = ops.iter().enumerate().filter(|(_, o)| o.0 != ' ').map(|(k, _)| k).collect();
    if changed.is_empty() {
        return String::new();
    }
    let keep = |k: usize| changed.iter().any(|c| k + 3 >= *c && k <= c + 3);
    let mut out = Vec::new();
    let mut skipped = false;
    for (k, (op, line)) in ops.iter().enumerate() {
        if keep(k) {
            if skipped {
                out.push("  …".to_string());
                skipped = false;
            }
            out.push(format!("{} {}", op, line));
        } else {
            skipped = true;
        }
    }
    if skipped {
        out.push("  …".into());
    }
    out.join("\n")
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

/// Classic install: %APPDATA%\Claude. Store (MSIX) install: the package's redirected Roaming.
pub fn config_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        if let Ok(rd) = std::fs::read_dir(Path::new(&local).join("Packages")) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with("Claude_") || name.starts_with("AnthropicClaude") {
                    out.push(e.path().join("LocalCache").join("Roaming").join("Claude").join("claude_desktop_config.json"));
                }
            }
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        out.push(Path::new(&appdata).join("Claude").join("claude_desktop_config.json"));
    }
    out
}

pub fn pick_config_path(candidates: &[PathBuf], exists: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    candidates.iter().find(|p| exists(p)).cloned().or_else(|| candidates.first().cloned())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfigPreview {
    pub path: String,
    pub exists: bool,
    pub changed: bool,
    pub diff: String,
    /// SHA-256 of the file as previewed; pass it back to confirm.
    pub hash: String,
    pub applied: bool,
    pub backup_path: Option<String>,
    pub claude_code_command: String,
    pub message: String,
}

pub fn claude_code_command(exe: &str) -> String {
    format!("claude mcp add --scope user {} -- \"{}\" {}", SERVER_NAME, exe.trim_matches('"'), STDIO_FLAG)
}

/// `install = true` adds/updates the entry; false removes it. With `confirm_hash = None` this
/// only previews. With the previewed hash it backs up and writes.
pub fn run(install: bool, exe: &str, confirm_hash: Option<&str>) -> Result<ClaudeConfigPreview, String> {
    let path = pick_config_path(&config_candidates(), &|p: &Path| p.is_file()).ok_or("Couldn't locate Claude Desktop's settings folder.")?;
    let exists = path.is_file();
    let original = if exists { std::fs::read_to_string(&path).map_err(|e| e.to_string())? } else { String::new() };
    let hash = sha256_hex(original.as_bytes());
    let next = if install { merge_lens_server(&original, exe)? } else { remove_lens_server(&original)? };
    let mut p = ClaudeConfigPreview {
        path: path.to_string_lossy().into_owned(),
        exists,
        changed: next.is_some(),
        diff: next.as_deref().map(|n| line_diff(&original, n)).unwrap_or_default(),
        hash: hash.clone(),
        applied: false,
        backup_path: None,
        claude_code_command: claude_code_command(exe),
        message: match (&next, install) {
            (None, true) => "Lens is already connected to Claude Desktop.".into(),
            (None, false) => "Lens isn't in Claude Desktop's config.".into(),
            (Some(_), true) => "Review the change, then confirm. Restart Claude Desktop afterwards.".into(),
            (Some(_), false) => "Review the removal, then confirm. Restart Claude Desktop afterwards.".into(),
        },
    };
    let (Some(want), Some(new_text)) = (confirm_hash, next) else {
        return Ok(p);
    };
    if want != hash {
        return Err("Claude's config changed since you previewed it. Preview again.".into());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    if exists {
        let backup = path.with_file_name(format!("claude_desktop_config.json.lens-backup-{}", crate::media::now_ms()));
        std::fs::copy(&path, &backup).map_err(|e| format!("Couldn't back up Claude's config: {}", e))?;
        p.backup_path = Some(backup.to_string_lossy().into_owned());
    }
    let tmp = path.with_extension("json.lens-tmp");
    std::fs::write(&tmp, &new_text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    p.applied = true;
    p.message = if install { "Connected. Restart Claude Desktop to load Lens's tools.".into() } else { "Removed. Restart Claude Desktop.".into() };
    Ok(p)
}

/// Removes Lens's `lens-ui` entry from one Claude Desktop config file, keeping a backup next to it.
/// Returns the backup path when something was removed, `None` when Lens wasn't in that file.
pub fn remove_lens_from(path: &Path) -> Result<Option<PathBuf>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let original = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let Some(new_text) = remove_lens_server(&original)? else {
        return Ok(None);
    };
    let backup = path.with_file_name(format!("claude_desktop_config.json.lens-backup-{}", crate::media::now_ms()));
    std::fs::copy(path, &backup).map_err(|e| format!("Couldn't back up Claude's config: {}", e))?;
    let tmp = path.with_extension("json.lens-tmp");
    std::fs::write(&tmp, &new_text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(Some(backup))
}

/// "Remove all Lens changes": take Lens out of every Claude Desktop config it may be in (classic
/// and Store installs). Otherwise Claude Desktop keeps launching a Lens that may no longer exist.
pub fn remove_for_uninstall() -> Result<String, String> {
    let mut removed = 0usize;
    let mut errors = Vec::new();
    for path in config_candidates() {
        match remove_lens_from(&path) {
            Ok(Some(_)) => removed += 1,
            Ok(None) => {}
            Err(e) => errors.push(e),
        }
    }
    if !errors.is_empty() {
        return Err(errors.join("; "));
    }
    Ok(if removed == 0 {
        "Lens wasn't connected to Claude Desktop.".into()
    } else {
        "Removed Lens from Claude Desktop's config (a backup sits next to it). Restart Claude Desktop.".into()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = "C:\\Program Files\\Lens UI\\lens-ui.exe";

    #[test]
    fn creates_a_fresh_config() {
        let out = merge_lens_server("", EXE).unwrap().unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["mcpServers"]["lens-ui"]["command"], EXE);
        assert_eq!(v["mcpServers"]["lens-ui"]["args"][0], "--mcp-stdio");
    }

    #[test]
    fn preserves_other_servers_order_and_formatting() {
        let original = "{\n    \"zeta\": 1,\n    \"mcpServers\": {\n        \"filesystem\": { \"command\": \"npx\", \"args\": [\"-y\", \"@x/fs\"] },\n        \"git\": {\"command\":\"uvx\"}\n    },\n    \"alpha\": true\n}\n";
        let out = merge_lens_server(original, EXE).unwrap().unwrap();
        // Untouched bytes before the insertion point are identical.
        let cut = original.find("\"git\": {\"command\":\"uvx\"}").unwrap() + "\"git\": {\"command\":\"uvx\"}".len();
        assert_eq!(&out[..cut], &original[..cut]);
        assert!(out.ends_with("    },\n    \"alpha\": true\n}\n"));
        assert!(out.contains("\n        \"lens-ui\": {\n          \"args\": [\n            \"--mcp-stdio\"\n          ],\n          \"command\""));
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["mcpServers"]["filesystem"]["args"][1], "@x/fs");
        assert_eq!(v["zeta"], 1);
    }

    #[test]
    fn idempotent_and_updates_in_place() {
        let once = merge_lens_server("{\"mcpServers\":{}}", EXE).unwrap().unwrap();
        assert!(merge_lens_server(&once, EXE).unwrap().is_none(), "second run changes nothing");
        let moved = merge_lens_server(&once, "D:\\Lens\\lens-ui.exe").unwrap().unwrap();
        let v: Value = serde_json::from_str(&moved).unwrap();
        assert_eq!(v["mcpServers"]["lens-ui"]["command"], "D:\\Lens\\lens-ui.exe");
        assert_eq!(v["mcpServers"].as_object().unwrap().len(), 1);
    }

    #[test]
    fn adds_mcp_servers_when_missing_and_handles_bom() {
        let out = merge_lens_server("\u{feff}{\"globalShortcut\": \"Ctrl+Space\"}", EXE).unwrap().unwrap();
        assert!(out.starts_with('\u{feff}'));
        let v: Value = serde_json::from_str(out.trim_start_matches('\u{feff}')).unwrap();
        assert_eq!(v["globalShortcut"], "Ctrl+Space");
        assert!(v["mcpServers"]["lens-ui"].is_object());
        let empty = merge_lens_server("{}", EXE).unwrap().unwrap();
        assert!(serde_json::from_str::<Value>(&empty).is_ok());
    }

    #[test]
    fn refuses_broken_or_odd_files() {
        assert!(merge_lens_server("{not json", EXE).is_err());
        assert!(merge_lens_server("[1,2]", EXE).is_err());
        assert!(merge_lens_server("{\"mcpServers\": []}", EXE).is_err());
        assert!(remove_lens_server("{oops").is_err());
    }

    #[test]
    fn strings_with_braces_and_escapes_dont_confuse_the_scanner() {
        let original = r#"{"note":"a } tricky \" { value","mcpServers":{"x":{"command":"c:\\a}b","args":["{"]}}}"#;
        let out = merge_lens_server(original, EXE).unwrap().unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["note"], "a } tricky \" { value");
        assert_eq!(v["mcpServers"]["x"]["args"][0], "{");
    }

    #[test]
    fn removal_round_trips() {
        let base = "{\n  \"mcpServers\": {\n    \"git\": {\"command\": \"uvx\"}\n  }\n}\n";
        let with = merge_lens_server(base, EXE).unwrap().unwrap();
        let back = remove_lens_server(&with).unwrap().unwrap();
        assert_eq!(back, base);
        assert!(remove_lens_server(base).unwrap().is_none());
        // Only member / first member cases.
        let only = merge_lens_server("{\"mcpServers\":{}}", EXE).unwrap().unwrap();
        let v: Value = serde_json::from_str(&remove_lens_server(&only).unwrap().unwrap()).unwrap();
        assert_eq!(v["mcpServers"], json!({}));
        let first = format!("{{\"mcpServers\":{{\"lens-ui\":{},\"b\":2}}}}", lens_server_value(EXE));
        let v: Value = serde_json::from_str(&remove_lens_server(&first).unwrap().unwrap()).unwrap();
        assert_eq!(v["mcpServers"], json!({"b": 2}));
    }

    #[test]
    fn diff_shows_only_the_change() {
        let a = "{\n  \"a\": 1,\n  \"b\": 2\n}";
        let b = "{\n  \"a\": 1,\n  \"b\": 2,\n  \"c\": 3\n}";
        let d = line_diff(a, b);
        assert!(d.contains("-   \"b\": 2"));
        assert!(d.contains("+   \"b\": 2,"));
        assert!(d.contains("+   \"c\": 3"));
        assert_eq!(line_diff(a, a), "");
    }

    #[test]
    fn claude_code_line_and_path_choice() {
        assert_eq!(claude_code_command(EXE), format!("claude mcp add --scope user lens-ui -- \"{}\" --mcp-stdio", EXE));
        let c = vec![PathBuf::from("/msix/c.json"), PathBuf::from("/roaming/c.json")];
        assert_eq!(pick_config_path(&c, &|p: &Path| p.ends_with("roaming/c.json")), Some(PathBuf::from("/roaming/c.json")));
        assert_eq!(pick_config_path(&c, &|_| false), Some(PathBuf::from("/msix/c.json")));
    }

    #[test]
    fn remove_lens_from_file_keeps_other_servers_and_backs_up() {
        let dir = std::env::temp_dir().join(format!("lens-claude-cfg-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("claude_desktop_config.json");
        let installed = merge_lens_server("{\n  \"mcpServers\": {\n    \"git\": {\"command\": \"uvx\"}\n  }\n}\n", EXE).unwrap().unwrap();
        std::fs::write(&path, &installed).unwrap();

        let backup = remove_lens_from(&path).unwrap().expect("Lens was in the file");
        let after: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(after["mcpServers"].get(SERVER_NAME).is_none());
        assert_eq!(after["mcpServers"]["git"]["command"], "uvx");
        assert_eq!(std::fs::read_to_string(&backup).unwrap(), installed);
        // Second run: nothing to do, nothing written.
        assert_eq!(remove_lens_from(&path).unwrap(), None);
        // Missing file: nothing to do.
        assert_eq!(remove_lens_from(&dir.join("nope.json")).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
