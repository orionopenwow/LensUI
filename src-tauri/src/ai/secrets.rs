//! API keys for AI providers, encrypted with Windows DPAPI (current user) under
//! `%APPDATA%\LensUI\secrets\ai-<provider>.bin`.
//!
//! * A key is never returned to the frontend, logged, serialised or put in an error message:
//!   [`Secret`] has no `Serialize` impl, prints as `Secret(<redacted>)` and wipes its bytes on drop.
//! * Only `has_key` (does the file exist) ever leaves the backend.
//! * Outside Windows there is no store; saving a key fails with a clear message.

use std::fmt;
use std::path::{Path, PathBuf};

/// Providers that may hold a key. "local" is an optional bearer token for a custom endpoint.
pub const KEYED_PROVIDERS: [&str; 2] = ["claude", "local"];

/// An API key in memory.
pub struct Secret(String);

impl Secret {
    pub fn new(s: String) -> Self {
        Secret(s)
    }
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(<redacted>)")
    }
}

impl Drop for Secret {
    fn drop(&mut self) {
        // SAFETY: zeroing keeps the buffer valid UTF-8 (all NUL bytes).
        let bytes = unsafe { self.0.as_mut_vec() };
        for b in bytes.iter_mut() {
            // Volatile so the wipe isn't optimised away.
            unsafe { std::ptr::write_volatile(b, 0) };
        }
    }
}

/// Validates a key the user pasted. Errors never echo the key.
pub fn validate(provider: &str, secret: &str) -> Result<(), String> {
    if !KEYED_PROVIDERS.contains(&provider) {
        return Err("That provider doesn't use a key.".into());
    }
    let s = secret.trim();
    if s.len() < 8 || s.len() > 512 {
        return Err("That doesn't look like an API key (wrong length).".into());
    }
    if s.chars().any(|c| c.is_whitespace() || c.is_control() || !c.is_ascii()) {
        return Err("That doesn't look like an API key (it contains spaces or unusual characters).".into());
    }
    if provider == "claude" && !s.starts_with("sk-ant-") {
        return Err("Claude API keys start with \"sk-ant-\". Create one at console.anthropic.com.".into());
    }
    Ok(())
}

/// Encrypts and decrypts key bytes. DPAPI on Windows; tests use a stand-in.
pub trait Protector: Send + Sync {
    fn protect(&self, plain: &[u8]) -> Result<Vec<u8>, String>;
    fn unprotect(&self, sealed: &[u8]) -> Result<Vec<u8>, String>;
}

pub struct SecretStore {
    dir: PathBuf,
    protector: Box<dyn Protector>,
}

impl SecretStore {
    pub fn new(dir: PathBuf, protector: Box<dyn Protector>) -> Self {
        SecretStore { dir, protector }
    }

    /// The real store: %APPDATA%\LensUI\secrets with DPAPI.
    pub fn system() -> Self {
        SecretStore::new(crate::config::config_dir().join("secrets"), default_protector())
    }

    fn path(&self, provider: &str) -> Result<PathBuf, String> {
        if !KEYED_PROVIDERS.contains(&provider) {
            return Err("That provider doesn't use a key.".into());
        }
        Ok(self.dir.join(format!("ai-{}.bin", provider)))
    }

    pub fn has(&self, provider: &str) -> bool {
        self.path(provider).map(|p| p.is_file()).unwrap_or(false)
    }

    pub fn set(&self, provider: &str, secret: &str) -> Result<(), String> {
        validate(provider, secret)?;
        let sealed = self.protector.protect(secret.trim().as_bytes())?;
        let path = self.path(provider)?;
        std::fs::create_dir_all(&self.dir).map_err(|_| "Couldn't create the Lens secrets folder.".to_string())?;
        write_atomic(&path, &sealed)
    }

    pub fn get(&self, provider: &str) -> Result<Option<Secret>, String> {
        let path = self.path(provider)?;
        let Ok(sealed) = std::fs::read(&path) else {
            return Ok(None);
        };
        let plain = self
            .protector
            .unprotect(&sealed)
            .map_err(|_| "The saved key couldn't be unlocked (it may belong to another Windows account). Enter it again.".to_string())?;
        let s = String::from_utf8(plain).map_err(|_| "The saved key is damaged. Enter it again.".to_string())?;
        Ok(Some(Secret::new(s)))
    }

    pub fn clear(&self, provider: &str) -> Result<(), String> {
        let path = self.path(provider)?;
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("Couldn't remove the saved key.".into()),
        }
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|_| "Couldn't save the key.".to_string())?;
    std::fs::rename(&tmp, path).map_err(|_| {
        let _ = std::fs::remove_file(&tmp);
        "Couldn't save the key.".to_string()
    })
}

fn default_protector() -> Box<dyn Protector> {
    #[cfg(windows)]
    {
        Box::new(dpapi::Dpapi)
    }
    #[cfg(not(windows))]
    {
        Box::new(Unavailable)
    }
}

