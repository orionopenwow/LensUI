//! Credentials for feed and message connectors (OAuth tokens, app passwords, the user's own API
//! keys), sealed with DPAPI (current user) under `%APPDATA%\LensUI\secrets\conn-<key>.bin`.
//! Same rules as the AI key store: values never leave the backend, never appear in Debug,
//! logs or errors, and are wiped on drop.

use crate::ai::secrets::{Protector, Secret};
use std::path::PathBuf;

/// Vault keys look like `bluesky:alice.example` — letters, digits and `:._@-` only.
pub fn valid_key(k: &str) -> bool {
    !k.is_empty() && k.len() <= 128 && k.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '.' | '_' | '@' | '-'))
}

fn file_name(k: &str) -> String {
    // ':' and '@' aren't nice in Windows file names.
    format!("conn-{}.bin", k.replace(':', "~").replace('@', "+"))
}

pub struct Vault {
    dir: PathBuf,
    protector: Box<dyn Protector>,
}

impl Vault {
    pub fn new(dir: PathBuf, protector: Box<dyn Protector>) -> Self {
        Vault { dir, protector }
    }

    pub fn system() -> Self {
        Vault::new(crate::config::config_dir().join("secrets"), crate::ai::secrets::default_protector())
    }

    pub fn has(&self, key: &str) -> bool {
        valid_key(key) && self.dir.join(file_name(key)).is_file()
    }

    pub fn set(&self, key: &str, value: &str) -> Result<(), String> {
        if !valid_key(key) {
            return Err("Invalid connection name.".into());
        }
        let v = value.trim();
        if v.is_empty() || v.len() > 8192 {
            return Err("That credential doesn't look right.".into());
        }
        let sealed = self.protector.protect(v.as_bytes())?;
        std::fs::create_dir_all(&self.dir).map_err(|_| "Couldn't create the Lens secrets folder.".to_string())?;
        let path = self.dir.join(file_name(key));
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, &sealed).map_err(|_| "Couldn't save the credential.".to_string())?;
        std::fs::rename(&tmp, &path).map_err(|_| {
            let _ = std::fs::remove_file(&tmp);
            "Couldn't save the credential.".to_string()
        })
    }

    pub fn get(&self, key: &str) -> Result<Option<Secret>, String> {
        if !valid_key(key) {
            return Err("Invalid connection name.".into());
        }
        let Ok(sealed) = std::fs::read(self.dir.join(file_name(key))) else { return Ok(None) };
        let plain = self
            .protector
            .unprotect(&sealed)
            .map_err(|_| "The saved sign-in couldn't be unlocked. Connect the account again.".to_string())?;
        String::from_utf8(plain).map(|s| Some(Secret::new(s))).map_err(|_| "The saved sign-in is damaged. Connect again.".into())
    }

    pub fn clear(&self, key: &str) -> Result<(), String> {
        if !valid_key(key) {
            return Err("Invalid connection name.".into());
        }
        match std::fs::remove_file(self.dir.join(file_name(key))) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("Couldn't remove the saved sign-in.".into()),
        }
    }
}
