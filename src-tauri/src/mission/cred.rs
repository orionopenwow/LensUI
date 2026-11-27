//! The GitHub token for Mission Control, kept in Windows Credential Manager (a generic credential,
//! "LensMissionControl:github", current user, this PC). It is never written to a file, a log, the
//! audit log or an export, and it leaves this module only as the value of an `Authorization`
//! header to api.github.com (`github.rs`). Fallback when nothing is stored: `gh auth token`.

use crate::ai::secrets::Secret;

pub const TARGET: &str = "LensMissionControl:github";

/// Where the token in use came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TokenSource {
    CredentialManager,
    GhCli,
    None,
}

/// A token as pasted: trimmed; refuses anything that isn't plainly a GitHub token.
pub fn clean_token(t: &str) -> Result<String, String> {
    let t = t.trim();
    let ok_prefix = ["github_pat_", "ghp_", "gho_"].iter().any(|p| t.starts_with(p));
    if !ok_prefix || t.len() < 30 || t.len() > 255 || !t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("That doesn't look like a GitHub token (it should start with github_pat_ or ghp_).".into());
    }
    Ok(t.to_string())
}

#[cfg(windows)]
mod imp {
    use super::TARGET;
    use windows::core::{HSTRING, PCWSTR, PWSTR};
    use windows::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_FLAGS, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

    pub fn write(token: &str) -> Result<(), String> {
        let target = HSTRING::from(TARGET);
        let user = HSTRING::from("github");
        let mut blob = token.as_bytes().to_vec();
        let cred = CREDENTIALW {
            Flags: CRED_FLAGS(0),
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(target.as_ptr() as *mut u16),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            UserName: PWSTR(user.as_ptr() as *mut u16),
            ..Default::default()
        };
        let r = unsafe { CredWriteW(&cred, 0) };
        blob.iter_mut().for_each(|b| *b = 0);
        r.map_err(|_| "Windows Credential Manager refused to save the token.".to_string())
    }

    pub fn read() -> Option<String> {
        let target = HSTRING::from(TARGET);
        let mut p: *mut CREDENTIALW = std::ptr::null_mut();
        unsafe {
            CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0, &mut p).ok()?;
            if p.is_null() {
                return None;
            }
            let c = &*p;
            let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec();
            CredFree(p as *const core::ffi::c_void);
            String::from_utf8(bytes).ok()
        }
    }

    pub fn delete() -> Result<(), String> {
        let target = HSTRING::from(TARGET);
        match unsafe { CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0) } {
            Ok(()) => Ok(()),
            // Not found is fine: nothing to forget.
            Err(e) if e.code().0 as u32 == 0x8007_0490 => Ok(()),
            Err(_) => Err("Windows Credential Manager refused to remove the token.".into()),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn write(_token: &str) -> Result<(), String> {
        Err("Mission Control keeps its token in Windows Credential Manager (Windows only).".into())
    }
    pub fn read() -> Option<String> {
        None
    }
    pub fn delete() -> Result<(), String> {
        Ok(())
    }
}

pub fn store(token: &str) -> Result<(), String> {
    imp::write(&clean_token(token)?)
}

pub fn forget() -> Result<(), String> {
    imp::delete()
}

/// `gh auth token`, if the GitHub CLI is installed and signed in. Fixed arguments, no shell.
fn gh_cli_token() -> Option<String> {
    let mut cmd = std::process::Command::new("gh");
    cmd.args(["auth", "token", "--hostname", "github.com"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let t = String::from_utf8(out.stdout).ok()?;
    clean_token(&t).ok()
}

/// The token to use and where it came from. Credential Manager first, then `gh`.
pub fn token() -> (Option<Secret>, TokenSource) {
    if let Some(t) = imp::read().filter(|t| !t.is_empty()) {
        return (Some(Secret::new(t)), TokenSource::CredentialManager);
    }
    // `gh auth token` is asked once per run (a process per request would be slow); "not signed
    // in" is asked again after a minute.
    static GH: std::sync::Mutex<Option<(Option<String>, u64)>> = std::sync::Mutex::new(None);
    let mut g = GH.lock().unwrap_or_else(|e| e.into_inner());
    let now = super::now_ms();
    let fresh = match g.as_ref() {
        Some((Some(_), _)) => true,
        Some((None, at)) => now.saturating_sub(*at) < 60_000,
        None => false,
    };
    if !fresh {
        *g = Some((gh_cli_token(), now));
    }
    match g.as_ref().and_then(|(t, _)| t.clone()) {
        Some(t) => (Some(Secret::new(t)), TokenSource::GhCli),
        None => (None, TokenSource::None),
    }
}

/// Where a token would come from, without reading the gh CLI every time (cheap status call).
pub fn source_hint() -> TokenSource {
    if imp::read().is_some() {
        TokenSource::CredentialManager
    } else {
        TokenSource::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pasted_tokens_are_checked_and_trimmed() {
        assert_eq!(clean_token("  ghp_0123456789abcdefghijABCDEFGHIJ0123\n").unwrap(), "ghp_0123456789abcdefghijABCDEFGHIJ0123");
        assert!(clean_token("github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz").is_ok());
        for bad in ["", "hello", "ghp_short", "Bearer ghp_0123456789abcdefghijABCDEFGHIJ", "ghp_0123456789abcdefghij ABCDEFGHIJ0123", "sk-ant-0123456789abcdefghijklmnop"] {
            assert!(clean_token(bad).is_err(), "{bad}");
        }
        // The error never echoes what was pasted.
        let e = clean_token("ghp_bad value").unwrap_err();
        assert!(!e.contains("bad value"));
    }
}
