//! Local look-alike and scam-domain guard. No network, no cloud lookups.
//!
//! Signals, each turned into a [`Reason`]:
//! - `javascript:` / `data:` / `file:` links, `user@host` tricks, raw IP hosts;
//! - punycode (`xn--`) labels that mix Latin with Cyrillic/Greek letters, or that fold to a brand;
//! - a brand's name used inside another site's name with words like "login" or "verify";
//! - a brand name or brand domain used as a *subdomain* of some other site;
//! - small edit distance to a brand, or to a site the user already knows (bookmarks, frequent);
//! - risky TLDs, which only add weight to other signals;
//! - a site seen for the first time during a sign-in or payment flow;
//! - link text that names one site while the link goes to another.

use super::confusables::{is_mixed_script, is_whole_script_lookalike, skeleton};
use super::{Reason, Severity};

/// Where the action happens; sign-in and payment pages get stricter checks.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Flow {
    #[default]
    Browse,
    Login,
    Payment,
}

impl Flow {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "login" | "signin" | "sign-in" => Flow::Login,
            "payment" | "checkout" | "pay" => Flow::Payment,
            _ => Flow::Browse,
        }
    }
    pub fn is_sensitive(self) -> bool {
        !matches!(self, Flow::Browse)
    }
}

/// A minimally parsed URL. Lens only needs scheme, host and the userinfo trick.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedUrl {
    pub scheme: String,
    pub host: String,
    pub has_userinfo: bool,
    pub rest: String,
}

pub fn parse_url(raw: &str) -> Option<ParsedUrl> {
    let s = raw.trim();
    let colon = s.find(':')?;
    let scheme = s[..colon].to_ascii_lowercase();
    if scheme.is_empty() || !scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c)) {
        return None;
    }
    let after = &s[colon + 1..];
    if !after.starts_with("//") {
        // javascript:, data:, mailto: and friends have no authority.
        return Some(ParsedUrl { scheme, host: String::new(), has_userinfo: false, rest: after.to_string() });
    }
    let after = &after[2..];
    let end = after.find(['/', '?', '#']).unwrap_or(after.len());
    let authority = &after[..end];
    let rest = after[end..].to_string();
    let (has_userinfo, hostport) = match authority.rfind('@') {
        Some(i) => (true, &authority[i + 1..]),
        None => (false, authority),
    };
    let host = if let Some(stripped) = hostport.strip_prefix('[') {
        // IPv6 literal
        stripped.split(']').next().unwrap_or("").to_string()
    } else {
        hostport.split(':').next().unwrap_or("").to_string()
    };
    let host = host.trim_end_matches('.').to_lowercase();
    Some(ParsedUrl { scheme, host, has_userinfo, rest })
}

// ---------------------------------------------------------------------------------------------
// Punycode (RFC 3492) decoding, for `xn--` labels.

pub fn punycode_decode(input: &str) -> Option<String> {
    const BASE: u32 = 36;
    const TMIN: u32 = 1;
    const TMAX: u32 = 26;
    const SKEW: u32 = 38;
    const DAMP: u32 = 700;
    let (basic, encoded) = match input.rfind('-') {
        Some(i) => (&input[..i], &input[i + 1..]),
        None => ("", input),
    };
    if !basic.is_ascii() {
        return None;
    }
    let mut output: Vec<char> = basic.chars().collect();
    let (mut n, mut i, mut bias) = (128u32, 0u32, 72u32);
    let bytes = encoded.as_bytes();
    let mut pos = 0;
    while pos < bytes.len() {
        let old_i = i;
        let mut w = 1u32;
        let mut k = BASE;
        loop {
            let b = *bytes.get(pos)?;
            pos += 1;
            let digit = match b {
                b'a'..=b'z' => (b - b'a') as u32,
                b'A'..=b'Z' => (b - b'A') as u32,
                b'0'..=b'9' => (b - b'0') as u32 + 26,
                _ => return None,
            };
            i = i.checked_add(digit.checked_mul(w)?)?;
            let t = if k <= bias { TMIN } else if k >= bias + TMAX { TMAX } else { k - bias };
            if digit < t {
                break;
            }
            w = w.checked_mul(BASE - t)?;
            k += BASE;
        }
        let len = output.len() as u32 + 1;
        // adapt
        let mut delta = if old_i == 0 { (i - old_i) / DAMP } else { (i - old_i) / 2 };
        delta += delta / len;
        let mut kk = 0;
        while delta > ((BASE - TMIN) * TMAX) / 2 {
            delta /= BASE - TMIN;
            kk += BASE;
        }
        bias = kk + (((BASE - TMIN + 1) * delta) / (delta + SKEW));
        n = n.checked_add(i / len)?;
        i %= len;
        let c = char::from_u32(n)?;
        if output.len() > 255 {
            return None;
        }
        output.insert(i as usize, c);
        i += 1;
    }
    Some(output.into_iter().collect())
}

