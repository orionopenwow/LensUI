use crate::config::config_dir;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: String,
}

pub fn list_folder_entries(folder_path: &str) -> Result<Vec<FolderEntry>, String> {
    let entries = fs::read_dir(folder_path).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for entry in entries.flatten().take(48) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
            continue;
        }
        let is_dir = path.is_dir();
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        items.push(FolderEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            extension,
        });
    }
    items.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(items)
}

fn parse_hex_rgb(hex: &str) -> (f32, f32, f32) {
    let clean = hex.trim_start_matches('#');
    if clean.len() == 6 && clean.is_ascii() {
        let r = u8::from_str_radix(&clean[0..2], 16).unwrap_or(96) as f32;
        let g = u8::from_str_radix(&clean[2..4], 16).unwrap_or(165) as f32;
        let b = u8::from_str_radix(&clean[4..6], 16).unwrap_or(250) as f32;
        return (r, g, b);
    }
    (96.0, 165.0, 250.0)
}

struct FolderPalette {
    back_top: (f32, f32, f32),
    back_bot: (f32, f32, f32),
    front_top: (f32, f32, f32),
    front_bot: (f32, f32, f32),
    rim: (f32, f32, f32),
    emblem: (f32, f32, f32),
}

fn folder_palette(theme: &str, accent_hex: &str) -> FolderPalette {
    match theme {
        "obsidian" => FolderPalette {
            back_top: (32.0, 34.0, 40.0),
            back_bot: (18.0, 19.0, 23.0),
            front_top: (42.0, 45.0, 53.0),
            front_bot: (20.0, 21.0, 26.0),
            rim: (125.0, 130.0, 145.0),
            emblem: (165.0, 170.0, 185.0),
        },
        "cobalt" => FolderPalette {
            back_top: (30.0, 64.0, 145.0),
            back_bot: (20.0, 42.0, 96.0),
            front_top: (56.0, 114.0, 224.0),
            front_bot: (30.0, 70.0, 158.0),
            rim: (147.0, 197.0, 253.0),
            emblem: (219.0, 234.0, 254.0),
        },
        "emerald" => FolderPalette {
            back_top: (15.0, 108.0, 82.0),
            back_bot: (10.0, 70.0, 54.0),
            front_top: (28.0, 160.0, 120.0),
            front_bot: (16.0, 102.0, 76.0),
            rim: (110.0, 231.0, 183.0),
            emblem: (209.0, 250.0, 229.0),
        },
        "amber" => FolderPalette {
            back_top: (155.0, 94.0, 18.0),
            back_bot: (102.0, 60.0, 12.0),
            front_top: (218.0, 145.0, 32.0),
            front_bot: (152.0, 92.0, 18.0),
            rim: (253.0, 224.0, 71.0),
            emblem: (254.0, 243.0, 199.0),
        },
        "rose" => FolderPalette {
            back_top: (155.0, 32.0, 62.0),
            back_bot: (100.0, 20.0, 42.0),
            front_top: (216.0, 56.0, 92.0),
            front_bot: (146.0, 32.0, 60.0),
            rim: (253.0, 164.0, 175.0),
            emblem: (255.0, 228.0, 230.0),
        },
        "violet" => FolderPalette {
            back_top: (84.0, 52.0, 160.0),
            back_bot: (54.0, 32.0, 108.0),
            front_top: (139.0, 98.0, 232.0),
            front_bot: (88.0, 56.0, 168.0),
            rim: (216.0, 196.0, 254.0),
            emblem: (237.0, 228.0, 255.0),
        },
        "frost" => FolderPalette {
            back_top: (58.0, 98.0, 116.0),
            back_bot: (38.0, 64.0, 78.0),
            front_top: (112.0, 172.0, 192.0),
            front_bot: (62.0, 108.0, 126.0),
            rim: (200.0, 232.0, 242.0),
            emblem: (228.0, 244.0, 250.0),
        },
        "ember" => FolderPalette {
            back_top: (150.0, 62.0, 16.0),
            back_bot: (96.0, 38.0, 10.0),
            front_top: (234.0, 112.0, 36.0),
            front_bot: (158.0, 64.0, 16.0),
            rim: (254.0, 196.0, 140.0),
            emblem: (255.0, 232.0, 208.0),
        },
        "minimal" => FolderPalette {
            back_top: (54.0, 56.0, 64.0),
            back_bot: (32.0, 34.0, 39.0),
            front_top: (76.0, 80.0, 90.0),
            front_bot: (42.0, 44.0, 50.0),
            rim: (210.0, 214.0, 224.0),
            emblem: (235.0, 238.0, 244.0),
        },
        "neon" => FolderPalette {
            back_top: (18.0, 24.0, 36.0),
            back_bot: (10.0, 14.0, 22.0),
            front_top: (24.0, 34.0, 52.0),
            front_bot: (12.0, 18.0, 30.0),
            rim: (56.0, 210.0, 255.0),
            emblem: (56.0, 210.0, 255.0),
        },
        _ => {
            // Matte Glassware tinted subtly with chosen accent
            let (ar, ag, ab) = parse_hex_rgb(accent_hex);
            let mix = |base: f32, acc: f32, t: f32| base * (1.0 - t) + acc * t;
            FolderPalette {
                back_top: (mix(28.0, ar, 0.35), mix(30.0, ag, 0.35), mix(36.0, ab, 0.35)),
                back_bot: (mix(16.0, ar, 0.25), mix(18.0, ag, 0.25), mix(22.0, ab, 0.25)),
                front_top: (mix(36.0, ar, 0.52), mix(38.0, ag, 0.52), mix(46.0, ab, 0.52)),
                front_bot: (mix(18.0, ar, 0.38), mix(20.0, ag, 0.38), mix(26.0, ab, 0.38)),
                rim: (mix(180.0, ar, 0.55), mix(185.0, ag, 0.55), mix(195.0, ab, 0.55)),
                emblem: (mix(220.0, ar, 0.4), mix(225.0, ag, 0.4), mix(235.0, ab, 0.4)),
            }
        }
    }
}

