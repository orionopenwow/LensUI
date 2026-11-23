//! A small read-only SQLite reader: enough to read whole tables from a copy of a browser's
//! History / places.sqlite file without pulling in a C library.
//!
//! Supports table b-trees (interior + leaf), overflow pages, every record serial type, UTF-8
//! text, and `INTEGER PRIMARY KEY` row-id aliases. It does not read the `-wal` file, so the last
//! few minutes of a browser that is still running may be missing (documented in the UI).

use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Int(i64),
    Real(f64),
    Text(String),
    /// Kept so records decode completely; no importer needs blob contents yet.
    #[allow(dead_code)]
    Blob(Vec<u8>),
}

impl Value {
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Int(i) => Some(*i),
            Value::Real(r) => Some(*r as i64),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Text(s) => Some(s),
            _ => None,
        }
    }
}

pub struct Db {
    data: Vec<u8>,
    page_size: usize,
    usable: usize,
}

const MAX_PAGES_VISITED: usize = 2_000_000;

fn be16(b: &[u8], o: usize) -> Option<usize> {
    Some(u16::from_be_bytes([*b.get(o)?, *b.get(o + 1)?]) as usize)
}
fn be32(b: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_be_bytes([*b.get(o)?, *b.get(o + 1)?, *b.get(o + 2)?, *b.get(o + 3)?]))
}

/// SQLite varint: returns (value, bytes used).
pub fn varint(b: &[u8], o: usize) -> Option<(u64, usize)> {
    let mut v: u64 = 0;
    for i in 0..9 {
        let c = *b.get(o + i)?;
        if i == 8 {
            return Some(((v << 8) | u64::from(c), 9));
        }
        v = (v << 7) | u64::from(c & 0x7f);
        if c & 0x80 == 0 {
            return Some((v, i + 1));
        }
    }
    None
}

impl Db {
    pub fn open(data: Vec<u8>) -> Result<Db, String> {
        if data.len() < 100 || &data[..16] != b"SQLite format 3\0" {
            return Err("Not a SQLite database.".into());
        }
        let ps = be16(&data, 16).ok_or("Bad header.")?;
        let page_size = if ps == 1 { 65536 } else { ps };
        if !(512..=65536).contains(&page_size) || !page_size.is_power_of_two() {
            return Err("Bad page size.".into());
        }
        let reserved = data[20] as usize;
        if data[56..60] != [0, 0, 0, 1] && data[56..60] != [0, 0, 0, 0] {
            return Err("Only UTF-8 databases are supported.".into());
        }
        Ok(Db { usable: page_size - reserved, page_size, data })
    }

    fn page(&self, n: u32) -> Result<&[u8], String> {
        let n = n as usize;
        if n == 0 {
            return Err("Bad page number.".into());
        }
        let start = (n - 1) * self.page_size;
        self.data.get(start..start + self.page_size).ok_or_else(|| "Page out of range (the file may be truncated).".to_string())
    }

    /// Reads a cell's payload (following overflow pages).
    fn payload(&self, page: &[u8], at: usize, total: usize, visited: &mut usize) -> Result<Vec<u8>, String> {
        let u = self.usable;
        let x = u - 35;
        let local = if total <= x {
            total
        } else {
            let m = ((u - 12) * 32 / 255) - 23;
            let k = m + ((total - m) % (u - 4));
            if k <= x { k } else { m }
        };
        let mut out = page.get(at..at + local).ok_or("Cell out of range.")?.to_vec();
        if local < total {
            let mut next = be32(page, at + local).ok_or("Bad overflow pointer.")?;
            while out.len() < total {
                *visited += 1;
                if next == 0 || *visited > MAX_PAGES_VISITED {
                    return Err("Broken overflow chain.".into());
                }
                let p = self.page(next)?;
                next = be32(p, 0).ok_or("Bad overflow page.")?;
                let take = (total - out.len()).min(u - 4);
                out.extend_from_slice(p.get(4..4 + take).ok_or("Bad overflow page.")?);
            }
        }
        Ok(out)
    }

    /// All (rowid, record) pairs of the table b-tree rooted at `root`, in order.
    fn walk(&self, root: u32, limit: usize) -> Result<Vec<(i64, Vec<Value>)>, String> {
        let mut rows = vec![];
        let mut stack = vec![root];
        let mut seen: HashSet<u32> = HashSet::new();
        let mut visited = 0usize;
        while let Some(pn) = stack.pop() {
            if !seen.insert(pn) || seen.len() > MAX_PAGES_VISITED {
                return Err("The database's pages form a loop.".into());
            }
            let page = self.page(pn)?;
            let h = if pn == 1 { 100 } else { 0 };
            let kind = *page.get(h).ok_or("Bad page.")?;
            let cells = be16(page, h + 3).ok_or("Bad page.")?;
            match kind {
                0x0d => {
                    for i in 0..cells {
                        let ptr = be16(page, h + 8 + i * 2).ok_or("Bad cell pointer.")?;
                        let (size, a) = varint(page, ptr).ok_or("Bad cell.")?;
                        let (rowid, b) = varint(page, ptr + a).ok_or("Bad cell.")?;
                        let body = self.payload(page, ptr + a + b, size as usize, &mut visited)?;
                        rows.push((rowid as i64, record(&body)?));
                        if rows.len() >= limit {
                            return Ok(rows);
                        }
                    }
                }
                0x05 => {
                    let right = be32(page, h + 8).ok_or("Bad page.")?;
                    // Push in reverse so children are visited left to right.
                    stack.push(right);
                    for i in (0..cells).rev() {
                        let ptr = be16(page, h + 12 + i * 2).ok_or("Bad cell pointer.")?;
                        stack.push(be32(page, ptr).ok_or("Bad child pointer.")?);
                    }
                }
                _ => return Err(format!("Unexpected page type {kind:#x}.")),
            }
        }
        Ok(rows)
    }

