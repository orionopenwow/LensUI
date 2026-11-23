//! Agent safety commands (W8-O). The logic and its red-team tests live in `crate::agentsafe`;
//! this file only converts to and from IPC types.
//!
//! Every agent action should call `agentsafe_check` before it runs (see docs/AGENT_SAFETY.md ›
//! "Integration"). Page, OCR and file text should go through `agentsafe_scan` before it reaches
//! any model; the returned `wrapped` text is the only form a model may see.

use crate::agentsafe::domains::{check_url, DomainInput, DomainReport, Flow};
use crate::agentsafe::hidden_text::{scan, wrap_untrusted, Source, Style, TextNode};
use crate::agentsafe::pipeline::{check, ActionKind, CheckContext, Client, Origin, Target};
use crate::agentsafe::profile::{AgentProfile, GrantScope};
use crate::agentsafe::state::{self, now_secs};
use crate::agentsafe::{Reason, Sensitivity, Verdict};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyReason {
    pub code: String,
    /// "info" | "low" | "medium" | "high" | "critical"
    pub severity: String,
    pub detail: String,
}

impl From<&Reason> for SafetyReason {
    fn from(r: &Reason) -> Self {
        Self { code: r.code.to_string(), severity: r.severity.as_str().to_string(), detail: r.detail.clone() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetySettings {
    /// Always true: agent runs use the signed-out profile.
    pub sandbox_profile: bool,
    pub domain_guard: bool,
    pub injection_guard: bool,
    /// "relaxed" | "balanced" | "strict"
    pub sensitivity: String,
    pub banner_for_people: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainCheck {
    pub host: String,
    pub display_host: String,
    pub site: String,
    pub trusted: bool,
    pub risk: String,
    pub reasons: Vec<SafetyReason>,
}

impl From<&DomainReport> for DomainCheck {
    fn from(d: &DomainReport) -> Self {
        Self {
            host: d.host.clone(),
            display_host: d.display_host.clone(),
            site: d.registrable.clone(),
            trusted: d.trusted,
            risk: d.risk.as_str().to_string(),
            reasons: d.reasons.iter().map(Into::into).collect(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScanNode {
    pub id: u32,
    pub text: String,
    /// "dom" | "alt" | "meta" | "ocr" | "file" | "transcript" | "clipboard" | "tool"
    pub source: String,
    pub display_none: bool,
    pub visibility_hidden: bool,
    pub opacity: Option<f32>,
    pub contrast: Option<f32>,
    pub font_px: Option<f32>,
    pub offscreen: bool,
    pub clipped: bool,
    pub aria_hidden: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanFinding {
    pub node: u32,
    pub start: usize,
    pub end: usize,
    pub kind: String,
    pub severity: String,
    pub detail: String,
    pub quarantined: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub risk: String,
    pub findings: Vec<ScanFinding>,
    pub reasons: Vec<SafetyReason>,
    /// The text wrapped as untrusted data, with flagged spans set aside. Give models only this.
    pub wrapped: String,
    pub quarantined: Vec<QuarantinedSpan>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuarantinedSpan {
    pub id: u32,
    pub reason: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyCheckRequest {
    /// e.g. "read", "navigate", "click", "type", "submit", "send", "pay", "login", "delete",
    /// "download", "settings_write", "window", "launch", "clipboard".
    pub action: String,
    /// "internal" | "voice" | "claude-desktop" | "claude-code" | other MCP client name.
    #[serde(default)]
    pub client: String,
    /// "user" when the person asked for this step; "untrusted" when a model planned it after
    /// reading pages, files, OCR or tool output.
    #[serde(default)]
    pub origin: String,
    #[serde(default)]
    pub run_id: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub link_text: Option<String>,
    #[serde(default)]
    pub field: Option<String>,
    #[serde(default)]
    pub carries_user_data: bool,
    #[serde(default)]
    pub local_only_data: bool,
    #[serde(default)]
    pub data_in_url: bool,
    #[serde(default)]
    pub needs_signed_in: bool,
    /// "browse" | "login" | "payment"
    #[serde(default)]
    pub flow: Option<String>,
    #[serde(default)]
    pub known_domains: Vec<String>,
    #[serde(default)]
    pub seen_before: bool,
    /// Text the step was planned from; scanned for injection.
    #[serde(default)]
    pub source_nodes: Vec<ScanNode>,
    #[serde(default)]
    pub payments_ask_first: bool,
    #[serde(default)]
    pub user_initiated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyCheckResult {
    /// "allow" | "ask" | "block"
    pub verdict: String,
    pub reasons: Vec<SafetyReason>,
    /// "sandbox" or "signed-in"
    pub profile: String,
    pub profile_site: Option<String>,
    pub profile_space: Option<String>,
    pub domain: Option<DomainCheck>,
    pub hold_to_confirm: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyGrant {
    pub site: String,
    /// "run" | "day"
    pub scope: String,
    pub run_id: Option<String>,
    pub expires_at: Option<u64>,
    pub granted_at: u64,
    pub space: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyQuarantineEntry {
    pub id: u64,
    pub at: u64,
    pub source: String,
    pub reason: String,
    pub text: String,
}

fn to_nodes(nodes: &[ScanNode]) -> Vec<TextNode> {
    nodes
        .iter()
        .take(5_000)
        .map(|n| TextNode {
            id: n.id,
            text: n.text.chars().take(20_000).collect(),
            source: Source::parse(&n.source),
            style: Style {
                display_none: n.display_none,
                visibility_hidden: n.visibility_hidden,
                opacity: n.opacity.unwrap_or(1.0),
                contrast: n.contrast.unwrap_or(0.0),
                font_px: n.font_px.unwrap_or(16.0),
                offscreen: n.offscreen,
                clipped: n.clipped,
                aria_hidden: n.aria_hidden,
            },
        })
        .collect()
}

fn settings_dto(s: &state::Settings) -> SafetySettings {
    SafetySettings {
        sandbox_profile: s.sandbox_profile,
        domain_guard: s.domain_guard,
        injection_guard: s.injection_guard,
        sensitivity: s.sensitivity.as_str().to_string(),
        banner_for_people: s.banner_for_people,
    }
}

#[tauri::command]
pub(crate) fn agentsafe_settings_get() -> SafetySettings {
    state::with(|s| settings_dto(&s.settings))
}

#[tauri::command]
pub(crate) fn agentsafe_settings_set(settings: SafetySettings) -> SafetySettings {
    state::with(|s| {
        s.settings.domain_guard = settings.domain_guard;
        s.settings.injection_guard = settings.injection_guard;
        s.settings.sensitivity = Sensitivity::parse(&settings.sensitivity);
        s.settings.banner_for_people = settings.banner_for_people;
        s.settings.sandbox_profile = true;
        s.save();
        settings_dto(&s.settings)
    })
}

#[tauri::command]
pub(crate) fn agentsafe_check_url(url: String, link_text: Option<String>, flow: Option<String>, known_domains: Option<Vec<String>>, seen_before: Option<bool>) -> DomainCheck {
    let known = known_domains.unwrap_or_default();
    let r = check_url(&DomainInput {
        url: &url,
        link_text: link_text.as_deref(),
        flow: flow.as_deref().map(Flow::parse).unwrap_or_default(),
        known_domains: &known,
        seen_before: seen_before.unwrap_or(true),
    });
    (&r).into()
}

/// Scans page/OCR/file text. When `record` is true, quarantined spans are added to the viewer.
#[tauri::command]
pub(crate) fn agentsafe_scan(nodes: Vec<ScanNode>, label: String, record: Option<bool>) -> ScanResult {
    let nodes = to_nodes(&nodes);
    let enabled = state::with(|s| s.settings.injection_guard);
    let report = if enabled { scan(&nodes) } else { Default::default() };
    let (wrapped, quarantined) = wrap_untrusted(&nodes, &report, &label);
    if record.unwrap_or(true) && !quarantined.is_empty() {
        let now = now_secs();
        state::with(|s| {
            for (_, why, text) in &quarantined {
                s.quarantine_push(now, &label, why, text);
            }
        });
    }
    ScanResult {
        risk: report.risk.map(|r| r.as_str()).unwrap_or("info").to_string(),
        findings: report
            .findings
            .iter()
            .map(|f| ScanFinding {
                node: f.node,
                start: f.start,
                end: f.end,
                kind: f.kind.as_str().to_string(),
                severity: f.severity.as_str().to_string(),
                detail: f.detail.clone(),
                quarantined: f.quarantine,
            })
            .collect(),
        reasons: report.reasons().iter().map(Into::into).collect(),
        wrapped,
        quarantined: quarantined.into_iter().map(|(id, reason, text)| QuarantinedSpan { id, reason, text }).collect(),
    }
}

/// The guard pipeline. Every agent action calls this before it runs.
#[tauri::command]
pub(crate) fn agentsafe_check(req: SafetyCheckRequest) -> SafetyCheckResult {
    let Some(action) = ActionKind::parse(&req.action) else {
        return SafetyCheckResult {
            verdict: "block".into(),
            reasons: vec![SafetyReason { code: "risk.unknown_action".into(), severity: "high".into(), detail: format!("Unknown action \"{}\"", req.action) }],
            profile: "sandbox".into(),
            profile_site: None,
            profile_space: None,
            domain: None,
            hold_to_confirm: false,
        };
    };
    let nodes = to_nodes(&req.source_nodes);
    let (settings, grants) = state::with(|s| (s.settings.clone(), s.grants.clone()));
    let report = if settings.injection_guard && !nodes.is_empty() { Some(scan(&nodes)) } else { None };
    let target = Target {
        url: if settings.domain_guard { req.url.clone() } else { None },
        link_text: req.link_text.clone(),
        field: req.field.clone(),
        carries_user_data: req.carries_user_data,
        local_only_data: req.local_only_data,
        data_in_url: req.data_in_url,
        needs_signed_in: req.needs_signed_in,
    };
    let ctx = CheckContext {
        client: Client::parse(&req.client),
        origin: if req.origin.eq_ignore_ascii_case("user") || req.origin.is_empty() { Origin::User } else { Origin::Untrusted },
        run_id: req.run_id.as_deref(),
        now: now_secs(),
        flow: req.flow.as_deref().map(Flow::parse).unwrap_or_default(),
        sensitivity: settings.sensitivity,
        grants: &grants,
        known_domains: &req.known_domains,
        seen_before: req.seen_before,
        injection: report.as_ref(),
        payments_ask_first: req.payments_ask_first,
        user_initiated: req.user_initiated,
    };
    let r = check(action, &target, &ctx);
    // With the domain guard off, the profile still follows grants for the real URL.
    let profile = match (&req.url, settings.domain_guard) {
        (Some(u), false) => grants.profile_for(u, req.run_id.as_deref(), now_secs()),
        _ => r.profile.clone(),
    };
    let (kind, site, space) = match profile {
        AgentProfile::Sandbox => ("sandbox", None, None),
        AgentProfile::SignedIn { site, space } => ("signed-in", Some(site), space),
    };
    let reasons: &[Reason] = match &r.verdict {
        Verdict::Allow => &[],
        Verdict::Ask(x) | Verdict::Block(x) => x,
    };
    let _ = crate::tester::log("info", "agentsafe", &format!("{} {} → {}", req.client, req.action, r.verdict.kind()));
    SafetyCheckResult {
        verdict: r.verdict.kind().to_string(),
        reasons: reasons.iter().map(Into::into).collect(),
        profile: kind.into(),
        profile_site: site,
        profile_space: space,
        domain: r.domain.as_ref().map(Into::into),
        hold_to_confirm: r.hold_to_confirm,
    }
}

fn grant_dto(g: &crate::agentsafe::profile::SiteGrant) -> SafetyGrant {
    let (scope, run_id, expires_at) = match &g.scope {
        GrantScope::Run(r) => ("run", Some(r.clone()), None),
        GrantScope::Until(t) => ("day", None, Some(*t)),
    };
    SafetyGrant { site: g.site.clone(), scope: scope.into(), run_id, expires_at, granted_at: g.granted_at, space: g.space.clone() }
}

#[tauri::command]
pub(crate) fn agentsafe_grants_list() -> Vec<SafetyGrant> {
    state::with(|s| s.grants.list().iter().map(grant_dto).collect())
}

/// Gives one site signed-in access, for one run (`scope = "run"` with `run_id`) or for one day.
#[tauri::command]
pub(crate) fn agentsafe_grant(site: String, scope: String, run_id: Option<String>, space: Option<String>) -> Result<SafetyGrant, String> {
    let now = now_secs();
    state::with(|s| {
        let g = match (scope.as_str(), run_id) {
            ("run", Some(r)) if !r.is_empty() => s.grants.grant(&site, GrantScope::Run(r), space, now),
            ("run", _) => return Err("A run grant needs the run's id".to_string()),
            _ => s.grants.grant_for_day(&site, space, now),
        }
        .map(grant_dto)
        .map_err(|e| e.to_string())?;
        s.save();
        Ok(g)
    })
}

#[tauri::command]
pub(crate) fn agentsafe_revoke(site: String) -> bool {
    state::with(|s| {
        let removed = s.grants.revoke(&site);
        s.save();
        removed
    })
}

#[tauri::command]
pub(crate) fn agentsafe_revoke_all() {
    state::with(|s| {
        s.grants.revoke_all();
        s.save();
    })
}

/// Ends a run: its run-scoped grants are dropped.
#[tauri::command]
pub(crate) fn agentsafe_run_ended(run_id: String) {
    state::with(|s| {
        let active: Vec<String> = s
            .grants
            .list()
            .iter()
            .filter_map(|g| match &g.scope {
                GrantScope::Run(r) if *r != run_id => Some(r.clone()),
                _ => None,
            })
            .collect();
        s.grants.prune(now_secs(), &active);
        s.save();
    })
}

#[tauri::command]
pub(crate) fn agentsafe_quarantine_list() -> Vec<SafetyQuarantineEntry> {
    state::with(|s| {
        s.quarantine
            .iter()
            .rev()
            .map(|q| SafetyQuarantineEntry { id: q.id, at: q.at, source: q.source.clone(), reason: q.reason.clone(), text: q.text.clone() })
            .collect()
    })
}

#[tauri::command]
pub(crate) fn agentsafe_quarantine_clear() {
    state::with(|s| s.quarantine.clear())
}