/// Signed distance to a rounded rectangle centered at (cx, cy) with half-extents (hx, hy) and corner radius r.
#[inline]
fn sd_rounded_box(px: f32, py: f32, cx: f32, cy: f32, hx: f32, hy: f32, r: f32) -> f32 {
    let qx = (px - cx).abs() - (hx - r);
    let qy = (py - cy).abs() - (hy - r);
    let out = (qx.max(0.0).hypot(qy.max(0.0))) - r;
    let ins = qx.max(qy).min(0.0);
    out + ins
}

#[inline]
fn blend_over(dst: &mut [f32; 4], src: [f32; 4]) {
    let sa = src[3].clamp(0.0, 1.0);
    let da = dst[3];
    let out_a = sa + da * (1.0 - sa);
    if out_a > 1e-5 {
        dst[0] = (src[0] * sa + dst[0] * da * (1.0 - sa)) / out_a;
        dst[1] = (src[1] * sa + dst[1] * da * (1.0 - sa)) / out_a;
        dst[2] = (src[2] * sa + dst[2] * da * (1.0 - sa)) / out_a;
        dst[3] = out_a;
    }
}

/// Generates a crisp 256x256 anti-aliased Linux/Matte-Glassware style folder .ico (PNG-in-ICO, Win11 native)
fn generate_folder_ico(theme: &str, accent_hex: &str) -> Result<PathBuf, String> {
    let icons_dir = config_dir().join("folder-icons");
    fs::create_dir_all(&icons_dir).map_err(|e| e.to_string())?;
    let safe_hex = accent_hex.trim_start_matches('#');
    let ico_path = icons_dir.join(format!("lens_glass_folder_{}_{}.ico", theme, safe_hex));

    let pal = folder_palette(theme, accent_hex);
    let w: u32 = 256;
    let h: u32 = 256;
    let mut rgba = vec![0u8; (w * h * 4) as usize];

    for y in 0..h {
        for x in 0..w {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let mut col = [0.0f32; 4];

            // 1. Soft ambient drop shadow beneath folder
            let d_shadow = sd_rounded_box(px, py, 128.0, 212.0, 96.0, 16.0, 14.0);
            if d_shadow < 18.0 {
                let sa = ((18.0 - d_shadow) / 36.0).clamp(0.0, 0.38);
                blend_over(&mut col, [0.0, 0.0, 0.0, sa]);
            }

            // 2. Folder Backplate + Smooth Curved Tab (WhiteSur/Colloid Linux silhouette)
            let d_tab = sd_rounded_box(px, py, 74.0, 62.0, 50.0, 24.0, 16.0);
            let d_back = sd_rounded_box(px, py, 128.0, 132.0, 104.0, 74.0, 20.0);
            let d_union = d_tab.min(d_back);
            let cov_back = (0.75 - d_union).clamp(0.0, 1.0);
            if cov_back > 0.0 {
                let t = ((py - 38.0) / 168.0).clamp(0.0, 1.0);
                let r = pal.back_top.0 * (1.0 - t) + pal.back_bot.0 * t;
                let g = pal.back_top.1 * (1.0 - t) + pal.back_bot.1 * t;
                let b = pal.back_top.2 * (1.0 - t) + pal.back_bot.2 * t;
                blend_over(&mut col, [r, g, b, cov_back]);
            }

            // 3. Subtle frosted inner document sheet peeking above the front flap
            let d_sheet = sd_rounded_box(px, py, 128.0, 94.0, 88.0, 14.0, 8.0);
            let cov_sheet = (0.75 - d_sheet).clamp(0.0, 1.0);
            if cov_sheet > 0.0 {
                blend_over(&mut col, [235.0, 240.0, 248.0, cov_sheet * 0.22]);
            }

            // 4. Matte Glassware Front Flap
            let d_front = sd_rounded_box(px, py, 128.0, 148.0, 106.0, 62.0, 20.0);
            let cov_front = (0.75 - d_front).clamp(0.0, 1.0);
            if cov_front > 0.0 {
                let t = ((py - 86.0) / 124.0).clamp(0.0, 1.0);
                let mut r = pal.front_top.0 * (1.0 - t) + pal.front_bot.0 * t;
                let mut g = pal.front_top.1 * (1.0 - t) + pal.front_bot.1 * t;
                let mut b = pal.front_top.2 * (1.0 - t) + pal.front_bot.2 * t;

                // Subtle diagonal matte glass sheen across top-left of front flap
                let sheen = (1.0 - ((px - 40.0) + (py - 86.0)) / 240.0).clamp(0.0, 1.0) * 0.14;
                r = (r + 255.0 * sheen).min(255.0);
                g = (g + 255.0 * sheen).min(255.0);
                b = (b + 255.0 * sheen).min(255.0);

                blend_over(&mut col, [r, g, b, cov_front * 0.97]);

                // Specular top glass rim highlight
                if d_front > -2.6 && py < 120.0 {
                    let rim_a = ((2.6 + d_front) / 2.6).clamp(0.0, 1.0) * 0.65 * cov_front;
                    blend_over(&mut col, [pal.rim.0, pal.rim.1, pal.rim.2, rim_a]);
                }
            }

            // 5. Minimalist Linux glassware emblem notch centered on front flap
            let d_notch = sd_rounded_box(px, py, 128.0, 150.0, 28.0, 4.5, 4.5);
            let cov_notch = (0.75 - d_notch).clamp(0.0, 1.0);
            if cov_notch > 0.0 {
                blend_over(&mut col, [pal.emblem.0, pal.emblem.1, pal.emblem.2, cov_notch * 0.42]);
            }

            let idx = ((y * w + x) * 4) as usize;
            rgba[idx] = col[0].clamp(0.0, 255.0) as u8;
            rgba[idx + 1] = col[1].clamp(0.0, 255.0) as u8;
            rgba[idx + 2] = col[2].clamp(0.0, 255.0) as u8;
            rgba[idx + 3] = (col[3] * 255.0).clamp(0.0, 255.0) as u8;
        }
    }

    let mut png_bytes = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut png_bytes, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
    }

    // ICO header with 0x00 width/height = 256x256 in Windows Vista+/11 ICO spec
    let mut ico = Vec::with_capacity(22 + png_bytes.len());
    ico.extend_from_slice(&0u16.to_le_bytes());
    ico.extend_from_slice(&1u16.to_le_bytes());
    ico.extend_from_slice(&1u16.to_le_bytes());
    ico.push(0); // 256px
    ico.push(0); // 256px
    ico.push(0);
    ico.push(0);
    ico.extend_from_slice(&1u16.to_le_bytes());
    ico.extend_from_slice(&32u16.to_le_bytes());
    ico.extend_from_slice(&(png_bytes.len() as u32).to_le_bytes());
    ico.extend_from_slice(&22u32.to_le_bytes());
    ico.extend_from_slice(&png_bytes);

    fs::write(&ico_path, ico).map_err(|e| e.to_string())?;
    Ok(ico_path)
}

