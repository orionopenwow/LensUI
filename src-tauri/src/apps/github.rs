//! GitHub-release fallback, the pure parts: which release asset to download, which checksum file
//! belongs to it, and which hosts a download may come from. Standard library only.
//!
//! Used only for catalogue apps that aren't in winget. Lens downloads over HTTPS from github.com's
//! own release hosts (never mirrors), verifies the SHA-256 against the project's published checksum
//! file when one exists, checks the Authenticode signature, and only then shows a second
//! confirmation with the publisher and signature status before running the installer.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    pub name: String,
    pub url: String,
    pub size: u64,
}

/// Hosts a release download may be served from. GitHub redirects asset downloads to its object
/// storage, so those hosts are allowed for the redirect target only.
pub const ALLOWED_HOSTS: &[&str] = &[
    "github.com",
    "api.github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "github-releases.githubusercontent.com",
];

/// `https://<allowed host>/…` only. No credentials, no ports, no other schemes.
pub fn is_allowed_download_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host_port = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host_port.contains('@') || host_port.contains(':') {
        return false;
    }
    let host = host_port.to_ascii_lowercase();
    ALLOWED_HOSTS.contains(&host.as_str())
}

/// `owner/repo` with GitHub's allowed characters.
pub fn is_valid_repo(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let (Some(owner), Some(name), None) = (parts.next(), parts.next(), parts.next()) else { return false };
    let ok = |s: &str| {
        !s.is_empty() && s.len() <= 100 && s != "." && s != ".." && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    };
    ok(owner) && ok(name)
}

/// `https://api.github.com/repos/<repo>/releases/latest`.
pub fn latest_release_api(repo: &str) -> Option<String> {
    is_valid_repo(repo).then(|| format!("https://api.github.com/repos/{repo}/releases/latest"))
}

/// Picks the Windows installer for this machine from a release's assets.
///
/// Preference: an asset whose name contains every `must_contain` hint (case-insensitive) → `.msi` →
/// `-setup.exe`/`setup` `.exe` → any `.exe` → `.msix`/`.appx`. Architecture: prefer `x64`/`amd64`/
/// `x86_64`, accept arch-less names, and skip `arm64`/`aarch64` unless `arm64` is true (and vice
/// versa). Source archives, debug symbols, checksums and signatures are never picked.
pub fn pick_windows_asset<'a>(assets: &'a [Asset], must_contain: &[&str], arm64: bool) -> Option<&'a Asset> {
    let score = |a: &Asset| -> Option<i32> {
        let n = a.name.to_ascii_lowercase();
        let ext_score = if n.ends_with(".msi") {
            40
        } else if n.ends_with(".exe") {
            if n.contains("setup") || n.contains("installer") { 35 } else { 20 }
        } else if n.ends_with(".msix") || n.ends_with(".msixbundle") || n.ends_with(".appx") {
            15
        } else {
            return None;
        };
        if ["sha256", ".sig", ".asc", ".pdb", "debug", "symbols", "source", "src."].iter().any(|bad| n.contains(bad)) {
            return None;
        }
        let is_arm = n.contains("arm64") || n.contains("aarch64");
        let is_x64 = n.contains("x64") || n.contains("amd64") || n.contains("x86_64") || n.contains("win64");
        let is_x86_only = (n.contains("x86") || n.contains("win32") || n.contains("i686")) && !is_x64;
        let arch_score = match (arm64, is_arm, is_x64) {
            (false, true, _) => return None,
            (true, false, true) => return None,
            (true, true, _) => 30,
            (false, false, true) => 30,
            _ if is_x86_only => 5,
            _ => 15,
        };
        // Platform: drop obvious non-Windows assets.
        if [".dmg", ".appimage", ".deb", ".rpm", "darwin", "macos", "linux"].iter().any(|bad| n.contains(bad)) {
            return None;
        }
        let hint_score = if must_contain.iter().all(|h| n.contains(&h.to_ascii_lowercase())) { 100 } else { 0 };
        Some(hint_score + ext_score + arch_score)
    };
    assets
        .iter()
        .filter(|a| is_allowed_download_url(&a.url))
        .filter_map(|a| score(a).map(|s| (s, a)))
        .max_by(|(sa, a), (sb, b)| sa.cmp(sb).then_with(|| b.name.cmp(&a.name)))
        .map(|(_, a)| a)
}

