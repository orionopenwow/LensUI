//! Audit log: one line per thing Lens Cleaner did, in %APPDATA%\LensUI\cleaner\log\YYYY-MM-DD.log.
//! Paths only (never file contents). Kept 90 days.

use std::io::Write;
use std::path::Path;

pub fn line(ms: u64, kind: &str, detail: &str) -> String {
    let secs = (ms / 1000) % 86_400;
    let clean: String = detail.chars().map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
    format!("{} {:02}:{:02}:{:02} {} {}\n", super::day_string(ms), secs / 3600, (secs / 60) % 60, secs % 60, kind, clean)
}

pub fn write(dir: &Path, ms: u64, kind: &str, details: &[String]) {
    let log = dir.join("log");
    if std::fs::create_dir_all(&log).is_err() {
        return;
    }
    let file = log.join(format!("{}.log", super::day_string(ms)));
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(file) {
        for d in details {
            let _ = f.write_all(line(ms, kind, d).as_bytes());
        }
    }
    prune(&log, ms);
}

fn prune(log: &Path, ms: u64) {
    let cutoff = super::day_string(ms.saturating_sub(90 * 86_400_000));
    if let Ok(rd) = std::fs::read_dir(log) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.ends_with(".log") && n.len() == 14 && &n[..10] < cutoff.as_str() {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}
