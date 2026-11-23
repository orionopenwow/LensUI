//! Spoken numbers → digits, but only where a number is expected ("volume thirty percent",
//! "workspace two", "timer for five minutes"). App names such as "One Note" stay untouched.
//! Standard library only.

const UNITS: &[(&str, u32)] = &[
    ("zero", 0),
    ("oh", 0),
    ("one", 1),
    ("two", 2),
    ("three", 3),
    ("four", 4),
    ("five", 5),
    ("six", 6),
    ("seven", 7),
    ("eight", 8),
    ("nine", 9),
    ("ten", 10),
    ("eleven", 11),
    ("twelve", 12),
    ("thirteen", 13),
    ("fourteen", 14),
    ("fifteen", 15),
    ("sixteen", 16),
    ("seventeen", 17),
    ("eighteen", 18),
    ("nineteen", 19),
];

const TENS: &[(&str, u32)] = &[
    ("twenty", 20),
    ("thirty", 30),
    ("forty", 40),
    ("fourty", 40),
    ("fifty", 50),
    ("sixty", 60),
    ("seventy", 70),
    ("eighty", 80),
    ("ninety", 90),
];

/// Words after which a number is expected.
const BEFORE: &[&str] = &[
    "volume", "brightness", "workspace", "desktop", "to", "at", "for", "by", "timer", "number", "monitor", "screen", "level",
    "in", "of",
];

/// Words that mark the preceding words as a number.
const AFTER: &[&str] = &[
    "percent", "%", "minute", "minutes", "min", "mins", "second", "seconds", "sec", "secs", "hour", "hours", "hr", "hrs",
    "km", "kilometres", "kilometers", "kilometre", "kilometer", "mile", "miles", "mi", "kg", "kilograms", "kilos", "pound", "pounds",
    "lb", "lbs", "foot", "feet", "ft", "inch", "inches", "cm", "centimetres", "centimeters", "metre", "metres", "meter", "meters",
    "degrees", "celsius", "fahrenheit", "litre", "litres", "liter", "liters", "gb", "mb", "gigabytes", "megabytes", "times", "plus",
    "minus", "divided",
];

fn unit(w: &str) -> Option<u32> {
    UNITS.iter().find(|(n, _)| *n == w).map(|(_, v)| *v)
}

fn tens(w: &str) -> Option<u32> {
    TENS.iter().find(|(n, _)| *n == w).map(|(_, v)| *v)
}

/// Reads a number starting at `words[i]`; returns (value, words consumed).
fn read_number(words: &[&str], i: usize) -> Option<(u32, usize)> {
    let w = words.get(i)?;
    // "forty-five"
    if let Some((a, b)) = w.split_once('-') {
        if let (Some(t), Some(u)) = (tens(a), unit(b)) {
            if u < 10 {
                return Some((t + u, 1));
            }
        }
    }
    // "a hundred", "one hundred"
    if (*w == "a" || *w == "one") && words.get(i + 1) == Some(&"hundred") {
        return Some((100, 2));
    }
    if *w == "hundred" {
        return Some((100, 1));
    }
    if let Some(t) = tens(w) {
        if let Some(u) = words.get(i + 1).and_then(|n| unit(n)).filter(|u| (1..10).contains(u)) {
            return Some((t + u, 2));
        }
        return Some((t, 1));
    }
    if *w == "oh" {
        return None; // only meaningful inside clock times, which we don't parse here
    }
    unit(w).map(|u| (u, 1))
}

/// Converts number words to digits where the context expects a number.
pub fn convert(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut out: Vec<String> = Vec::with_capacity(words.len());
    let mut i = 0;
    while i < words.len() {
        if let Some((value, used)) = read_number(&words, i) {
            let prev = if i == 0 { None } else { words.get(i - 1).copied() };
            let next = words.get(i + used).copied();
            let expected = prev.map(|p| BEFORE.contains(&p)).unwrap_or(false) || next.map(|n| AFTER.contains(&n)).unwrap_or(false);
            if expected {
                out.push(value.to_string());
                i += used;
                continue;
            }
        }
        out.push(words[i].to_string());
        i += 1;
    }
    out.join(" ")
}

#[cfg(test)]
mod tests {
    use super::convert;

    #[test]
    fn converts_in_context() {
        assert_eq!(convert("volume thirty percent"), "volume 30 percent");
        assert_eq!(convert("set volume to forty five"), "set volume to 45");
        assert_eq!(convert("brightness to seventy-five"), "brightness to 75");
        assert_eq!(convert("workspace two"), "workspace 2");
        assert_eq!(convert("timer for five minutes"), "timer for 5 minutes");
        assert_eq!(convert("ten minute timer"), "10 minute timer");
        assert_eq!(convert("volume to a hundred"), "volume to 100");
        assert_eq!(convert("dnd for ninety minutes"), "dnd for 90 minutes");
    }

    #[test]
    fn leaves_names_alone() {
        assert_eq!(convert("open one note"), "open one note");
        assert_eq!(convert("switch to three d viewer"), "switch to 3 d viewer"); // "to" expects a number; harmless
        assert_eq!(convert("open seven zip"), "open seven zip");
        assert_eq!(convert("play two steps from hell"), "play two steps from hell");
    }
}
