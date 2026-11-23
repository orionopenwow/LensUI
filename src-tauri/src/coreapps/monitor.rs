//! Lens Monitor: processes grouped by app, plus GPU / disk / network rates that sysinfo doesn't
//! give. CPU and memory come from `sys_telemetry::collect_telemetry` (the shared sampler).
//!
//! GPU, disk and network are read from Windows' formatted performance classes through CIM
//! (class names are the same in every Windows language, unlike typeperf counter paths). That
//! takes ~0.5 s, so it runs on a background thread at most every 2 s, and only while the
//! Monitor window keeps asking (nothing is sampled while it is hidden).

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerfRates {
    /// Busiest GPU engine, % (what Task Manager shows). None when Windows has no GPU counters.
    pub gpu_pct: Option<f32>,
    pub disk_read_bps: Option<f64>,
    pub disk_write_bps: Option<f64>,
    /// % of time the disks were busy (all disks).
    pub disk_busy_pct: Option<f32>,
    pub net_rx_bps: Option<f64>,
    pub net_tx_bps: Option<f64>,
}

/// The PowerShell that prints one line per counter: `G|instance|util`, `D|_Total|read|write|busy`,
/// `N|adapter|rx|tx`.
pub const PERF_SCRIPT: &str = "$ErrorActionPreference='SilentlyContinue';\
Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | ForEach-Object { \"G|$($_.Name)|$($_.UtilizationPercentage)\" };\
Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter \"Name='_Total'\" | ForEach-Object { \"D|$($_.Name)|$($_.DiskReadBytesPersec)|$($_.DiskWriteBytesPersec)|$($_.PercentDiskTime)\" };\
Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | ForEach-Object { \"N|$($_.Name)|$($_.BytesReceivedPersec)|$($_.BytesSentPersec)\" }";

/// GPU engine instance names look like `pid_1234_luid_0x0_0x0000C3F2_phys_0_eng_3_engtype_3D`.
/// The same engine appears once per process; Task Manager adds those up per engine and shows
/// the busiest engine.
fn engine_key(instance: &str) -> &str {
    match instance.find("luid_") {
        Some(i) => &instance[i..],
        None => instance,
    }
}

