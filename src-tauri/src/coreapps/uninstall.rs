//! Lens Startup & Uninstall: installed programs from the registry's Uninstall keys, and the
//! checks that make sure Lens only ever runs an app's *own* uninstaller.
//!
//! Lens never deletes program files itself. It runs the uninstaller the app registered
//! (`UninstallString`: MSI or the app's own exe) or `winget uninstall`, after a confirm, and
//! afterwards offers leftover folders for review; those go to the Recycle Bin, never deleted.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstalledProgram {
    /// "HKLM\…\Uninstall\<key>" style id, stable between scans.
    pub key: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub install_location: String,
    /// EstimatedSize, in KB, as the installer reported it.
    pub size_kb: Option<u64>,
    /// YYYYMMDD as written by the installer.
    pub install_date: String,
    pub uninstall_string: String,
    /// True when Lens can run the registered uninstaller (it passed `validate_uninstall`).
    pub can_uninstall: bool,
    /// Why not, in plain English, when `can_uninstall` is false.
    pub blocked_reason: Option<String>,
    /// Last time Windows recorded the app being started from the shell (UserAssist), Unix ms.
    pub last_used_ms: Option<i64>,
    /// Per-user install (HKCU).
    pub per_user: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UninstallPlan {
    /// `msiexec.exe /x {GUID}`: Windows Installer removes the product it installed.
    Msi { product: String },
    /// The app's own uninstaller exe, with the arguments it registered.
    Exe { path: String, args: Vec<String> },
}

impl UninstallPlan {
    /// (program, argument string) for ShellExecute, which shows the UAC prompt when needed.
    pub fn command(&self) -> (String, String) {
        match self {
            UninstallPlan::Msi { product } => ("msiexec.exe".into(), format!("/x {product}")),
            UninstallPlan::Exe { path, args } => (
                path.clone(),
                args.iter().map(|a| if a.contains(' ') { format!("\"{a}\"") } else { a.clone() }).collect::<Vec<_>>().join(" "),
            ),
        }
    }
}

/// Programs that can run arbitrary commands, scripts or DLLs. An uninstall string that starts one
/// of these is not "the app's own uninstaller", whatever it claims.
const INTERPRETERS: &[&str] = &[
    "cmd.exe", "powershell.exe", "pwsh.exe", "rundll32.exe", "regsvr32.exe", "mshta.exe", "wscript.exe", "cscript.exe",
    "explorer.exe", "conhost.exe", "bitsadmin.exe", "certutil.exe", "curl.exe", "wmic.exe", "schtasks.exe", "reg.exe",
    "msbuild.exe", "installutil.exe", "forfiles.exe", "bash.exe", "wsl.exe", "python.exe", "pythonw.exe", "node.exe",
    "java.exe", "javaw.exe", "sc.exe", "net.exe", "taskkill.exe", "del.exe", "start.exe",
];

/// Words in display names that say nothing about which folder is the app's.
const STOPWORDS: &[&str] = &[
    "microsoft", "corporation", "inc", "ltd", "llc", "x64", "x86", "arm64", "bit", "version", "update", "the", "for", "and",
    "edition", "windows", "app", "apps", "program", "files", "tools", "runtime", "user", "machine", "setup",
];

/// File-name stems that installers use for their uninstallers.
fn looks_like_uninstaller(file: &str) -> bool {
    let f = file.to_ascii_lowercase();
    ["unins", "uninst", "uninstall", "remove", "setup", "update.exe", "install", "maintenancetool", "helper.exe"]
        .iter()
        .any(|k| f.contains(k))
}

fn is_guid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 38
        && b[0] == b'{'
        && b[37] == b'}'
        && s[1..37].char_indices().all(|(i, c)| if [8, 13, 18, 23].contains(&i) { c == '-' } else { c.is_ascii_hexdigit() })
}

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

fn norm_dir(p: &str) -> String {
    p.trim().trim_matches('"').trim_end_matches(['\\', '/']).replace('/', "\\").to_ascii_lowercase()
}

