//! Battery health from `powercfg /batteryreport /xml` (no admin needed). The report is written to
//! a Lens temp folder, read, parsed here and deleted.
//!
//! The XML is small and regular, so a tiny tag scanner is enough: no XML crate.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BatteryPack {
    pub id: String,
    pub manufacturer: String,
    pub chemistry: String,
    pub design_mwh: u64,
    pub full_mwh: u64,
    /// None when the battery doesn't report cycles (common; Windows then shows "-").
    pub cycles: Option<u32>,
    /// Full charge as a % of design, 0–100+ (new packs can read slightly above 100).
    pub health_pct: Option<f32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BatteryUsagePoint {
    /// Local time as written by Windows, e.g. "2026-11-20T10:00:00".
    pub local_time: String,
    pub ac: bool,
    pub charge_mwh: u64,
    pub full_mwh: u64,
    /// Charge as % of full, when both are known.
    pub percent: Option<f32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CapacityPoint {
    pub start: String,
    pub end: String,
    pub full_mwh: u64,
    pub design_mwh: u64,
    pub cycles: Option<u32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BatteryReport {
    pub computer: String,
    pub scan_time: String,
    pub batteries: Vec<BatteryPack>,
    pub usage: Vec<BatteryUsagePoint>,
    pub capacity_history: Vec<CapacityPoint>,
}

/// Inner text of every `<tag …>…</tag>` (not nested in itself).
fn blocks<'a>(xml: &'a str, tag: &str) -> Vec<&'a str> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(i) = xml[from..].find(&open) {
        let start = from + i;
        let after = &xml[start + open.len()..];
        // Must be the whole tag name ("<Battery" must not match "<Batteries").
        match after.chars().next() {
            Some(c) if c == '>' || c == ' ' || c == '/' || c == '\n' || c == '\r' || c == '\t' => {}
            _ => {
                from = start + open.len();
                continue;
            }
        }
        let Some(gt) = after.find('>') else { break };
        if after[..gt].ends_with('/') {
            out.push("");
            from = start + open.len() + gt + 1;
            continue;
        }
        let body_start = start + open.len() + gt + 1;
        let Some(end) = xml[body_start..].find(&close) else { break };
        out.push(&xml[body_start..body_start + end]);
        from = body_start + end + close.len();
    }
    out
}

fn text(xml: &str, tag: &str) -> String {
    blocks(xml, tag).first().map(|s| unescape(s.trim())).unwrap_or_default()
}

/// Attributes of every `<tag …/>` or `<tag …>` start tag.
fn start_tags(xml: &str, tag: &str) -> Vec<Vec<(String, String)>> {
    let open = format!("<{tag}");
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(i) = xml[from..].find(&open) {
        let start = from + i + open.len();
        let rest = &xml[start..];
        if !rest.starts_with(|c: char| c.is_whitespace() || c == '/' || c == '>') {
            from = start;
            continue;
        }
        let Some(gt) = rest.find('>') else { break };
        out.push(attrs(&rest[..gt]));
        from = start + gt + 1;
    }
    out
}

fn attrs(s: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut rest = s;
    while let Some(eq) = rest.find('=') {
        let name = rest[..eq].trim().trim_start_matches('/').trim().to_string();
        let after = rest[eq + 1..].trim_start();
        let Some(q) = after.chars().next().filter(|c| *c == '"' || *c == '\'') else { break };
        let Some(end) = after[1..].find(q) else { break };
        out.push((name, unescape(&after[1..1 + end])));
        rest = &after[1 + end + 1..];
    }
    out
}

fn attr<'a>(a: &'a [(String, String)], name: &str) -> Option<&'a str> {
    a.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

fn num(s: &str) -> Option<u64> {
    s.trim().parse::<u64>().ok()
}

/// Windows writes 0 when it doesn't know the cycle count.
fn cycles(s: &str) -> Option<u32> {
    s.trim().parse::<u32>().ok().filter(|c| *c > 0)
}

fn health(full: u64, design: u64) -> Option<f32> {
    if design == 0 || full == 0 {
        return None;
    }
    Some(((full as f64 / design as f64) * 1000.0).round() as f32 / 10.0)
}

