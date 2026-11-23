//! A small confusable-letter table and the "skeleton" used to compare domain names.
//!
//! The mappings are a hand-picked subset of the prototypes in Unicode's `confusables.txt`
//! (Unicode Technical Standard #39, "Unicode Security Mechanisms"). That data is distributed under
//! the Unicode License v3, which allows copying and modification with the copyright notice kept;
//! see docs/AGENT_SAFETY.md › "Third-party data". Only the Latin-lookalike letters that matter for
//! domain names are included (Cyrillic, Greek, Armenian, Latin extensions, fullwidth forms), plus
//! a few ASCII digit/letter swaps that phishers use (`0`→`o`, `1`→`l`, `rn`→`m`).
//!
//! The skeleton is only used for comparison; it is never shown to people.

/// Maps one character to its Latin prototype, if it is a known look-alike.
pub fn prototype(c: char) -> Option<char> {
    let p = match c {
        // Cyrillic
        'а' => 'a', 'в' => 'b', 'с' => 'c', 'ԁ' => 'd', 'е' => 'e', 'һ' => 'h', 'і' => 'i',
        'ј' => 'j', 'к' => 'k', 'ӏ' => 'l', 'м' => 'm', 'п' => 'n', 'о' => 'o', 'р' => 'p',
        'ԛ' => 'q', 'г' => 'r', 'ѕ' => 's', 'т' => 't', 'ц' => 'u', 'ѵ' => 'v', 'ԝ' => 'w',
        'х' => 'x', 'у' => 'y', 'ᴢ' => 'z', 'ё' => 'e', 'ї' => 'i', 'ѡ' => 'w', 'ү' => 'y',
        'А' => 'a', 'В' => 'b', 'С' => 'c', 'Е' => 'e', 'Н' => 'h', 'І' => 'i', 'Ј' => 'j',
        'К' => 'k', 'М' => 'm', 'О' => 'o', 'Р' => 'p', 'Ѕ' => 's', 'Т' => 't', 'Х' => 'x',
        'У' => 'y', 'Ү' => 'y', 'Ԍ' => 'g', 'Ԛ' => 'q', 'Ԝ' => 'w', 'ɡ' => 'g',
        // Greek
        'α' => 'a', 'β' => 'b', 'ε' => 'e', 'η' => 'n', 'ι' => 'i', 'κ' => 'k', 'ν' => 'v',
        'ο' => 'o', 'ρ' => 'p', 'τ' => 't', 'υ' => 'u', 'χ' => 'x', 'γ' => 'y', 'ω' => 'w',
        'Α' => 'a', 'Β' => 'b', 'Ε' => 'e', 'Ζ' => 'z', 'Η' => 'h', 'Ι' => 'i', 'Κ' => 'k',
        'Μ' => 'm', 'Ν' => 'n', 'Ο' => 'o', 'Ρ' => 'p', 'Τ' => 't', 'Υ' => 'y', 'Χ' => 'x',
        // Armenian
        'օ' => 'o', 'ս' => 'u', 'ց' => 'g', 'հ' => 'h', 'ո' => 'n', 'զ' => 'q',
        // Latin extensions and modifiers
        'ı' => 'i', 'ɩ' => 'i', 'ł' => 'l', 'ƚ' => 'l', 'ɑ' => 'a', 'ǝ' => 'e', 'ɛ' => 'e',
        'ɵ' => 'o', 'ø' => 'o', 'ð' => 'd', 'đ' => 'd', 'ħ' => 'h', 'ŀ' => 'l', 'ſ' => 'f',
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' | 'ạ' => 'a',
        'ç' | 'ć' | 'ĉ' | 'ċ' | 'č' => 'c',
        'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' | 'ẹ' => 'e',
        'ì' | 'í' | 'î' | 'ï' | 'ĩ' | 'ī' | 'ĭ' | 'į' | 'ị' => 'i',
        'ñ' | 'ń' | 'ņ' | 'ň' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ō' | 'ŏ' | 'ő' | 'ọ' => 'o',
        'ù' | 'ú' | 'û' | 'ü' | 'ũ' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' | 'ụ' => 'u',
        'ý' | 'ÿ' | 'ŷ' => 'y',
        'ś' | 'ŝ' | 'ş' | 'š' | 'ṣ' => 's',
        'ź' | 'ż' | 'ž' => 'z',
        'ĝ' | 'ğ' | 'ġ' | 'ģ' => 'g',
        'ĺ' | 'ļ' | 'ľ' => 'l',
        'ŕ' | 'ŗ' | 'ř' => 'r',
        'ţ' | 'ť' => 't',
        'ŵ' => 'w',
        'ķ' => 'k',
        // Fullwidth Latin letters and digits
        c @ '\u{FF41}'..='\u{FF5A}' => char::from_u32(c as u32 - 0xFF41 + 'a' as u32)?,
        c @ '\u{FF21}'..='\u{FF3A}' => char::from_u32(c as u32 - 0xFF21 + 'a' as u32)?,
        c @ '\u{FF10}'..='\u{FF19}' => char::from_u32(c as u32 - 0xFF10 + '0' as u32)?,
        _ => return None,
    };
    Some(p)
}

