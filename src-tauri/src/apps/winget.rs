//! winget argument building and output parsing, standard library only.
//!
//! Lens never runs winget through a shell. `build_args` returns a fixed argument vector for one of
//! five allowed operations, and the package id must match `[A-Za-z0-9._-]+` (no leading `-`, no
//! `..`), so nothing a catalogue entry or a voice command says can smuggle in a flag or a command.
//! Every operation pins `--exact --source winget`, so only the community repository's reviewed
//! manifests (with their SHA-256 installer hashes) are used.

/// The only winget operations Lens performs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WingetOp {
    /// `winget show`: metadata and the agreements the user must see before installing.
    Show,
    Install,
    Upgrade,
    Uninstall,
    /// `winget list --id`: is it installed, and which version.
    List,
}

impl WingetOp {
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "show" => Self::Show,
            "install" => Self::Install,
            "upgrade" => Self::Upgrade,
            "uninstall" => Self::Uninstall,
            "list" => Self::List,
            _ => return None,
        })
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Show => "show",
            Self::Install => "install",
            Self::Upgrade => "upgrade",
            Self::Uninstall => "uninstall",
            Self::List => "list",
        }
    }
    /// Operations that change the machine. The UI must have shown a confirmation first.
    pub fn changes_system(self) -> bool {
        matches!(self, Self::Install | Self::Upgrade | Self::Uninstall)
    }
}

/// Valid winget package identifier: 1–128 chars of `[A-Za-z0-9._-]`, not starting with `-` or `.`,
/// no `..`, and at least one `.` (winget ids are `Publisher.Package`).
pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
        && !id.starts_with('-')
        && !id.starts_with('.')
        && !id.ends_with('.')
        && !id.contains("..")
        && id.contains('.')
}

/// Builds the exact argument vector for `op` on `id`. Returns an error for an invalid id.
pub fn build_args(op: WingetOp, id: &str) -> Result<Vec<String>, String> {
    if !is_valid_id(id) {
        return Err(format!("not a valid winget package id: {id:?}"));
    }
    let mut a: Vec<&str> = vec![op.as_str(), "--id", id, "--exact", "--source", "winget"];
    match op {
        WingetOp::Show | WingetOp::List => a.push("--accept-source-agreements"),
        // The UI shows the package agreements (from `show`) and the user clicks Install before this
        // runs, so accepting them here records that consent rather than replacing it.
        WingetOp::Install | WingetOp::Upgrade => {
            a.extend(["--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"])
        }
        WingetOp::Uninstall => a.extend(["--accept-source-agreements", "--disable-interactivity"]),
    }
    Ok(a.into_iter().map(String::from).collect())
}

/// `winget list` for every winget-sourced package (one call to learn what's installed).
pub fn list_all_args() -> Vec<String> {
    ["list", "--source", "winget", "--accept-source-agreements", "--disable-interactivity"].map(String::from).to_vec()
}

/// Splits `buf` into the longest valid UTF-8 prefix (decoded) and the incomplete tail bytes that
/// must wait for the next read. winget's progress bars use 3-byte characters (`█`, `▒`), and a pipe
/// read can end in the middle of one. Invalid sequences that aren't just a truncated tail are
/// replaced rather than held back.
pub fn split_utf8(buf: &[u8]) -> (String, Vec<u8>) {
    match std::str::from_utf8(buf) {
        Ok(s) => (s.to_string(), Vec::new()),
        Err(e) => {
            let valid = e.valid_up_to();
            match e.error_len() {
                // Truncated sequence at the end: keep it for later.
                None => (String::from_utf8_lossy(&buf[..valid]).into_owned(), buf[valid..].to_vec()),
                // A real invalid byte: replace it and keep going.
                Some(bad) => {
                    let mut s = String::from_utf8_lossy(&buf[..valid + bad]).into_owned();
                    let (rest, tail) = split_utf8(&buf[valid + bad..]);
                    s.push_str(&rest);
                    (s, tail)
                }
            }
        }
    }
}

/// What `winget show` tells us before an install.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ShowInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub publisher_url: String,
    pub license: String,
    pub license_url: String,
    pub homepage: String,
    pub description: String,
    /// `(label, text-or-url)` pairs from the manifest's Agreements block.
    pub agreements: Vec<(String, String)>,
    pub installer_type: String,
    pub installer_url: String,
    pub installer_sha256: String,
}

