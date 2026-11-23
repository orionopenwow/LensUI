//! SHA-256 (FIPS 180-4), standard library only, plus helpers to read common checksum files.
//!
//! Lens uses this to verify GitHub-release downloads before it offers to run them. winget does its
//! own hash check from the manifest, so this only matters for the release fallback.

use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/// Streaming SHA-256 hasher.
#[derive(Clone)]
pub struct Sha256 {
    state: [u32; 8],
    buf: [u8; 64],
    buf_len: usize,
    total: u64,
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha256 {
    pub fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
                0x5be0cd19,
            ],
            buf: [0; 64],
            buf_len: 0,
            total: 0,
        }
    }

    pub fn update(&mut self, mut data: &[u8]) {
        self.total = self.total.wrapping_add(data.len() as u64);
        if self.buf_len > 0 {
            let take = (64 - self.buf_len).min(data.len());
            self.buf[self.buf_len..self.buf_len + take].copy_from_slice(&data[..take]);
            self.buf_len += take;
            data = &data[take..];
            if self.buf_len == 64 {
                let block = self.buf;
                self.compress(&block);
                self.buf_len = 0;
            }
        }
        while data.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[..64]);
            self.compress(&block);
            data = &data[64..];
        }
        if !data.is_empty() {
            self.buf[..data.len()].copy_from_slice(data);
            self.buf_len = data.len();
        }
    }

    pub fn finish(mut self) -> [u8; 32] {
        let bit_len = self.total.wrapping_mul(8);
        let mut pad = vec![0x80u8];
        let rem = (self.buf_len + 1) % 64;
        let zeros = if rem <= 56 { 56 - rem } else { 120 - rem };
        pad.resize(pad.len() + zeros, 0u8);
        pad.extend_from_slice(&bit_len.to_be_bytes());
        // `update` would also count the padding into `total`; that's fine because we already took it.
        let saved = self.total;
        self.update(&pad);
        self.total = saved;
        debug_assert_eq!(self.buf_len, 0);
        let mut out = [0u8; 32];
        for (i, word) in self.state.iter().enumerate() {
            out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        out
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 64];
        for (i, chunk) in block.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.state;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (s, v) in self.state.iter_mut().zip([a, b, c, d, e, f, g, h]) {
            *s = s.wrapping_add(v);
        }
    }
}

/// Lower-case hex of `bytes`.
pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 15) as usize] as char);
    }
    s
}

/// SHA-256 of a string, as lower-case hex (cache file names).
pub fn hex_digest_str(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    to_hex(&h.finish())
}

/// SHA-256 of a byte slice, as lower-case hex.
#[cfg(test)]
pub fn hex_digest(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    to_hex(&h.finish())
}

/// SHA-256 of a file, streamed in 64 KiB chunks.
pub fn file_hex_digest(path: &Path) -> io::Result<String> {
    let mut f = File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(to_hex(&h.finish()))
}

/// True when `s` is exactly 64 hex characters.
pub fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Constant-time-ish, case-insensitive comparison of two hex digests.
pub fn digests_match(a: &str, b: &str) -> bool {
    if !is_sha256_hex(a) || !is_sha256_hex(b) {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x.to_ascii_lowercase() ^ y.to_ascii_lowercase()))
        == 0
}