/// Splits a command line the way the registry stores it: a quoted program, or an unquoted one
/// that may contain spaces and ends at ".exe", then arguments (quotes respected).
pub fn split_command(cmd: &str) -> Option<(String, Vec<String>)> {
    let s = cmd.trim();
    let (prog, rest) = if let Some(r) = s.strip_prefix('"') {
        let end = r.find('"')?;
        (r[..end].to_string(), &r[end + 1..])
    } else {
        let lower = s.to_ascii_lowercase();
        let end = match lower.find(".exe") {
            Some(i) => i + 4,
            None => s.find(' ').unwrap_or(s.len()),
        };
        (s[..end].to_string(), &s[end..])
    };
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut any = false;
    for c in rest.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                any = true;
            }
            c if c.is_whitespace() && !quoted => {
                if any || !cur.is_empty() {
                    args.push(std::mem::take(&mut cur));
                    any = false;
                }
            }
            c => cur.push(c),
        }
    }
    if quoted {
        return None;
    }
    if any || !cur.is_empty() {
        args.push(cur);
    }
    Some((prog, args))
}

/// Decides whether `uninstall_string` is the app's own uninstaller and, if so, how to run it.
/// Rejects anything else with a plain-English reason. Never runs anything itself.
pub fn validate_uninstall(uninstall_string: &str, display_name: &str, install_location: &str) -> Result<UninstallPlan, String> {
    let s = uninstall_string.trim();
    if s.is_empty() {
        return Err("This app didn't register an uninstaller.".into());
    }
    if s.len() > 1024 {
        return Err("The registered uninstall command is unusually long, so Lens won't run it.".into());
    }
    if s.chars().any(|c| c.is_control()) || s.chars().any(|c| "&|<>^`;%$\n".contains(c)) {
        return Err("The registered uninstall command contains shell characters, so Lens won't run it.".into());
    }
    let (prog, args) = split_command(s).ok_or("The registered uninstall command couldn't be read.")?;
    let file = file_name(&prog).to_ascii_lowercase();

    if file == "msiexec.exe" || file == "msiexec" {
        let guids: Vec<&String> = args.iter().filter(|a| is_guid(a.trim_start_matches(['/', '-', 'I', 'i', 'X', 'x']))).collect();
        let joined: Vec<String> = args.iter().map(|a| a.to_ascii_lowercase()).collect();
        // Only switches and exactly one product code: no transforms, packages or logs.
        let ok_args = joined.iter().all(|a| {
            let t = a.trim_start_matches(['/', '-']);
            is_guid(&t.trim_start_matches(['i', 'x']).to_uppercase()) || matches!(t, "i" | "x" | "q" | "qb" | "qn" | "passive" | "norestart" | "quiet")
        });
        return match (guids.len(), ok_args) {
            (1, true) => {
                let g = guids[0].trim_start_matches(['/', '-', 'I', 'i', 'X', 'x']).to_uppercase();
                Ok(UninstallPlan::Msi { product: g })
            }
            (0, _) => Err("The Windows Installer command has no product code.".into()),
            _ => Err("The Windows Installer command does more than remove this product, so Lens won't run it.".into()),
        };
    }

    if INTERPRETERS.contains(&file.as_str()) {
        return Err(format!("The uninstall command starts {file}, which isn't the app's own uninstaller."));
    }
    let p = prog.replace('/', "\\");
    let lower = p.to_ascii_lowercase();
    let absolute = lower.len() > 3 && lower.as_bytes()[1] == b':' && lower.as_bytes()[2] == b'\\' && lower.as_bytes()[0].is_ascii_alphabetic();
    if !absolute || lower.contains("\\..\\") || lower.starts_with("\\\\") {
        return Err("The uninstaller isn't a full path on this PC.".into());
    }
    if !lower.ends_with(".exe") {
        return Err("The uninstaller isn't a program file (.exe).".into());
    }
    let in_windows = ["c:\\windows\\system32\\", "c:\\windows\\syswow64\\", "c:\\windows\\"].iter().any(|w| lower.starts_with(w))
        && !lower.starts_with("c:\\windows\\installer\\");
    if in_windows {
        return Err("The uninstall command points at a Windows system program.".into());
    }
    let loc = norm_dir(install_location);
    let inside_location = !loc.is_empty() && loc.len() > 3 && lower.starts_with(&format!("{loc}\\"));
    // Squirrel/Electron apps register "%LOCALAPPDATA%\<App>\Update.exe --uninstall" with no
    // install location; installer caches keep "…\Package Cache\{id}\setup.exe".
    let named = looks_like_uninstaller(&file);
    let name_words: Vec<String> = display_name
        .to_ascii_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3 && !STOPWORDS.contains(w))
        .map(String::from)
        .collect();
    let folder_matches_name = name_words.iter().any(|w| lower.contains(w.as_str()));
    let cache = lower.contains("\\package cache\\") || lower.starts_with("c:\\windows\\installer\\");
    if inside_location || cache || (named && folder_matches_name) {
        Ok(UninstallPlan::Exe { path: p, args })
    } else {
        Err("The uninstaller isn't inside this app's folder, so Lens can't be sure it belongs to the app.".into())
    }
}