/// Finds the checksum asset for `installer`: `<installer>.sha256`, then a shared
/// `SHA256SUMS`/`checksums.txt`/`*.sha256sum` file.
pub fn pick_checksum_asset<'a>(assets: &'a [Asset], installer: &Asset) -> Option<&'a Asset> {
    let inst = installer.name.to_ascii_lowercase();
    let direct = [format!("{inst}.sha256"), format!("{inst}.sha256sum"), format!("{inst}.sha256.txt")];
    if let Some(a) = assets.iter().find(|a| direct.contains(&a.name.to_ascii_lowercase())) {
        return Some(a);
    }
    assets.iter().find(|a| {
        let n = a.name.to_ascii_lowercase();
        n == "sha256sums" || n == "sha256sums.txt" || n == "checksums.txt" || n == "checksums.sha256" || n.ends_with("_sha256sums.txt") || n.ends_with("-checksums.txt")
    })
}

/// A file name Lens will write into its temp download folder: the asset name with anything other
/// than `[A-Za-z0-9._-]` replaced, never starting with `.`, at most 120 chars.
pub fn safe_file_name(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
        .collect();
    while s.starts_with('.') {
        s.remove(0);
    }
    if s.is_empty() {
        s = "download".into();
    }
    s.truncate(120);
    s
}

/// Authenticode result shown in the second confirmation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignatureInfo {
    /// `Valid`, `NotSigned`, `HashMismatch`, `NotTrusted`, `UnknownError` (PowerShell's status names).
    pub status: String,
    /// Signer certificate subject, e.g. `CN=Example Ltd, O=Example Ltd, C=GB`.
    pub subject: String,
}

/// Parses the JSON printed by
/// `Get-AuthenticodeSignature … | Select Status,@{n='Subject';e={$_.SignerCertificate.Subject}} | ConvertTo-Json -Compress`.
/// PowerShell prints `Status` as a number (enum) or a name depending on version; both are handled.
pub fn parse_signature_json(json: &str) -> SignatureInfo {
    let field = |key: &str| -> Option<String> {
        let k = format!("\"{key}\":");
        let start = json.find(&k)? + k.len();
        let rest = json[start..].trim_start();
        if let Some(r) = rest.strip_prefix('"') {
            let end = r.find('"')?;
            Some(r[..end].to_string())
        } else {
            let end = rest.find([',', '}']).unwrap_or(rest.len());
            Some(rest[..end].trim().to_string())
        }
    };
    let status = match field("Status").as_deref() {
        Some("0") | Some("Valid") => "Valid",
        Some("1") | Some("UnknownError") => "UnknownError",
        Some("2") | Some("NotSigned") => "NotSigned",
        Some("3") | Some("HashMismatch") => "HashMismatch",
        Some("4") | Some("NotTrusted") => "NotTrusted",
        Some("5") | Some("NotSupportedFileFormat") => "NotSupportedFileFormat",
        Some("6") | Some("Incompatible") => "Incompatible",
        _ => "UnknownError",
    }
    .to_string();
    let subject = field("Subject").filter(|s| s != "null").unwrap_or_default();
    SignatureInfo { status, subject }
}