/// Finds the expected digest for `file_name` in a checksum file. Understands the common formats:
/// * `<hex>  name` and `<hex> *name` (sha256sum, binary mode),
/// * `SHA256 (name) = <hex>` (BSD / openssl),
/// * `name: <hex>` and `name <hex>`,
/// * a file holding only one bare digest (e.g. `app.msi.sha256`), used when nothing else matches.
///
/// Names compare case-insensitively and ignore any leading `./` or directory.
pub fn find_in_checksum_file(text: &str, file_name: &str) -> Option<String> {
    let want = base_name(file_name).to_ascii_lowercase();
    let mut bare: Vec<String> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("SHA256 (").or_else(|| line.strip_prefix("SHA2-256 (")) {
            if let Some((name, hex)) = rest.split_once(") = ") {
                if base_name(name).eq_ignore_ascii_case(&want) && is_sha256_hex(hex.trim()) {
                    return Some(hex.trim().to_ascii_lowercase());
                }
            }
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        match parts.as_slice() {
            [hex] if is_sha256_hex(hex) => bare.push(hex.to_ascii_lowercase()),
            [hex, name] if is_sha256_hex(hex) => {
                let n = name.trim_start_matches('*');
                if base_name(n).eq_ignore_ascii_case(&want) {
                    return Some(hex.to_ascii_lowercase());
                }
            }
            [name, hex] if is_sha256_hex(hex) => {
                let n = name.trim_end_matches(':');
                if base_name(n).eq_ignore_ascii_case(&want) {
                    return Some(hex.to_ascii_lowercase());
                }
            }
            _ => {}
        }
    }
    if bare.len() == 1 {
        return bare.pop();
    }
    None
}

fn base_name(name: &str) -> &str {
    name.rsplit(['/', '\\']).next().unwrap_or(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_vectors() {
        assert_eq!(hex_digest(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(hex_digest(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(
            hex_digest(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
        let million = vec![b'a'; 1_000_000];
        assert_eq!(hex_digest(&million), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
    }

    #[test]
    fn streaming_equals_one_shot_at_every_split() {
        let data: Vec<u8> = (0..300u32).map(|i| (i * 7 % 251) as u8).collect();
        let whole = hex_digest(&data);
        for split in 0..data.len() {
            let mut h = Sha256::new();
            h.update(&data[..split]);
            h.update(&data[split..]);
            assert_eq!(to_hex(&h.finish()), whole, "split at {split}");
        }
    }

    #[test]
    fn file_digest_matches_memory() {
        let dir = std::env::temp_dir().join(format!("lens-apps-sha-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("x.bin");
        let data: Vec<u8> = (0..200_000u32).map(|i| (i % 256) as u8).collect();
        std::fs::write(&p, &data).unwrap();
        assert_eq!(file_hex_digest(&p).unwrap(), hex_digest(&data));
        let _ = std::fs::remove_dir_all(&dir);
    }

    const H1: &str = "1111111111111111111111111111111111111111111111111111111111111111";
    const H2: &str = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";

    #[test]
    fn checksum_file_formats() {
        let gnu = format!("{H1}  Concat_0.2.8_x64.msi\n{H2} *Concat_0.2.8_x64-setup.exe\n");
        assert_eq!(find_in_checksum_file(&gnu, "concat_0.2.8_x64.msi").as_deref(), Some(H1));
        assert_eq!(find_in_checksum_file(&gnu, "Concat_0.2.8_x64-setup.exe"), Some(H2.to_ascii_lowercase()));
        assert_eq!(find_in_checksum_file(&gnu, "other.zip"), None);

        let bsd = format!("SHA256 (dist/app.zip) = {H1}\n");
        assert_eq!(find_in_checksum_file(&bsd, "app.zip").as_deref(), Some(H1));

        let colon = format!("app-setup.exe: {H2}\n");
        assert_eq!(find_in_checksum_file(&colon, "app-setup.exe"), Some(H2.to_ascii_lowercase()));

        let bare = format!("{H1}\n");
        assert_eq!(find_in_checksum_file(&bare, "anything.msi").as_deref(), Some(H1));
        let two_bare = format!("{H1}\n{H2}\n");
        assert_eq!(find_in_checksum_file(&two_bare, "anything.msi"), None, "ambiguous bare digests");
    }

    #[test]
    fn digest_comparison() {
        assert!(digests_match(H2, &H2.to_ascii_lowercase()));
        assert!(!digests_match(H1, H2));
        assert!(!digests_match("abc", "abc"));
    }
}