/// Leftover folders Lens may offer to move to the Recycle Bin after an uninstall: the program's
/// own install folder, under Program Files, ProgramData or a user's AppData, never a root or a
/// shared Windows/user folder.
pub fn leftover_allowed(path: &str) -> bool {
    let p = norm_dir(path);
    if p.len() < 6 || p.contains("\\..") || p.starts_with("\\\\") {
        return false;
    }
    let parts: Vec<&str> = p.split('\\').collect();
    let under = |prefix: &[&str], extra: usize| parts.len() >= 1 + prefix.len() + extra && parts[1..=prefix.len()].iter().zip(prefix).all(|(a, b)| a == b);
    // C:\Program Files\X, C:\Program Files (x86)\X, C:\ProgramData\X
    if under(&["program files"], 1) || under(&["program files (x86)"], 1) {
        return true;
    }
    if under(&["programdata"], 1) {
        return !matches!(parts[2], "microsoft" | "package cache" | "packages");
    }
    // C:\Users\<u>\AppData\{Local,Roaming}\X (not Microsoft, Temp or Packages)
    if parts.len() >= 6 && parts[1] == "users" && parts[3] == "appdata" && matches!(parts[4], "local" | "roaming" | "locallow") {
        return !matches!(parts[5], "microsoft" | "temp" | "packages" | "programs" | "lensui") || (parts[5] == "programs" && parts.len() >= 7);
    }
    false
}

// ── UserAssist: when the user last started a program from the shell ─────────────────────────────

/// UserAssist value names are ROT13.
pub fn rot13(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' => (((c as u8 - b'a') + 13) % 26 + b'a') as char,
            'A'..='Z' => (((c as u8 - b'A') + 13) % 26 + b'A') as char,
            _ => c,
        })
        .collect()
}

/// Known-folder GUIDs UserAssist uses instead of paths.
const KNOWN: &[(&str, &str)] = &[
    ("{6D809377-6AF0-444B-8957-A3773F02200E}", "C:\\Program Files"),
    ("{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}", "C:\\Program Files (x86)"),
    ("{F38BF404-1D43-42F2-9305-67DE0B28FC23}", "C:\\Windows"),
    ("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}", "C:\\Windows\\System32"),
];

/// Decodes a UserAssist value name into a path (known-folder GUIDs expanded).
pub fn userassist_path(raw_name: &str) -> String {
    let mut p = rot13(raw_name);
    for (g, dir) in KNOWN {
        if p.to_ascii_uppercase().starts_with(g) {
            p = format!("{dir}{}", &p[g.len()..]);
        }
    }
    p
}

/// Last-run time from a 72-byte UserAssist record (FILETIME at offset 60), Unix ms.
pub fn userassist_last_run(data: &[u8]) -> Option<i64> {
    let b = data.get(60..68)?;
    let ft = u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]);
    if ft == 0 {
        return None;
    }
    Some((ft as i64 - 116_444_736_000_000_000) / 10_000)
}

