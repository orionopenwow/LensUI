#![allow(clippy::all)]
use super::audit::{self, AuditEntry};
use super::catalogue::{self, Entry};
use super::engine::{self, Engine, Stores};
use super::grants::{client_kind, Decision, Grants, Level};
use super::lens::{default_stores, place_on_monitor};
use super::tools::{self, Call, Desktop, ShelfAction, WinAction, WinInfo};
use super::{Capability, Risk};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

// ------------------------------------------------------------------ fakes

struct Mem {
    stores: Mutex<BTreeMap<String, Value>>,
    fail: Mutex<Option<String>>,
    writes: Mutex<Vec<String>>,
}

impl Mem {
    fn new() -> Mem {
        let mut m = BTreeMap::new();
        for (k, v) in default_stores() {
            m.insert(k.to_string(), v);
        }
        Mem { stores: Mutex::new(m), fail: Mutex::new(None), writes: Mutex::new(vec![]) }
    }
    fn fail_on(&self, s: &str) {
        *self.fail.lock().unwrap() = Some(s.to_string());
    }
    fn snapshot(&self) -> BTreeMap<String, Value> {
        self.stores.lock().unwrap().clone()
    }
}

impl Stores for Mem {
    fn read(&self, store: &str) -> Result<Value, String> {
        self.stores.lock().unwrap().get(store).cloned().ok_or_else(|| "no store".into())
    }
    fn write(&self, store: &str, value: Value) -> Result<(), String> {
        if self.fail.lock().unwrap().as_deref() == Some(store) {
            return Err(format!("{} refused", store));
        }
        self.writes.lock().unwrap().push(store.to_string());
        self.stores.lock().unwrap().insert(store.to_string(), value);
        Ok(())
    }
}

struct Fake {
    mem: Mem,
    wins: Mutex<Vec<WinInfo>>,
    pinned: Mutex<Vec<i64>>,
    rects: Mutex<BTreeMap<i64, [i32; 4]>>,
    log: Mutex<Vec<String>>,
    dir: PathBuf,
}

