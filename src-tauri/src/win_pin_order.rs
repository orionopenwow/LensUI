//! Windows' own pinned-taskbar order, read-only (B-22).
//!
//! Lens mirrors the apps pinned to the Windows taskbar into the Dock. It used to take them in
//! `read_dir` order of `…\Quick Launch\User Pinned\TaskBar` — alphabetical on NTFS — so the
//! Dock's order didn't match the taskbar's. The real order is kept by Explorer in
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband\Favorites`, a binary list
//! of shell item IDs in pin order. Each item carries the shortcut's file name as UTF-16, so the
//! order is the order in which the `.lnk` names first appear in that blob.
//!
//! Lens only ever READS this value and the pin folder. It never writes Windows' pin data.

/// Lower-cased UTF-16 code units of a string.
fn lower_utf16(s: &str) -> Vec<u16> {
    s.to_lowercase().encode_utf16().collect()
}

/// The blob read as little-endian UTF-16 at both byte alignments, lower-cased.
fn blob_as_utf16(blob: &[u8]) -> [Vec<u16>; 2] {
    let read = |start: usize| -> Vec<u16> {
        let units: Vec<u16> = blob[start.min(blob.len())..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units).to_lowercase().encode_utf16().collect()
    };
    [read(0), read(1)]
}

/// First position of `needle` that starts a name: the unit before it is not part of a longer
/// name (so "Edge.lnk" does not match inside "Microsoft Edge.lnk").
fn find(hay: &[u16], needle: &[u16]) -> Option<usize> {
    if needle.is_empty() || needle.len() > hay.len() {
        return None;
    }
    let starts_name = |i: usize| {
        if i == 0 {
            return true;
        }
        let prev = hay[i - 1];
        if prev == u16::from(b'\\') || prev == u16::from(b'/') {
            return true;
        }
        // Printable ASCII before the match means it's the tail of a longer name.
        !(0x20..0x7F).contains(&prev)
    };
    (0..=hay.len() - needle.len()).find(|&i| hay[i..i + needle.len()] == *needle && starts_name(i))
}

/// Byte offset at which `<stem>.lnk` first appears in the Favorites blob.
pub(crate) fn favorites_offset(blob: &[u8], stem: &str) -> Option<usize> {
    let needle = lower_utf16(&format!("{stem}.lnk"));
    let views = blob_as_utf16(blob);
    let a = find(&views[0], &needle).map(|i| i * 2);
    let b = find(&views[1], &needle).map(|i| i * 2 + 1);
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (x, y) => x.or(y),
    }
}

/// Sorts shortcut stems into Windows' pin order. Stems found in the blob come first, in blob
/// order; the rest keep their incoming order (the caller passes them oldest-pinned first).
pub(crate) fn order_by_favorites(stems: &[String], blob: &[u8]) -> Vec<String> {
    let mut keyed: Vec<(usize, Option<usize>, &String)> = stems
        .iter()
        .enumerate()
        .map(|(i, s)| (i, favorites_offset(blob, s), s))
        .collect();
    keyed.sort_by(|a, b| match (a.1, b.1) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.0.cmp(&b.0),
    });
    keyed.into_iter().map(|(_, _, s)| s.clone()).collect()
}

/// Explorer's Favorites blob, if present.
#[cfg(windows)]
pub(crate) fn read_favorites_blob() -> Option<Vec<u8>> {
    crate::win_shell::read_hkcu_bytes(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Taskband",
        "Favorites",
    )
}

#[cfg(not(windows))]
pub(crate) fn read_favorites_blob() -> Option<Vec<u8>> {
    None
}

/// Puts the Dock entries that mirror Windows pins (`is_windows_pin`) into `windows_order`,
/// reusing the slots those entries already occupy so Lens-only pins don't move.
/// Returns true when the order changed.
pub(crate) fn apply_order<T, F, K>(items: &mut [T], is_windows_pin: F, key: K, windows_order: &[String]) -> bool
where
    T: Clone,
    F: Fn(&T) -> bool,
    K: Fn(&T) -> String,
{
    let slots: Vec<usize> = (0..items.len()).filter(|&i| is_windows_pin(&items[i])).collect();
    let mut mirrored: Vec<T> = slots.iter().map(|&i| items[i].clone()).collect();
    let rank = |t: &T| {
        let k = key(t).to_lowercase();
        windows_order
            .iter()
            .position(|w| w.to_lowercase() == k)
            .unwrap_or(usize::MAX)
    };
    let before: Vec<String> = mirrored.iter().map(&key).collect();
    mirrored.sort_by_key(rank);
    let after: Vec<String> = mirrored.iter().map(&key).collect();
    if before == after {
        return false;
    }
    for (slot, item) in slots.into_iter().zip(mirrored) {
        items[slot] = item;
    }
    true
}

/// True when `new` holds exactly the same ids as `prev`, in a different order: a reorder the
/// person made in Lens (adding or removing a pin is not a reorder).
pub(crate) fn is_reorder(prev: &[String], new: &[String]) -> bool {
    if prev.len() != new.len() || prev == new {
        return false;
    }
    let mut a = prev.to_vec();
    let mut b = new.to_vec();
    a.sort();
    b.sort();
    a == b
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A Favorites blob shaped like Explorer's: a leading byte, then for each pin a size word,
    /// some ID-list bytes and the shortcut's name as UTF-16 inside an extension block. Names
    /// are deliberately at odd offsets for some entries, and the order is not alphabetical.
    fn fixture_blob(names: &[&str]) -> Vec<u8> {
        let mut blob = vec![0x00u8];
        for (i, name) in names.iter().enumerate() {
            let mut item = vec![0x14, 0x00, 0x1F, 0x80, 0xBE, 0xEF, 0x00, 0x04];
            if i % 2 == 1 {
                item.push(0xAA); // shift the UTF-16 text to an odd offset
            }
            for u in format!("{name}.lnk").encode_utf16() {
                item.extend_from_slice(&u.to_le_bytes());
            }
            item.extend_from_slice(&[0, 0, 0x26, 0x00]);
            blob.extend_from_slice(&(item.len() as u32).to_le_bytes());
            blob.extend_from_slice(&item);
        }
        blob.push(0xFF);
        blob
    }

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn reads_pin_order_from_favorites_blob() {
        let blob = fixture_blob(&["Spotify", "File Explorer", "Discord", "Visual Studio Code"]);
        // read_dir order on NTFS is alphabetical:
        let dir_order = s(&["Discord", "File Explorer", "Spotify", "Visual Studio Code"]);
        assert_eq!(
            order_by_favorites(&dir_order, &blob),
            s(&["Spotify", "File Explorer", "Discord", "Visual Studio Code"])
        );
    }

    #[test]
    fn unknown_pins_keep_their_order_after_known_ones() {
        let blob = fixture_blob(&["Discord", "Spotify"]);
        let dir_order = s(&["Zed", "Discord", "Arc", "Spotify"]);
        assert_eq!(order_by_favorites(&dir_order, &blob), s(&["Discord", "Spotify", "Zed", "Arc"]));
    }

    #[test]
    fn matching_is_case_insensitive_and_needs_the_full_name() {
        let blob = fixture_blob(&["Microsoft Edge", "Edge Tools"]);
        assert!(favorites_offset(&blob, "microsoft edge").is_some());
        assert!(favorites_offset(&blob, "Edge").is_none());
        assert!(favorites_offset(&[], "Edge").is_none());
        assert_eq!(
            order_by_favorites(&s(&["Edge Tools", "Microsoft Edge"]), &blob),
            s(&["Microsoft Edge", "Edge Tools"])
        );
    }

    #[test]
    fn detects_reorders_only() {
        assert!(is_reorder(&s(&["a", "b", "c"]), &s(&["b", "a", "c"])));
        assert!(!is_reorder(&s(&["a", "b"]), &s(&["a", "b"])));
        assert!(!is_reorder(&s(&["a", "b"]), &s(&["a", "b", "c"])));
        assert!(!is_reorder(&s(&["a", "b"]), &s(&["a", "c"])));
    }

    #[test]
    fn applies_order_without_moving_lens_only_pins() {
        // (name, from Windows?)
        let mut items = vec![
            ("Discord", true),
            ("Lens Notes", false),
            ("File Explorer", true),
            ("Spotify", true),
        ];
        let order = s(&["Spotify", "File Explorer", "Discord"]);
        assert!(apply_order(&mut items, |t| t.1, |t| t.0.to_string(), &order));
        assert_eq!(
            items.iter().map(|t| t.0).collect::<Vec<_>>(),
            vec!["Spotify", "Lens Notes", "File Explorer", "Discord"]
        );
        assert!(!apply_order(&mut items, |t| t.1, |t| t.0.to_string(), &order));
    }
}