/// Parses `winget show` output. The format is `Key: value` lines, with nested blocks indented under
/// `Agreements:` and `Installer:`. Unknown keys are ignored.
pub fn parse_show(output: &str) -> Option<ShowInfo> {
    let mut info = ShowInfo::default();
    let mut section = "";
    let mut last_agreement: Option<usize> = None;
    for raw in output.lines() {
        let line = raw.trim_end_matches('\r');
        if let Some(rest) = line.strip_prefix("Found ") {
            // `Found Ollama [Ollama.Ollama]`
            if let (Some(open), Some(close)) = (rest.rfind('['), rest.rfind(']')) {
                if open < close {
                    info.name = rest[..open].trim().to_string();
                    info.id = rest[open + 1..close].to_string();
                }
            }
            continue;
        }
        if line.trim().is_empty() {
            continue;
        }
        let indented = line.starts_with(' ') || line.starts_with('\t');
        let trimmed = line.trim();
        let (key, value) = match trimmed.split_once(':') {
            Some((k, v)) => (k.trim(), v.trim()),
            None => {
                // Continuation of a multi-line agreement text.
                if section == "agreements" {
                    if let Some(i) = last_agreement {
                        let t = &mut info.agreements[i].1;
                        if !t.is_empty() {
                            t.push(' ');
                        }
                        t.push_str(trimmed);
                    }
                }
                continue;
            }
        };
        // Values like `https://…` contain a ':' after the scheme; split_once only splits at the first.
        if !indented {
            section = match key {
                "Agreements" => "agreements",
                "Installer" => "installer",
                _ => "",
            };
            match key {
                "Version" => info.version = value.to_string(),
                "Publisher" => info.publisher = value.to_string(),
                "Publisher Url" => info.publisher_url = value.to_string(),
                "License" => info.license = value.to_string(),
                "License Url" => info.license_url = value.to_string(),
                "Homepage" => info.homepage = value.to_string(),
                "Description" | "Short Description" if info.description.is_empty() => {
                    info.description = value.to_string()
                }
                _ => {}
            }
            continue;
        }
        match section {
            "agreements" => {
                info.agreements.push((key.to_string(), value.to_string()));
                last_agreement = Some(info.agreements.len() - 1);
            }
            "installer" => match key {
                "Installer Type" | "Type" => info.installer_type = value.to_string(),
                "Installer Url" | "Download Url" => info.installer_url = value.to_string(),
                "Installer SHA256" | "SHA256" => info.installer_sha256 = value.to_ascii_lowercase(),
                _ => {}
            },
            _ => {}
        }
    }
    if info.id.is_empty() && info.version.is_empty() {
        None
    } else {
        Some(info)
    }
}

/// From `winget list --id <id> --exact` output, the installed version of `id`, if any.
/// The output is a table: `Name  Id  Version  [Available]  Source`.
pub fn parse_list_version(output: &str, id: &str) -> Option<(String, Option<String>)> {
    for raw in output.lines() {
        let line = raw.trim_end_matches('\r');
        // winget draws progress spinners with \r on the same line; keep only the last segment.
        let line = line.rsplit('\r').next().unwrap_or(line);
        let cols: Vec<&str> = line.split_whitespace().collect();
        let Some(pos) = cols.iter().position(|c| c.eq_ignore_ascii_case(id)) else { continue };
        let version = cols.get(pos + 1)?.to_string();
        // An "Available" column only appears when an upgrade exists; the last column is the source.
        let available = match cols.get(pos + 2) {
            Some(v) if cols.len() > pos + 3 && looks_like_version(v) => Some(v.to_string()),
            _ => None,
        };
        return Some((version, available));
    }
    None
}

fn looks_like_version(s: &str) -> bool {
    s.chars().next().is_some_and(|c| c.is_ascii_digit()) && s.chars().all(|c| c.is_ascii_alphanumeric() || ".-+_".contains(c))
}