/// Decodes every `xn--` label of a host for display; other labels are kept.
pub fn to_unicode(host: &str) -> String {
    host.split('.')
        .map(|l| {
            l.strip_prefix("xn--")
                .and_then(punycode_decode)
                .unwrap_or_else(|| l.to_string())
        })
        .collect::<Vec<_>>()
        .join(".")
}

// ---------------------------------------------------------------------------------------------
// Registrable domain ("eTLD+1"), from a compact public-suffix subset.

const MULTI_SUFFIXES: &[&str] = &[
    "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
    "com.au", "net.au", "org.au", "edu.au", "gov.au",
    "co.nz", "org.nz", "co.jp", "ne.jp", "or.jp", "ac.jp", "co.kr", "or.kr",
    "com.br", "net.br", "org.br", "gov.br", "com.mx", "com.ar", "com.co", "com.pe",
    "com.cn", "net.cn", "org.cn", "com.hk", "com.tw", "com.sg", "com.my", "co.id",
    "co.in", "net.in", "org.in", "gov.in", "co.za", "org.za", "com.tr", "com.ua",
    "co.il", "com.sa", "com.eg", "com.ng", "co.ke", "com.pk", "com.ph", "com.vn",
    "github.io", "gitlab.io", "pages.dev", "netlify.app", "vercel.app", "web.app",
    "firebaseapp.com", "herokuapp.com", "blogspot.com", "azurewebsites.net",
    "cloudfront.net", "appspot.com", "workers.dev", "ngrok.io", "ngrok-free.app",
    "s3.amazonaws.com", "r2.dev", "glitch.me", "repl.co", "wixsite.com", "weebly.com",
];

pub fn is_ip_literal(host: &str) -> bool {
    if host.contains(':') {
        return true; // IPv6
    }
    let parts: Vec<&str> = host.split('.').collect();
    parts.len() == 4 && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit()))
        || (!host.is_empty() && host.chars().all(|c| c.is_ascii_digit())) // decimal IP trick
        || (host.starts_with("0x") && host[2..].chars().all(|c| c.is_ascii_hexdigit()) && host.len() > 2)
}

/// `login.secure.paypal.co.uk` → `paypal.co.uk`. IPs and single labels come back unchanged.
pub fn registrable_domain(host: &str) -> String {
    let host = host.trim_end_matches('.').to_lowercase();
    if host.is_empty() || is_ip_literal(&host) {
        return host;
    }
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() <= 2 {
        return host;
    }
    for take in [3usize, 2] {
        if labels.len() > take {
            let suffix = labels[labels.len() - take..].join(".");
            if MULTI_SUFFIXES.contains(&suffix.as_str()) {
                return labels[labels.len() - take - 1..].join(".");
            }
        }
    }
    labels[labels.len() - 2..].join(".")
}

/// The name part of a registrable domain: `paypal.co.uk` → `paypal`.
pub fn site_label(registrable: &str) -> &str {
    registrable.split('.').next().unwrap_or(registrable)
}

