//! A small, tolerant XML reader: enough for RSS 2.0, RSS 1.0/RDF, Atom, YouTube channel feeds
//! and OPML. No DTD/entity expansion (so no billion-laughs), no network, std only. Builds a tiny
//! element tree with a depth and size cap.

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Element {
    /// Local name, lowercased, without namespace prefix (`media:thumbnail` → `thumbnail`).
    pub name: String,
    /// Full qualified name lowercased (`media:thumbnail`).
    pub qname: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Element>,
    pub text: String,
}

impl Element {
    pub fn attr(&self, k: &str) -> Option<&str> {
        self.attrs.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str())
    }
    pub fn child(&self, name: &str) -> Option<&Element> {
        self.children.iter().find(|c| c.name == name)
    }
    pub fn child_q(&self, qname: &str) -> Option<&Element> {
        self.children.iter().find(|c| c.qname == qname)
    }
    pub fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Element> + 'a {
        self.children.iter().filter(move |c| c.name == name)
    }
    pub fn child_text(&self, name: &str) -> Option<String> {
        self.child(name).map(|c| c.text.trim().to_string()).filter(|t| !t.is_empty())
    }
    /// Depth-first search for the first descendant with this local name.
    pub fn find(&self, name: &str) -> Option<&Element> {
        for c in &self.children {
            if c.name == name {
                return Some(c);
            }
            if let Some(f) = c.find(name) {
                return Some(f);
            }
        }
        None
    }
}

pub const MAX_BYTES: usize = 5 * 1024 * 1024;
const MAX_DEPTH: usize = 64;
const MAX_NODES: usize = 200_000;

pub fn parse(src: &str) -> Result<Element, String> {
    if src.len() > MAX_BYTES {
        return Err("Feed is too large.".into());
    }
    let b = src.as_bytes();
    let mut i = 0usize;
    let mut stack: Vec<Element> = vec![Element { name: "#document".into(), qname: "#document".into(), ..Default::default() }];
    let mut nodes = 0usize;
    while i < b.len() {
        if b[i] == b'<' {
            if src[i..].starts_with("<!--") {
                i = find_from(src, i + 4, "-->").map(|e| e + 3).ok_or("Unclosed comment")?;
                continue;
            }
            if src[i..].starts_with("<![CDATA[") {
                let end = find_from(src, i + 9, "]]>").ok_or("Unclosed CDATA")?;
                if let Some(top) = stack.last_mut() {
                    top.text.push_str(&src[i + 9..end]);
                }
                i = end + 3;
                continue;
            }
            if src[i..].starts_with("<?") {
                i = find_from(src, i + 2, "?>").map(|e| e + 2).ok_or("Unclosed declaration")?;
                continue;
            }
            if src[i..].starts_with("<!") {
                // DOCTYPE and friends: skipped entirely (no entity expansion).
                i = skip_bang(src, i).ok_or("Unclosed declaration")?;
                continue;
            }
            let end = tag_end(b, i + 1).ok_or("Unclosed tag")?;
            let inner = &src[i + 1..end];
            i = end + 1;
            if let Some(close) = inner.strip_prefix('/') {
                let q = close.trim().to_ascii_lowercase();
                // Pop to the matching element (tolerates unclosed children).
                if let Some(pos) = stack.iter().rposition(|e| e.qname == q) {
                    if pos == 0 {
                        continue;
                    }
                    while stack.len() > pos {
                        let el = stack.pop().unwrap();
                        stack.last_mut().unwrap().children.push(el);
                    }
                }
                continue;
            }
            let self_closing = inner.ends_with('/');
            let inner = inner.trim_end_matches('/');
            let (qname, attrs) = parse_tag(inner);
            nodes += 1;
            if nodes > MAX_NODES {
                return Err("Feed has too many elements.".into());
            }
            let name = qname.rsplit(':').next().unwrap_or(&qname).to_string();
            let el = Element { name, qname, attrs, ..Default::default() };
            if self_closing {
                stack.last_mut().unwrap().children.push(el);
            } else {
                if stack.len() > MAX_DEPTH {
                    return Err("Feed is nested too deeply.".into());
                }
                stack.push(el);
            }
        } else {
            let next = src[i..].find('<').map(|p| i + p).unwrap_or(b.len());
            if let Some(top) = stack.last_mut() {
                top.text.push_str(&crate::feeds::model::decode_entities(&src[i..next]));
            }
            i = next;
        }
    }
    while stack.len() > 1 {
        let el = stack.pop().unwrap();
        stack.last_mut().unwrap().children.push(el);
    }
    Ok(stack.pop().unwrap())
}

fn find_from(s: &str, from: usize, pat: &str) -> Option<usize> {
    s.get(from..)?.find(pat).map(|p| from + p)
}

fn skip_bang(s: &str, i: usize) -> Option<usize> {
    let b = s.as_bytes();
    let mut depth = 0i32;
    let mut j = i;
    while j < b.len() {
        match b[j] {
            b'[' => depth += 1,
            b']' => depth -= 1,
            b'>' if depth <= 0 => return Some(j + 1),
            _ => {}
        }
        j += 1;
    }
    None
}

fn tag_end(b: &[u8], mut j: usize) -> Option<usize> {
    let mut quote = 0u8;
    while j < b.len() {
        let c = b[j];
        if quote != 0 {
            if c == quote {
                quote = 0;
            }
        } else if c == b'"' || c == b'\'' {
            quote = c;
        } else if c == b'>' {
            return Some(j);
        }
        j += 1;
    }
    None
}

fn parse_tag(inner: &str) -> (String, Vec<(String, String)>) {
    let inner = inner.trim();
    let name_end = inner.find(|c: char| c.is_whitespace()).unwrap_or(inner.len());
    let qname = inner[..name_end].to_ascii_lowercase();
    let mut attrs = Vec::new();
    let rest = &inner[name_end..];
    let b = rest.as_bytes();
    let mut i = 0;
    while i < b.len() {
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        let ks = i;
        while i < b.len() && b[i] != b'=' && !b[i].is_ascii_whitespace() {
            i += 1;
        }
        let key = rest[ks..i].to_ascii_lowercase();
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if i < b.len() && b[i] == b'=' {
            i += 1;
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < b.len() && (b[i] == b'"' || b[i] == b'\'') {
                let q = b[i];
                i += 1;
                let vs = i;
                while i < b.len() && b[i] != q {
                    i += 1;
                }
                let v = crate::feeds::model::decode_entities(&rest[vs..i.min(b.len())]);
                attrs.push((key, v));
                i += 1;
            } else {
                let vs = i;
                while i < b.len() && !b[i].is_ascii_whitespace() {
                    i += 1;
                }
                attrs.push((key, rest[vs..i].to_string()));
            }
        } else if !key.is_empty() {
            attrs.push((key, String::new()));
        }
    }
    (qname, attrs)
}