pub fn parse_perf(text: &str) -> PerfRates {
    let mut r = PerfRates::default();
    let mut engines: HashMap<&str, f32> = HashMap::new();
    let mut rx = 0.0;
    let mut tx = 0.0;
    let mut any_net = false;
    for line in text.lines() {
        let f: Vec<&str> = line.trim().split('|').collect();
        match f.as_slice() {
            ["G", name, util] => {
                if let Ok(u) = util.trim().parse::<f32>() {
                    *engines.entry(engine_key(name)).or_insert(0.0) += u;
                }
            }
            ["D", _, read, write, busy] => {
                r.disk_read_bps = read.trim().parse().ok();
                r.disk_write_bps = write.trim().parse().ok();
                r.disk_busy_pct = busy.trim().parse::<f32>().ok().map(|b| b.min(100.0));
            }
            ["N", name, a, b] => {
                // Skip loopback, ISATAP/Teredo and virtual switch adapters.
                let n = name.to_ascii_lowercase();
                if n.contains("loopback") || n.contains("isatap") || n.contains("teredo") || n.contains("vethernet") {
                    continue;
                }
                if let (Ok(a), Ok(b)) = (a.trim().parse::<f64>(), b.trim().parse::<f64>()) {
                    rx += a;
                    tx += b;
                    any_net = true;
                }
            }
            _ => {}
        }
    }
    if !engines.is_empty() {
        r.gpu_pct = Some(engines.values().cloned().fold(0.0, f32::max).min(100.0));
    }
    if any_net {
        r.net_rx_bps = Some(rx);
        r.net_tx_bps = Some(tx);
    }
    r
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub exe: Option<String>,
    pub cpu: f32,
    pub memory_mb: f64,
    /// Disk read + write since the last sample, bytes per second.
    pub disk_bps: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppGroup {
    /// "chrome" for chrome.exe.
    pub name: String,
    pub exe: Option<String>,
    pub pids: Vec<u32>,
    pub cpu: f32,
    pub memory_mb: f64,
    pub disk_bps: f64,
    /// Windows or Lens itself: End task is not offered.
    pub protected: bool,
}

/// Processes Windows needs to keep running (ending them logs you out or crashes Windows), plus
/// Lens itself. Compared case-insensitively without ".exe".
const PROTECTED: &[&str] = &[
    "system", "system idle process", "idle", "registry", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "lsaiso",
    "svchost", "fontdrvhost", "dwm", "memory compression", "secure system", "spoolsv", "sihost", "ctfmon", "audiodg",
    "explorer", "taskhostw", "runtimebroker", "startmenuexperiencehost", "shellexperiencehost", "searchhost", "textinputhost",
    "msmpeng", "nissrv", "securityhealthservice", "wudfhost", "conhost", "dllhost", "lens-ui", "lens ui", "lensui",
    "msedgewebview2",
];

pub fn is_protected(name: &str, pid: u32) -> bool {
    let n = name.trim().to_ascii_lowercase();
    let n = n.trim_end_matches(".exe");
    pid < 100 || pid == std::process::id() || PROTECTED.contains(&n)
}

/// Groups processes by executable name. Sorted by CPU, then memory.
pub fn group_processes(procs: &[ProcInfo]) -> Vec<AppGroup> {
    let mut map: HashMap<String, AppGroup> = HashMap::new();
    for p in procs {
        let display = p.name.trim_end_matches(".exe").trim_end_matches(".EXE").to_string();
        let g = map.entry(display.to_lowercase()).or_insert_with(|| AppGroup {
            name: display.clone(),
            exe: None,
            pids: vec![],
            cpu: 0.0,
            memory_mb: 0.0,
            disk_bps: 0.0,
            protected: false,
        });
        g.pids.push(p.pid);
        g.cpu += p.cpu;
        g.memory_mb += p.memory_mb;
        g.disk_bps += p.disk_bps;
        if g.exe.is_none() {
            g.exe = p.exe.clone();
        }
        g.protected |= is_protected(&p.name, p.pid);
    }
    let mut out: Vec<AppGroup> = map.into_values().collect();
    for g in &mut out {
        g.pids.sort_unstable();
        g.cpu = (g.cpu * 10.0).round() / 10.0;
        g.memory_mb = (g.memory_mb * 10.0).round() / 10.0;
    }
    out.sort_by(|a, b| {
        b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal).then(b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal))
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perf_lines() {
        let text = "\
G|pid_100_luid_0x00000000_0x0000C3F2_phys_0_eng_0_engtype_3D|30
G|pid_200_luid_0x00000000_0x0000C3F2_phys_0_eng_0_engtype_3D|25
G|pid_200_luid_0x00000000_0x0000C3F2_phys_0_eng_3_engtype_VideoDecode|40
G|pid_300_luid_0x00000000_0x0000C3F2_phys_0_eng_0_engtype_3D|bad
D|_Total|1048576|524288|12
N|Intel[R] Wi-Fi 6E AX211 160MHz|20000|3000
N|Software Loopback Interface 1|99999|99999
N|vEthernet (WSL)|5000|5000
N|Realtek PCIe GbE Family Controller|0|0
noise
";
        let r = parse_perf(text);
        assert_eq!(r.gpu_pct, Some(55.0));
        assert_eq!(r.disk_read_bps, Some(1_048_576.0));
        assert_eq!(r.disk_write_bps, Some(524_288.0));
        assert_eq!(r.disk_busy_pct, Some(12.0));
        assert_eq!(r.net_rx_bps, Some(20_000.0));
        assert_eq!(r.net_tx_bps, Some(3_000.0));
    }

    #[test]
    fn empty_perf_is_unknown_not_zero() {
        let r = parse_perf("");
        assert_eq!(r, PerfRates::default());
        assert_eq!(parse_perf("G|x_luid_1|150").gpu_pct, Some(100.0));
    }

    #[test]
    fn protection() {
        assert!(is_protected("csrss.exe", 600));
        assert!(is_protected("Explorer.EXE", 5000));
        assert!(is_protected("anything", 4));
        assert!(is_protected("x", std::process::id()));
        assert!(!is_protected("chrome.exe", 5000));
    }

    #[test]
    fn grouping() {
        let p = |pid, name: &str, cpu, mem| ProcInfo { pid, name: name.into(), exe: Some(format!("C:\\{name}")), cpu, memory_mb: mem, disk_bps: 10.0 };
        let g = group_processes(&[p(500, "chrome.exe", 5.0, 300.0), p(501, "chrome.exe", 2.5, 200.0), p(700, "svchost.exe", 1.0, 50.0), p(800, "code.exe", 9.0, 100.0)]);
        assert_eq!(g[0].name, "code");
        assert_eq!(g[1].name, "chrome");
        assert_eq!(g[1].pids, vec![500, 501]);
        assert_eq!(g[1].cpu, 7.5);
        assert_eq!(g[1].memory_mb, 500.0);
        assert_eq!(g[1].disk_bps, 20.0);
        assert!(!g[1].protected);
        assert!(g[2].protected);
    }
}
