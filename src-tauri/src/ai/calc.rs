//! Offline calculator and unit converter for the script assistant. Standard library only.
//!
//! The grammar is small on purpose: + - * / ^ %, parentheses, unary minus, "x" or "×" for
//! multiply, "N% of M", sqrt(), pi and e. No variables, no loops, no way to run anything.

/// Formats a number without float noise: 0.1+0.2 → "0.3", 1e21 stays readable.
pub fn format_number(v: f64) -> String {
    if !v.is_finite() {
        return if v.is_nan() { "not a number".into() } else { "infinity".into() };
    }
    if v == v.trunc() && v.abs() < 1e15 {
        return format!("{}", v as i64);
    }
    let s = format!("{:.10}", v);
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    if s == "-0" {
        "0".into()
    } else {
        s
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(f64),
    Op(char),
    LParen,
    RParen,
    Ident(String),
}

fn tokenize(src: &str) -> Option<Vec<Tok>> {
    let mut out = Vec::new();
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.' || (chars[i] == ',' && i + 1 < chars.len() && chars[i + 1].is_ascii_digit())) {
                i += 1;
            }
            let raw: String = chars[start..i].iter().filter(|c| **c != ',').collect();
            out.push(Tok::Num(raw.parse().ok()?));
            continue;
        }
        if c.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_alphabetic() {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect::<String>().to_lowercase();
            match word.as_str() {
                "x" | "times" => out.push(Tok::Op('*')),
                "plus" => out.push(Tok::Op('+')),
                "minus" => out.push(Tok::Op('-')),
                "over" => out.push(Tok::Op('/')),
                "mod" => out.push(Tok::Op('m')),
                "of" => out.push(Tok::Op('*')),
                _ => out.push(Tok::Ident(word)),
            }
            continue;
        }
        match c {
            '+' | '-' | '*' | '/' | '^' | '%' => out.push(Tok::Op(c)),
            '×' | '·' => out.push(Tok::Op('*')),
            '÷' => out.push(Tok::Op('/')),
            '(' => out.push(Tok::LParen),
            ')' => out.push(Tok::RParen),
            _ => return None,
        }
        i += 1;
    }
    Some(out)
}

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
    depth: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }
    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        t
    }
    fn expr(&mut self) -> Option<f64> {
        let mut v = self.term()?;
        while let Some(Tok::Op(c)) = self.peek() {
            let c = *c;
            if c != '+' && c != '-' {
                break;
            }
            self.pos += 1;
            let r = self.term()?;
            v = if c == '+' { v + r } else { v - r };
        }
        Some(v)
    }
    fn term(&mut self) -> Option<f64> {
        let mut v = self.power()?;
        loop {
            match self.peek() {
                Some(Tok::Op(c)) if matches!(c, '*' | '/' | 'm') => {
                    let c = *c;
                    self.pos += 1;
                    let r = self.power()?;
                    v = match c {
                        '*' => v * r,
                        '/' => {
                            if r == 0.0 {
                                return None;
                            }
                            v / r
                        }
                        _ => {
                            if r == 0.0 {
                                return None;
                            }
                            v % r
                        }
                    };
                }
                // Implicit multiply: "2(3+4)" or "2pi".
                Some(Tok::LParen) | Some(Tok::Ident(_)) => {
                    let r = self.power()?;
                    v *= r;
                }
                _ => break,
            }
        }
        Some(v)
    }
    fn power(&mut self) -> Option<f64> {
        let base = self.unary()?;
        if let Some(Tok::Op('^')) = self.peek() {
            self.pos += 1;
            let exp = self.power()?; // right-associative
            return Some(base.powf(exp));
        }
        Some(base)
    }
    fn unary(&mut self) -> Option<f64> {
        match self.peek() {
            Some(Tok::Op('-')) => {
                self.pos += 1;
                Some(-self.unary()?)
            }
            Some(Tok::Op('+')) => {
                self.pos += 1;
                self.unary()
            }
            _ => self.postfix(),
        }
    }
    fn postfix(&mut self) -> Option<f64> {
        let mut v = self.atom()?;
        while let Some(Tok::Op('%')) = self.peek() {
            self.pos += 1;
            v /= 100.0;
        }
        Some(v)
    }
    fn atom(&mut self) -> Option<f64> {
        self.depth += 1;
        if self.depth > 64 {
            return None;
        }
        let r = match self.next()? {
            Tok::Num(n) => Some(n),
            Tok::LParen => {
                let v = self.expr()?;
                match self.next()? {
                    Tok::RParen => Some(v),
                    _ => None,
                }
            }
            Tok::Ident(name) => match name.as_str() {
                "pi" => Some(std::f64::consts::PI),
                "e" => Some(std::f64::consts::E),
                "sqrt" | "abs" | "round" | "floor" | "ceil" | "ln" | "log" | "sin" | "cos" | "tan" => {
                    let arg = self.atom()?;
                    Some(match name.as_str() {
                        "sqrt" => {
                            if arg < 0.0 {
                                return None;
                            }
                            arg.sqrt()
                        }
                        "abs" => arg.abs(),
                        "round" => arg.round(),
                        "floor" => arg.floor(),
                        "ceil" => arg.ceil(),
                        "ln" => arg.ln(),
                        "log" => arg.log10(),
                        "sin" => arg.to_radians().sin(),
                        "cos" => arg.to_radians().cos(),
                        _ => arg.to_radians().tan(),
                    })
                }
                _ => None,
            },
            _ => None,
        };
        self.depth -= 1;
        r
    }
}