/// Latest run of any exe inside `install_location`.
pub fn last_used_for(install_location: &str, entries: &[(String, i64)]) -> Option<i64> {
    let loc = norm_dir(install_location);
    if loc.len() <= 3 {
        return None;
    }
    let prefix = format!("{loc}\\");
    entries.iter().filter(|(p, _)| p.to_ascii_lowercase().starts_with(&prefix)).map(|(_, t)| *t).max()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exe(path: &str, args: &[&str]) -> UninstallPlan {
        UninstallPlan::Exe { path: path.into(), args: args.iter().map(|s| s.to_string()).collect() }
    }

    #[test]
    fn msi_product_codes() {
        let g = "{90160000-008C-0000-1000-0000000FF1CE}";
        assert_eq!(validate_uninstall(&format!("MsiExec.exe /X{g}"), "Office", ""), Ok(UninstallPlan::Msi { product: g.into() }));
        assert_eq!(validate_uninstall(&format!("MsiExec.exe /I{}", g.to_lowercase()), "Office", ""), Ok(UninstallPlan::Msi { product: g.into() }));
        assert_eq!(validate_uninstall(&format!("C:\\Windows\\System32\\msiexec.exe /x {g} /qb"), "x", ""), Ok(UninstallPlan::Msi { product: g.into() }));
        assert!(validate_uninstall("MsiExec.exe /X", "x", "").is_err());
        assert!(validate_uninstall(&format!("msiexec /x {g} /i C:\\evil.msi"), "x", "").is_err());
        assert!(validate_uninstall(&format!("msiexec /x {g} TRANSFORMS=evil.mst"), "x", "").is_err());
        assert_eq!(UninstallPlan::Msi { product: g.into() }.command(), ("msiexec.exe".into(), format!("/x {g}")));
    }

    #[test]
    fn own_exe_uninstallers() {
        assert_eq!(
            validate_uninstall("\"C:\\Program Files\\Krita (x64)\\uninstall.exe\"", "Krita (x64) 5.3.4", "C:\\Program Files\\Krita (x64)"),
            Ok(exe("C:\\Program Files\\Krita (x64)\\uninstall.exe", &[]))
        );
        // Unquoted with spaces, Inno-style args.
        assert_eq!(
            validate_uninstall("C:\\Program Files\\Notepad++\\uninstall.exe /S", "Notepad++", ""),
            Ok(exe("C:\\Program Files\\Notepad++\\uninstall.exe", &["/S"]))
        );
        assert_eq!(
            validate_uninstall("\"C:\\Program Files (x86)\\Steam\\uninstall.exe\" /x \"some arg\"", "Steam", "C:\\Program Files (x86)\\Steam\\"),
            Ok(exe("C:\\Program Files (x86)\\Steam\\uninstall.exe", &["/x", "some arg"]))
        );
        // Squirrel: no install location, Update.exe in a folder named after the app.
        assert_eq!(
            validate_uninstall("C:\\Users\\a\\AppData\\Local\\Discord\\Update.exe --uninstall", "Discord", ""),
            Ok(exe("C:\\Users\\a\\AppData\\Local\\Discord\\Update.exe", &["--uninstall"]))
        );
        // WiX bundle in the package cache.
        assert!(validate_uninstall(
            "\"C:\\ProgramData\\Package Cache\\{11111111-2222-3333-4444-555555555555}\\VC_redist.x64.exe\"  /uninstall",
            "Microsoft Visual C++ 2015-2022 Redistributable",
            ""
        )
        .is_ok());
        let (prog, args) = exe("C:\\A B\\unins000.exe", &["/SILENT", "a b"]).command();
        assert_eq!((prog.as_str(), args.as_str()), ("C:\\A B\\unins000.exe", "/SILENT \"a b\""));
    }

    #[test]
    fn rejects_anything_else() {
        let bad = [
            ("cmd.exe /c rmdir /s /q C:\\", "x", ""),
            ("C:\\Windows\\System32\\cmd.exe /c del C:\\x", "x", ""),
            ("powershell -enc ZQBjAGgAbwA=", "x", ""),
            ("rundll32.exe C:\\x\\evil.dll,Entry", "x", ""),
            ("\"C:\\Program Files\\App\\unins000.exe\" & calc.exe", "App", "C:\\Program Files\\App"),
            ("C:\\Program Files\\App\\uninst.exe | more", "App", "C:\\Program Files\\App"),
            ("C:\\Program Files\\App\\uninst.exe %COMSPEC%", "App", "C:\\Program Files\\App"),
            ("C:\\Program Files\\Other\\uninst.exe", "App", "C:\\Program Files\\App"),
            ("C:\\Program Files\\App\\..\\Evil\\uninst.exe", "App", ""),
            ("uninst.exe", "App", ""),
            ("\\\\server\\share\\App\\uninstall.exe", "App", ""),
            ("C:\\Program Files\\App\\readme.txt", "App", "C:\\Program Files\\App"),
            ("C:\\Windows\\notepad.exe", "Windows", "C:\\Windows"),
            ("\"C:\\Program Files\\App\\uninst.exe", "App", "C:\\Program Files\\App"),
            ("", "App", ""),
            ("C:\\Users\\a\\Downloads\\totally-legit.exe", "App", ""),
        ];
        for (cmd, name, loc) in bad {
            assert!(validate_uninstall(cmd, name, loc).is_err(), "should reject {cmd}");
        }
    }

    #[test]
    fn leftovers() {
        assert!(leftover_allowed("C:\\Program Files\\Krita (x64)"));
        assert!(leftover_allowed("C:\\Program Files (x86)\\Steam\\"));
        assert!(leftover_allowed("C:\\ProgramData\\Krita"));
        assert!(leftover_allowed("C:\\Users\\a\\AppData\\Local\\Discord"));
        assert!(leftover_allowed("C:\\Users\\a\\AppData\\Local\\Programs\\Obsidian"));
        for p in [
            "C:\\", "C:\\Program Files", "C:\\Program Files\\", "C:\\Windows\\System32", "C:\\Users\\a", "C:\\Users\\a\\Documents\\x",
            "C:\\ProgramData\\Microsoft", "C:\\Users\\a\\AppData\\Local", "C:\\Users\\a\\AppData\\Local\\Microsoft",
            "C:\\Users\\a\\AppData\\Local\\Temp", "C:\\Users\\a\\AppData\\Roaming\\LensUI", "C:\\Users\\a\\AppData\\Local\\Programs",
            "C:\\Program Files\\..\\Windows", "\\\\server\\share\\x", "",
        ] {
            assert!(!leftover_allowed(p), "should refuse {p}");
        }
    }

    #[test]
    fn userassist_decoding() {
        assert_eq!(rot13("Uryyb"), "Hello");
        assert_eq!(rot13(&rot13("C:\\Program Files\\x.exe")), "C:\\Program Files\\x.exe");
        let name = rot13("{6D809377-6AF0-444B-8957-A3773F02200E}\\Krita (x64)\\bin\\krita.exe");
        assert_eq!(userassist_path(&name), "C:\\Program Files\\Krita (x64)\\bin\\krita.exe");
        let mut data = vec![0u8; 72];
        // 2026-11-20T10:00:00Z = 1_795_168_800_000 ms
        let ft: u64 = 1_795_168_800_000 * 10_000 + 116_444_736_000_000_000;
        data[60..68].copy_from_slice(&ft.to_le_bytes());
        assert_eq!(userassist_last_run(&data), Some(1_795_168_800_000));
        assert_eq!(userassist_last_run(&[0u8; 72]), None);
        assert_eq!(userassist_last_run(&[0u8; 16]), None);
        let entries = vec![
            ("C:\\Program Files\\Krita (x64)\\bin\\krita.exe".to_string(), 100),
            ("C:\\Program Files\\Krita (x64)\\krita-helper.exe".to_string(), 300),
            ("C:\\Program Files\\Krita2\\x.exe".to_string(), 900),
        ];
        assert_eq!(last_used_for("C:\\Program Files\\Krita (x64)\\", &entries), Some(300));
        assert_eq!(last_used_for("", &entries), None);
        assert_eq!(last_used_for("C:\\", &entries), None);
    }
}