#[cfg(windows)]
fn refresh_windows_icon_cache() {
    use std::os::windows::process::CommandExt;
    use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    unsafe {
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None);
    }
    let _ = std::process::Command::new("ie4uinit.exe")
        .arg("-show")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

#[cfg(windows)]
fn notify_shell_folder_changed(folder_path: &str) {
    use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_UPDATEDIR, SHCNF_PATHW};
    let wide: Vec<u16> = folder_path.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        SHChangeNotify(
            SHCNE_UPDATEDIR,
            SHCNF_PATHW,
            Some(wide.as_ptr() as *const _),
            None,
        );
    }
    refresh_windows_icon_cache();
}

/// Decodes a desktop.ini as Windows writes it (UTF-16 LE with BOM, UTF-8, or ANSI).
fn decode_ini_bytes(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    let body = if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        &bytes[3..]
    } else {
        bytes
    };
    String::from_utf8_lossy(body).into_owned()
}

/// Encodes as UTF-16 LE with BOM — the format Explorer itself uses, safe for non-ASCII paths.
fn encode_ini_utf16(text: &str) -> Vec<u8> {
    let mut out = vec![0xFF, 0xFE];
    for unit in text.encode_utf16() {
        out.extend_from_slice(&unit.to_le_bytes());
    }
    out
}