#[cfg(not(windows))]
struct Unavailable;

#[cfg(not(windows))]
impl Protector for Unavailable {
    fn protect(&self, _: &[u8]) -> Result<Vec<u8>, String> {
        Err("Saving API keys needs Windows (keys are encrypted with your Windows account).".into())
    }
    fn unprotect(&self, _: &[u8]) -> Result<Vec<u8>, String> {
        Err("Saved keys can only be read on Windows.".into())
    }
}

#[cfg(windows)]
mod dpapi {
    use super::Protector;
    use std::ffi::c_void;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    /// Extra entropy so other apps running as the same user can't unprotect Lens blobs by
    /// accident (DPAPI still trusts the user account, which is the intended boundary).
    const ENTROPY: &[u8] = b"LensUI.ai.secrets.v1";

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            p_data_in: *const DataBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            p_data_in: *const DataBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
    }

    pub struct Dpapi;

    fn run(input: &[u8], protect: bool) -> Result<Vec<u8>, String> {
        let inp = DataBlob { cb_data: input.len() as u32, pb_data: input.as_ptr() as *mut u8 };
        let ent = DataBlob { cb_data: ENTROPY.len() as u32, pb_data: ENTROPY.as_ptr() as *mut u8 };
        let mut out = DataBlob { cb_data: 0, pb_data: std::ptr::null_mut() };
        // SAFETY: all pointers are valid for the call; DPAPI allocates `out` with LocalAlloc,
        // which is copied and freed below.
        let ok = unsafe {
            if protect {
                CryptProtectData(&inp, std::ptr::null(), &ent, std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            } else {
                CryptUnprotectData(&inp, std::ptr::null_mut(), &ent, std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            }
        };
        if ok == 0 || out.pb_data.is_null() {
            return Err(if protect { "Windows couldn't encrypt the key." } else { "Windows couldn't decrypt the key." }.into());
        }
        // SAFETY: DPAPI returned `cb_data` valid bytes at `pb_data`.
        let bytes = unsafe { std::slice::from_raw_parts(out.pb_data, out.cb_data as usize) }.to_vec();
        unsafe {
            // Wipe the plaintext copy DPAPI handed back before freeing it.
            if !protect {
                for i in 0..out.cb_data as usize {
                    std::ptr::write_volatile(out.pb_data.add(i), 0);
                }
            }
            LocalFree(out.pb_data as *mut c_void);
        }
        Ok(bytes)
    }

    impl Protector for Dpapi {
        fn protect(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
            run(plain, true)
        }
        fn unprotect(&self, sealed: &[u8]) -> Result<Vec<u8>, String> {
            run(sealed, false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test stand-in: reversible XOR so plaintext never sits in the file.
    struct Xor;
    impl Protector for Xor {
        fn protect(&self, p: &[u8]) -> Result<Vec<u8>, String> {
            Ok(p.iter().map(|b| b ^ 0x5a).collect())
        }
        fn unprotect(&self, s: &[u8]) -> Result<Vec<u8>, String> {
            Ok(s.iter().map(|b| b ^ 0x5a).collect())
        }
    }

    const KEY: &str = "sk-ant-api03-TESTKEY-abcdefghijklmnop";

    fn store(tag: &str) -> SecretStore {
        let dir = std::env::temp_dir().join(format!("lens-ai-secrets-{}-{}", std::process::id(), tag));
        let _ = std::fs::remove_dir_all(&dir);
        SecretStore::new(dir, Box::new(Xor))
    }

    #[test]
    fn round_trip_and_clear() {
        let s = store("rt");
        assert!(!s.has("claude"));
        s.set("claude", KEY).unwrap();
        assert!(s.has("claude"));
        let raw = std::fs::read(s.dir.join("ai-claude.bin")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("TESTKEY"), "key must not be stored in plain text");
        assert_eq!(s.get("claude").unwrap().unwrap().expose(), KEY);
        s.clear("claude").unwrap();
        assert!(!s.has("claude"));
        assert!(s.get("claude").unwrap().is_none());
        s.clear("claude").unwrap(); // idempotent
    }

    #[test]
    fn never_printed() {
        let sec = Secret::new(KEY.to_string());
        let dbg = format!("{:?}", sec);
        assert!(!dbg.contains("TESTKEY"));
        assert_eq!(dbg, "Secret(<redacted>)");
        let wrapped = format!("{:?}", Some(&sec));
        assert!(!wrapped.contains("TESTKEY"));
    }

    #[test]
    fn validation_never_echoes() {
        for bad in ["short", "sk-ant- has spaces in it", "not-an-anthropic-key-1234567"] {
            let e = validate("claude", bad).unwrap_err();
            assert!(!e.contains(bad), "error echoed the key: {}", e);
        }
        assert!(validate("claude", KEY).is_ok());
        assert!(validate("script", KEY).is_err());
        assert!(validate("local", "any-bearer-token-123").is_ok());
        assert!(store("bad").set("../evil", KEY).is_err());
    }
}