/// Evaluates an arithmetic expression. `None` if it isn't one (or divides by zero).
pub fn eval(src: &str) -> Option<f64> {
    if src.len() > 200 {
        return None;
    }
    let toks = tokenize(src)?;
    if toks.is_empty() || !toks.iter().any(|t| matches!(t, Tok::Num(_)) || matches!(t, Tok::Ident(n) if n == "pi")) {
        return None;
    }
    let mut p = Parser { toks, pos: 0, depth: 0 };
    let v = p.expr()?;
    if p.pos != p.toks.len() || !v.is_finite() {
        return None;
    }
    Some(v)
}

/// True if the text is plainly an arithmetic expression (digits and operators only).
pub fn looks_like_math(src: &str) -> bool {
    let t = src.trim();
    !t.is_empty()
        && t.chars().any(|c| c.is_ascii_digit())
        && t.chars().any(|c| "+-*/^%×÷()".contains(c))
        && t.chars().all(|c| c.is_ascii_digit() || " .,+-*/^%×÷()x".contains(c))
}

// ---------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Dim {
    Length,
    Mass,
    Temp,
    Volume,
    Speed,
    Data,
    Time,
}

/// (aliases, canonical symbol, dimension, factor to the base unit). Temperatures use 0 factors
/// and are handled separately.
const UNITS: &[(&[&str], &str, Dim, f64)] = &[
    (&["mm", "millimeter", "millimeters", "millimetre", "millimetres"], "mm", Dim::Length, 0.001),
    (&["cm", "centimeter", "centimeters", "centimetre", "centimetres"], "cm", Dim::Length, 0.01),
    (&["m", "meter", "meters", "metre", "metres"], "m", Dim::Length, 1.0),
    (&["km", "kilometer", "kilometers", "kilometre", "kilometres", "k"], "km", Dim::Length, 1000.0),
    (&["in", "inch", "inches", "\""], "in", Dim::Length, 0.0254),
    (&["ft", "foot", "feet", "'"], "ft", Dim::Length, 0.3048),
    (&["yd", "yard", "yards"], "yd", Dim::Length, 0.9144),
    (&["mi", "mile", "miles"], "mi", Dim::Length, 1609.344),
    (&["g", "gram", "grams"], "g", Dim::Mass, 1.0),
    (&["kg", "kilogram", "kilograms", "kilo", "kilos"], "kg", Dim::Mass, 1000.0),
    (&["lb", "lbs", "pound", "pounds"], "lb", Dim::Mass, 453.59237),
    (&["oz", "ounce", "ounces"], "oz", Dim::Mass, 28.349523125),
    (&["st", "stone", "stones"], "st", Dim::Mass, 6350.29318),
    (&["c", "celsius", "°c", "centigrade"], "°C", Dim::Temp, 0.0),
    (&["f", "fahrenheit", "°f"], "°F", Dim::Temp, 0.0),
    (&["kelvin"], "K", Dim::Temp, 0.0),
    (&["ml", "milliliter", "milliliters", "millilitre", "millilitres"], "ml", Dim::Volume, 0.001),
    (&["l", "liter", "liters", "litre", "litres"], "l", Dim::Volume, 1.0),
    (&["gal", "gallon", "gallons"], "gal", Dim::Volume, 3.785411784),
    (&["floz", "fl oz", "fluid ounce", "fluid ounces"], "fl oz", Dim::Volume, 0.0295735295625),
    (&["cup", "cups"], "cup", Dim::Volume, 0.2365882365),
    (&["kmh", "km/h", "kph"], "km/h", Dim::Speed, 1.0 / 3.6),
    (&["mph"], "mph", Dim::Speed, 0.44704),
    (&["m/s", "mps"], "m/s", Dim::Speed, 1.0),
    (&["knot", "knots", "kn"], "kn", Dim::Speed, 0.514444),
    (&["b", "byte", "bytes"], "B", Dim::Data, 1.0),
    (&["kb", "kilobyte", "kilobytes"], "KB", Dim::Data, 1024.0),
    (&["mb", "megabyte", "megabytes"], "MB", Dim::Data, 1048576.0),
    (&["gb", "gigabyte", "gigabytes", "gig", "gigs"], "GB", Dim::Data, 1073741824.0),
    (&["tb", "terabyte", "terabytes"], "TB", Dim::Data, 1099511627776.0),
    (&["sec", "secs", "second", "seconds", "s"], "s", Dim::Time, 1.0),
    (&["min", "mins", "minute", "minutes"], "min", Dim::Time, 60.0),
    (&["h", "hr", "hrs", "hour", "hours"], "h", Dim::Time, 3600.0),
    (&["day", "days", "d"], "day", Dim::Time, 86400.0),
    (&["week", "weeks", "wk"], "week", Dim::Time, 604800.0),
];

