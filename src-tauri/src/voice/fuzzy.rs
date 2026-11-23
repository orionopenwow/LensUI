//! Small, dependency-free fuzzy matching for speech: app names the recogniser split or misheard
//! ("spot if i" → Spotify) and "did you mean" suggestions.

/// Lowercase letters and digits only.
pub fn squash(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// 1.0 = identical, 0.0 = nothing in common.
pub fn ratio(a: &str, b: &str) -> f32 {
    let n = a.chars().count().max(b.chars().count());
    if n == 0 {
        return 1.0;
    }
    1.0 - levenshtein(a, b) as f32 / n as f32
}

/// Best app for a spoken name. Exact (ignoring spaces and punctuation) scores 1.0, a whole
/// word of the app's name 0.95, a prefix 0.9, otherwise the edit-distance ratio of the squashed
/// strings (against the full name and each word). Returns `None` below 0.75.
pub fn best_app<'a>(spoken: &str, candidates: &'a [String]) -> Option<(&'a str, f32)> {
    let s = squash(spoken);
    if s.len() < 2 {
        return None;
    }
    let mut best: Option<(&str, f32)> = None;
    for c in candidates {
        let full = squash(c);
        if full.is_empty() {
            continue;
        }
        let mut score = if full == s {
            1.0
        } else if c.split_whitespace().any(|w| squash(w) == s) {
            0.95
        } else if s.len() >= 3 && full.starts_with(&s) {
            0.9
        } else {
            let mut r = ratio(&s, &full);
            for w in c.split_whitespace() {
                let w = squash(w);
                if w.len() >= 4 {
                    r = r.max(ratio(&s, &w) * 0.97);
                }
            }
            r
        };
        // Prefer shorter names on ties ("Chrome" over "Chrome Remote Desktop").
        score -= full.len() as f32 * 0.0001;
        if best.map(|(_, b)| score > b).unwrap_or(true) {
            best = Some((c.as_str(), score));
        }
    }
    best.filter(|(_, sc)| *sc >= 0.75)
}

/// Closest phrase from `examples`, if it is close enough to suggest (ratio ≥ 0.6).
pub fn did_you_mean<'a>(heard: &str, examples: &[&'a str]) -> Option<&'a str> {
    let h = heard.trim().to_lowercase();
    if h.len() < 3 {
        return None;
    }
    examples
        .iter()
        .map(|e| (*e, ratio(&h, e)))
        .filter(|(_, r)| *r >= 0.6)
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(e, _)| e)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apps() -> Vec<String> {
        [
            "Spotify", "Google Chrome", "Firefox", "Visual Studio Code", "Notepad", "Microsoft Excel", "Microsoft Word", "WordPad",
            "Discord", "Steam", "Adobe Photoshop 2025", "File Explorer", "Calculator", "OneNote", "Microsoft Teams", "Slack",
            "Obsidian", "Chrome Remote Desktop",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect()
    }

    #[test]
    fn app_names_survive_mishearing() {
        let a = apps();
        let cases = [
            ("spot if i", "Spotify"),
            ("spotify", "Spotify"),
            ("chrome", "Google Chrome"),
            ("fire fox", "Firefox"),
            ("note pad", "Notepad"),
            ("excel", "Microsoft Excel"),
            ("word", "Microsoft Word"),
            ("photo shop", "Adobe Photoshop 2025"),
            ("one note", "OneNote"),
            ("discourd", "Discord"),
            ("visual studio code", "Visual Studio Code"),
            ("calculater", "Calculator"),
            ("teems", "Microsoft Teams"),
            ("obsidion", "Obsidian"),
        ];
        for (spoken, want) in cases {
            assert_eq!(best_app(spoken, &a).map(|(n, _)| n), Some(want), "{}", spoken);
        }
        assert_eq!(best_app("zzzz", &a), None);
        assert_eq!(best_app("x", &a), None);
    }

    #[test]
    fn suggestions() {
        let ex = ["minimise this", "show desktop", "next workspace", "dark mode"];
        assert_eq!(did_you_mean("minimize dis", &ex), Some("minimise this"));
        assert_eq!(did_you_mean("show the desk top", &ex), Some("show desktop"));
        assert_eq!(did_you_mean("banana bread recipe", &ex), None);
    }

    #[test]
    fn levenshtein_basics() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("", "abc"), 3);
        assert!((ratio("abc", "abc") - 1.0).abs() < f32::EPSILON);
    }
}
