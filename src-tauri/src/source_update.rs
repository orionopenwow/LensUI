//! Updates for Lens run from a clone of the repository (Launch-Lens-UI.bat or Build-Lens-UI.bat).
//!
//! Signed releases update through `win_update` and GitHub Releases. A build made from the source
//! folder has no update key, so it follows `origin/main` instead: every 30 minutes (unless updates
//! are "off") it fetches main and, when there are new commits, the same "Restart to update" pill
//! appears in the Top Bar and in Settings › About & Testing › Updates. Restart puts the desktop
//! back (as Quit does), and a small PowerShell helper waits for Lens to exit, runs
//! `git pull --ff-only origin main`, rebuilds the same way the build was made, and starts Lens
//! again. If the pull or the build fails, the helper starts the build you had and says why.
//!
//! Only a fast-forward on the `main` branch is offered as "ready". On another branch, or when
//! main has moved in a way that can't fast-forward, the status is "available" with what to do
//! by hand. Nothing touches the folder until the person clicks Restart.

use crate::win_update::UpdateStatus;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The repository a source build lives in: `<repo>\src-tauri\target\<profile>\lens-ui.exe`.
pub fn repo_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    repo_root_for(&exe)
}

/// Pure path rule (unit-tested): three folders above the exe, holding `.git` and the Tauri config.
pub fn repo_root_for(exe: &Path) -> Option<PathBuf> {
    let profile_dir = exe.parent()?; // target\debug | target\release
    let target = profile_dir.parent()?;
    if !target.file_name()?.to_string_lossy().eq_ignore_ascii_case("target") {
        return None;
    }
    let src_tauri = target.parent()?;
    let repo = src_tauri.parent()?;
    let looks_right = repo.join(".git").exists() && src_tauri.join("tauri.conf.json").exists();
    looks_right.then(|| repo.to_path_buf())
}

/// "dev" for a `tauri dev` build (target\debug), "release" for a Build-Lens-UI build.
pub fn build_kind(exe: &Path) -> &'static str {
    let dir = exe.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_lowercase());
    if dir.as_deref() == Some("debug") { "dev" } else { "release" }
}

fn git(repo: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).args(["-c", "core.fileMode=false"]).args(args);
    // Never wait on a credential prompt nobody can see.
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|e| format!("git isn't available: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// What the folder looks like next to origin/main. Pure input to `status_for`.
#[derive(Debug, Clone, PartialEq)]
pub struct Behind {
    pub branch: String,
    pub commits: u32,
    pub fast_forward: bool,
    pub newest: String,
    pub subjects: Vec<String>,
}

/// Pure (unit-tested): the status a source build shows for what `check` found.
pub fn status_for(b: &Behind) -> UpdateStatus {
    let base = UpdateStatus {
        state: "up-to-date".into(),
        current_version: env!("CARGO_PKG_VERSION").into(),
        new_version: None,
        notes: None,
        message: "This folder has everything on main.".into(),
    };
    if b.commits == 0 {
        return base;
    }
    let n = b.commits;
    let changes = if n == 1 { "1 new change".to_string() } else { format!("{n} new changes") };
    let notes = b.subjects.iter().map(|s| format!("- {s}")).collect::<Vec<_>>().join("\n");
    let version = format!("main {}", b.newest);
    if b.branch == "main" && b.fast_forward {
        UpdateStatus {
            state: "ready".into(),
            new_version: Some(version),
            notes: Some(notes),
            message: format!(
                "{changes} on main. Restart to update: Lens pulls them, rebuilds (a few minutes) and starts again."
            ),
            ..base
        }
    } else {
        let why = if b.branch != "main" {
            format!("this folder is on the branch \"{}\", not main", b.branch)
        } else {
            "this folder has commits that aren't on main".to_string()
        };
        UpdateStatus {
            state: "available".into(),
            new_version: Some(version),
            notes: Some(notes),
            message: format!("{changes} on main, but {why}. Update it by hand (git pull), then restart Lens."),
            ..base
        }
    }
}

/// Fetches origin/main and compares. Blocking (runs git); call off the UI thread.
pub fn check(repo: &Path) -> UpdateStatus {
    let err = |m: String| UpdateStatus {
        state: "error".into(),
        current_version: env!("CARGO_PKG_VERSION").into(),
        new_version: None,
        notes: None,
        message: m,
    };
    if let Err(e) = git(repo, &["fetch", "--quiet", "origin", "main"]) {
        return err(format!("Couldn't reach GitHub to look for changes on main: {e}"));
    }
    let read = || -> Result<Behind, String> {
        let commits = git(repo, &["rev-list", "--count", "HEAD..origin/main"])?.parse::<u32>().unwrap_or(0);
        let branch = git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        let fast_forward = git(repo, &["merge-base", "--is-ancestor", "HEAD", "origin/main"]).is_ok();
        let newest = git(repo, &["rev-parse", "--short", "origin/main"])?;
        let subjects = git(repo, &["log", "--format=%s", "-n", "20", "HEAD..origin/main"])?
            .lines()
            .map(str::to_string)
            .collect();
        Ok(Behind { branch, commits, fast_forward, newest, subjects })
    };
    match read() {
        Ok(b) => status_for(&b),
        Err(e) => err(format!("Couldn't compare this folder with main: {e}")),
    }
}

/// The helper that runs after Lens exits. Kept as a file in %TEMP% so it outlives Lens.
const HELPER: &str = r#"param([string]$Repo, [int]$LensPid, [string]$Kind, [string]$Exe)
$Host.UI.RawUI.WindowTitle = 'Lens - updating from main'
Write-Host '[Lens] Updating from main. This window closes when Lens is back.' -ForegroundColor Cyan
Wait-Process -Id $LensPid -Timeout 60 -ErrorAction SilentlyContinue
Set-Location $Repo
$env:GIT_TERMINAL_PROMPT = '0'
git -c core.fileMode=false pull --ff-only origin main
$pulled = ($LASTEXITCODE -eq 0)
if (-not $pulled) { Write-Host '[Lens] git pull failed (see above). Starting the Lens you had.' -ForegroundColor Yellow; Start-Sleep -Seconds 5 }
if ($Kind -eq 'dev') {
  # Launch-Lens-UI.bat installs changed dependencies, starts the dev server and Lens.
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'Launch-Lens-UI.bat' -WorkingDirectory $Repo
  exit 0
}
if ($pulled) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo 'tools\build\build-lens.ps1')
  if ($LASTEXITCODE -ne 0) { Write-Host '[Lens] The build failed (see above). Starting the Lens you had.' -ForegroundColor Yellow; Start-Sleep -Seconds 8 }
}
Start-Process -FilePath $Exe -WorkingDirectory (Split-Path $Exe)
"#;