    /// Reads up to `limit` rows of a table. Returns column names and rows (row-id aliases filled in).
    pub fn table(&self, name: &str, limit: usize) -> Result<(Vec<String>, Vec<Vec<Value>>), String> {
        let master = self.walk(1, 10_000)?;
        let row = master
            .iter()
            .map(|(_, r)| r)
            .find(|r| r.first().and_then(Value::as_str) == Some("table") && r.get(1).and_then(Value::as_str).is_some_and(|n| n.eq_ignore_ascii_case(name)))
            .ok_or_else(|| format!("No table named {name}."))?;
        let root = row.get(3).and_then(Value::as_i64).ok_or("Bad schema row.")? as u32;
        let sql = row.get(4).and_then(Value::as_str).unwrap_or("");
        let (cols, alias) = columns(sql);
        let mut out = vec![];
        for (rowid, mut rec) in self.walk(root, limit)? {
            rec.resize(cols.len().max(rec.len()), Value::Null);
            if let Some(i) = alias {
                if rec[i] == Value::Null {
                    rec[i] = Value::Int(rowid);
                }
            }
            out.push(rec);
        }
        Ok((cols, out))
    }
}

fn record(b: &[u8]) -> Result<Vec<Value>, String> {
    let (hlen, mut o) = varint(b, 0).ok_or("Bad record.")?;
    let hlen = hlen as usize;
    let mut types = vec![];
    while o < hlen {
        let (t, n) = varint(b, o).ok_or("Bad record header.")?;
        types.push(t);
        o += n;
    }
    let mut p = hlen;
    let mut out = Vec::with_capacity(types.len());
    let int = |b: &[u8], p: usize, n: usize| -> Option<i64> {
        let s = b.get(p..p + n)?;
        let mut v: i64 = if s[0] & 0x80 != 0 { -1 } else { 0 };
        for &x in s {
            v = (v << 8) | i64::from(x);
        }
        Some(v)
    };
    for t in types {
        let (v, n) = match t {
            0 => (Value::Null, 0),
            1..=4 => {
                let n = t as usize;
                (Value::Int(int(b, p, n).ok_or("Bad int.")?), n)
            }
            5 => (Value::Int(int(b, p, 6).ok_or("Bad int.")?), 6),
            6 => (Value::Int(int(b, p, 8).ok_or("Bad int.")?), 8),
            7 => {
                let s = b.get(p..p + 8).ok_or("Bad real.")?;
                (Value::Real(f64::from_be_bytes(s.try_into().map_err(|_| "Bad real.")?)), 8)
            }
            8 => (Value::Int(0), 0),
            9 => (Value::Int(1), 0),
            10 | 11 => return Err("Reserved serial type.".into()),
            t if t % 2 == 0 => {
                let n = ((t - 12) / 2) as usize;
                (Value::Blob(b.get(p..p + n).ok_or("Bad blob.")?.to_vec()), n)
            }
            t => {
                let n = ((t - 13) / 2) as usize;
                (Value::Text(String::from_utf8_lossy(b.get(p..p + n).ok_or("Bad text.")?).into_owned()), n)
            }
        };
        out.push(v);
        p += n;
    }
    Ok(out)
}

/// Column names from a CREATE TABLE statement, and which one aliases the row id.
pub fn columns(sql: &str) -> (Vec<String>, Option<usize>) {
    let (Some(a), Some(b)) = (sql.find('('), sql.rfind(')')) else { return (vec![], None) };
    let body = &sql[a + 1..b];
    let mut parts = vec![];
    let (mut depth, mut cur) = (0i32, String::new());
    for c in body.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(std::mem::take(&mut cur));
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    parts.push(cur);
    let mut cols = vec![];
    let mut alias = None;
    for p in parts {
        let t = p.trim();
        let first = t.split_whitespace().next().unwrap_or("").to_ascii_uppercase();
        if t.is_empty() || ["PRIMARY", "UNIQUE", "CONSTRAINT", "CHECK", "FOREIGN"].contains(&first.as_str()) {
            continue;
        }
        let name = t.split_whitespace().next().unwrap_or("").trim_matches(|c| c == '"' || c == '`' || c == '[' || c == ']').to_string();
        let lower = t.to_ascii_lowercase();
        if lower.contains("integer primary key") {
            alias = Some(cols.len());
        }
        cols.push(name);
    }
    (cols, alias)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varints() {
        assert_eq!(varint(&[0x05], 0), Some((5, 1)));
        assert_eq!(varint(&[0x81, 0x00], 0), Some((128, 2)));
        assert_eq!(varint(&[0xff; 9], 0).map(|x| x.1), Some(9));
        assert_eq!(varint(&[0x81], 0), None);
    }

    #[test]
    fn column_parsing() {
        let (c, a) = columns("CREATE TABLE urls(id INTEGER PRIMARY KEY AUTOINCREMENT,url LONGVARCHAR,title LONGVARCHAR,visit_count INTEGER DEFAULT 0 NOT NULL, CONSTRAINT x UNIQUE(url))");
        assert_eq!(c, vec!["id", "url", "title", "visit_count"]);
        assert_eq!(a, Some(0));
    }

    #[test]
    fn rejects_garbage() {
        assert!(Db::open(vec![0; 50]).is_err());
        assert!(Db::open(b"not sqlite at all, definitely not a database file....................................................".to_vec()).is_err());
    }
}