/// winget's own "not installed / not found" outcomes, recognised in output text.
pub fn is_not_found(output: &str) -> bool {
    let o = output.to_ascii_lowercase();
    o.contains("no package found matching input criteria") || o.contains("no installed package found matching")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids() {
        for ok in ["Ollama.Ollama", "KDE.Krita", "ToEverything.AFFiNE", "Microsoft.VisualStudioCode.Insiders", "a_b.c-d"] {
            assert!(is_valid_id(ok), "{ok}");
        }
        for bad in [
            "", "Ollama", "-Ollama.Ollama", "--override.x", ".a.b", "a..b", "a.b.", "a b.c", "a.b;calc",
            "a.b&&calc", "a.b|x", "a.b\"", "a.b'", "a.b`", "a/b.c", "a\\b.c", "a.b\n--force", "Ünï.code",
        ] {
            assert!(!is_valid_id(bad), "{bad:?}");
        }
        assert!(!is_valid_id(&"a.".repeat(70)));
    }

    #[test]
    fn args_are_fixed_and_pinned() {
        let a = build_args(WingetOp::Install, "Ollama.Ollama").unwrap();
        assert_eq!(
            a,
            [
                "install", "--id", "Ollama.Ollama", "--exact", "--source", "winget",
                "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"
            ]
        );
        for op in [WingetOp::Show, WingetOp::Install, WingetOp::Upgrade, WingetOp::Uninstall, WingetOp::List] {
            let a = build_args(op, "KDE.Krita").unwrap();
            assert_eq!(a[0], op.as_str());
            assert!(a.windows(2).any(|w| w == ["--source", "winget"]));
            assert!(a.contains(&"--exact".to_string()));
            assert!(!a.iter().any(|x| x == "--override" || x == "--location" || x == "--force" || x == "--silent"));
            let values: Vec<&String> = a.iter().filter(|x| !x.starts_with("--")).collect();
            assert_eq!(values, [&op.as_str().to_string(), &"KDE.Krita".to_string(), &"winget".to_string()], "only op, id and source");
        }
        assert!(build_args(WingetOp::Install, "x.y --override /S").is_err());
        assert!(build_args(WingetOp::Uninstall, "--all.x").is_err());
        assert!(WingetOp::Install.changes_system() && !WingetOp::Show.changes_system());
        assert_eq!(WingetOp::parse("upgrade"), Some(WingetOp::Upgrade));
        assert_eq!(WingetOp::parse("import"), None);
    }

    const SHOW: &str = "Found Ollama [Ollama.Ollama]\r
Version: 0.40.16\r
Publisher: Ollama\r
Publisher Url: https://ollama.com\r
Author: Ollama\r
Moniker: ollama\r
Description: Get up and running with large language models locally.\r
Homepage: https://ollama.com\r
License: MIT\r
License Url: https://github.com/ollama/ollama/blob/main/LICENSE\r
Agreements:\r
  Terms of Service: https://ollama.com/terms\r
  Privacy: You agree that the\r
    installer may check for updates.\r
Installer:\r
  Installer Type: inno\r
  Installer Url: https://github.com/ollama/ollama/releases/download/v0.40.16/OllamaSetup.exe\r
  Installer SHA256: 3F0A0B0C0D0E0F101112131415161718191A1B1C1D1E1F202122232425262728\r
  Release Date: 2026-11-10\r
";

    #[test]
    fn show_parsing() {
        let s = parse_show(SHOW).unwrap();
        assert_eq!(s.id, "Ollama.Ollama");
        assert_eq!(s.name, "Ollama");
        assert_eq!(s.version, "0.40.16");
        assert_eq!(s.publisher, "Ollama");
        assert_eq!(s.license, "MIT");
        assert_eq!(s.license_url, "https://github.com/ollama/ollama/blob/main/LICENSE");
        assert_eq!(s.homepage, "https://ollama.com");
        assert_eq!(s.agreements.len(), 2);
        assert_eq!(s.agreements[0], ("Terms of Service".into(), "https://ollama.com/terms".into()));
        assert_eq!(s.agreements[1].1, "You agree that the installer may check for updates.");
        assert_eq!(s.installer_type, "inno");
        assert!(s.installer_url.ends_with("OllamaSetup.exe"));
        assert_eq!(s.installer_sha256, "3f0a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728");
        assert!(parse_show("No package found matching input criteria.").is_none());
    }

    #[test]
    fn utf8_carry() {
        let bar = "  ███▒▒ 45%".as_bytes();
        for cut in 0..bar.len() {
            let (a, tail) = split_utf8(&bar[..cut]);
            let mut rest = tail.clone();
            rest.extend_from_slice(&bar[cut..]);
            let (b, tail2) = split_utf8(&rest);
            assert!(tail2.is_empty());
            assert_eq!(format!("{a}{b}"), "  ███▒▒ 45%", "cut {cut}");
        }
        let (s, t) = split_utf8(&[b'a', 0xff, b'b']);
        assert_eq!((s.as_str(), t.len()), ("a\u{fffd}b", 0));
        assert_eq!(list_all_args()[0], "list");
        assert!(list_all_args().windows(2).any(|w| w == ["--source", "winget"]));
    }

    #[test]
    fn list_parsing() {
        let out = "\r   - \r   \\ \rName     Id             Version  Available Source\r
-----------------------------------------------------\r
Ollama   Ollama.Ollama  0.40.10  0.40.16   winget\r
";
        assert_eq!(parse_list_version(out, "Ollama.Ollama"), Some(("0.40.10".into(), Some("0.40.16".into()))));
        let up_to_date = "Name   Id         Version Source\n---\nKrita  KDE.Krita  5.3.4.1 winget\n";
        assert_eq!(parse_list_version(up_to_date, "KDE.Krita"), Some(("5.3.4.1".into(), None)));
        assert_eq!(parse_list_version(up_to_date, "Ollama.Ollama"), None);
        assert!(is_not_found("No installed package found matching input criteria."));
        assert!(!is_not_found(up_to_date));
    }
}