/// "Restart to update" for a source build: start the helper, give the desktop back, exit.
pub fn restart(app: &tauri::AppHandle, repo: &Path) -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let script = std::env::temp_dir().join("lens-update-from-main.ps1");
    std::fs::write(&script, HELPER).map_err(|e| format!("Couldn't write the update helper: {e}"))?;
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .arg("-Repo")
        .arg(repo)
        .arg("-LensPid")
        .arg(std::process::id().to_string())
        .arg("-Kind")
        .arg(build_kind(&exe))
        .arg("-Exe")
        .arg(&exe)
        .current_dir(repo);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0000_0010); // CREATE_NEW_CONSOLE: the person sees the pull and build
    }
    cmd.spawn().map_err(|e| format!("Couldn't start the update helper: {e}"))?;
    crate::commands::power::restore_before_exit(app);
    app.exit(0);
    Ok("Updating from main…".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn behind(branch: &str, commits: u32, ff: bool) -> Behind {
        Behind { branch: branch.into(), commits, fast_forward: ff, newest: "abc1234".into(), subjects: vec!["Fix the Dock".into(), "Add a theme".into()] }
    }

    #[test]
    fn nothing_new_is_up_to_date() {
        let st = status_for(&behind("main", 0, true));
        assert_eq!(st.state, "up-to-date");
        assert!(st.new_version.is_none(), "no pill and no notification");
    }

    #[test]
    fn new_commits_on_main_are_ready_to_restart() {
        let st = status_for(&behind("main", 2, true));
        assert_eq!(st.state, "ready", "the Top Bar pill says Restart to update");
        assert_eq!(st.new_version.as_deref(), Some("main abc1234"));
        assert!(st.message.contains("2 new changes"));
        assert_eq!(st.notes.as_deref(), Some("- Fix the Dock\n- Add a theme"));
    }

    #[test]
    fn another_branch_or_diverged_is_only_available() {
        let st = status_for(&behind("feature/x", 3, true));
        assert_eq!(st.state, "available");
        assert!(st.message.contains("feature/x"));
        let st = status_for(&behind("main", 1, false));
        assert_eq!(st.state, "available");
        assert!(st.message.contains("aren't on main"));
    }

    #[test]
    fn source_builds_are_found_by_their_path() {
        let dir = std::env::temp_dir().join(format!("lens-src-{}", std::process::id()));
        let exe = dir.join("src-tauri").join("target").join("debug").join("lens-ui.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        assert_eq!(repo_root_for(&exe), None, "no .git, not a clone");
        std::fs::create_dir_all(dir.join(".git")).unwrap();
        std::fs::write(dir.join("src-tauri").join("tauri.conf.json"), "{}").unwrap();
        assert_eq!(repo_root_for(&exe), Some(dir.clone()));
        assert_eq!(build_kind(&exe), "dev");
        assert_eq!(build_kind(&dir.join("src-tauri/target/release/lens-ui.exe")), "release");
        let installed = PathBuf::from(r"C:\Users\x\AppData\Local\Lens UI\lens-ui.exe");
        assert_eq!(repo_root_for(&installed), None, "an installed copy updates from Releases");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