pub fn tld(host: &str) -> &str {
    host.rsplit('.').next().unwrap_or("")
}

// ---------------------------------------------------------------------------------------------
// Brands that phishers copy. Each lists its real registrable domains.

pub struct Brand {
    pub name: &'static str,
    pub domains: &'static [&'static str],
}

pub const BRANDS: &[Brand] = &[
    Brand { name: "paypal", domains: &["paypal.com", "paypal.me", "paypal-community.com", "paypalobjects.com"] },
    Brand { name: "apple", domains: &["apple.com", "icloud.com", "apple.news", "me.com", "mzstatic.com"] },
    Brand { name: "icloud", domains: &["icloud.com", "apple.com"] },
    Brand { name: "google", domains: &["google.com", "google.co.uk", "google.com.au", "google.de", "google.fr", "google.co.jp", "google.co.in", "google.ca", "googleusercontent.com", "googleapis.com", "gstatic.com", "youtube.com", "gmail.com", "goo.gl", "googlemail.com", "g.co", "withgoogle.com", "blogspot.com"] },
    Brand { name: "gmail", domains: &["gmail.com", "google.com"] },
    Brand { name: "microsoft", domains: &["microsoft.com", "live.com", "office.com", "microsoftonline.com", "outlook.com", "msn.com", "bing.com", "azure.com", "windows.com", "xbox.com", "skype.com", "office365.com", "sharepoint.com", "onedrive.com", "microsoft365.com", "aka.ms"] },
    Brand { name: "outlook", domains: &["outlook.com", "live.com", "office.com", "microsoft.com"] },
    Brand { name: "office365", domains: &["office.com", "microsoft.com", "office365.com"] },
    Brand { name: "amazon", domains: &["amazon.com", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.co.jp", "amazon.ca", "amazon.in", "amazon.com.au", "amazon.it", "amazon.es", "amazonaws.com", "amazon.jobs", "amzn.to", "a2z.com", "media-amazon.com", "ssl-images-amazon.com"] },
    Brand { name: "netflix", domains: &["netflix.com", "nflxext.com", "nflximg.net", "nflxvideo.net"] },
    Brand { name: "facebook", domains: &["facebook.com", "fb.com", "fbcdn.net", "messenger.com", "meta.com"] },
    Brand { name: "instagram", domains: &["instagram.com", "cdninstagram.com"] },
    Brand { name: "whatsapp", domains: &["whatsapp.com", "whatsapp.net"] },
    Brand { name: "walmart", domains: &["walmart.com", "walmart.ca", "walmartimages.com"] },
    Brand { name: "chase", domains: &["chase.com", "jpmorganchase.com", "jpmorgan.com"] },
    Brand { name: "bankofamerica", domains: &["bankofamerica.com", "bofa.com"] },
    Brand { name: "wellsfargo", domains: &["wellsfargo.com", "wf.com"] },
    Brand { name: "citibank", domains: &["citi.com", "citibank.com"] },
    Brand { name: "americanexpress", domains: &["americanexpress.com", "aexp.com"] },
    Brand { name: "amex", domains: &["americanexpress.com", "amex.com"] },
    Brand { name: "capitalone", domains: &["capitalone.com"] },
    Brand { name: "hsbc", domains: &["hsbc.com", "hsbc.co.uk"] },
    Brand { name: "barclays", domains: &["barclays.co.uk", "barclays.com"] },
    Brand { name: "coinbase", domains: &["coinbase.com"] },
    Brand { name: "binance", domains: &["binance.com", "binance.us"] },
    Brand { name: "metamask", domains: &["metamask.io"] },
    Brand { name: "kraken", domains: &["kraken.com"] },
    Brand { name: "github", domains: &["github.com", "github.io", "githubusercontent.com", "githubassets.com"] },
    Brand { name: "dropbox", domains: &["dropbox.com", "dropboxusercontent.com"] },
    Brand { name: "docusign", domains: &["docusign.com", "docusign.net"] },
    Brand { name: "adobe", domains: &["adobe.com", "adobelogin.com", "typekit.net"] },
    Brand { name: "linkedin", domains: &["linkedin.com", "licdn.com", "lnkd.in"] },
    Brand { name: "twitter", domains: &["twitter.com", "x.com", "t.co", "twimg.com"] },
    Brand { name: "steam", domains: &["steampowered.com", "steamcommunity.com", "steamstatic.com"] },
    Brand { name: "steampowered", domains: &["steampowered.com"] },
    Brand { name: "steamcommunity", domains: &["steamcommunity.com"] },
    Brand { name: "discord", domains: &["discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media"] },
    Brand { name: "ebay", domains: &["ebay.com", "ebay.co.uk", "ebay.de", "ebay.com.au", "ebayimg.com"] },
    Brand { name: "usps", domains: &["usps.com"] },
    Brand { name: "fedex", domains: &["fedex.com"] },
    Brand { name: "royalmail", domains: &["royalmail.com"] },
    Brand { name: "irs", domains: &["irs.gov"] },
    Brand { name: "anthropic", domains: &["anthropic.com", "claude.ai", "claude.com"] },
    Brand { name: "claude", domains: &["claude.ai", "claude.com", "anthropic.com"] },
    Brand { name: "openai", domains: &["openai.com", "chatgpt.com", "oaistatic.com"] },
    Brand { name: "chatgpt", domains: &["chatgpt.com", "openai.com"] },
    Brand { name: "yahoo", domains: &["yahoo.com", "yahoo.co.jp", "yimg.com", "yahoo.co.uk"] },
    Brand { name: "roblox", domains: &["roblox.com", "rbxcdn.com"] },
    Brand { name: "epicgames", domains: &["epicgames.com", "unrealengine.com", "fortnite.com"] },
    Brand { name: "spotify", domains: &["spotify.com", "scdn.co", "spotifycdn.com"] },
    Brand { name: "booking", domains: &["booking.com", "bstatic.com"] },
    Brand { name: "airbnb", domains: &["airbnb.com", "airbnb.co.uk", "muscache.com"] },
    Brand { name: "opentable", domains: &["opentable.com"] },
    Brand { name: "revolut", domains: &["revolut.com"] },
    Brand { name: "stripe", domains: &["stripe.com", "stripe.network"] },
    Brand { name: "shopify", domains: &["shopify.com", "myshopify.com", "shopifycdn.com"] },
    Brand { name: "venmo", domains: &["venmo.com"] },
    Brand { name: "zelle", domains: &["zellepay.com"] },
    Brand { name: "binance", domains: &["binance.com"] },
    Brand { name: "outlook", domains: &["outlook.com"] },
    Brand { name: "zoom", domains: &["zoom.us", "zoom.com", "zoomgov.com"] },
    Brand { name: "slack", domains: &["slack.com", "slack-edge.com"] },
    Brand { name: "notion", domains: &["notion.so", "notion.com", "notion.site"] },
    Brand { name: "dhl", domains: &["dhl.com", "dhl.de"] },
    Brand { name: "costco", domains: &["costco.com"] },
    Brand { name: "target", domains: &["target.com"] },
    Brand { name: "bestbuy", domains: &["bestbuy.com"] },
    Brand { name: "verizon", domains: &["verizon.com", "verizonwireless.com"] },
    Brand { name: "tmobile", domains: &["t-mobile.com"] },
    Brand { name: "att", domains: &["att.com"] },
];

/// Words that turn "a brand name inside another site's name" into a phishing pattern.
const LURE_WORDS: &[&str] = &[
    "login", "log-in", "signin", "sign-in", "secure", "security", "verify", "verification", "account",
    "accounts", "update", "billing", "wallet", "auth", "support", "help", "service", "services",
    "unlock", "recover", "recovery", "confirm", "invoice", "refund", "payment", "pay", "customer",
    "alert", "suspended", "validate", "id", "online", "portal", "official", "reset", "claim",
    "gift", "prize", "bonus", "airdrop", "connect", "dapp", "restore", "safe", "team", "center",
];

/// TLDs that are cheap and over-represented in phishing feeds. They only add weight.
const RISKY_TLDS: &[&str] = &[
    "zip", "mov", "xyz", "top", "click", "country", "gq", "tk", "ml", "cf", "ga", "work", "support",
    "rest", "cam", "lol", "icu", "buzz", "monster", "quest", "sbs", "cfd", "bond", "loan", "fit",
    "live", "shop", "online", "site", "info", "help", "today", "best", "link", "bar", "beauty",
];

fn brand_for_domain(reg: &str) -> Option<&'static Brand> {
    BRANDS.iter().find(|b| b.domains.contains(&reg))
}

fn is_brand_domain(reg: &str) -> bool {
    brand_for_domain(reg).is_some()
}

/// Damerau–Levenshtein (optimal string alignment) distance on chars.
pub fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (n, m) = (a.len(), b.len());
    if n == 0 {
        return m;
    }
    if m == 0 {
        return n;
    }
    let mut d = vec![vec![0usize; m + 1]; n + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in d[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=n {
        for j in 1..=m {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            let mut v = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                v = v.min(d[i - 2][j - 2] + 1);
            }
            d[i][j] = v;
        }
    }
    d[n][m]
}

/// Allowed distance for a look-alike match, by length; short names need an exact skeleton match.
fn lookalike_threshold(len: usize) -> usize {
    match len {
        0..=4 => 0,
        5..=8 => 1,
        _ => 2,
    }
}

fn tokens(label: &str) -> Vec<String> {
    label
        .split(|c: char| c == '-' || c == '_' || c.is_ascii_digit())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

/// Inputs for one domain check.
#[derive(Clone, Debug, Default)]
pub struct DomainInput<'a> {
    pub url: &'a str,
    /// Visible text of the link the user or agent is about to follow, if any.
    pub link_text: Option<&'a str>,
    pub flow: Flow,
    /// Registrable domains the user already knows: bookmarks, frequently visited, typed before.
    pub known_domains: &'a [String],
    /// Whether this site has been visited before (history), used for "first visit" in sensitive flows.
    pub seen_before: bool,
}

/// What the guard concluded about one URL.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DomainReport {
    pub scheme: String,
    pub host: String,
    /// The host as people would read it (punycode decoded).
    pub display_host: String,
    pub registrable: String,
    pub trusted: bool,
    pub risk: Severity,
    pub reasons: Vec<Reason>,
}