/// The publisher's display name from a certificate subject (`CN=` value), for the confirmation.
pub fn subject_common_name(subject: &str) -> Option<String> {
    subject
        .split(',')
        .map(str::trim)
        .find_map(|p| p.strip_prefix("CN="))
        .map(|s| s.trim_matches('"').to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a(name: &str) -> Asset {
        Asset { name: name.into(), url: format!("https://github.com/o/r/releases/download/v1/{name}"), size: 1 }
    }

    #[test]
    fn urls_and_repos() {
        assert!(is_allowed_download_url("https://github.com/jub0t/Concat/releases/download/v0.2.8/x.msi"));
        assert!(is_allowed_download_url("https://objects.githubusercontent.com/abc"));
        for bad in [
            "http://github.com/x", "https://github.com.evil.io/x", "https://evil.io/github.com",
            "https://user@github.com/x", "https://github.com:444/x", "ftp://github.com/x", "https://raw.githubusercontent.com/x",
        ] {
            assert!(!is_allowed_download_url(bad), "{bad}");
        }
        assert!(is_valid_repo("jub0t/Concat") && is_valid_repo("storytold/craft-launcher") && is_valid_repo("ggml-org/whisper.cpp"));
        for bad in ["jub0t", "a/b/c", "../x", "a/..", "a b/c", "a/b?x", ""] {
            assert!(!is_valid_repo(bad), "{bad}");
        }
        assert_eq!(latest_release_api("jub0t/Concat").unwrap(), "https://api.github.com/repos/jub0t/Concat/releases/latest");
    }

    #[test]
    fn asset_picking() {
        let assets = vec![
            a("Concat_0.2.8_aarch64.dmg"),
            a("Concat_0.2.8_amd64.AppImage"),
            a("Concat_0.2.8_amd64.deb"),
            a("Concat_0.2.8_x64-setup.exe"),
            a("Concat_0.2.8_x64_en-US.msi"),
            a("Concat_0.2.8_arm64_en-US.msi"),
            a("Concat_0.2.8_x64_en-US.msi.sha256"),
            a("Source code.zip"),
        ];
        assert_eq!(pick_windows_asset(&assets, &[], false).unwrap().name, "Concat_0.2.8_x64_en-US.msi");
        assert_eq!(pick_windows_asset(&assets, &[], true).unwrap().name, "Concat_0.2.8_arm64_en-US.msi");
        assert_eq!(pick_windows_asset(&assets, &["setup"], false).unwrap().name, "Concat_0.2.8_x64-setup.exe");
        let checksum = pick_checksum_asset(&assets, pick_windows_asset(&assets, &[], false).unwrap()).unwrap();
        assert_eq!(checksum.name, "Concat_0.2.8_x64_en-US.msi.sha256");

        let only_mac = vec![a("x.dmg"), a("x.AppImage")];
        assert!(pick_windows_asset(&only_mac, &[], false).is_none());

        let shared = vec![a("degenview-windows-x64-installer.exe"), a("degenview-windows-x64.zip"), a("SHA256SUMS")];
        let inst = pick_windows_asset(&shared, &[], false).unwrap();
        assert_eq!(inst.name, "degenview-windows-x64-installer.exe");
        assert_eq!(pick_checksum_asset(&shared, inst).unwrap().name, "SHA256SUMS");

        let mut off_host = a("evil-setup.exe");
        off_host.url = "https://evil.example/evil-setup.exe".into();
        assert!(pick_windows_asset(&[off_host], &[], false).is_none());
    }

    #[test]
    fn file_names() {
        assert_eq!(safe_file_name("Concat_0.2.8_x64-setup.exe"), "Concat_0.2.8_x64-setup.exe");
        assert_eq!(safe_file_name("../../evil.exe"), "_.._evil.exe".trim_start_matches('.'));
        assert_eq!(safe_file_name("..\\x y.msi"), "_x_y.msi");
        assert_eq!(safe_file_name(""), "download");
        assert!(!safe_file_name("...hidden").starts_with('.'));
    }

    #[test]
    fn signature_json() {
        let s = parse_signature_json(r#"{"Status":0,"Subject":"CN=Ollama Inc., O=Ollama Inc., L=Palo Alto, S=California, C=US"}"#);
        assert_eq!(s.status, "Valid");
        assert_eq!(subject_common_name(&s.subject).as_deref(), Some("Ollama Inc."));
        let s = parse_signature_json(r#"{"Status":"NotSigned","Subject":null}"#);
        assert_eq!(s.status, "NotSigned");
        assert_eq!(s.subject, "");
        assert_eq!(parse_signature_json("garbage").status, "UnknownError");
        assert_eq!(subject_common_name("O=x"), None);
    }
}
