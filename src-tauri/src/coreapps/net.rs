//! Lens Network (read-only): live connections from `netstat -ano`, grouped by app.
//!
//! This counts open connections, not bytes: per-app traffic needs ETW and admin rights, so the
//! app says "connections open now" rather than pretending to measure bandwidth.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetConn {
    /// "TCP" | "UDP"
    pub proto: String,
    pub local_ip: String,
    pub local_port: u16,
    /// "*" for UDP.
    pub remote_ip: String,
    pub remote_port: u16,
    /// ESTABLISHED, LISTENING, TIME_WAIT… (netstat's own words); "" for UDP.
    pub state: String,
    pub pid: u32,
}

/// "192.168.1.5:443" / "[fe80::1%12]:5353" / "*:*" → (ip, port).
fn split_endpoint(s: &str) -> Option<(String, u16)> {
    if s == "*:*" {
        return Some(("*".into(), 0));
    }
    let i = s.rfind(':')?;
    let ip = s[..i].trim_start_matches('[').trim_end_matches(']').to_string();
    let port_s = &s[i + 1..];
    let port = if port_s == "*" { 0 } else { port_s.parse().ok()? };
    Some((ip, port))
}

/// Parses `netstat -ano`. Header lines (in any language) are skipped because they don't start
/// with TCP/UDP.
pub fn parse_netstat(text: &str) -> Vec<NetConn> {
    let mut out = Vec::new();
    for line in text.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        let proto = match cols.first() {
            Some(p) if p.eq_ignore_ascii_case("TCP") => "TCP",
            Some(p) if p.eq_ignore_ascii_case("UDP") => "UDP",
            _ => continue,
        };
        let (state, pid) = match (proto, cols.len()) {
            ("TCP", 5) => (cols[3].to_string(), cols[4]),
            ("UDP", 4) => (String::new(), cols[3]),
            _ => continue,
        };
        let (Some((local_ip, local_port)), Some((remote_ip, remote_port)), Ok(pid)) =
            (split_endpoint(cols[1]), split_endpoint(cols[2]), pid.parse::<u32>())
        else {
            continue;
        };
        out.push(NetConn { proto: proto.into(), local_ip, local_port, remote_ip, remote_port, state, pid });
    }
    out
}

/// True for a remote address on the internet (not this PC, the LAN, link-local or unspecified).
pub fn is_internet(ip: &str) -> bool {
    let ip = ip.split('%').next().unwrap_or(ip);
    if let Ok(v4) = ip.parse::<std::net::Ipv4Addr>() {
        return !(v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast() || v4.is_multicast()
            // 100.64.0.0/10 carrier-grade NAT
            || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 64));
    }
    if let Ok(v6) = ip.parse::<std::net::Ipv6Addr>() {
        let s = v6.segments()[0];
        return !(v6.is_loopback() || v6.is_unspecified() || v6.is_multicast() || (s & 0xffc0) == 0xfe80 || (s & 0xfe00) == 0xfc00)
            && v6.to_ipv4_mapped().map(|m| is_internet(&m.to_string())).unwrap_or(true);
    }
    false
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetAppRow {
    pub name: String,
    pub pids: Vec<u32>,
    /// Exe path of one of the processes (for the icon), when known.
    pub exe: Option<String>,
    /// Established TCP connections to internet addresses.
    pub internet: u32,
    /// Established TCP connections to this PC or the local network.
    pub local: u32,
    /// Ports this app is listening on (TCP LISTENING).
    pub listening: Vec<u16>,
    /// Up to 6 distinct internet peers, "ip:port".
    pub peers: Vec<String>,
}

