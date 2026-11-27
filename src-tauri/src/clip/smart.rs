//! What a selection *is*, worked out locally (regex-free parsing, no model, no network), so the
//! selection bar can offer one smart action and a one-line preview (docs/plans/SELECTION_BAR.md
//! §3.2). Pure and cheap: it runs on every bar show and must never delay it.
//!
//! Kinds, checked in this order (the first that fits wins):
//! URL · e-mail · colour · file path · maths · number with a unit · code · one word.
//! Currencies are recognised but only converted where the currency feature already has rates;
//! here the preview just names the amount (units only, no network).

use crate::ai::calc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmartKind {
    Url,
    Email,
    Colour,
    Path,
    Maths,
    Quantity,
    Currency,
    Code,
    Word,
}

impl SmartKind {
    pub fn id(self) -> &'static str {
        match self {
            SmartKind::Url => "url",
            SmartKind::Email => "email",
            SmartKind::Colour => "colour",
            SmartKind::Path => "path",
            SmartKind::Maths => "maths",
            SmartKind::Quantity => "quantity",
            SmartKind::Currency => "currency",
            SmartKind::Code => "code",
            SmartKind::Word => "word",
        }
    }

    /// The smart action the bar puts first for this kind (an id the frontend knows).
    pub fn action(self) -> &'static str {
        match self {
            SmartKind::Url => "smart:open_url",
            SmartKind::Email => "smart:email",
            SmartKind::Colour => "smart:copy_colour",
            SmartKind::Path => "smart:show_in_explorer",
            SmartKind::Maths => "smart:copy_result",
            SmartKind::Quantity | SmartKind::Currency => "smart:convert",
            SmartKind::Code => "smart:explain_code",
            SmartKind::Word => "define",
        }
    }
}

/// One classification: the kind, a short preview line ("" when none) and a normalised value
/// (the URL, the address, the result as text, the hex colour…).
#[derive(Debug, Clone, PartialEq)]
pub struct Smart {
    pub kind: SmartKind,
    pub preview: String,
    pub value: String,
}

/// Longest selection the classifier looks at; longer text is "just text".
pub const MAX_LEN: usize = 400;

pub fn classify(text: &str) -> Option<Smart> {
    let t = text.trim();
    if t.is_empty() || t.chars().count() > MAX_LEN {
        return None;
    }
    let one_line = !t.contains('\n');
    if one_line {
        if let Some(s) = url(t) {
            return Some(s);
        }
        if let Some(s) = email(t) {
            return Some(s);
        }
        if let Some(s) = colour(t) {
            return Some(s);
        }
        if let Some(s) = path(t) {
            return Some(s);
        }
        if let Some(s) = maths(t) {
            return Some(s);
        }
        if let Some(s) = quantity(t) {
            return Some(s);
        }
    }
    if let Some(s) = code(t) {
        return Some(s);
    }
    if one_line {
        if let Some(s) = word(t) {
            return Some(s);
        }
    }
    None
}

fn smart(kind: SmartKind, preview: impl Into<String>, value: impl Into<String>) -> Option<Smart> {
    Some(Smart { kind, preview: preview.into(), value: value.into() })
}

// ---- URL and e-mail ------------------------------------------------------------------------

fn host_like(h: &str) -> bool {
    let parts: Vec<&str> = h.split('.').collect();
    parts.len() >= 2
        && parts.iter().all(|p| !p.is_empty() && p.len() <= 63 && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        && parts.last().is_some_and(|tld| tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic()))
}

fn url(t: &str) -> Option<Smart> {
    if t.contains(char::is_whitespace) {
        return None;
    }
    let lower = t.to_ascii_lowercase();
    let (full, rest) = if let Some(r) = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://")) {
        (t.to_string(), r.to_string())
    } else if let Some(r) = lower.strip_prefix("www.") {
        (format!("https://{t}"), format!("www.{r}"))
    } else {
        return None;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit_once(':').filter(|(_, p)| p.chars().all(|c| c.is_ascii_digit())).map(|(h, _)| h).unwrap_or(host);
    if !host_like(host) {
        return None;
    }
    smart(SmartKind::Url, host.trim_start_matches("www.").to_string(), full)
}

