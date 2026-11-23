//! Firefox's `mozLz40` files (session store, bookmark backups): an 8-byte magic, the
//! decompressed size, then one LZ4 block.

const MAGIC: &[u8] = b"mozLz40\0";
const MAX_OUT: usize = 256 * 1024 * 1024;

pub fn decode_mozlz4(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 || &data[..8] != MAGIC {
        return Err("Not a mozLz4 file.".into());
    }
    let size = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
    if size > MAX_OUT {
        return Err("File is too large.".into());
    }
    lz4_block(&data[12..], size)
}

/// Decodes one LZ4 block into exactly `size` bytes.
pub fn lz4_block(src: &[u8], size: usize) -> Result<Vec<u8>, String> {
    let mut out: Vec<u8> = Vec::with_capacity(size);
    let mut i = 0usize;
    let bad = || "Corrupt LZ4 data.".to_string();
    let read_len = |src: &[u8], i: &mut usize, mut n: usize| -> Result<usize, String> {
        if n == 15 {
            loop {
                let b = *src.get(*i).ok_or_else(bad)?;
                *i += 1;
                n = n.checked_add(b as usize).ok_or_else(bad)?;
                if b != 255 {
                    break;
                }
            }
        }
        Ok(n)
    };
    while i < src.len() {
        let token = src[i];
        i += 1;
        let lit = read_len(src, &mut i, (token >> 4) as usize)?;
        let end = i.checked_add(lit).ok_or_else(bad)?;
        out.extend_from_slice(src.get(i..end).ok_or_else(bad)?);
        i = end;
        if i >= src.len() {
            break; // last sequence has literals only
        }
        let off = u16::from_le_bytes([*src.get(i).ok_or_else(bad)?, *src.get(i + 1).ok_or_else(bad)?]) as usize;
        i += 2;
        if off == 0 || off > out.len() {
            return Err(bad());
        }
        let len = read_len(src, &mut i, (token & 0x0f) as usize)? + 4;
        if out.len() + len > size {
            return Err(bad());
        }
        let start = out.len() - off;
        for k in 0..len {
            let b = out[start + k];
            out.push(b);
        }
    }
    if out.len() != size {
        return Err("LZ4 size mismatch.".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literal_only_and_matches() {
        // "abcabcabcabc": literals "abc", then a match of length 9 at offset 3.
        let block = [0x35, b'a', b'b', b'c', 3, 0];
        assert_eq!(lz4_block(&block, 12).unwrap(), b"abcabcabcabc");
        // A match followed by a literal-only tail, wrapped in the mozLz4 header.
        let block2 = [0x34, b'a', b'b', b'c', 3, 0, 0x10, b'!'];
        let mut f2 = b"mozLz40\0".to_vec();
        f2.extend_from_slice(&12u32.to_le_bytes());
        f2.extend_from_slice(&block2);
        assert_eq!(decode_mozlz4(&f2).unwrap(), b"abcabcabcab!");
    }

    #[test]
    fn rejects_bad_offsets_and_sizes() {
        assert!(lz4_block(&[0x10, b'a', 9, 0], 10).is_err());
        assert!(lz4_block(&[0x30, b'a', b'b', b'c'], 5).is_err());
        assert!(decode_mozlz4(b"nope").is_err());
    }
}
