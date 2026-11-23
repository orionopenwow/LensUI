//! Encryption at rest for clipboard history and the Shelf.
//!
//! On Windows every file is sealed with DPAPI (`CryptProtectData`, current-user scope), so only the
//! signed-in Windows user on this PC can read it; no key is stored by Lens. Other platforms (used
//! for development and CI only) write the same container with a "plain" scheme byte.
//!
//! Container: `LENSSEAL` (8 bytes) · version 1 (1 byte) · scheme (1 byte: 0 plain, 1 DPAPI) · payload.

pub const MAGIC: &[u8; 8] = b"LENSSEAL";
pub const VERSION: u8 = 1;
pub const SCHEME_PLAIN: u8 = 0;
pub const SCHEME_DPAPI: u8 = 1;

/// Entropy mixed into DPAPI so other apps calling CryptUnprotectData on the file get nothing
/// without also knowing this string (defence in depth, not a secret).
const ENTROPY: &[u8] = b"LensUI/clip+shelf/v1";

pub trait Sealer {
    fn scheme(&self) -> u8;
    fn seal_raw(&self, plain: &[u8]) -> Result<Vec<u8>, String>;
    fn open_raw(&self, sealed: &[u8]) -> Result<Vec<u8>, String>;
}

/// Wraps `plain` in the container.
pub fn seal(sealer: &dyn Sealer, plain: &[u8]) -> Result<Vec<u8>, String> {
    let body = sealer.seal_raw(plain)?;
    let mut out = Vec::with_capacity(body.len() + 10);
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.push(sealer.scheme());
    out.extend_from_slice(&body);
    Ok(out)
}

/// Opens a container. A file sealed with another scheme than `sealer`'s is refused, so a plain
/// file can never be accepted in place of an encrypted one on Windows.
pub fn open(sealer: &dyn Sealer, data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 10 || &data[..8] != MAGIC {
        return Err("not a Lens sealed file".into());
    }
    if data[8] != VERSION {
        return Err(format!("unsupported sealed-file version {}", data[8]));
    }
    if data[9] != sealer.scheme() {
        return Err("sealed with a different scheme".into());
    }
    sealer.open_raw(&data[10..])
}

/// Development/CI sealer: stores bytes as they are.
pub struct PlainSealer;

impl Sealer for PlainSealer {
    fn scheme(&self) -> u8 {
        SCHEME_PLAIN
    }
    fn seal_raw(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
        Ok(plain.to_vec())
    }
    fn open_raw(&self, sealed: &[u8]) -> Result<Vec<u8>, String> {
        Ok(sealed.to_vec())
    }
}

#[cfg(windows)]
pub struct DpapiSealer;

#[cfg(windows)]
mod dpapi {
    #[repr(C)]
    pub struct DataBlob {
        pub cb: u32,
        pub pb: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        pub fn CryptProtectData(
            data_in: *const DataBlob,
            description: *const u16,
            entropy: *const DataBlob,
            reserved: *mut core::ffi::c_void,
            prompt: *mut core::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        pub fn CryptUnprotectData(
            data_in: *const DataBlob,
            description: *mut *mut u16,
            entropy: *const DataBlob,
            reserved: *mut core::ffi::c_void,
            prompt: *mut core::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn LocalFree(mem: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
    }

    pub const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
}

#[cfg(windows)]
impl Sealer for DpapiSealer {
    fn scheme(&self) -> u8 {
        SCHEME_DPAPI
    }

    fn seal_raw(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
        use dpapi::*;
        let input = DataBlob { cb: plain.len() as u32, pb: plain.as_ptr() as *mut u8 };
        let entropy = DataBlob { cb: ENTROPY.len() as u32, pb: ENTROPY.as_ptr() as *mut u8 };
        let mut out = DataBlob { cb: 0, pb: std::ptr::null_mut() };
        // SAFETY: all blobs point at live buffers for the duration of the call; the output blob
        // is allocated by DPAPI and released with LocalFree below.
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                &entropy,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 || out.pb.is_null() {
            return Err("CryptProtectData failed".into());
        }
        // SAFETY: DPAPI returned `out.cb` valid bytes at `out.pb`.
        let bytes = unsafe { std::slice::from_raw_parts(out.pb, out.cb as usize).to_vec() };
        unsafe { LocalFree(out.pb as *mut _) };
        Ok(bytes)
    }

    fn open_raw(&self, sealed: &[u8]) -> Result<Vec<u8>, String> {
        use dpapi::*;
        let input = DataBlob { cb: sealed.len() as u32, pb: sealed.as_ptr() as *mut u8 };
        let entropy = DataBlob { cb: ENTROPY.len() as u32, pb: ENTROPY.as_ptr() as *mut u8 };
        let mut out = DataBlob { cb: 0, pb: std::ptr::null_mut() };
        // SAFETY: as in `seal_raw`.
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                &entropy,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 || out.pb.is_null() {
            return Err("CryptUnprotectData failed (sealed by another user or PC?)".into());
        }
        // SAFETY: DPAPI returned `out.cb` valid bytes at `out.pb`.
        let bytes = unsafe { std::slice::from_raw_parts(out.pb, out.cb as usize).to_vec() };
        unsafe { LocalFree(out.pb as *mut _) };
        Ok(bytes)
    }
}

/// The sealer for this platform.
pub fn platform_sealer() -> Box<dyn Sealer + Send + Sync> {
    #[cfg(windows)]
    {
        Box::new(DpapiSealer)
    }
    #[cfg(not(windows))]
    {
        Box::new(PlainSealer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A reversible test sealer, to prove the container never leaks plaintext when a real cipher
    /// is used and that scheme mismatches are refused.
    struct XorSealer;
    impl Sealer for XorSealer {
        fn scheme(&self) -> u8 {
            7
        }
        fn seal_raw(&self, p: &[u8]) -> Result<Vec<u8>, String> {
            Ok(p.iter().map(|b| b ^ 0x5A).collect())
        }
        fn open_raw(&self, s: &[u8]) -> Result<Vec<u8>, String> {
            Ok(s.iter().map(|b| b ^ 0x5A).collect())
        }
    }

    #[test]
    fn round_trip_plain_and_cipher() {
        let msg = b"{\"items\":[\"hello\"]}";
        for s in [&PlainSealer as &dyn Sealer, &XorSealer] {
            let sealed = seal(s, msg).unwrap();
            assert_eq!(&sealed[..8], MAGIC);
            assert_eq!(open(s, &sealed).unwrap(), msg);
        }
        let sealed = seal(&XorSealer, msg).unwrap();
        assert!(!sealed.windows(5).any(|w| w == b"hello"), "ciphertext must not contain plaintext");
    }

    #[test]
    fn refuses_garbage_and_scheme_mismatch() {
        assert!(open(&PlainSealer, b"nope").is_err());
        assert!(open(&PlainSealer, b"LENSSEAL\x02\x00x").is_err());
        let sealed = seal(&PlainSealer, b"x").unwrap();
        assert!(open(&XorSealer, &sealed).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_round_trip() {
        let msg = b"secret clipboard text";
        let sealed = seal(&DpapiSealer, msg).unwrap();
        assert!(!sealed.windows(6).any(|w| w == b"secret"));
        assert_eq!(open(&DpapiSealer, &sealed).unwrap(), msg);
    }
}