impl Fake {
    fn new(tag: &str) -> Fake {
        let dir = std::env::temp_dir().join(format!("lens-control-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut rects = BTreeMap::new();
        rects.insert(101, [100, 100, 800, 600]);
        Fake {
            mem: Mem::new(),
            wins: Mutex::new(vec![
                WinInfo { hwnd: 101, title: "Report.docx — Word".into(), app: "WINWORD".into(), focused: true, minimized: false, maximized: false },
                WinInfo { hwnd: 202, title: "Inbox".into(), app: "olk".into(), focused: false, minimized: false, maximized: true },
            ]),
            pinned: Mutex::new(vec![]),
            rects: Mutex::new(rects),
            log: Mutex::new(vec![]),
            dir,
        }
    }
}

impl Stores for Fake {
    fn read(&self, s: &str) -> Result<Value, String> {
        self.mem.read(s)
    }
    fn write(&self, s: &str, v: Value) -> Result<(), String> {
        self.mem.write(s, v)
    }
}

impl Desktop for Fake {
    fn as_stores(&self) -> &dyn Stores {
        self
    }
    fn windows(&self) -> Vec<WinInfo> {
        self.wins.lock().unwrap().clone()
    }
    fn monitors(&self) -> Value {
        json!([{ "id": "\\\\.\\DISPLAY1" }])
    }
    fn window_rect(&self, h: i64) -> Option<[i32; 4]> {
        self.rects.lock().unwrap().get(&h).copied()
    }
    fn window_workspace(&self, _h: i64) -> Option<usize> {
        Some(0)
    }
    fn is_pinned(&self, h: i64) -> bool {
        self.pinned.lock().unwrap().contains(&h)
    }
    fn window_do(&self, h: i64, a: &WinAction) -> Result<String, String> {
        self.log.lock().unwrap().push(format!("{} {:?}", h, a));
        let mut ws = self.wins.lock().unwrap();
        let w = ws.iter_mut().find(|w| w.hwnd == h).ok_or("gone")?;
        match a {
            WinAction::Minimize => w.minimized = true,
            WinAction::Restore => {
                w.minimized = false;
                w.maximized = false
            }
            WinAction::Maximize => w.maximized = true,
            WinAction::Pin(p) => {
                let mut pins = self.pinned.lock().unwrap();
                if *p {
                    pins.push(h)
                } else {
                    pins.retain(|x| *x != h)
                }
            }
            WinAction::Move { x, y, w: ww, h: hh } => {
                self.rects.lock().unwrap().insert(h, [*x, *y, *ww, *hh]);
            }
            _ => {}
        }
        Ok("done".into())
    }
    fn shelf(&self, a: &ShelfAction) -> Result<Value, String> {
        Ok(match a {
            ShelfAction::List { .. } => json!([{ "id": "s1", "title": "Notes" }]),
            ShelfAction::Add { .. } => json!("s2"),
            ShelfAction::Context { .. } => json!({ "text": "ctx" }),
        })
    }
    fn app(&self, launch: bool, name: &str) -> Result<String, String> {
        Ok(format!("{} {}", if launch { "Opened" } else { "Switched to" }, name))
    }
    fn snapshots_dir(&self) -> PathBuf {
        self.dir.join("snapshots")
    }
    fn now_ms(&self) -> u64 {
        1_700_000_000_000
    }
}

fn engine() -> Engine {
    Engine::new(catalogue::build(&default_stores()))
}

fn changes(v: Value) -> Map<String, Value> {
    v.as_object().unwrap().clone()
}

// ------------------------------------------------------------------ catalogue

#[test]
fn every_config_leaf_is_registered() {
    let missing = catalogue::unregistered(&default_stores());
    assert!(missing.is_empty(), "add a RULES entry (category, capability, risk) for: {:?}", missing);
}

#[test]
fn catalogue_covers_every_store_and_area() {
    let e = engine();
    assert!(e.entries.len() > 150, "only {} entries", e.entries.len());
    for prefix in [
        "theme.preset", "theme.customAccent", "theme.glassOpacity", "theme.borderRadius", "dock.style", "dock.magnification",
        "dock.launchAnimation", "topBar.height", "windowControls.frameStyle", "windowStyling.dimInactive", "windowStyling.activeBorder",
        "cursorFx.ripples", "wallpaper.scene", "wallpaper.calm", "hotCorners", "altDrag", "appSummon", "dndSchedule", "workspaces",
        "tiling", "clipboard.enabled", "live.volume", "live.brightness", "live.nightLight", "live.dnd", "func.hideNativeTaskbar",
    ] {
        assert!(!e.entries_under(prefix).is_empty(), "nothing under {}", prefix);
    }
    let stores: std::collections::BTreeSet<&str> = e.entries.iter().map(|x| x.store.as_str()).collect();
    for s in ["config", "wallpaper", "windowStyling", "cursorFx", "clipboard", "live"] {
        assert!(stores.contains(s), "store {} missing", s);
    }
}

#[test]
fn every_entry_is_described_with_a_valid_example() {
    for e in engine().entries {
        assert!(!e.label.is_empty() && !e.description.is_empty(), "{}", e.path);
        assert!(e.description.ends_with('.'), "{} description should be a sentence", e.path);
        assert!(e.schema.is_object(), "{}", e.path);
        let ex: Value = serde_json::from_str(&e.example).unwrap();
        assert_eq!(ex["tool"], "lens_set");
        let v = &ex["args"]["changes"][&e.path];
        if !v.is_null() {
            catalogue::validate_value(&e, v).unwrap_or_else(|m| panic!("{} example {}: {}", e.path, v, m));
        }
        // The default itself is valid, except where the default is an "unset" sentinel.
        if !(e.default.is_null() || e.default.as_str() == Some("")) {
            catalogue::validate_value(&e, &e.default).unwrap_or_else(|m| panic!("{} default {}: {}", e.path, e.default, m));
        }
    }
}

#[test]
fn sensitive_paths_are_blocked_or_ask() {
    let e = engine();
    for p in ["mcp.enabled", "ai", "configVersion", "func.injectedHook", "wallpaper.accentHex"] {
        for x in e.entries_under(p) {
            assert_eq!(x.risk, Risk::Blocked, "{}", x.path);
        }
    }
    assert!(!e.entries_under("ai").is_empty());
    for p in ["func.hideNativeTaskbar", "func.runOnStartup", "theme.customCss", "clipboard.enabled", "cursorFx.keystrokesAll"] {
        assert_eq!(e.entry(p).unwrap_or_else(|| panic!("{}", p)).risk, Risk::Confirm, "{}", p);
    }
    assert_eq!(e.entry("dock.style").unwrap().risk, Risk::Low);
}

#[test]
fn search_finds_by_words() {
    let e = engine();
    let r = catalogue::search(&e.entries, "dock magnification", 10);
    assert!(r.iter().any(|x| x.path == "dock.magnification"));
    assert_eq!(catalogue::search(&e.entries, "dock.style", 3)[0].path, "dock.style");
    assert!(catalogue::search(&e.entries, "zzzz nothing", 10).is_empty());
}

#[test]
fn schema_validation() {
    let e = engine();
    let ent = |p: &str| e.entry(p).unwrap().clone();
    let style = ent("dock.style");
    assert!(catalogue::validate_value(&style, &json!("slim")).is_ok());
    assert!(catalogue::validate_value(&style, &json!("sideways")).is_err());
    assert!(catalogue::validate_value(&style, &json!(3)).is_err());
    let op = ent("theme.glassOpacity");
    assert!(catalogue::validate_value(&op, &json!(0.8)).is_ok());
    assert!(catalogue::validate_value(&op, &json!(0.1)).is_err(), "opacity floor 40 % (AGENTS.md)");
    let rad = ent("theme.borderRadius");
    assert!(catalogue::validate_value(&rad, &json!(21)).is_err(), "roundness 0-20 (AGENTS.md)");
    let acc = ent("theme.customAccent");
    assert!(catalogue::validate_value(&acc, &json!("#3b82f6")).is_ok());
    assert!(catalogue::validate_value(&acc, &json!("blue")).is_err());
    let pack = ent("theme.preset");
    assert!(catalogue::validate_value(&pack, &json!("nord-frost")).is_ok());
    assert!(catalogue::validate_value(&pack, &json!("../../etc")).is_err());
    let dim = ent("windowStyling.dimInactive");
    assert!(catalogue::validate_value(&dim, &json!(41)).is_err());
    let vol = ent("live.volume");
    assert!(catalogue::validate_value(&vol, &json!(101)).is_err());
    assert!(catalogue::validate_value(&ent("dock.showLabels"), &json!("yes")).is_err());
}

// ------------------------------------------------------------------ engine

#[test]
fn batch_applies_atomically_with_one_undo() {
    let e = engine();
    let m = Mem::new();
    let before = m.snapshot();
    let plan = e
        .plan(&m, &changes(json!({ "theme.preset": "nord-frost", "dock.style": "slim", "windowStyling.dimInactive": 20 })))
        .unwrap();
    assert_eq!(plan.changes.len(), 3);
    assert!(plan.capabilities.contains(&Capability::ChangeLook));
    let rec = e.apply(&m, &plan, "Claude Desktop", "Nord", 1).unwrap();
    assert_eq!(m.read("config").unwrap()["dock"]["style"], "slim");
    assert_eq!(m.read("windowStyling").unwrap()["dimInactive"], 20);
    e.undo_settings(&m, &rec).unwrap();
    assert_eq!(m.snapshot(), before, "undo restores exactly");
    assert!(e.undo_settings(&m, &e.undo_target(Some(&rec.id)).unwrap()).is_err(), "can't undo twice");
}

#[test]
fn failed_store_rolls_back_everything() {
    let e = engine();
    let m = Mem::new();
    let before = m.snapshot();
    m.fail_on("windowStyling");
    let plan = e.plan(&m, &changes(json!({ "dock.style": "slim", "windowStyling.dimInactive": 20 }))).unwrap();
    assert!(e.apply(&m, &plan, "x", "x", 1).is_err());
    assert_eq!(m.snapshot(), before, "config write was rolled back");
    assert!(e.undo_target(None).is_none(), "no undo record for a failed batch");
}

#[test]
fn plan_rejects_unknown_blocked_invalid_and_noop() {
    let e = engine();
    let m = Mem::new();
    assert!(e.plan(&m, &changes(json!({ "dock.nope": 1 }))).unwrap_err().contains("Unknown setting"));
    assert!(e.plan(&m, &changes(json!({ "mcp.enabled": true }))).unwrap_err().contains("can't be changed by an AI"));
    assert!(e.plan(&m, &changes(json!({ "ai.privacy": "allow_cloud" }))).is_err());
    assert!(e.plan(&m, &changes(json!({ "dock.style": "bogus" }))).is_err());
    let cur = m.read("config").unwrap()["dock"]["style"].clone();
    assert!(e.plan(&m, &changes(json!({ "dock.style": cur }))).unwrap_err().contains("already"));
    assert!(e.plan(&m, &Map::new()).is_err());
    let hidden = m.read("config").unwrap()["func"]["hideNativeTaskbar"].as_bool().unwrap_or(false);
    let p = e.plan(&m, &changes(json!({ "func.hideNativeTaskbar": !hidden }))).unwrap();
    assert_eq!(p.risk, Risk::Confirm);
}

#[test]
fn presets_are_valid_plans() {
    let e = engine();
    let m = Mem::new();
    for p in engine::PRESETS {
        let c = engine::preset_changes(p.id).unwrap();
        e.plan(&m, &c).unwrap_or_else(|x| panic!("preset {}: {}", p.id, x));
    }
    assert_eq!(engine::preset_changes("pack:tokyo-night").unwrap()["theme.preset"], "tokyo-night");
    assert!(engine::preset_changes("nope").is_err());
}

#[test]
fn snapshots_round_trip_as_one_batch() {
    let e = engine();
    let d = Fake::new("snap");
    let out = tools::execute(&e, &d, "you", &Call::SnapshotSave("My look".into())).unwrap();
    assert!(out.text.contains("My look"));
    let before = d.mem.snapshot();
    tools::execute(&e, &d, "you", &Call::Set { changes: changes(json!({ "dock.style": "taskbar", "theme.borderRadius": 4 })) }).unwrap();
    assert_ne!(d.mem.snapshot(), before);
    let r = tools::execute(&e, &d, "you", &Call::SnapshotRestore("My look".into())).unwrap();
    assert!(r.undo_id.is_some());
    assert_eq!(d.mem.read("config").unwrap()["dock"], before["config"]["dock"]);
    assert_eq!(engine::list_snapshots(&d.snapshots_dir()).len(), 1);
    assert!(engine::load_snapshot(&d.snapshots_dir(), "../x").is_err());
    let _ = std::fs::remove_dir_all(&d.dir);
}

// ------------------------------------------------------------------ windows

#[test]
fn window_actions_record_their_inverse() {
    let e = engine();
    let d = Fake::new("win");
    let out = tools::execute(&e, &d, "Claude Desktop", &Call::Window { hwnd: 101, action: WinAction::Minimize }).unwrap();
    let id = out.undo_id.expect("minimise is undoable");
    assert!(d.windows()[0].minimized);
    tools::execute(&e, &d, "Claude Desktop", &Call::Undo(Some(id.clone()))).unwrap();
    assert!(!d.windows()[0].minimized, "undo restored the window");
    assert!(tools::execute(&e, &d, "x", &Call::Undo(Some(id))).is_err());

    tools::execute(&e, &d, "x", &Call::Window { hwnd: 101, action: WinAction::Move { x: 0, y: 0, w: 640, h: 480 } }).unwrap();
    assert_eq!(d.window_rect(101), Some([0, 0, 640, 480]));
    tools::execute(&e, &d, "x", &Call::Undo(None)).unwrap();
    assert_eq!(d.window_rect(101), Some([100, 100, 800, 600]), "move undone");

    tools::execute(&e, &d, "x", &Call::Window { hwnd: 101, action: WinAction::Pin(true) }).unwrap();
    assert!(d.is_pinned(101));
    tools::execute(&e, &d, "x", &Call::Undo(None)).unwrap();
    assert!(!d.is_pinned(101));

    let close = tools::execute(&e, &d, "x", &Call::Window { hwnd: 202, action: WinAction::Close }).unwrap();
    assert!(close.undo_id.is_none(), "closing can't be undone");
    assert!(tools::execute(&e, &d, "x", &Call::Window { hwnd: 999, action: WinAction::Focus }).is_err());
}

#[test]
fn assessments_carry_capabilities_risk_and_preview() {
    let e = engine();
    let d = Fake::new("assess");
    let a = tools::assess(&e, &d, "Claude Desktop", &Call::Window { hwnd: 202, action: WinAction::Close }).unwrap();
    assert_eq!(a.capabilities, vec![Capability::CloseApps]);
    assert_eq!(a.risk, Risk::Confirm);
    assert_eq!(a.preview["holdToConfirm"], true);
    assert_eq!(a.preview["reversible"], false);
    assert_eq!(a.preview["kind"], "window");
    assert_eq!(a.preview["window"]["app"], "olk");

    let look = tools::assess(&e, &d, "Claude Desktop", &Call::Set { changes: changes(json!({ "dock.style": "slim", "theme.customAccent": "#ff8800" })) }).unwrap();
    assert_eq!(look.preview["kind"], "look");
    assert_eq!(look.preview["look"]["after"]["dockStyle"], "slim");
    assert_eq!(look.preview["look"]["after"]["accent"], "#ff8800");
    assert_ne!(look.preview["look"]["before"]["dockStyle"], "slim");
    assert!(look.preview["question"].as_str().unwrap().ends_with('?'));
    assert!(look.preview["reason"].as_str().unwrap().starts_with("Claude Desktop wants to"));

    let s = tools::assess(&e, &d, "claude-code", &Call::Set { changes: changes(json!({ "hotCorners.enabled": true })) });
    if let Ok(s) = s {
        assert_eq!(s.preview["kind"], "settings");
    }
}

#[test]
fn monitor_placement_keeps_relative_position() {
    let from = [0, 0, 1920, 1040];
    let to = [1920, 0, 2560, 1400];
    assert_eq!(place_on_monitor([0, 0, 800, 600], from, to), [1920, 0, 800, 600]);
    let [x, y, w, h] = place_on_monitor([1120, 440, 800, 600], from, to);
    assert_eq!((w, h), (800, 600));
    assert_eq!(x + w, 1920 + 2560, "right-aligned stays right-aligned");
    assert_eq!(y + h, 1400);
    let big = place_on_monitor([0, 0, 3000, 2000], from, [0, 0, 1280, 720]);
    assert_eq!(big, [0, 0, 1280, 720], "clamped to the smaller monitor");
}

// ------------------------------------------------------------------ grants

#[test]
fn grant_defaults_and_precedence() {
    let mut g = Grants::default();
    let c = "Claude Desktop";
    assert_eq!(client_kind(c), "claude-desktop");
    assert_eq!(client_kind("claude-code"), "claude-code");
    assert_eq!(client_kind("internal"), "internal");
    assert_eq!(client_kind("some-agent"), "other");
    assert_eq!(g.level(c, Capability::ReadSettings), Level::Allowed);
    for cap in [Capability::ChangeLook, Capability::ArrangeWindows, Capability::TypeText, Capability::CloseApps, Capability::SendToCloud] {
        assert_eq!(g.level(c, cap), Level::Ask, "{:?}", cap);
    }
    assert_eq!(g.level(c, Capability::Destructive), Level::Blocked);
    assert_eq!(g.level(c, Capability::Payments), Level::Blocked, "payments are blocked until the user allows asking");
    assert_eq!(g.level(c, Capability::SendMessages), Level::Ask);
    assert_eq!(g.level(c, Capability::DeleteToBin), Level::Ask);
    assert!(g.set(c, Capability::Payments, Level::Allowed, false).is_err(), "payments never run without a card");
    assert!(g.set(c, Capability::SendMessages, Level::Allowed, true).is_err());
    g.set(c, Capability::Payments, Level::Ask, true).unwrap();
    assert_eq!(g.decide(c, &[Capability::Payments], Risk::Confirm), Decision::Ask);
    assert_eq!(g.level("internal", Capability::UseShelf), Level::Allowed);
    assert_eq!(g.level(c, Capability::UseShelf), Level::Ask);

    assert_eq!(g.decide(c, &[Capability::ReadSettings], Risk::Low), Decision::Run);
    assert_eq!(g.decide(c, &[Capability::ChangeLook], Risk::Low), Decision::Ask);
    g.set(c, Capability::ChangeLook, Level::Allowed, true).unwrap();
    assert_eq!(g.decide(c, &[Capability::ChangeLook], Risk::Low), Decision::Run, "session grant");
    assert_eq!(g.decide(c, &[Capability::ChangeLook], Risk::Confirm), Decision::Ask, "confirm risk always asks");
    assert!(matches!(g.decide(c, &[Capability::ChangeLook], Risk::Blocked), Decision::Block(_)));
    g.set(c, Capability::ArrangeWindows, Level::Blocked, false).unwrap();
    assert!(matches!(g.decide(c, &[Capability::ChangeLook, Capability::ArrangeWindows], Risk::Low), Decision::Block(_)), "blocked beats allowed");
    assert!(g.set(c, Capability::Destructive, Level::Allowed, false).is_err());
    assert_eq!(g.level("claude-code", Capability::ChangeLook), Level::Ask, "grants are per client");
    g.revoke(c);
    assert_eq!(g.level(c, Capability::ChangeLook), Level::Ask);
    assert_eq!(g.level(c, Capability::ArrangeWindows), Level::Ask);
}

#[test]
fn grants_persist_without_session_or_destructive() {
    let dir = std::env::temp_dir().join(format!("lens-grants-{}", std::process::id()));
    let p = dir.join("grants.json");
    let mut g = Grants::default();
    g.set("Claude Desktop", Capability::ChangeLook, Level::Allowed, false).unwrap();
    g.set("Claude Desktop", Capability::LaunchApps, Level::Allowed, true).unwrap();
    g.save(&p).unwrap();
    let back = Grants::load(&p);
    assert_eq!(back.level("Claude Desktop", Capability::ChangeLook), Level::Allowed);
    assert_eq!(back.level("Claude Desktop", Capability::LaunchApps), Level::Ask, "session grants aren't saved");
    std::fs::write(&p, r#"{"saved":{"claude-desktop":{"destructive":"allowed"}}}"#).unwrap();
    assert_eq!(Grants::load(&p).level("Claude Desktop", Capability::Destructive), Level::Blocked);
    std::fs::write(&p, "{nope").unwrap();
    assert_eq!(Grants::load(&p), Grants::default());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn task_list_marks_used_capabilities() {
    let g = Grants::default();
    let l = g.task_list("Claude Desktop", &[Capability::ChangeLook]);
    let a = l.as_array().unwrap();
    assert_eq!(a.len(), Capability::ALL.len());
    let look = a.iter().find(|x| x["id"] == "change_look").unwrap();
    assert_eq!(look["used"], true);
    assert_eq!(look["level"], "ask");
    assert_eq!(a.iter().find(|x| x["id"] == "destructive").unwrap()["level"], "blocked");
    assert_eq!(a.iter().find(|x| x["id"] == "payments").unwrap()["principle"], "Every payment waits");
    assert_eq!(a.iter().find(|x| x["id"] == "delete_to_bin").unwrap()["principle"], "Deletions go to the Bin");
}

// ------------------------------------------------------------------ audit

#[test]
fn audit_appends_reads_newest_first_and_rotates() {
    let dir = std::env::temp_dir().join(format!("lens-audit-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let p = dir.join("audit.jsonl");
    for i in 0..5 {
        audit::append(&p, &AuditEntry::new(i, "Claude Desktop", "lens_set", &format!("change {}", i), "ran", Some(format!("undo-{}", i))));
    }
    std::fs::OpenOptions::new().append(true).open(&p).map(|mut f| std::io::Write::write_all(&mut f, b"garbage\n")).unwrap().unwrap();
    let r = audit::read(&p, 3);
    assert_eq!(r.len(), 3);
    assert_eq!(r[0].summary, "change 4");
    assert_eq!(r[0].undo_id.as_deref(), Some("undo-4"));
    std::fs::write(&p, vec![b'x'; (audit::MAX_BYTES + 10) as usize]).unwrap();
    audit::append(&p, &AuditEntry::new(9, "a\u{7}b", "t", "s", "ran", None));
    assert!(dir.join("audit.1.jsonl").exists());
    let r = audit::read(&p, 10);
    assert_eq!(r.len(), 1);
    assert_eq!(r[0].client, "ab", "control characters stripped");
    let _ = std::fs::remove_dir_all(&dir);
}

// ------------------------------------------------------------------ tools / MCP

#[test]
fn mcp_tool_list_snapshot() {
    let names: Vec<String> = tools::mcp_tool_defs().iter().map(|d| d["name"].as_str().unwrap().to_string()).collect();
    assert_eq!(
        names,
        vec![
            "lens_list_settings", "lens_get", "lens_set", "lens_windows", "lens_window_action", "lens_app", "lens_shelf",
            "lens_apply_preset", "lens_undo", "lens_snapshot_save", "lens_snapshot_restore",
        ]
    );
    for d in tools::mcp_tool_defs() {
        assert_eq!(d["inputSchema"]["type"], "object");
        assert_eq!(d["annotations"]["destructiveHint"], false);
        assert!(d["description"].as_str().unwrap().len() > 30);
    }
    let r: Vec<String> = super::lens::resources().iter().map(|x| x["uri"].as_str().unwrap().to_string()).collect();
    assert_eq!(r, vec!["lens://settings/catalogue", "lens://theme/current", "lens://shelf/items"]);
}

#[test]
fn parse_accepts_good_calls() {
    assert!(matches!(tools::parse("lens_get", &json!({ "paths": ["dock"] })), Ok(Call::Get { .. })));
    assert!(matches!(tools::parse("lens_set", &json!({ "path": "dock.style", "value": "slim" })), Ok(Call::Set { .. })));
    assert!(matches!(tools::parse("lens_window_action", &json!({ "hwnd": 5, "action": "snap", "slot": "left" })), Ok(Call::Window { .. })));
    assert!(matches!(tools::parse("lens_window_action", &json!({ "hwnd": 5, "action": "minimise" })), Ok(Call::Window { action: WinAction::Minimize, .. })));
    assert!(matches!(tools::parse("lens_shelf", &json!({ "action": "add", "text": "hi", "url": "javascript:alert(1)" })), Ok(Call::Shelf(ShelfAction::Add { url: None, .. }))));
    assert!(matches!(tools::parse("lens_undo", &Value::Null), Ok(Call::Undo(None))));
    assert!(tools::parse("lens_app", &json!({ "name": "C:\\Windows\\cmd.exe" })).is_err());
    assert!(tools::parse("lens_window_action", &json!({ "hwnd": 5, "action": "move", "x": 0, "y": 0, "width": 10, "height": 10 })).is_err());
    assert!(tools::parse("lens_snapshot_save", &json!({ "name": "../../evil" })).is_err());
    assert!(tools::parse("lens_rm_rf", &json!({})).is_err());
    assert!(!tools::describe("lens_set", &json!({ "changes": { "dock.style": "slim" } })).is_empty());
}

/// Malformed arguments never panic: every input is either parsed or rejected with a message.
#[test]
fn fuzz_malformed_arguments_never_panic() {
    let mut seed: u64 = 0x5eed_1e75;
    let mut next = || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        seed >> 33
    };
    let atoms = [
        json!(null), json!(true), json!(-1), json!(0), json!(1e300), json!(i64::MAX), json!(""), json!("dock.style"),
        json!("x".repeat(5000)), json!("\u{0}\u{7}"), json!([]), json!([1, "a", null]), json!({}), json!({ "a": { "b": [] } }),
        json!("../.."), json!("slim"), json!(1.5), json!("#zzzzzz"),
    ];
    let keys = ["paths", "path", "value", "changes", "hwnd", "action", "slot", "x", "y", "width", "height", "target", "name", "id", "text", "ids", "query", "limit"];
    let e = engine();
    let d = Fake::new("fuzz");
    for _ in 0..4000 {
        let tool = tools::TOOLS[(next() as usize) % tools::TOOLS.len()].name;
        let mut m = Map::new();
        for _ in 0..(next() % 5) {
            let k = keys[(next() as usize) % keys.len()];
            let v = atoms[(next() as usize) % atoms.len()].clone();
            m.insert(k.to_string(), v);
        }
        let args = if next() % 9 == 0 { atoms[(next() as usize) % atoms.len()].clone() } else { Value::Object(m) };
        if let Ok(call) = tools::parse(tool, &args) {
            let _ = tools::assess(&e, &d, "fuzzer", &call);
            let _ = tools::describe(tool, &args);
        }
        let _ = crate::ai::tools::validate(tool, &args);
    }
    let _ = std::fs::remove_dir_all(&d.dir);
}

/// src/control/catalogue.json is generated from the catalogue. Regenerate with
/// `LENS_WRITE_CATALOGUE=1 cargo test --lib export_catalogue` (or `bun run gen:catalogue`).
#[test]
fn export_catalogue() {
    let e = engine();
    let doc = catalogue::export_json(&e.entries);
    let text = serde_json::to_string_pretty(&doc).unwrap() + "\n";
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/control/catalogue.json");
    if std::env::var("LENS_WRITE_CATALOGUE").is_ok() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &text).unwrap();
        return;
    }
    let committed = std::fs::read_to_string(&path).unwrap_or_default().replace("\r\n", "\n");
    if committed != text {
        // Printed so a CI log alone is enough to refresh the file.
        println!("CATALOGUE-BEGIN\n{}CATALOGUE-END", text);
        panic!("src/control/catalogue.json is stale: run `bun run gen:catalogue`");
    }
}

#[test]
fn entries_are_serializable_for_the_ui() {
    let e = engine();
    let one: &Entry = e.entry("dock.style").unwrap();
    let v = serde_json::to_value(one).unwrap();
    assert_eq!(v["capability"], "change_look");
    assert_eq!(v["risk"], "low");
    assert_eq!(v["schema"]["enum"][0], "floating");
}