/// Which writing system a letter belongs to, for mixed-script detection.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Script {
    Latin,
    Cyrillic,
    Greek,
    Armenian,
    Other,
    Common,
}

pub fn script_of(c: char) -> Script {
    let u = c as u32;
    if c.is_ascii_alphabetic() || (0x00C0..=0x024F).contains(&u) || (0x1E00..=0x1EFF).contains(&u) {
        Script::Latin
    } else if (0x0400..=0x052F).contains(&u) || (0x1C80..=0x1C8F).contains(&u) {
        Script::Cyrillic
    } else if (0x0370..=0x03FF).contains(&u) || (0x1F00..=0x1FFF).contains(&u) {
        Script::Greek
    } else if (0x0530..=0x058F).contains(&u) {
        Script::Armenian
    } else if c.is_ascii() || !c.is_alphabetic() {
        Script::Common
    } else {
        Script::Other
    }
}

/// True when a label mixes Latin letters with Cyrillic, Greek or Armenian ones, the classic
/// homograph pattern. A label written entirely in one script (e.g. a real Russian domain) is fine.
pub fn is_mixed_script(label: &str) -> bool {
    let mut latin = false;
    let mut lookalike_script = false;
    for c in label.chars() {
        match script_of(c) {
            Script::Latin => latin = true,
            Script::Cyrillic | Script::Greek | Script::Armenian => lookalike_script = true,
            _ => {}
        }
    }
    latin && lookalike_script
}

/// True when every letter of a non-Latin label has a Latin look-alike, e.g. a fully Cyrillic
/// "аррӏе" that renders like "apple".
pub fn is_whole_script_lookalike(label: &str) -> bool {
    let mut any = false;
    for c in label.chars() {
        if c == '-' || c.is_ascii_digit() {
            continue;
        }
        if c.is_ascii() {
            return false;
        }
        if prototype(c).is_none() {
            return false;
        }
        any = true;
    }
    any
}

/// The comparison skeleton: lower-case, look-alikes folded to Latin, then a few multi-letter
/// tricks folded (`rn`→`m`, `vv`→`w`, `cl`→`d`) and digit swaps (`0`→`o`, `1`→`l`, `3`→`e`,
/// `5`→`s`). Hyphens are kept. Always compare skeleton to skeleton, so real names that contain
/// `rn` or `cl` still match themselves.
pub fn skeleton(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let c = c.to_lowercase().next().unwrap_or(c);
        let c = prototype(c).unwrap_or(c);
        let c = match c {
            '0' => 'o',
            '1' | '|' => 'l',
            '3' => 'e',
            '5' => 's',
            _ => c,
        };
        out.push(c);
    }
    out.replace("rn", "m").replace("vv", "w").replace("cl", "d")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_cyrillic_and_digits() {
        assert_eq!(skeleton("раураl"), "paypal");
        assert_eq!(skeleton("g00gle"), "google");
        assert_eq!(skeleton("rnicrosoft"), "microsoft");
        assert_eq!(skeleton("ＡＰＰＬＥ"), "apple");
    }

    #[test]
    fn mixed_script() {
        assert!(is_mixed_script("pаypal")); // Cyrillic а
        assert!(!is_mixed_script("paypal"));
        assert!(!is_mixed_script("яндекс"));
        assert!(is_whole_script_lookalike("аррӏе"));
        assert!(!is_whole_script_lookalike("яндекс"));
    }
}
