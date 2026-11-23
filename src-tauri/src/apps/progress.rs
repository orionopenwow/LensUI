//! Turns winget's console output into progress events for `lens://apps/progress`.
//!
//! winget redraws one line with carriage returns for its spinner and download bar
//! (`  ██████▒▒▒▒  12.0 MB / 48.3 MB` or `  ███▒▒  45%`), and prints phase lines such as
//! `Downloading https://…`, `Successfully verified installer hash`, `Starting package install...`.
//! [`ProgressParser`] accepts arbitrary chunks (split anywhere) and emits only meaningful changes.

/// Install phases shown in the UI, in order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Stage {
    Resolving,
    Downloading,
    Verifying,
    Installing,
    Done,
    Failed,
}

impl Stage {
    pub fn as_str(self) -> &'static str {
        match self {
            Stage::Resolving => "resolving",
            Stage::Downloading => "downloading",
            Stage::Verifying => "verifying",
            Stage::Installing => "installing",
            Stage::Done => "done",
            Stage::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProgressEvent {
    pub stage: Stage,
    /// 0–100 for the current stage, when winget reports it.
    pub pct: Option<f32>,
    /// Plain-language line for the UI.
    pub message: String,
}

#[derive(Debug, Default)]
pub struct ProgressParser {
    pending: String,
    stage: Option<Stage>,
    last_pct: Option<i32>,
    finished: bool,
}

impl ProgressParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn stage(&self) -> Option<Stage> {
        self.stage
    }

    /// Feeds a chunk of stdout/stderr. Returns the events produced by complete segments.
    pub fn feed(&mut self, chunk: &str) -> Vec<ProgressEvent> {
        self.pending.push_str(chunk);
        let mut out = Vec::new();
        while let Some(idx) = self.pending.find(['\r', '\n']) {
            let seg: String = self.pending[..idx].to_string();
            self.pending.drain(..=idx);
            self.segment(&seg, &mut out);
        }
        // A progress bar may sit at the end without a trailing \r yet; parse it if it already holds a value.
        if looks_like_bar(&self.pending) && (self.pending.contains('%') || self.pending.contains(" / ")) {
            let seg = std::mem::take(&mut self.pending);
            if self.pending_is_complete_bar(&seg) {
                self.segment(&seg, &mut out);
            } else {
                self.pending = seg;
            }
        }
        out
    }

    /// Flushes any trailing text and, if the process exited without a recognised result line,
    /// reports success or failure from the exit code.
    pub fn finish(&mut self, exit_code: Option<i32>) -> Vec<ProgressEvent> {
        let mut out = Vec::new();
        let rest = std::mem::take(&mut self.pending);
        if !rest.trim().is_empty() {
            self.segment(&rest, &mut out);
        }
        if !self.finished {
            self.finished = true;
            match exit_code {
                Some(0) => out.push(self.ev(Stage::Done, Some(100.0), "Finished".into())),
                Some(code) => out.push(self.ev(Stage::Failed, None, failure_message(code))),
                None => out.push(self.ev(Stage::Failed, None, "Cancelled".into())),
            }
        }
        out
    }

    fn pending_is_complete_bar(&self, seg: &str) -> bool {
        // "45%" or "12.0 MB / 48.3 MB" with both numbers present.
        let t = seg.trim();
        t.ends_with('%') || t.ends_with("MB") || t.ends_with("KB") || t.ends_with("GB") || t.ends_with(" B")
    }

    fn ev(&mut self, stage: Stage, pct: Option<f32>, message: String) -> ProgressEvent {
        self.stage = Some(stage);
        ProgressEvent { stage, pct, message }
    }

    fn segment(&mut self, raw: &str, out: &mut Vec<ProgressEvent>) {
        let line = raw.trim();
        if line.is_empty() || is_spinner(line) || self.finished {
            return;
        }
        let lower = line.to_ascii_lowercase();
        if looks_like_bar(line) {
            if let Some(pct) = bar_percent(line) {
                let rounded = pct.round() as i32;
                // Only report whole-percent changes to keep the event stream small.
                if self.last_pct != Some(rounded) {
                    self.last_pct = Some(rounded);
                    let stage = match self.stage {
                        Some(Stage::Installing) => Stage::Installing,
                        _ => Stage::Downloading,
                    };
                    let size = bar_size_text(line);
                    out.push(self.ev(stage, Some(pct), size.unwrap_or_else(|| format!("{rounded}%"))));
                }
            }
            return;
        }
        if lower.starts_with("found ") {
            self.last_pct = None;
            out.push(self.ev(Stage::Resolving, None, line.to_string()));
        } else if lower.starts_with("downloading ") {
            self.last_pct = None;
            out.push(self.ev(Stage::Downloading, Some(0.0), "Downloading from the publisher".into()));
        } else if lower.contains("successfully verified installer hash") {
            out.push(self.ev(Stage::Verifying, Some(100.0), "Installer hash verified".into()));
        } else if lower.contains("installer hash does not match") {
            self.finished = true;
            out.push(self.ev(Stage::Failed, None, "The download didn't match its published hash, so Lens stopped. Nothing was installed.".into()));
        } else if lower.starts_with("starting package install") || lower.starts_with("starting package uninstall") {
            self.last_pct = None;
            let msg = if lower.contains("uninstall") { "Uninstalling…" } else { "Installing…" };
            out.push(self.ev(Stage::Installing, None, msg.into()));
        } else if lower.starts_with("successfully installed")
            || lower.starts_with("successfully uninstalled")
            || lower.contains("no available upgrade found")
            || lower.contains("found an existing package already installed")
        {
            self.finished = true;
            let msg = if lower.contains("no available upgrade") || lower.contains("already installed") {
                "Already up to date"
            } else if lower.contains("uninstalled") {
                "Uninstalled"
            } else {
                "Installed"
            };
            out.push(self.ev(Stage::Done, Some(100.0), msg.into()));
        } else if lower.contains("no package found matching input criteria") {
            self.finished = true;
            out.push(self.ev(Stage::Failed, None, "winget couldn't find this package. It may have been renamed; use the official download link instead.".into()));
        } else if lower.starts_with("installer failed with exit code") || lower.starts_with("uninstall failed with exit code") {
            self.finished = true;
            out.push(self.ev(Stage::Failed, None, line.to_string()));
        } else if lower.contains("cancelled") || lower.contains("canceled") {
            self.finished = true;
            out.push(self.ev(Stage::Failed, None, "Cancelled".into()));
        }
        // Other informational lines (licence notices, "This application is licensed to you by…") are ignored.
    }
}

fn is_spinner(line: &str) -> bool {
    line.chars().all(|c| matches!(c, '-' | '\\' | '|' | '/' | ' '))
}

fn looks_like_bar(line: &str) -> bool {
    line.contains('█') || line.contains('▒')
}

/// Percent from a bar line: either an explicit `NN%`, or `done / total` with units.
fn bar_percent(line: &str) -> Option<f32> {
    let t = line.trim();
    if let Some(p) = t.strip_suffix('%') {
        let num: String = p.chars().rev().take_while(|c| c.is_ascii_digit() || *c == '.').collect::<Vec<_>>().into_iter().rev().collect();
        return num.parse::<f32>().ok().map(|v| v.clamp(0.0, 100.0));
    }
    let (left, right) = t.split_once(" / ")?;
    let done = parse_size(left.rsplit(['█', '▒']).next()?.trim())?;
    let total = parse_size(right.trim())?;
    if total <= 0.0 {
        return None;
    }
    Some(((done / total) * 100.0).clamp(0.0, 100.0) as f32)
}

fn bar_size_text(line: &str) -> Option<String> {
    let t = line.trim();
    let (left, right) = t.split_once(" / ")?;
    let done = left.rsplit(['█', '▒']).next()?.trim();
    Some(format!("{done} of {}", right.trim()))
}

/// `12.0 MB` → bytes.
fn parse_size(s: &str) -> Option<f64> {
    let mut parts = s.split_whitespace();
    let n: f64 = parts.next()?.parse().ok()?;
    let mult = match parts.next().unwrap_or("B") {
        "B" => 1.0,
        "KB" => 1024.0,
        "MB" => 1024.0 * 1024.0,
        "GB" => 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some(n * mult)
}

/// Plain-language failure for common winget/installer exit codes.
pub fn failure_message(code: i32) -> String {
    // winget returns HRESULT-style codes (as signed i32).
    match code as u32 {
        0x8A15_0014 => "winget couldn't find this package.".into(),
        0x8A15_002B => "The installer needs to run as administrator and the prompt was declined.".into(),
        0x8A15_0011 => "The download didn't match its published hash, so nothing was installed.".into(),
        0x8A15_0101..=0x8A15_01FF => "The installer reported an error. See the audit log for details.".into(),
        0x8007_04C7 => "Cancelled".into(),
        _ if code == 1602 => "Cancelled in the installer".into(),
        _ if code == 3010 => "Installed. Restart Windows to finish.".into(),
        _ => format!("winget exited with code {code:#x}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed_all(p: &mut ProgressParser, s: &str) -> Vec<ProgressEvent> {
        p.feed(s)
    }

    const FIXTURE_INSTALL: &str = "   - \r   \\ \r   | \rFound Ollama [Ollama.Ollama] Version 0.40.16\r\nThis application is licensed to you by its owner.\r\nMicrosoft is not responsible for, nor does it grant any licenses to, third-party packages.\r\nDownloading https://github.com/ollama/ollama/releases/download/v0.40.16/OllamaSetup.exe\r\n  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  0.00 B / 1.10 GB\r  ██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒   225 MB / 1.10 GB\r  ███████████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒   563 MB / 1.10 GB\r  ██████████████████████████████  1.10 GB / 1.10 GB\r\nSuccessfully verified installer hash\r\nStarting package install...\r\n  ████████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  40%\r  ██████████████████████████████  100%\r\nSuccessfully installed\r\n";

    #[test]
    fn full_install_fixture() {
        let mut p = ProgressParser::new();
        let evs = feed_all(&mut p, FIXTURE_INSTALL);
        let stages: Vec<Stage> = evs.iter().map(|e| e.stage).collect();
        assert_eq!(stages.first(), Some(&Stage::Resolving));
        assert!(stages.contains(&Stage::Downloading));
        assert!(stages.contains(&Stage::Verifying));
        assert!(stages.contains(&Stage::Installing));
        assert_eq!(stages.last(), Some(&Stage::Done));
        // Stages never go backwards.
        assert!(stages.windows(2).all(|w| w[0] <= w[1]), "{stages:?}");
        let dl: Vec<f32> = evs.iter().filter(|e| e.stage == Stage::Downloading).filter_map(|e| e.pct).collect();
        assert!(dl.windows(2).all(|w| w[0] <= w[1]));
        assert!((dl.last().unwrap() - 100.0).abs() < 0.01);
        assert!(evs.iter().any(|e| e.message.contains("225 MB of 1.10 GB")));
        let inst: Vec<f32> = evs.iter().filter(|e| e.stage == Stage::Installing).filter_map(|e| e.pct).collect();
        assert_eq!(inst, vec![40.0, 100.0]);
        // finish() after a recognised success adds nothing.
        assert!(p.finish(Some(0)).is_empty());
    }

    #[test]
    fn chunk_boundaries_do_not_matter() {
        let whole = { let mut p = ProgressParser::new(); let mut v = p.feed(FIXTURE_INSTALL); v.extend(p.finish(Some(0))); v };
        for size in [1usize, 3, 7, 64] {
            let mut p = ProgressParser::new();
            let mut got = Vec::new();
            let chars: Vec<char> = FIXTURE_INSTALL.chars().collect();
            for c in chars.chunks(size) {
                got.extend(p.feed(&c.iter().collect::<String>()));
            }
            got.extend(p.finish(Some(0)));
            let a: Vec<_> = whole.iter().map(|e| (e.stage, e.pct.map(|x| x.round() as i32))).collect();
            let b: Vec<_> = got.iter().map(|e| (e.stage, e.pct.map(|x| x.round() as i32))).collect();
            assert_eq!(a, b, "chunk size {size}");
        }
    }

    #[test]
    fn hash_mismatch_and_not_found() {
        let mut p = ProgressParser::new();
        let evs = p.feed("Found X [A.B] Version 1\r\nDownloading https://e.com/x.exe\r\nInstaller hash does not match; this cannot be overridden when running as admin\r\n");
        assert_eq!(evs.last().unwrap().stage, Stage::Failed);
        assert!(evs.last().unwrap().message.contains("didn't match"));
        assert!(p.finish(Some(-1978335215)).is_empty(), "already reported");

        let mut p = ProgressParser::new();
        let evs = p.feed("No package found matching input criteria.\r\n");
        assert_eq!(evs[0].stage, Stage::Failed);
    }

    #[test]
    fn exit_codes_without_result_lines() {
        let mut p = ProgressParser::new();
        p.feed("Starting package install...\r\n");
        let evs = p.finish(Some(1602));
        assert_eq!(evs[0].stage, Stage::Failed);
        assert!(evs[0].message.contains("Cancelled"));
        let mut p = ProgressParser::new();
        assert_eq!(p.finish(Some(0))[0].stage, Stage::Done);
        let mut p = ProgressParser::new();
        assert_eq!(p.finish(None)[0].message, "Cancelled");
        assert!(failure_message(0x8A150011u32 as i32).contains("hash"));
    }

    #[test]
    fn upgrade_and_uninstall_lines() {
        let mut p = ProgressParser::new();
        let evs = p.feed("No available upgrade found.\r\n");
        assert_eq!(evs[0], ProgressEvent { stage: Stage::Done, pct: Some(100.0), message: "Already up to date".into() });
        let mut p = ProgressParser::new();
        let evs = p.feed("Starting package uninstall...\r\nSuccessfully uninstalled\r\n");
        assert_eq!(evs[0].message, "Uninstalling…");
        assert_eq!(evs[1].message, "Uninstalled");
    }
}