fn email(t: &str) -> Option<Smart> {
    let t = t.strip_prefix("mailto:").unwrap_or(t);
    let (local, domain) = t.split_once('@')?;
    if local.is_empty()
        || local.len() > 64
        || domain.contains('@')
        || !local.chars().all(|c| c.is_ascii_alphanumeric() || "._%+-".contains(c))
        || !host_like(&domain.to_ascii_lowercase())
    {
        return None;
    }
    smart(SmartKind::Email, "", t.to_string())
}

// ---- colour --------------------------------------------------------------------------------

/// "#1e90ff", "#fff", "rgb(30, 144, 255)", "rgba(…)", "hsl(210, 100%, 56%)" → "#1E90FF".
pub fn parse_colour(t: &str) -> Option<String> {
    let l = t.trim().to_ascii_lowercase();
    if let Some(h) = l.strip_prefix('#') {
        if !(h.len() == 3 || h.len() == 6 || h.len() == 8) || !h.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        let full: String = if h.len() == 3 { h.chars().flat_map(|c| [c, c]).collect() } else { h[..6].to_string() };
        return Some(format!("#{}", full.to_ascii_uppercase()));
    }
    let (func, args) = l.split_once('(')?;
    let args = args.strip_suffix(')')?;
    let nums: Vec<&str> = args.split([',', ' ', '/']).map(str::trim).filter(|s| !s.is_empty()).collect();
    if nums.len() < 3 || nums.len() > 4 {
        return None;
    }
    let pct = |s: &str| s.strip_suffix('%').and_then(|v| v.parse::<f64>().ok());
    match func.trim() {
        "rgb" | "rgba" => {
            let mut c = [0u8; 3];
            for (i, n) in nums.iter().take(3).enumerate() {
                let v = if let Some(p) = pct(n) { p * 2.55 } else { n.parse::<f64>().ok()? };
                if !(0.0..=255.0).contains(&v) {
                    return None;
                }
                c[i] = v.round() as u8;
            }
            Some(format!("#{:02X}{:02X}{:02X}", c[0], c[1], c[2]))
        }
        "hsl" | "hsla" => {
            let h = nums[0].trim_end_matches("deg").parse::<f64>().ok()?;
            let s = pct(nums[1])? / 100.0;
            let li = pct(nums[2])? / 100.0;
            if !(0.0..=1.0).contains(&s) || !(0.0..=1.0).contains(&li) {
                return None;
            }
            let (r, g, b) = hsl_to_rgb(h.rem_euclid(360.0), s, li);
            Some(format!("#{:02X}{:02X}{:02X}", r, g, b))
        }
        _ => None,
    }
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let to = |v: f64| ((v + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    (to(r), to(g), to(b))
}

fn colour(t: &str) -> Option<Smart> {
    let hex = parse_colour(t)?;
    smart(SmartKind::Colour, hex.clone(), hex)
}

// ---- file path -----------------------------------------------------------------------------

/// A Windows path: "C:\…", "D:/…", "\\server\share\…" or "%USERPROFILE%\…". Existence is the
/// caller's business (this module never touches the disk).
pub fn looks_like_path(t: &str) -> bool {
    let t = t.trim().trim_matches('"');
    if t.len() < 3 || t.len() > 260 || t.contains(['<', '>', '|', '*', '?', '\n']) {
        return false;
    }
    let b = t.as_bytes();
    let drive = b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/');
    let unc = t.starts_with("\\\\") && t[2..].contains('\\');
    let env = t.starts_with('%') && t[1..].contains("%\\");
    drive || unc || env
}

fn path(t: &str) -> Option<Smart> {
    if !looks_like_path(t) {
        return None;
    }
    let clean = t.trim().trim_matches('"');
    let name = clean.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(clean);
    smart(SmartKind::Path, name.to_string(), clean.to_string())
}

// ---- maths and quantities --------------------------------------------------------------------

fn maths(t: &str) -> Option<Smart> {
    // "12,480" is a number, not a sum: an operator is required.
    let src = t.trim().trim_end_matches('=').trim();
    if !calc::looks_like_math(src) {
        return None;
    }
    let v = calc::eval(&src.replace(',', ""))?;
    let shown = calc::format_number((v * 1e6).round() / 1e6);
    smart(SmartKind::Maths, format!("= {shown}"), shown)
}

/// The counterpart unit shown in the preview (metric ⇄ imperial, °C ⇄ °F, bytes one step).
fn counterpart(sym: &str) -> Option<&'static str> {
    Some(match sym {
        "km" => "mi",
        "mi" => "km",
        "m" => "ft",
        "ft" => "m",
        "cm" => "in",
        "in" => "cm",
        "mm" => "in",
        "yd" => "m",
        "kg" => "lb",
        "lb" => "kg",
        "g" => "oz",
        "oz" => "g",
        "st" => "kg",
        "°C" => "°F",
        "°F" => "°C",
        "K" => "°C",
        "l" => "gal",
        "gal" => "l",
        "ml" => "fl oz",
        "fl oz" => "ml",
        "cup" => "ml",
        "km/h" => "mph",
        "mph" => "km/h",
        "m/s" => "km/h",
        "kn" => "km/h",
        "MB" => "GB",
        "GB" => "MB",
        "TB" => "GB",
        "KB" => "MB",
        "min" => "h",
        "h" => "min",
        "day" => "h",
        "week" => "day",
        _ => return None,
    })
}

const CURRENCIES: &[(&str, &str)] = &[
    ("$", "USD"), ("usd", "USD"), ("€", "EUR"), ("eur", "EUR"), ("£", "GBP"), ("gbp", "GBP"), ("¥", "JPY"), ("jpy", "JPY"),
    ("chf", "CHF"), ("cad", "CAD"), ("aud", "AUD"), ("sek", "SEK"), ("nok", "NOK"), ("dkk", "DKK"), ("inr", "INR"), ("cny", "CNY"),
];

/// Splits "12,480 USD", "$12.5k", "5km", "-3.5 °C" into (number, unit text).
fn number_and_unit(t: &str) -> Option<(f64, String)> {
    let s = t.trim();
    // A leading currency symbol: "$12.50".
    for (sym, code) in CURRENCIES.iter().filter(|(s, _)| !s.chars().all(|c| c.is_ascii_alphabetic())) {
        if let Some(rest) = s.strip_prefix(sym) {
            let v = parse_number(rest.trim())?;
            return Some((v, code.to_string()));
        }
    }
    let end = s.char_indices().find(|(_, c)| !(c.is_ascii_digit() || matches!(c, '.' | ',' | '-' | '+'))).map(|(i, _)| i).unwrap_or(s.len());
    if end == 0 {
        return None;
    }
    let v = parse_number(&s[..end])?;
    let unit = s[end..].trim().to_string();
    if unit.is_empty() || unit.chars().count() > 20 {
        return None;
    }
    Some((v, unit))
}

/// "12,480" → 12480; "1.5" → 1.5; "1,5" (European decimal) → 1.5 when it can't be thousands.
fn parse_number(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() || !s.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    let thousands = s.split(',').skip(1).all(|g| g.len() == 3 && g.chars().all(|c| c.is_ascii_digit()));
    let n = if s.contains(',') && !s.contains('.') && !thousands { s.replace(',', ".") } else { s.replace(',', "") };
    n.parse::<f64>().ok().filter(|v| v.is_finite())
}

fn quantity(t: &str) -> Option<Smart> {
    let (v, unit) = number_and_unit(t)?;
    let lower = unit.to_lowercase();
    if let Some((_, code)) = CURRENCIES.iter().find(|(s, _)| *s == lower) {
        return smart(SmartKind::Currency, format!("{} {}", calc::format_number(v), code), format!("{v} {code}"));
    }
    if let Some((_, code)) = CURRENCIES.iter().find(|(_, c)| c.eq_ignore_ascii_case(&unit)) {
        return smart(SmartKind::Currency, format!("{} {}", calc::format_number(v), code), format!("{v} {code}"));
    }
    // Which unit is it? Converting to itself names the canonical symbol.
    let from = calc::convert(v, &unit, &unit)?.from;
    let to = counterpart(from)?;
    let c = calc::convert(v, from, to)?;
    let shown = calc::format_number((c.result * 100.0).round() / 100.0);
    smart(SmartKind::Quantity, format!("≈ {shown} {to}"), format!("{v} {from} in {to}"))
}

// ---- code and words ------------------------------------------------------------------------

/// A rough "this is source code" test: several of the usual tells, never prose.
pub fn looks_like_code(t: &str) -> bool {
    let tells = [
        ";\n", "{\n", "}\n", "=>", "->", "::", "fn ", "def ", "function ", "const ", "let ", "var ", "return ", "import ", "#include",
        "class ", "public ", "</", "/>", "==", "!=", "&&", "||", "print(", "console.", "SELECT ", " FROM ", "#!/",
    ];
    let hits = tells.iter().filter(|p| t.contains(*p)).count();
    let symbols = t.chars().filter(|c| "{}[]();=<>".contains(*c)).count();
    let words = t.split_whitespace().count().max(1);
    hits >= 2 || (hits >= 1 && symbols * 4 >= words) || (t.trim_end().ends_with(';') && symbols >= 3)
}

/// The language, by a few cheap tells ("" when unsure).
pub fn code_language(t: &str) -> &'static str {
    if t.contains("fn ") && (t.contains("let ") || t.contains("->") || t.contains("::")) {
        "Rust"
    } else if t.contains("def ") || (t.contains("import ") && t.contains(':') && !t.contains(';')) {
        "Python"
    } else if t.contains("=>") || t.contains("const ") || t.contains("function ") || t.contains("console.") {
        "JavaScript"
    } else if t.to_ascii_uppercase().contains("SELECT ") && t.to_ascii_uppercase().contains(" FROM ") {
        "SQL"
    } else if t.contains("</") || t.contains("/>") {
        "HTML"
    } else if t.contains("#include") {
        "C"
    } else {
        ""
    }
}