fn find_unit(raw: &str) -> Option<(&'static str, Dim, f64)> {
    let r = raw.trim().trim_end_matches('.').to_lowercase();
    let r = r.strip_prefix("degrees ").or_else(|| r.strip_prefix("degree ")).unwrap_or(&r).trim().to_string();
    // "k" alone means kelvin only when converting temperatures; resolved by the caller.
    UNITS
        .iter()
        .find(|(aliases, ..)| aliases.contains(&r.as_str()))
        .map(|(_, sym, dim, f)| (*sym, *dim, *f))
}

fn to_celsius(v: f64, sym: &str) -> f64 {
    match sym {
        "°F" => (v - 32.0) * 5.0 / 9.0,
        "K" => v - 273.15,
        _ => v,
    }
}

fn from_celsius(v: f64, sym: &str) -> f64 {
    match sym {
        "°F" => v * 9.0 / 5.0 + 32.0,
        "K" => v + 273.15,
        _ => v,
    }
}

/// A finished conversion.
#[derive(Debug, Clone, PartialEq)]
pub struct Conversion {
    pub value: f64,
    pub from: &'static str,
    pub to: &'static str,
    pub result: f64,
}

/// Converts between two named units. `None` if either is unknown or the dimensions differ.
pub fn convert(value: f64, from: &str, to: &str) -> Option<Conversion> {
    let mut f = find_unit(from)?;
    let mut t = find_unit(to)?;
    // "k" is kilometres by default but kelvin next to a temperature.
    if from.trim().eq_ignore_ascii_case("k") && t.1 == Dim::Temp {
        f = ("K", Dim::Temp, 0.0);
    }
    if to.trim().eq_ignore_ascii_case("k") && f.1 == Dim::Temp {
        t = ("K", Dim::Temp, 0.0);
    }
    if f.1 != t.1 {
        return None;
    }
    let result = if f.1 == Dim::Temp {
        from_celsius(to_celsius(value, f.0), t.0)
    } else {
        value * f.2 / t.2
    };
    Some(Conversion { value, from: f.0, to: t.0, result })
}

