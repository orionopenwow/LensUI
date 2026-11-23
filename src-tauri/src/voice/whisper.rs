//! Local speech recognition through whisper.cpp's `whisper-server`, started by Lens on a
//! loopback port with the model kept loaded, so a short command is recognised in a few hundred
//! milliseconds. Audio goes only to 127.0.0.1 and is never written to disk.

use std::net::{SocketAddr, TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Words that bias recognition towards Lens commands (Whisper's initial prompt).
pub const BIAS: &str = "Hey Lens. Minimise this. Maximise. Restore. Pin on top. Snap left. Snap right. Next monitor. \
Workspace two. Overview. Dark mode. Light mode. Theme Tokyo Night. Accent purple. Dock slim. Volume thirty percent. \
Mute. Do not disturb. Focus mode. Shelf. Paste the last clip. Summarise this page. Undo. Yes. No.";

pub struct Server {
    child: Child,
    pub port: u16,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn free_port() -> Result<u16, String> {
    let l = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("No free local port: {}", e))?;
    l.local_addr().map(|a| a.port()).map_err(|e| e.to_string())
}

/// Arguments for whisper-server (pure, tested).
pub fn server_args(model: &str, port: u16, threads: u32, language: &str) -> Vec<String> {
    let mut a = vec![
        "-m".to_string(),
        model.to_string(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "-t".into(),
        threads.clamp(1, 16).to_string(),
    ];
    if !language.is_empty() {
        a.push("-l".into());
        a.push(language.to_string());
    }
    a
}

/// Checks the configured files before anything is started.
pub fn check_paths(server: &str, model: &str) -> Result<(), String> {
    if server.trim().is_empty() || model.trim().is_empty() {
        return Err("Set up speech recognition: choose whisper-server.exe and a ggml model in Voice settings.".into());
    }
    let s = std::path::Path::new(server);
    if !s.is_file() {
        return Err("whisper-server.exe wasn't found at the path in Voice settings.".into());
    }
    let name = s.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
    if !(name.starts_with("whisper-server") || name == "server.exe" || name == "server") {
        return Err("Choose whisper.cpp's whisper-server.exe (not another program).".into());
    }
    let m = std::path::Path::new(model);
    if !m.is_file() {
        return Err("The speech model file wasn't found.".into());
    }
    if !m.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("bin")).unwrap_or(false) {
        return Err("Choose a whisper.cpp ggml model (a .bin file).".into());
    }
    Ok(())
}

impl Server {
    /// Starts whisper-server and waits (up to 20 s) until it accepts connections.
    pub fn start(server: &str, model: &str, threads: u32, language: &str) -> Result<Server, String> {
        check_paths(server, model)?;
        let port = free_port()?;
        let mut cmd = Command::new(server);
        cmd.args(server_args(model, port, threads, if language == "auto" { "auto" } else { language }))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let child = cmd.spawn().map_err(|e| format!("Couldn't start whisper-server: {}", e))?;
        let mut s = Server { child, port };
        let addr: SocketAddr = ([127, 0, 0, 1], port).into();
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
                return Ok(s);
            }
            if let Ok(Some(status)) = s.child.try_wait() {
                return Err(format!("whisper-server stopped while loading the model ({}).", status));
            }
            if Instant::now() > deadline {
                return Err("whisper-server took too long to load the model.".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    pub fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// Recognises one utterance (16 kHz mono WAV bytes).
    pub fn transcribe(&self, wav: &[u8], prompt: &str) -> Result<String, String> {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
        let boundary = format!("lensvoice{:x}{:x}", std::process::id(), nanos);
        let body = multipart(
            &boundary,
            &[("temperature", "0.0"), ("response_format", "json"), ("prompt", prompt), ("no_timestamps", "true")],
            wav,
        );
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(12))
            .no_proxy()
            .build()
            .map_err(|e| e.to_string())?;
        let res = client
            .post(format!("http://127.0.0.1:{}/inference", self.port))
            .header("content-type", format!("multipart/form-data; boundary={}", boundary))
            .body(body)
            .send()
            .map_err(|_| "Speech recognition didn't answer.".to_string())?;
        if !res.status().is_success() {
            return Err(format!("Speech recognition failed ({}).", res.status().as_u16()));
        }
        let text = res.text().map_err(|e| e.to_string())?;
        parse_response(&text)
    }
}

/// multipart/form-data body with text fields and one WAV file (pure, tested).
pub fn multipart(boundary: &str, fields: &[(&str, &str)], wav: &[u8]) -> Vec<u8> {
    let mut b = Vec::with_capacity(wav.len() + 512);
    for (k, v) in fields {
        b.extend_from_slice(format!("--{}\r\nContent-Disposition: form-data; name=\"{}\"\r\n\r\n{}\r\n", boundary, k, v).as_bytes());
    }
    b.extend_from_slice(
        format!("--{}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n", boundary)
            .as_bytes(),
    );
    b.extend_from_slice(wav);
    b.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());
    b
}

/// `{"text": "..."}` → trimmed text.
pub fn parse_response(body: &str) -> Result<String, String> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|_| "Speech recognition sent something unexpected.".to_string())?;
    if let Some(e) = v.get("error").and_then(|e| e.as_str()) {
        return Err(format!("Speech recognition: {}", crate::ai::privacy::cap(e, 120)));
    }
    let t = v.get("text").and_then(|t| t.as_str()).ok_or("Speech recognition sent no text.")?;
    Ok(t.split_whitespace().collect::<Vec<_>>().join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_and_multipart() {
        let a = server_args("C:\\m\\ggml-base.en.bin", 5123, 99, "en");
        assert_eq!(a, vec!["-m", "C:\\m\\ggml-base.en.bin", "--host", "127.0.0.1", "--port", "5123", "-t", "16", "-l", "en"]);
        assert!(!server_args("m", 1, 4, "").contains(&"-l".to_string()));
        let body = multipart("B", &[("temperature", "0.0")], b"RIFFxx");
        let s = String::from_utf8_lossy(&body);
        assert!(s.starts_with("--B\r\nContent-Disposition: form-data; name=\"temperature\"\r\n\r\n0.0\r\n"));
        assert!(s.contains("name=\"file\"; filename=\"speech.wav\""));
        assert!(s.ends_with("RIFFxx\r\n--B--\r\n"));
    }

    #[test]
    fn responses() {
        assert_eq!(parse_response(r#"{"text":"  Minimize this.\n"}"#).unwrap(), "Minimize this.");
        assert!(parse_response(r#"{"error":"bad audio"}"#).unwrap_err().contains("bad audio"));
        assert!(parse_response("<html>").is_err());
    }

    #[test]
    fn path_checks() {
        assert!(check_paths("", "").is_err());
        assert!(check_paths("C:\\nope\\whisper-server.exe", "C:\\nope\\m.bin").is_err());
        let dir = std::env::temp_dir().join(format!("lens-voice-paths-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let srv = dir.join("whisper-server.exe");
        let calc = dir.join("calc.exe");
        let model = dir.join("ggml-base.en.bin");
        for p in [&srv, &calc, &model] {
            std::fs::write(p, b"x").unwrap();
        }
        assert!(check_paths(srv.to_str().unwrap(), model.to_str().unwrap()).is_ok());
        assert!(check_paths(calc.to_str().unwrap(), model.to_str().unwrap()).is_err());
        assert!(check_paths(srv.to_str().unwrap(), calc.to_str().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