fn code(t: &str) -> Option<Smart> {
    if t.len() < 8 || !looks_like_code(t) {
        return None;
    }
    let lang = code_language(t);
    smart(SmartKind::Code, lang, lang)
}

fn word(t: &str) -> Option<Smart> {
    let w = t.trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace() || "“”‘’«»".contains(c));
    if w.chars().count() < 2 || w.chars().count() > 32 || !w.chars().all(|c| c.is_alphabetic() || c == '-' || c == '\'') {
        return None;
    }
    smart(SmartKind::Word, "", w.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(t: &str) -> Option<SmartKind> {
        classify(t).map(|s| s.kind)
    }

    #[test]
    fn urls() {
        for u in ["https://example.com", "http://example.com/a?b=1#c", "www.lens.dev/docs", "https://sub.domain.co.uk:8443/x"] {
            assert_eq!(kind(u), Some(SmartKind::Url), "{u}");
        }
        assert_eq!(classify("https://www.example.com/path").unwrap().preview, "example.com");
        assert_eq!(classify("www.example.com").unwrap().value, "https://www.example.com");
        for not in ["example", "https://", "https://nodot", "see https://example.com now", "ftp://x.com", "http://-"] {
            assert_ne!(kind(not), Some(SmartKind::Url), "{not}");
        }
    }

    #[test]
    fn emails() {
        for e in ["me@example.com", "first.last+tag@sub.example.org", "mailto:a_b@x.io"] {
            assert_eq!(kind(e), Some(SmartKind::Email), "{e}");
        }
        assert_eq!(classify("mailto:a_b@x.io").unwrap().value, "a_b@x.io");
        for not in ["@example.com", "me@", "me@localhost", "a@b@c.com", "me at example.com"] {
            assert_ne!(kind(not), Some(SmartKind::Email), "{not}");
        }
    }

    #[test]
    fn colours() {
        assert_eq!(parse_colour("#fff").as_deref(), Some("#FFFFFF"));
        assert_eq!(parse_colour("#1e90ff").as_deref(), Some("#1E90FF"));
        assert_eq!(parse_colour("#1e90ffcc").as_deref(), Some("#1E90FF"));
        assert_eq!(parse_colour("rgb(30, 144, 255)").as_deref(), Some("#1E90FF"));
        assert_eq!(parse_colour("rgba(30 144 255 / 0.5)").as_deref(), Some("#1E90FF"));
        assert_eq!(parse_colour("rgb(100%, 0%, 0%)").as_deref(), Some("#FF0000"));
        assert_eq!(parse_colour("hsl(0, 100%, 50%)").as_deref(), Some("#FF0000"));
        assert_eq!(parse_colour("hsl(120deg, 100%, 25%)").as_deref(), Some("#008000"));
        assert_eq!(parse_colour("hsl(240, 100%, 50%)").as_deref(), Some("#0000FF"));
        for not in ["#ggg", "#12", "rgb(300, 0, 0)", "rgb(1,2)", "hsl(0, 200%, 50%)", "cmyk(0,0,0,0)"] {
            assert_eq!(parse_colour(not), None, "{not}");
        }
        assert_eq!(kind("#09090b"), Some(SmartKind::Colour));
    }

    #[test]
    fn paths() {
        for p in ["C:\\Users\\me\\Documents\\report.docx", "D:/games/save.dat", "\\\\server\\share\\file.txt", "%USERPROFILE%\\Desktop", "\"C:\\Program Files\\Lens\""] {
            assert_eq!(kind(p), Some(SmartKind::Path), "{p}");
        }
        assert_eq!(classify("C:\\Users\\me\\Documents\\report.docx").unwrap().preview, "report.docx");
        assert_eq!(classify("\"C:\\Program Files\\Lens\"").unwrap().value, "C:\\Program Files\\Lens");
        for not in ["C:", "C:report", "/usr/bin", "\\\\server", "C:\\a|b"] {
            assert_ne!(kind(not), Some(SmartKind::Path), "{not}");
        }
    }

    #[test]
    fn maths() {
        assert_eq!(classify("12 * 3.5").unwrap().preview, "= 42");
        assert_eq!(classify("(1 + 2) ^ 3").unwrap().preview, "= 27");
        assert_eq!(classify("10 / 4 =").unwrap().preview, "= 2.5");
        assert_eq!(classify("12,000 + 480").unwrap().preview, "= 12480");
        assert_eq!(classify("0.1 + 0.2").unwrap().value, "0.3");
        assert_ne!(kind("12,480"), Some(SmartKind::Maths), "a plain number is not a sum");
        assert_eq!(kind("1 / 0"), None, "division by zero has no result");
    }

    #[test]
    fn quantities() {
        assert_eq!(classify("5 km").unwrap().preview, "≈ 3.11 mi");
        assert_eq!(classify("5km").unwrap().preview, "≈ 3.11 mi");
        assert_eq!(classify("100 °F").unwrap().preview, "≈ 37.78 °C");
        assert_eq!(classify("-3.5 celsius").unwrap().preview, "≈ 25.7 °F");
        assert_eq!(classify("2 kg").unwrap().preview, "≈ 4.41 lb");
        assert_eq!(classify("1,5 l").unwrap().preview, "≈ 0.4 gal");
        assert_eq!(classify("12,480 USD").unwrap().kind, SmartKind::Currency);
        assert_eq!(classify("12,480 USD").unwrap().preview, "12480 USD");
        assert_eq!(classify("$12.50").unwrap().preview, "12.5 USD");
        assert_eq!(classify("€ 3").unwrap().kind, SmartKind::Currency);
        assert_eq!(kind("5 bananas"), None, "unknown unit: nothing");
    }

    #[test]
    fn code() {
        let rust = "fn main() {\n    let x = 1;\n}\n";
        assert_eq!(kind(rust), Some(SmartKind::Code));
        assert_eq!(classify(rust).unwrap().preview, "Rust");
        assert_eq!(classify("const add = (a, b) => a + b;").unwrap().preview, "JavaScript");
        assert_eq!(classify("def add(a, b):\n    return a + b").unwrap().preview, "Python");
        assert_eq!(classify("SELECT name FROM users WHERE id = 1;").unwrap().preview, "SQL");
        for prose in ["The quarterly numbers were good, and the team was happy.", "Let me know if you want to meet tomorrow."] {
            assert_ne!(kind(prose), Some(SmartKind::Code), "{prose}");
        }
    }

    #[test]
    fn words_and_plain_text() {
        assert_eq!(kind("serendipity"), Some(SmartKind::Word));
        assert_eq!(classify("“serendipity,”").unwrap().value, "serendipity");
        assert_eq!(kind("well-being"), Some(SmartKind::Word));
        assert_eq!(kind("two words"), None);
        assert_eq!(kind("a"), None);
        assert_eq!(kind(""), None);
        assert_eq!(kind(&"x".repeat(MAX_LEN + 1)), None);
        assert_eq!(SmartKind::Word.action(), "define");
        assert!(SmartKind::ALL_IDS.iter().all(|id| !id.is_empty()));
    }

    #[test]
    fn order_is_stable() {
        // A URL that is also one "word" is a URL; an e-mail is never a path.
        assert_eq!(kind("www.example.com"), Some(SmartKind::Url));
        assert_eq!(kind("me@example.com"), Some(SmartKind::Email));
        assert_eq!(kind("#fff"), Some(SmartKind::Colour));
    }
}

impl SmartKind {
    /// Every kind's id, for the settings ("smart previews per kind").
    pub const ALL_IDS: [&'static str; 9] = ["url", "email", "colour", "path", "maths", "quantity", "currency", "code", "word"];
}