/// True when the line is an icon assignment inside [.ShellClassInfo].
fn is_icon_key(line: &str) -> bool {
    let key = line.split('=').next().unwrap_or("").trim().to_ascii_lowercase();
    line.contains('=') && matches!(key.as_str(), "iconresource" | "iconfile" | "iconindex")
}

/// Sets the folder icon inside an existing desktop.ini while keeping every other line
/// (localized folder names, folder type, info tips) exactly as the user had it.
fn merge_icon_into_ini(existing: &str, ico_path: &str) -> String {
    let icon_line = format!("IconResource={},0", ico_path);
    let mut out: Vec<String> = Vec::new();
    let mut in_shell = false;
    let mut inserted = false;
    for raw in existing.lines() {
        let line = raw.trim_end_matches('\r');
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_shell = trimmed.eq_ignore_ascii_case("[.ShellClassInfo]");
            out.push(line.to_string());
            if in_shell && !inserted {
                out.push(icon_line.clone());
                inserted = true;
            }
            continue;
        }
        if in_shell && is_icon_key(trimmed) {
            continue;
        }
        out.push(line.to_string());
    }
    if !inserted {
        let mut head = vec!["[.ShellClassInfo]".to_string(), icon_line];
        head.extend(out.into_iter().skip_while(|l| l.trim().is_empty()));
        out = head;
    }
    while out.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        out.pop();
    }
    let mut text = out.join("\r\n");
    text.push_str("\r\n");
    text
}