/// Groups connections by process name. `names` maps pid → (name, exe).
/// Rows are sorted by internet connections, then local ones, then name.
pub fn group_by_process(conns: &[NetConn], names: &HashMap<u32, (String, Option<String>)>) -> Vec<NetAppRow> {
    let mut rows: Vec<NetAppRow> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for c in conns {
        let (name, exe) = match (c.pid, names.get(&c.pid)) {
            (0, _) => ("System Idle".to_string(), None),
            (4, _) => ("System".to_string(), None),
            (_, Some((n, e))) => (n.trim_end_matches(".exe").trim_end_matches(".EXE").to_string(), e.clone()),
            (pid, None) => (format!("Process {pid}"), None),
        };
        let key = name.to_lowercase();
        let i = *index.entry(key).or_insert_with(|| {
            rows.push(NetAppRow { name: name.clone(), pids: vec![], exe: exe.clone(), internet: 0, local: 0, listening: vec![], peers: vec![] });
            rows.len() - 1
        });
        let row = &mut rows[i];
        if !row.pids.contains(&c.pid) {
            row.pids.push(c.pid);
        }
        if row.exe.is_none() {
            row.exe = exe;
        }
        if c.proto == "TCP" && c.state.eq_ignore_ascii_case("LISTENING") {
            if !row.listening.contains(&c.local_port) {
                row.listening.push(c.local_port);
            }
        } else if c.proto == "TCP" && c.state.eq_ignore_ascii_case("ESTABLISHED") {
            if is_internet(&c.remote_ip) {
                row.internet += 1;
                let peer = if c.remote_ip.contains(':') { format!("[{}]:{}", c.remote_ip, c.remote_port) } else { format!("{}:{}", c.remote_ip, c.remote_port) };
                if row.peers.len() < 6 && !row.peers.contains(&peer) {
                    row.peers.push(peer);
                }
            } else {
                row.local += 1;
            }
        }
    }
    for r in &mut rows {
        r.pids.sort_unstable();
        r.listening.sort_unstable();
    }
    rows.sort_by(|a, b| b.internet.cmp(&a.internet).then(b.local.cmp(&a.local)).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    rows
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetSnapshot {
    pub apps: Vec<NetAppRow>,
    pub total_connections: u32,
    pub internet_connections: u32,
    /// The address Windows would use for internet traffic (found without sending anything).
    pub local_ipv4: Option<String>,
    pub local_ipv6: Option<String>,
    pub taken_ms: i64,
}

/// The source address the routing table picks for a public destination. `connect` on a UDP
/// socket sends no packets; it only asks the OS which interface it would use.
pub fn primary_address(v6: bool) -> Option<String> {
    let (bind, dest) = if v6 { ("[::]:0", "[2001:4860:4860::8888]:53") } else { ("0.0.0.0:0", "8.8.8.8:53") };
    let s = std::net::UdpSocket::bind(bind).ok()?;
    s.connect(dest).ok()?;
    let ip = s.local_addr().ok()?.ip();
    if ip.is_unspecified() {
        None
    } else {
        Some(ip.to_string())
    }
}

#[cfg(windows)]
pub fn run_netstat() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = std::process::Command::new("netstat.exe")
        .arg("-ano")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Couldn't run netstat: {e}"))?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(not(windows))]
pub fn run_netstat() -> Result<String, String> {
    Err("Live connections need Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NETSTAT: &str = "
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1012
  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4
  TCP    127.0.0.1:5357         127.0.0.1:61001        ESTABLISHED     7720
  TCP    192.168.1.23:51012     140.82.112.25:443      ESTABLISHED     9001
  TCP    192.168.1.23:51013     140.82.112.25:443      ESTABLISHED     9001
  TCP    192.168.1.23:51020     52.97.4.18:443         ESTABLISHED     9002
  TCP    192.168.1.23:51030     192.168.1.1:80         ESTABLISHED     7720
  TCP    192.168.1.23:51040     35.186.224.25:443      TIME_WAIT       0
  TCP    [::]:135               [::]:0                 LISTENING       1012
  TCP    [2a01:4b00::7]:51100   [2606:4700::6810:84e5]:443  ESTABLISHED     9001
  UDP    0.0.0.0:5353           *:*                                    2200
  UDP    [fe80::1%12]:1900      *:*                                    2200
garbage line
";

    #[test]
    fn parses_netstat() {
        let c = parse_netstat(NETSTAT);
        assert_eq!(c.len(), 12);
        assert_eq!(c[3], NetConn { proto: "TCP".into(), local_ip: "192.168.1.23".into(), local_port: 51012, remote_ip: "140.82.112.25".into(), remote_port: 443, state: "ESTABLISHED".into(), pid: 9001 });
        assert_eq!(c[8].local_ip, "::");
        assert_eq!(c[9].remote_ip, "2606:4700::6810:84e5");
        assert_eq!(c[10].proto, "UDP");
        assert_eq!(c[10].state, "");
        assert_eq!(c[11].local_ip, "fe80::1%12");
    }

    #[test]
    fn internet_classification() {
        assert!(is_internet("140.82.112.25"));
        assert!(is_internet("2606:4700::6810:84e5"));
        for ip in ["127.0.0.1", "192.168.1.1", "10.0.0.2", "172.16.4.4", "169.254.1.1", "0.0.0.0", "::", "::1", "fe80::1%12", "fd00::1", "100.64.1.1", "*"] {
            assert!(!is_internet(ip), "{ip}");
        }
    }

    #[test]
    fn groups_by_app() {
        let mut names = HashMap::new();
        names.insert(9001, ("chrome.exe".to_string(), Some("C:\\Chrome\\chrome.exe".to_string())));
        names.insert(9002, ("Teams.exe".to_string(), None));
        names.insert(7720, ("svchost.exe".to_string(), None));
        names.insert(1012, ("svchost.exe".to_string(), None));
        let rows = group_by_process(&parse_netstat(NETSTAT), &names);
        assert_eq!(rows[0].name, "chrome");
        assert_eq!(rows[0].internet, 3);
        assert_eq!(rows[0].peers, vec!["140.82.112.25:443", "[2606:4700::6810:84e5]:443"]);
        assert_eq!(rows[0].exe.as_deref(), Some("C:\\Chrome\\chrome.exe"));
        assert_eq!(rows[1].name, "Teams");
        let svc = rows.iter().find(|r| r.name == "svchost").unwrap();
        assert_eq!(svc.pids, vec![1012, 7720]);
        assert_eq!(svc.local, 2);
        assert_eq!(svc.listening, vec![135]);
        assert!(rows.iter().any(|r| r.name == "System" && r.listening == vec![445]));
        assert!(rows.iter().any(|r| r.name == "Process 2200"));
    }
}