pub fn parse_battery_report(xml: &str) -> Result<BatteryReport, String> {
    if !xml.contains("<BatteryReport") {
        return Err("That isn't a Windows battery report.".into());
    }
    let mut r = BatteryReport {
        computer: text(xml, "ComputerName"),
        scan_time: text(xml, "ScanTime"),
        ..Default::default()
    };
    for b in blocks(xml, "Battery") {
        let design = num(&text(b, "DesignCapacity")).unwrap_or(0);
        let full = num(&text(b, "FullChargeCapacity")).unwrap_or(0);
        r.batteries.push(BatteryPack {
            id: text(b, "Id"),
            manufacturer: text(b, "Manufacturer"),
            chemistry: text(b, "Chemistry"),
            design_mwh: design,
            full_mwh: full,
            cycles: cycles(&text(b, "CycleCount")),
            health_pct: health(full, design),
        });
    }
    for a in start_tags(xml, "UsageEntry") {
        let charge = attr(&a, "ChargeCapacity").and_then(num).unwrap_or(0);
        let full = attr(&a, "FullChargeCapacity").and_then(num).unwrap_or(0);
        r.usage.push(BatteryUsagePoint {
            local_time: attr(&a, "LocalTimestamp").or_else(|| attr(&a, "Timestamp")).unwrap_or("").to_string(),
            ac: attr(&a, "Ac") == Some("1"),
            charge_mwh: charge,
            full_mwh: full,
            percent: if full > 0 { Some(((charge as f64 / full as f64) * 1000.0).round() as f32 / 10.0) } else { None },
        });
    }
    for a in start_tags(xml, "HistoryEntry") {
        r.capacity_history.push(CapacityPoint {
            start: attr(&a, "LocalStartDate").or_else(|| attr(&a, "StartDate")).unwrap_or("").to_string(),
            end: attr(&a, "LocalEndDate").or_else(|| attr(&a, "EndDate")).unwrap_or("").to_string(),
            full_mwh: attr(&a, "FullChargeCapacity").and_then(num).unwrap_or(0),
            design_mwh: attr(&a, "DesignCapacity").and_then(num).unwrap_or(0),
            cycles: attr(&a, "CycleCount").and_then(cycles),
        });
    }
    Ok(r)
}

/// Generates and parses the report. Windows-only; no admin needed.
#[cfg(windows)]
pub fn run_report() -> Result<BatteryReport, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let dir = std::env::temp_dir().join("LensUI-battery");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("report-{}.xml", std::process::id()));
    let status = std::process::Command::new("powercfg.exe")
        .arg("/batteryreport")
        .arg("/xml")
        .arg("/output")
        .arg(&file)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Couldn't run powercfg: {e}"))?;
    if !status.status.success() {
        let _ = std::fs::remove_file(&file);
        return Err("Windows couldn't make a battery report. This PC may not have a battery.".into());
    }
    let bytes = std::fs::read(&file).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&file);
    // powercfg writes UTF-8 with a BOM on current builds, UTF-16 on some older ones.
    let xml = if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes)).into_owned()
    };
    parse_battery_report(&xml)
}

#[cfg(not(windows))]
pub fn run_report() -> Result<BatteryReport, String> {
    Err("Battery reports need Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("fixtures/batteryreport.xml");

    #[test]
    fn parses_the_fixture() {
        let r = parse_battery_report(FIXTURE).unwrap();
        assert_eq!(r.computer, "LENS-LAPTOP");
        assert_eq!(r.batteries.len(), 1);
        let b = &r.batteries[0];
        assert_eq!(b.manufacturer, "SMP");
        assert_eq!(b.chemistry, "LiP");
        assert_eq!(b.design_mwh, 57_000);
        assert_eq!(b.full_mwh, 49_590);
        assert_eq!(b.cycles, Some(214));
        assert_eq!(b.health_pct, Some(87.0));
        assert_eq!(r.usage.len(), 4);
        assert!(r.usage[0].ac);
        assert!(!r.usage[1].ac);
        assert_eq!(r.usage[1].percent, Some(80.0));
        assert_eq!(r.usage[2].local_time, "2026-11-20T13:30:00");
        assert_eq!(r.capacity_history.len(), 3);
        assert_eq!(r.capacity_history[2].full_mwh, 49_590);
        assert_eq!(r.capacity_history[0].cycles, None, "0 means unknown");
    }

    #[test]
    fn unknown_cycles_and_missing_capacity() {
        let xml = "<BatteryReport><Batteries><Battery><Id>X</Id><DesignCapacity>0</DesignCapacity><FullChargeCapacity>100</FullChargeCapacity><CycleCount>0</CycleCount></Battery></Batteries></BatteryReport>";
        let r = parse_battery_report(xml).unwrap();
        assert_eq!(r.batteries[0].cycles, None);
        assert_eq!(r.batteries[0].health_pct, None);
    }

    #[test]
    fn no_batteries_and_garbage() {
        let r = parse_battery_report("<BatteryReport><Batteries /></BatteryReport>").unwrap();
        assert!(r.batteries.is_empty());
        assert!(parse_battery_report("<html>nope</html>").is_err());
    }

    #[test]
    fn tag_names_are_whole_words() {
        // "<Batteries>" must not be read as a "<Battery>".
        let xml = "<BatteryReport><Batteries><Battery><Id>A</Id></Battery><Battery><Id>B &amp; C</Id></Battery></Batteries></BatteryReport>";
        let r = parse_battery_report(xml).unwrap();
        assert_eq!(r.batteries.iter().map(|b| b.id.as_str()).collect::<Vec<_>>(), vec!["A", "B & C"]);
    }
}