pub fn check_url(input: &DomainInput) -> DomainReport {
    let mut reasons: Vec<Reason> = Vec::new();
    let parsed = match parse_url(input.url) {
        Some(p) => p,
        None => {
            reasons.push(Reason::new("domain.unparseable", Severity::Medium, "This link isn't a normal web address"));
            return finish(String::new(), String::new(), String::new(), String::new(), false, reasons);
        }
    };
    let scheme = parsed.scheme.clone();
    match scheme.as_str() {
        "javascript" | "vbscript" => {
            reasons.push(Reason::new("domain.script_url", Severity::Critical, "This link runs code instead of opening a page"));
            return finish(scheme, String::new(), String::new(), String::new(), false, reasons);
        }
        "data" | "blob" => {
            reasons.push(Reason::new("domain.data_url", Severity::High, "This link opens content embedded in the link itself, a common way to fake a page"));
            return finish(scheme, String::new(), String::new(), String::new(), false, reasons);
        }
        "file" => {
            reasons.push(Reason::new("domain.file_url", Severity::Medium, "This link opens a file on your PC"));
            return finish(scheme, String::new(), String::new(), String::new(), false, reasons);
        }
        "http" | "https" => {}
        "mailto" | "tel" | "sms" => {
            return finish(scheme, String::new(), String::new(), String::new(), false, reasons);
        }
        other => {
            reasons.push(Reason::new("domain.unusual_scheme", Severity::Medium, format!("This link uses an unusual scheme ({other}:)")));
            return finish(scheme, String::new(), String::new(), String::new(), false, reasons);
        }
    }

    let host = parsed.host.clone();
    let display = to_unicode(&host);
    let registrable = registrable_domain(&host);
    let display_reg = to_unicode(&registrable);
    let sensitive = input.flow.is_sensitive();

    if host.is_empty() {
        reasons.push(Reason::new("domain.no_host", Severity::Medium, "This link has no site name"));
        return finish(scheme, host, display, registrable, false, reasons);
    }
    if parsed.has_userinfo {
        reasons.push(Reason::new(
            "domain.userinfo",
            Severity::High,
            format!("The text before '@' is a disguise; this link really goes to {display}"),
        ));
    }
    if is_ip_literal(&host) {
        let sev = if sensitive { Severity::High } else { Severity::Medium };
        reasons.push(Reason::new("domain.ip_host", sev, "This link goes to a raw IP address instead of a named site"));
    }
    if scheme == "http" && sensitive {
        reasons.push(Reason::new("domain.insecure", Severity::High, "This sign-in or payment page isn't encrypted (http)"));
    }

    let known = |reg: &str| input.known_domains.iter().any(|k| registrable_domain(k) == reg);
    let trusted = is_brand_domain(&registrable) || known(&registrable);

    // Link text that names a different site.
    if let Some(text) = input.link_text {
        if let Some(named) = domain_in_text(text) {
            let named_reg = registrable_domain(&named);
            if !named_reg.is_empty() && named_reg != registrable && !same_brand(&named_reg, &registrable) {
                reasons.push(Reason::new(
                    "domain.text_mismatch",
                    Severity::High,
                    format!("The link says {named_reg} but goes to {display_reg}"),
                ));
            }
        }
    }

    if trusted {
        return finish(scheme, host, display, registrable, true, reasons);
    }

    // Punycode and homographs, on the registrable label.
    let label_unicode = site_label(&display_reg).to_string();
    let label_skel = skeleton(&label_unicode);
    let has_idn = registrable.split('.').any(|l| l.starts_with("xn--"));
    if has_idn || !label_unicode.is_ascii() {
        if let Some(b) = BRANDS.iter().find(|b| skeleton(b.name) == label_skel || b.domains.iter().any(|d| skeleton(site_label(d)) == label_skel)) {
            reasons.push(Reason::new(
                "domain.homoglyph",
                Severity::Critical,
                format!("{display_reg} imitates {} with look-alike letters", b.domains[0]),
            ));
        } else if is_mixed_script(&label_unicode) || is_whole_script_lookalike(&label_unicode) {
            reasons.push(Reason::new("domain.mixed_script", Severity::High, format!("{display_reg} mixes letters from different alphabets")));
        } else if has_idn {
            reasons.push(Reason::new("domain.idn", Severity::Low, format!("{display_reg} uses non-Latin letters")));
        }
    }

    // Look-alike of a user-known site.
    if !reasons.iter().any(|r| r.code == "domain.homoglyph") {
        for k in input.known_domains {
            let kreg = registrable_domain(k);
            let kl = skeleton(site_label(&kreg));
            if kl.len() < 4 || kreg == registrable {
                continue;
            }
            let dist = edit_distance(&label_skel, &kl);
            if (dist > 0 && dist <= lookalike_threshold(kl.chars().count())) || (dist == 0 && kreg != registrable) {
                reasons.push(Reason::new(
                    "domain.lookalike_known",
                    Severity::High,
                    format!("{display_reg} looks like {kreg}, a site you use"),
                ));
                break;
            }
        }
    }

    // Brands: look-alike, brand + lure word, brand in subdomain.
    let label_tokens = tokens(&label_skel);
    let mut flagged_brand = reasons.iter().any(|r| r.code == "domain.homoglyph" || r.code == "domain.lookalike_known");
    if !flagged_brand {
        for b in BRANDS {
            let bs = skeleton(b.name);
            let dist = edit_distance(&label_skel, &bs);
            let thr = lookalike_threshold(bs.chars().count());
            if dist == 0 || (dist <= thr && dist > 0) {
                // e.g. paypa1.com, arnazon.com, micros0ft.com, or a brand name on another TLD.
                let sev = if dist == 0 { Severity::High } else { Severity::Critical };
                let what = if dist == 0 { "uses the name of" } else { "is one letter away from" };
                reasons.push(Reason::new("domain.lookalike_brand", sev, format!("{display_reg} {what} {}", b.domains[0])));
                flagged_brand = true;
                break;
            }
            let lure_present = label_tokens.iter().any(|t| LURE_WORDS.contains(&t.as_str()));
            let brand_token = label_tokens.iter().any(|t| {
                *t == bs || (t.len() >= 6 && edit_distance(t, &bs) == 1) || (bs.len() >= 5 && lure_present && t.starts_with(bs.as_str()) && t.len() <= bs.len() + 4)
            });
            if label_tokens.len() > 1 && brand_token {
                let lure = label_tokens.iter().find(|t| LURE_WORDS.contains(&t.as_str()));
                let sev = if lure.is_some() || RISKY_TLDS.contains(&tld(&registrable)) { Severity::High } else { Severity::Medium };
                let detail = match lure {
                    Some(l) => format!("{display_reg} pairs {} with \"{l}\" but isn't {}", b.name, b.domains[0]),
                    None => format!("{display_reg} uses the name {} but isn't {}", b.name, b.domains[0]),
                };
                reasons.push(Reason::new("domain.brand_combo", sev, detail));
                flagged_brand = true;
                break;
            }
            // A single long token that starts or ends with the brand plus a lure word, e.g. "paypallogin".
            if label_tokens.len() == 1 && bs.len() >= 5 && label_skel.len() > bs.len() + 2 {
                let rest = label_skel.strip_prefix(bs.as_str()).or_else(|| label_skel.strip_suffix(bs.as_str()));
                if let Some(rest) = rest {
                    if LURE_WORDS.iter().any(|l| rest == *l || rest.trim_matches('-') == *l) {
                        reasons.push(Reason::new(
                            "domain.brand_combo",
                            Severity::High,
                            format!("{display_reg} joins {} with \"{rest}\" but isn't {}", b.name, b.domains[0]),
                        ));
                        flagged_brand = true;
                        break;
                    }
                }
            }
        }
    }

    // Brand in the subdomain part: paypal.com.account-check.xyz, login.microsoftonline.com.evil.io
    if !flagged_brand {
        let sub = host.strip_suffix(&registrable).unwrap_or("").trim_end_matches('.');
        if !sub.is_empty() {
            let sub_skel = skeleton(&to_unicode(sub));
            let sub_tokens: Vec<String> = sub_skel.split(['.', '-']).filter(|t| !t.is_empty()).map(str::to_string).collect();
            if let Some(b) = BRANDS.iter().find(|b| {
                let bs = skeleton(b.name);
                (bs.len() >= 4 && sub_tokens.contains(&bs)) || b.domains.iter().any(|d| sub_skel.contains(&skeleton(d)))
            }) {
                reasons.push(Reason::new(
                    "domain.brand_subdomain",
                    Severity::High,
                    format!("This page is on {display_reg}, not {} — the brand name is only a prefix", b.domains[0]),
                ));
                flagged_brand = true;
            }
        }
    }

    // Risky TLD only adds weight to other signals.
    let risky_tld = RISKY_TLDS.contains(&tld(&registrable));
    if risky_tld && (flagged_brand || sensitive) {
        reasons.push(Reason::new("domain.risky_tld", Severity::Low, format!(".{} sites are often used for scams", tld(&registrable))));
    }

    // Lots of labels on a sensitive flow.
    if sensitive && host.split('.').count() > 4 {
        reasons.push(Reason::new("domain.deep_subdomain", Severity::Low, "This sign-in page sits deep inside another site's address"));
    }

    // First visit in a sensitive flow.
    if sensitive && !input.seen_before {
        let what = if input.flow == Flow::Payment { "payment" } else { "sign-in" };
        reasons.push(Reason::new(
            "domain.new_sensitive",
            Severity::Medium,
            format!("First visit to {display_reg}, and it's asking for a {what}"),
        ));
    }

    finish(scheme, host, display, registrable, false, reasons)
}

