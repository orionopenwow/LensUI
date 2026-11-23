//! Safety rules for voice, as pure functions:
//! * where dictation / paste may type (never password fields, elevated or credential windows,
//!   or Lens itself), and
//! * when always-listening must pause (locked, fullscreen, games, meetings, another app using
//!   the microphone).

#[derive(Debug, Clone, Default)]
pub struct TargetInfo {
    /// Foreground process, e.g. "notepad.exe".
    pub process_name: String,
    /// UI Automation's IsPassword for the focused element (`None` = couldn't tell).
    pub is_password: Option<bool>,
    /// The target process runs elevated (`None` = couldn't tell).
    pub elevated: Option<bool>,
    /// The focused window belongs to Lens.
    pub is_lens: bool,
    /// Something has keyboard focus.
    pub has_focus: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    NoTarget,
    Password,
    Elevated,
    Lens,
    Sensitive,
    Unknown,
}

impl Refusal {
    pub fn message(&self) -> &'static str {
        match self {
            Refusal::NoTarget => "Click into a text box first.",
            Refusal::Password => "Lens never types into password fields.",
            Refusal::Elevated => "Lens doesn't type into administrator windows.",
            Refusal::Lens => "That's a Lens window. Click into the app you want to type in.",
            Refusal::Sensitive => "Lens doesn't type into password managers or sign-in windows.",
            Refusal::Unknown => "Lens couldn't check that text box is safe, so it didn't type.",
        }
    }
}

/// Password managers, credential prompts and the lock screen.
pub const SENSITIVE_PROCESSES: &[&str] = &[
    "1password.exe", "keepass.exe", "keepassxc.exe", "bitwarden.exe", "lastpass.exe", "dashlane.exe", "enpass.exe", "nordpass.exe",
    "roboform.exe", "credentialuibroker.exe", "consent.exe", "logonui.exe", "lockapp.exe", "userprofilemanager.exe",
];

pub fn dictation_allowed(t: &TargetInfo) -> Result<(), Refusal> {
    if t.is_lens {
        return Err(Refusal::Lens);
    }
    if !t.has_focus || t.process_name.is_empty() {
        return Err(Refusal::NoTarget);
    }
    let p = t.process_name.to_lowercase();
    if SENSITIVE_PROCESSES.contains(&p.as_str()) {
        return Err(Refusal::Sensitive);
    }
    match t.is_password {
        Some(true) => return Err(Refusal::Password),
        None => return Err(Refusal::Unknown),
        Some(false) => {}
    }
    match t.elevated {
        Some(true) => Err(Refusal::Elevated),
        None => Err(Refusal::Unknown),
        Some(false) => Ok(()),
    }
}

#[derive(Debug, Clone, Default)]
pub struct Env {
    pub locked: bool,
    pub fullscreen: bool,
    pub foreground_process: String,
    /// Another app is using the microphone right now.
    pub mic_in_use_by_other: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseReason {
    Locked,
    Fullscreen,
    Game,
    Meeting,
    MicBusy,
}

impl PauseReason {
    pub fn label(&self) -> &'static str {
        match self {
            PauseReason::Locked => "PC locked",
            PauseReason::Fullscreen => "Fullscreen app",
            PauseReason::Game => "Game running",
            PauseReason::Meeting => "In a call",
            PauseReason::MicBusy => "Mic in use by another app",
        }
    }
}

/// Meeting and call apps (foreground = probably on a call).
pub const MEETING_APPS: &[&str] = &[
    "teams.exe", "ms-teams.exe", "zoom.exe", "webex.exe", "webexmta.exe", "atmgr.exe", "skype.exe", "discord.exe", "gotomeeting.exe",
    "g2mcomm.exe", "bluejeans.exe", "ringcentral.exe", "facetime.exe", "whatsapp.exe", "signal.exe", "slack.exe",
];

/// Games and launchers' game processes (fullscreen catches most others).
pub const GAMES: &[&str] = &[
    "valorant.exe", "valorant-win64-shipping.exe", "cs2.exe", "csgo.exe", "fortniteclient-win64-shipping.exe", "r5apex.exe",
    "league of legends.exe", "overwatch.exe", "rocketleague.exe", "eldenring.exe", "gta5.exe", "rainbowsix.exe", "destiny2.exe",
    "cod.exe", "minecraft.exe", "javaw.exe", "dota2.exe", "pubg.exe", "tslgame.exe",
];

/// Why always-listening should pause now, if it should. Push-to-talk ignores everything but
/// the lock screen: pressing the key is an explicit request.
pub fn wake_pause_reason(env: &Env, pause_in_meetings: bool, pause_in_fullscreen: bool) -> Option<PauseReason> {
    if env.locked {
        return Some(PauseReason::Locked);
    }
    let p = env.foreground_process.to_lowercase();
    if GAMES.contains(&p.as_str()) {
        return Some(PauseReason::Game);
    }
    if pause_in_meetings && MEETING_APPS.contains(&p.as_str()) {
        return Some(PauseReason::Meeting);
    }
    if pause_in_meetings && env.mic_in_use_by_other {
        return Some(PauseReason::MicBusy);
    }
    if pause_in_fullscreen && env.fullscreen {
        return Some(PauseReason::Fullscreen);
    }
    None
}