/// Parses "5 km in miles", "100f to c", "3.5 lb as kg", "convert 10 gb to mb".
pub fn parse_conversion(text: &str) -> Option<Conversion> {
    let t = text.trim().to_lowercase();
    let t = t.strip_prefix("convert ").unwrap_or(&t).trim().to_string();
    let t = t.strip_prefix("how many ").map(|s| s.to_string()).unwrap_or(t);
    // "how many miles is 5 km" / "how many cm in 3 feet"
    for sep in [" in ", " to ", " into ", " as ", " is "] {
        if let Some(idx) = t.find(sep) {
            let (left, right) = (t[..idx].trim(), t[idx + sep.len()..].trim());
            // value + unit on the left, unit on the right
            if let Some((v, u)) = split_value_unit(left) {
                if let Some(c) = convert(v, &u, right) {
                    return Some(c);
                }
            }
            // unit on the left ("how many miles"), value + unit on the right
            if let Some((v, u)) = split_value_unit(right) {
                if let Some(c) = convert(v, &u, left) {
                    return Some(c);
                }
            }
        }
    }
    None
}

fn split_value_unit(s: &str) -> Option<(f64, String)> {
    let s = s.trim();
    let end = s
        .char_indices()
        .take_while(|(_, c)| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == ',')
        .map(|(i, c)| i + c.len_utf8())
        .last()?;
    let num: String = s[..end].chars().filter(|c| *c != ',').collect();
    let v: f64 = num.parse().ok()?;
    let unit = s[end..].trim().to_string();
    if unit.is_empty() {
        return None;
    }
    Some((v, unit))
}

/// Parses a duration: "5 minutes", "90s", "1h30m", "1 hour 15 min", "half an hour".
pub fn parse_duration_secs(text: &str) -> Option<u64> {
    let t = text.trim().to_lowercase();
    match t.as_str() {
        "half an hour" | "half hour" => return Some(1800),
        "an hour" | "one hour" => return Some(3600),
        "a minute" | "one minute" => return Some(60),
        "quarter of an hour" | "quarter hour" | "a quarter hour" => return Some(900),
        _ => {}
    }
    let mut total = 0f64;
    let mut found = false;
    let chars: Vec<char> = t.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() || chars[i] == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let n: f64 = chars[start..i].iter().collect::<String>().parse().ok()?;
            while i < chars.len() && chars[i] == ' ' {
                i += 1;
            }
            let ustart = i;
            while i < chars.len() && chars[i].is_ascii_alphabetic() {
                i += 1;
            }
            let unit: String = chars[ustart..i].iter().collect();
            let mult = match unit.as_str() {
                "s" | "sec" | "secs" | "second" | "seconds" => 1.0,
                "" | "m" | "min" | "mins" | "minute" | "minutes" => 60.0,
                "h" | "hr" | "hrs" | "hour" | "hours" => 3600.0,
                _ => return None,
            };
            total += n * mult;
            found = true;
        } else if chars[i].is_whitespace() || chars[i] == ',' || chars[i] == '&' {
            i += 1;
        } else {
            // allow joining words like "and"
            let start = i;
            while i < chars.len() && chars[i].is_ascii_alphabetic() {
                i += 1;
            }
            let w: String = chars[start..i].iter().collect();
            if w != "and" && w != "for" && w != "a" {
                return None;
            }
            if i == start {
                i += 1;
            }
        }
    }
    if !found || total <= 0.0 || total > 7.0 * 86400.0 {
        return None;
    }
    Some(total.round() as u64)
}