fn same_brand(a: &str, b: &str) -> bool {
    BRANDS.iter().any(|br| br.domains.contains(&a) && br.domains.contains(&b))
}

/// Finds something that looks like a domain in link text ("www.paypal.com/signin", "paypal.com").
pub fn domain_in_text(text: &str) -> Option<String> {
    for raw in text.split_whitespace() {
        let w = raw.trim_matches(|c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != ':' && c != '/');
        let w = w.strip_prefix("https://").or_else(|| w.strip_prefix("http://")).unwrap_or(w);
        let host = w.split('/').next().unwrap_or("").trim_end_matches('.').to_lowercase();
        let host = host.strip_prefix("www.").map(|h| h.to_string()).unwrap_or(host);
        let labels: Vec<&str> = host.split('.').collect();
        if labels.len() >= 2
            && labels.iter().all(|l| !l.is_empty() && l.chars().all(|c| c.is_alphanumeric() || c == '-'))
            && labels.last().map(|t| t.len() >= 2 && t.chars().all(|c| c.is_alphabetic())).unwrap_or(false)
        {
            return Some(host);
        }
    }
    None
}

fn finish(scheme: String, host: String, display_host: String, registrable: String, trusted: bool, mut reasons: Vec<Reason>) -> DomainReport {
    reasons.sort_by_key(|r| std::cmp::Reverse(r.severity));
    reasons.dedup_by(|a, b| a.code == b.code);
    let risk = reasons.iter().map(|r| r.severity).max().unwrap_or(Severity::Info);
    DomainReport { scheme, host, display_host, registrable, trusted, risk, reasons }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(url: &str) -> DomainReport {
        check_url(&DomainInput { url, ..Default::default() })
    }

    #[test]
    fn punycode_roundtrip_examples() {
        // RFC 3492 sample and a classic homograph.
        assert_eq!(punycode_decode("mnchen-3ya").as_deref(), Some("münchen"));
        assert_eq!(punycode_decode("pypal-4ve").as_deref(), Some("pаypal"));
        assert_eq!(to_unicode("xn--80ak6aa92e.com"), "аррӏе.com");
    }

    #[test]
    fn registrable() {
        assert_eq!(registrable_domain("login.secure.paypal.co.uk"), "paypal.co.uk");
        assert_eq!(registrable_domain("a.b.example.com"), "example.com");
        assert_eq!(registrable_domain("me.github.io"), "me.github.io");
        assert_eq!(registrable_domain("192.168.0.1"), "192.168.0.1");
    }

    #[test]
    fn basics() {
        assert_eq!(check("https://www.paypal.com/signin").risk, Severity::Info);
        assert!(check("https://www.paypal.com/signin").trusted);
        assert_eq!(check("javascript:alert(1)").risk, Severity::Critical);
        assert_eq!(check("https://xn--pypal-4ve.com/").risk, Severity::Critical);
        assert!(check("https://paypal-login-verify.com").risk >= Severity::High);
        assert!(check("https://paypa1.com").risk >= Severity::High);
        assert!(check("https://www.paypal.com.account-check.xyz/").risk >= Severity::High);
        assert!(check("https://applebees.com").risk < Severity::Medium);
    }

    #[test]
    fn text_mismatch() {
        let r = check_url(&DomainInput { url: "https://evil.example/login", link_text: Some("www.chase.com"), ..Default::default() });
        assert!(r.reasons.iter().any(|x| x.code == "domain.text_mismatch"));
    }
}