pub fn ptt_allowed(env: &Env) -> Result<(), PauseReason> {
    if env.locked {
        Err(PauseReason::Locked)
    } else {
        Ok(())
    }
}

/// Parses the microphone consent store: (subkey name, LastUsedTimeStart, LastUsedTimeStop).
/// An app is using the mic when it started and hasn't stopped. Lens itself is skipped.
pub fn mic_busy(entries: &[(String, u64, u64)], own_exe: &str) -> bool {
    let own = own_exe.to_lowercase().replace('\\', "#");
    entries.iter().any(|(name, start, stop)| *start != 0 && *stop == 0 && (own.is_empty() || !name.to_lowercase().ends_with(&own)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok_target() -> TargetInfo {
        TargetInfo { process_name: "notepad.exe".into(), is_password: Some(false), elevated: Some(false), is_lens: false, has_focus: true }
    }

    #[test]
    fn dictation_rules() {
        assert_eq!(dictation_allowed(&ok_target()), Ok(()));
        assert_eq!(dictation_allowed(&TargetInfo { is_password: Some(true), ..ok_target() }), Err(Refusal::Password));
        assert_eq!(dictation_allowed(&TargetInfo { is_password: None, ..ok_target() }), Err(Refusal::Unknown));
        assert_eq!(dictation_allowed(&TargetInfo { elevated: Some(true), ..ok_target() }), Err(Refusal::Elevated));
        assert_eq!(dictation_allowed(&TargetInfo { elevated: None, ..ok_target() }), Err(Refusal::Unknown));
        assert_eq!(dictation_allowed(&TargetInfo { is_lens: true, ..ok_target() }), Err(Refusal::Lens));
        assert_eq!(dictation_allowed(&TargetInfo { has_focus: false, ..ok_target() }), Err(Refusal::NoTarget));
        assert_eq!(dictation_allowed(&TargetInfo { process_name: "KeePassXC.exe".into(), ..ok_target() }), Err(Refusal::Sensitive));
        assert_eq!(dictation_allowed(&TargetInfo { process_name: "LogonUI.exe".into(), ..ok_target() }), Err(Refusal::Sensitive));
        // Password check wins even in a normal app.
        assert_eq!(
            dictation_allowed(&TargetInfo { process_name: "chrome.exe".into(), is_password: Some(true), ..ok_target() }),
            Err(Refusal::Password)
        );
        for r in [Refusal::NoTarget, Refusal::Password, Refusal::Elevated, Refusal::Lens, Refusal::Sensitive, Refusal::Unknown] {
            assert!(!r.message().is_empty());
        }
    }

    #[test]
    fn pause_rules() {
        let base = Env { foreground_process: "chrome.exe".into(), ..Default::default() };
        assert_eq!(wake_pause_reason(&base, true, true), None);
        assert_eq!(wake_pause_reason(&Env { locked: true, ..base.clone() }, false, false), Some(PauseReason::Locked));
        assert_eq!(wake_pause_reason(&Env { fullscreen: true, ..base.clone() }, true, true), Some(PauseReason::Fullscreen));
        assert_eq!(wake_pause_reason(&Env { fullscreen: true, ..base.clone() }, true, false), None);
        assert_eq!(wake_pause_reason(&Env { foreground_process: "Zoom.exe".into(), ..base.clone() }, true, true), Some(PauseReason::Meeting));
        assert_eq!(wake_pause_reason(&Env { foreground_process: "Zoom.exe".into(), ..base.clone() }, false, true), None);
        assert_eq!(wake_pause_reason(&Env { foreground_process: "cs2.exe".into(), ..base.clone() }, false, false), Some(PauseReason::Game));
        assert_eq!(wake_pause_reason(&Env { mic_in_use_by_other: true, ..base.clone() }, true, true), Some(PauseReason::MicBusy));
        assert_eq!(ptt_allowed(&Env { fullscreen: true, ..base.clone() }), Ok(()));
        assert_eq!(ptt_allowed(&Env { locked: true, ..base }), Err(PauseReason::Locked));
    }

    #[test]
    fn mic_consent_store() {
        let own = r"C:\Program Files\Lens UI\lens-ui.exe";
        let entries = vec![
            ("C:#Program Files#Lens UI#lens-ui.exe".to_string(), 133, 0),
            ("C:#Program Files#Zoom#zoom.exe".to_string(), 120, 130),
        ];
        assert!(!mic_busy(&entries, own));
        let mut busy = entries.clone();
        busy.push(("Microsoft.WindowsSoundRecorder_8wekyb3d8bbwe".into(), 140, 0));
        assert!(mic_busy(&busy, own));
    }
}