/// Removes the icon keys Lens wrote (`IconResource=...lens_glass_folder_...`) from a desktop.ini
/// and returns what is left, or `None` when nothing meaningful remains (the file can go).
/// Icon keys that don't point at a Lens icon are kept: they are the user's own.
fn strip_lens_icon_from_ini(text: &str) -> Option<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        let t = line.trim();
        if is_icon_key(t) && t.contains("lens_glass_folder_") {
            continue;
        }
        out.push(line.to_string());
    }
    // Drop section headers left with no keys under them.
    let mut kept: Vec<String> = Vec::new();
    for (i, line) in out.iter().enumerate() {
        let t = line.trim();
        if t.starts_with('[') {
            let has_keys = out[i + 1..]
                .iter()
                .map(|l| l.trim())
                .take_while(|l| !l.starts_with('['))
                .any(|l| !l.is_empty() && !l.starts_with(';'));
            if !has_keys {
                continue;
            }
        }
        kept.push(line.clone());
    }
    while kept.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        kept.pop();
    }
    if kept.iter().all(|l| l.trim().is_empty()) {
        return None;
    }
    let mut text = kept.join("\r\n");
    text.push_str("\r\n");
    Some(text)
}

/// Stable file name for a folder's desktop.ini backup (FNV-1a of the lower-cased path).
fn backup_name_for(folder_path: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in folder_path.trim_end_matches(['\\', '/']).to_lowercase().bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{:016x}.ini", hash)
}

fn folder_backup_dir() -> PathBuf {
    config_dir().join("folder-backups")
}

#[cfg(windows)]
fn run_attrib(args: &[&str]) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let _ = std::process::Command::new("attrib")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(not(windows))]
fn run_attrib(_args: &[&str]) {}

/// Applies a Lens folder icon. An existing desktop.ini is never thrown away: its original bytes are
/// backed up once to %APPDATA%\LensUI\folder-backups and only the icon line is changed, so Windows'
/// own settings (localized names of Documents/Downloads/etc.) survive and revert is exact.
pub fn apply_folder_theme(folder_path: &str, theme: &str, accent_hex: &str) -> Result<(), String> {
    let dir = Path::new(folder_path);
    if !dir.is_dir() {
        return Err("Target path is not an existing folder.".into());
    }
    let ico_path = generate_folder_ico(theme, accent_hex)?;
    let ico_str = ico_path.to_string_lossy().to_string();
    let ini_path = dir.join("desktop.ini");
    let ini_str = ini_path.to_string_lossy().to_string();

    let existing_bytes = fs::read(&ini_path).ok();
    let existing_text = existing_bytes
        .as_deref()
        .map(decode_ini_bytes)
        .unwrap_or_default();

    if let Some(bytes) = &existing_bytes {
        let written_by_lens = existing_text.contains("lens_glass_folder_");
        let backup = folder_backup_dir().join(backup_name_for(folder_path));
        if !written_by_lens && !backup.exists() {
            fs::create_dir_all(folder_backup_dir()).map_err(|e| e.to_string())?;
            fs::write(&backup, bytes).map_err(|e| e.to_string())?;
        }
    }

    let content = merge_icon_into_ini(&existing_text, &ico_str);

    run_attrib(&["-s", "-h", &ini_str]);
    fs::write(&ini_path, encode_ini_utf16(&content)).map_err(|e| e.to_string())?;
    run_attrib(&["+s", "+h", &ini_str]);
    run_attrib(&["+r", folder_path]);

    #[cfg(windows)]
    notify_shell_folder_changed(folder_path);
    Ok(())
}

