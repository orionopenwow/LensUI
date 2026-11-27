//! Mission Control must never reach a release. These tests read the build configs as they are in
//! the repo (tools/mission/guard.mjs checks the same on CI, plus the built bundle).

const CARGO: &str = include_str!("../../Cargo.toml");
const TAURI_CONF: &str = include_str!("../../tauri.conf.json");
const RELEASE_YML: &str = include_str!("../../../.github/workflows/release.yml");
const BUILD_YML: &str = include_str!("../../../.github/workflows/build.yml");
const LAUNCH_BAT: &str = include_str!("../../../Launch-Lens-UI.bat");
const BUILD_BAT: &str = include_str!("../../../Build-Lens-UI.bat");
const VITE: &str = include_str!("../../../vite.config.ts");

fn features_section(toml: &str) -> String {
    let start = toml.find("[features]").expect("a [features] section");
    let rest = &toml[start + 10..];
    rest[..rest.find("\n[").unwrap_or(rest.len())].to_string()
}

#[test]
fn admin_is_never_a_default_feature() {
    let f = features_section(CARGO);
    assert!(f.contains("admin = []"), "{f}");
    let default = f.lines().find(|l| l.trim_start().starts_with("default")).unwrap_or("");
    assert!(!default.contains("admin"), "{default}");
    // No dependency pulls it in either.
    assert_eq!(CARGO.matches("\"admin\"").count(), 0);
}

#[test]
fn release_and_build_configs_never_enable_it() {
    for (name, text) in [("release.yml", RELEASE_YML), ("tauri.conf.json", TAURI_CONF), ("Build-Lens-UI.bat", BUILD_BAT)] {
        assert!(!text.contains("--features admin") && !text.contains("-f admin") && !text.contains("features=admin"), "{name}");
        assert!(!text.contains("LENS_ADMIN=1"), "{name}");
    }
    // build.yml only checks and tests with it; the installer step never has it.
    for line in BUILD_YML.lines().filter(|l| l.contains("tauri build")) {
        assert!(!line.contains("admin"), "{line}");
    }
    assert!(!TAURI_CONF.contains("missioncontrol"), "the window is built at runtime, not declared");
}

#[test]
fn only_the_dev_launcher_and_dev_server_turn_it_on() {
    assert!(LAUNCH_BAT.contains("tauri dev --features admin"));
    assert!(LAUNCH_BAT.contains("LENS_ADMIN=1"));
    // Vite defines __LENS_ADMIN__ true only for the dev server, never for `vite build`.
    assert!(VITE.contains("__LENS_ADMIN__"));
    assert!(VITE.contains("command === \"serve\""));
}