/// "5 min", "1 h 30 min", "45 s".
pub fn describe_duration(secs: u64) -> String {
    let (h, m, s) = (secs / 3600, (secs % 3600) / 60, secs % 60);
    let mut parts = Vec::new();
    if h > 0 {
        parts.push(format!("{} h", h));
    }
    if m > 0 {
        parts.push(format!("{} min", m));
    }
    if s > 0 || parts.is_empty() {
        parts.push(format!("{} s", s));
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(s: &str) -> String {
        eval(s).map(format_number).unwrap_or_else(|| "none".into())
    }

    #[test]
    fn arithmetic() {
        assert_eq!(ev("2+3*4"), "14");
        assert_eq!(ev("(2+3)*4"), "20");
        assert_eq!(ev("2^10"), "1024");
        assert_eq!(ev("2^3^2"), "512");
        assert_eq!(ev("-3 + 5"), "2");
        assert_eq!(ev("0.1 + 0.2"), "0.3");
        assert_eq!(ev("12 x 7"), "84");
        assert_eq!(ev("15% of 80"), "12");
        assert_eq!(ev("50%"), "0.5");
        assert_eq!(ev("sqrt(16)"), "4");
        assert_eq!(ev("2(3+4)"), "14");
        assert_eq!(ev("1,000 * 3"), "3000");
        assert_eq!(ev("10 / 4"), "2.5");
        assert_eq!(ev("7 mod 3"), "1");
        assert_eq!(ev("1/0"), "none");
        assert_eq!(ev("hello"), "none");
        assert_eq!(ev("(1+2"), "none");
        assert_eq!(ev(""), "none");
        assert_eq!(ev(&"(".repeat(100)), "none");
    }

    #[test]
    fn conversions() {
        let c = parse_conversion("5 km in miles").unwrap();
        assert_eq!(format_number((c.result * 1000.0).round() / 1000.0), "3.107");
        let c = parse_conversion("100 f to c").unwrap();
        assert_eq!(format_number((c.result * 100.0).round() / 100.0), "37.78");
        let c = parse_conversion("0 c to k").unwrap();
        assert_eq!(format_number(c.result), "273.15");
        let c = parse_conversion("convert 10 lb to kg").unwrap();
        assert_eq!(format_number((c.result * 100.0).round() / 100.0), "4.54");
        let c = parse_conversion("how many cm in 3 feet").unwrap();
        assert_eq!(format_number((c.result * 100.0).round() / 100.0), "91.44");
        let c = parse_conversion("2 gb to mb").unwrap();
        assert_eq!(format_number(c.result), "2048");
        assert!(parse_conversion("5 km in kg").is_none());
        assert!(parse_conversion("tokyo to paris").is_none());
    }

    #[test]
    fn durations() {
        assert_eq!(parse_duration_secs("5 minutes"), Some(300));
        assert_eq!(parse_duration_secs("90s"), Some(90));
        assert_eq!(parse_duration_secs("1h30m"), Some(5400));
        assert_eq!(parse_duration_secs("1 hour and 15 min"), Some(4500));
        assert_eq!(parse_duration_secs("half an hour"), Some(1800));
        assert_eq!(parse_duration_secs("10"), Some(600));
        assert_eq!(parse_duration_secs("forever"), None);
        assert_eq!(parse_duration_secs("0 min"), None);
        assert_eq!(describe_duration(5400), "1 h 30 min");
        assert_eq!(describe_duration(45), "45 s");
    }
}