/// Restores the folder exactly as it was: the backed-up desktop.ini if there was one, otherwise no desktop.ini.
pub fn revert_folder_theme(folder_path: &str) -> Result<(), String> {
    let dir = Path::new(folder_path);
    let ini_path = dir.join("desktop.ini");
    let ini_str = ini_path.to_string_lossy().to_string();
    let backup = folder_backup_dir().join(backup_name_for(folder_path));

    if ini_path.exists() {
        run_attrib(&["-s", "-h", &ini_str]);
    }
    if backup.is_file() {
        let original = fs::read(&backup).map_err(|e| e.to_string())?;
        fs::write(&ini_path, original).map_err(|e| e.to_string())?;
        run_attrib(&["+s", "+h", &ini_str]);
        let _ = fs::remove_file(&backup);
    } else {
        // No backup (it was lost, or %APPDATA%\LensUI was reset). Only drop the icon Lens set and
        // keep everything else (localized names, folder type); delete the file only if nothing is left.
        if let Ok(bytes) = fs::read(&ini_path) {
            let text = decode_ini_bytes(&bytes);
            if !text.contains("lens_glass_folder_") {
                // Not Lens's icon: the file is the user's, leave it exactly as it is.
                run_attrib(&["+s", "+h", &ini_str]);
                #[cfg(windows)]
                notify_shell_folder_changed(folder_path);
                return Ok(());
            }
            match strip_lens_icon_from_ini(&text) {
                Some(rest) => {
                    fs::write(&ini_path, encode_ini_utf16(&rest)).map_err(|e| e.to_string())?;
                    run_attrib(&["+s", "+h", &ini_str]);
                }
                None => {
                    let _ = fs::remove_file(&ini_path);
                    run_attrib(&["-r", folder_path]);
                }
            }
        } else {
            run_attrib(&["-r", folder_path]);
        }
    }

    #[cfg(windows)]
    notify_shell_folder_changed(folder_path);
    Ok(())
}

/// Safely replaces ALL default Windows Explorer folder icons system-wide (HKCU Shell Icons 3 & 4).
#[cfg(windows)]
pub fn apply_global_explorer_folder_theme(theme: &str, accent_hex: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    let ico_path = generate_folder_ico(theme, accent_hex)?;
    let ico_val = format!("{},0\0", ico_path.to_string_lossy());
    let wide_val: Vec<u16> = ico_val.encode_utf16().collect();
    let bytes =
        unsafe { std::slice::from_raw_parts(wide_val.as_ptr() as *const u8, wide_val.len() * 2) };

    let subkey: Vec<u16> =
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Icons\0"
            .encode_utf16()
            .collect();

    unsafe {
        let mut hkey = HKEY::default();
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut hkey,
            None,
        )
        .ok()
        .map_err(|e| e.to_string())?;

        for id in ["3\0", "4\0"] {
            let name_w: Vec<u16> = id.encode_utf16().collect();
            let _ = RegSetValueExW(hkey, PCWSTR(name_w.as_ptr()), 0, REG_SZ, Some(bytes));
        }
        let _ = RegCloseKey(hkey);
    }
    refresh_windows_icon_cache();
    Ok(())
}

#[cfg(not(windows))]
pub fn apply_global_explorer_folder_theme(_theme: &str, _accent_hex: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn revert_global_explorer_folder_theme() -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
    };

    let subkey: Vec<u16> =
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Icons\0"
            .encode_utf16()
            .collect();

    unsafe {
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        )
        .is_ok()
        {
            for id in ["3\0", "4\0"] {
                let name_w: Vec<u16> = id.encode_utf16().collect();
                let _ = RegDeleteValueW(hkey, PCWSTR(name_w.as_ptr()));
            }
            let _ = RegCloseKey(hkey);
        }
    }
    refresh_windows_icon_cache();
    Ok(())
}

#[cfg(not(windows))]
pub fn revert_global_explorer_folder_theme() -> Result<(), String> {
    Ok(())
}

pub fn user_core_folders() -> Vec<String> {
    let base = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".into());
    ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"]
        .iter()
        .map(|f| format!("{}\\{}", base, f))
        .filter(|p| Path::new(p).is_dir())
        .collect()
}

#[cfg(test)]
#[path = "tests/win_folders.rs"]
mod tests;
