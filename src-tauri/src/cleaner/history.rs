//! "Where did my space go?" — one small local snapshot of drive usage per day, plus the sizes of
//! your top folders from each Space map scan. Stored as plain text in
//! %APPDATA%\LensUI\cleaner\history.txt; never leaves the PC.
//!
//!   D|2026-11-22|C:\|<total>|<free>
//!   F|2026-11-22|C:\Users\you\Videos|<size>

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const KEEP_DAYS: usize = 120;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub day: String,
    pub used: u64,
    pub free: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Growth {
    pub path: String,
    pub before: u64,
    pub after: u64,
    pub delta: i64,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct History {
    /// root → day → (total, free)
    pub drives: BTreeMap<String, BTreeMap<String, (u64, u64)>>,
    /// path → day → size
    pub folders: BTreeMap<String, BTreeMap<String, u64>>,
}

pub fn parse(src: &str) -> History {
    let mut h = History::default();
    for line in src.lines() {
        let f: Vec<&str> = line.split('|').collect();
        match f.as_slice() {
            ["D", day, root, total, free] => {
                if let (Ok(t), Ok(fr)) = (total.parse(), free.parse()) {
                    h.drives.entry(root.to_string()).or_default().insert(day.to_string(), (t, fr));
                }
            }
            ["F", day, path, size] => {
                if let Ok(s) = size.parse() {
                    h.folders.entry(path.to_string()).or_default().insert(day.to_string(), s);
                }
            }
            _ => {}
        }
    }
    h
}

fn trim<V>(m: &mut BTreeMap<String, V>) {
    while m.len() > KEEP_DAYS {
        let first = m.keys().next().cloned();
        if let Some(k) = first {
            m.remove(&k);
        }
    }
}

impl History {
    pub fn record_drive(&mut self, day: &str, root: &str, total: u64, free: u64) {
        let m = self.drives.entry(root.to_string()).or_default();
        m.insert(day.to_string(), (total, free));
        trim(m);
    }

    pub fn record_folder(&mut self, day: &str, path: &str, size: u64) {
        if path.contains('|') || path.contains('\n') {
            return;
        }
        let m = self.folders.entry(path.to_string()).or_default();
        m.insert(day.to_string(), size);
        trim(m);
    }

    pub fn serialize(&self) -> String {
        let mut s = String::new();
        for (root, days) in &self.drives {
            for (day, (t, f)) in days {
                s.push_str(&format!("D|{}|{}|{}|{}\n", day, root, t, f));
            }
        }
        for (path, days) in &self.folders {
            for (day, size) in days {
                s.push_str(&format!("F|{}|{}|{}\n", day, path, size));
            }
        }
        s
    }

    /// Used space per day for a drive, oldest first, last `days` entries.
    pub fn series(&self, root: &str, days: usize) -> Vec<Point> {
        let Some(m) = self.drives.get(root) else { return vec![] };
        let v: Vec<Point> = m.iter().map(|(d, (t, f))| Point { day: d.clone(), used: t.saturating_sub(*f), free: *f }).collect();
        v[v.len().saturating_sub(days)..].to_vec()
    }

    /// Folders that grew most between the oldest snapshot on or after `since_day` and the latest.
    pub fn growth(&self, since_day: &str, limit: usize) -> Vec<Growth> {
        let mut v: Vec<Growth> = self
            .folders
            .iter()
            .filter_map(|(path, days)| {
                let before = days.range(since_day.to_string()..).next().map(|(_, s)| *s)?;
                let after = *days.values().next_back()?;
                let delta = after as i64 - before as i64;
                (delta > 0).then(|| Growth { path: path.clone(), before, after, delta })
            })
            .collect();
        v.sort_by(|a, b| b.delta.cmp(&a.delta));
        v.truncate(limit);
        v
    }
}

/// A sudden jump in used space between the last two snapshots: ≥ 5 GB or ≥ 3% of the drive.
pub fn sudden_growth(series: &[Point], total: u64) -> Option<u64> {
    let [.., a, b] = series else { return None };
    let d = b.used.saturating_sub(a.used);
    (d >= 5_000_000_000 || (total > 0 && d * 100 >= total * 3)).then_some(d)
}
