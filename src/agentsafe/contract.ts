// Agent safety (W8-O): typed wrappers over the backend commands in commands/agentsafe.rs.
import { invoke } from "@tauri-apps/api/core";
import type {
  DomainCheck,
  SafetyCheckRequest,
  SafetyCheckResult,
  SafetyGrant,
  SafetyQuarantineEntry,
  SafetySettings,
  ScanNode,
  ScanResult,
  SafetyReason,
} from "../types/generated";

export type { DomainCheck, SafetyCheckRequest, SafetyCheckResult, SafetyGrant, SafetyQuarantineEntry, SafetySettings, ScanNode, ScanResult, SafetyReason };

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Verdict = "allow" | "ask" | "block";

export const DEFAULT_SAFETY_SETTINGS: SafetySettings = {
  sandboxProfile: true,
  domainGuard: true,
  injectionGuard: true,
  sensitivity: "balanced",
  bannerForPeople: true,
};

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export const safetySettingsGet = () => invoke<SafetySettings>("agentsafe_settings_get");
export const safetySettingsSet = (settings: SafetySettings) => invoke<SafetySettings>("agentsafe_settings_set", { settings });
export const safetyCheckUrl = (url: string, opts: { linkText?: string; flow?: "browse" | "login" | "payment"; knownDomains?: string[]; seenBefore?: boolean } = {}) =>
  invoke<DomainCheck>("agentsafe_check_url", { url, linkText: opts.linkText ?? null, flow: opts.flow ?? null, knownDomains: opts.knownDomains ?? null, seenBefore: opts.seenBefore ?? null });
export const safetyScan = (nodes: Partial<ScanNode>[], label: string, record = true) => invoke<ScanResult>("agentsafe_scan", { nodes, label, record });
export const safetyCheck = (req: Partial<SafetyCheckRequest> & { action: string }) => invoke<SafetyCheckResult>("agentsafe_check", { req });
export const safetyGrants = () => invoke<SafetyGrant[]>("agentsafe_grants_list");
export const safetyGrant = (site: string, scope: "run" | "day", runId?: string, space?: string) =>
  invoke<SafetyGrant>("agentsafe_grant", { site, scope, runId: runId ?? null, space: space ?? null });
export const safetyRevoke = (site: string) => invoke<boolean>("agentsafe_revoke", { site });
export const safetyRevokeAll = () => invoke<void>("agentsafe_revoke_all");
export const safetyRunEnded = (runId: string) => invoke<void>("agentsafe_run_ended", { runId });
export const safetyQuarantine = () => invoke<SafetyQuarantineEntry[]>("agentsafe_quarantine_list");
export const safetyQuarantineClear = () => invoke<void>("agentsafe_quarantine_clear");

/** Highest severity among reasons; "info" when there are none. */
export function worstSeverity(reasons: { severity: string }[]): Severity {
  let worst: Severity = "info";
  for (const r of reasons) {
    const s = (r.severity as Severity) in SEVERITY_RANK ? (r.severity as Severity) : "info";
    if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}

/** Plain-language headline for a verdict, used by the approval card and the banner. */
export function verdictHeadline(verdict: Verdict, reasons: { severity: string }[]): string {
  if (verdict === "block") return "Lens stopped this step";
  if (verdict === "ask") return SEVERITY_RANK[worstSeverity(reasons)] >= SEVERITY_RANK.high ? "Check this before you approve" : "Needs your OK";
  return "Looks fine";
}

/** "This run only", "42 min left", "18 h left". */
export function grantExpiryLabel(g: Pick<SafetyGrant, "scope" | "expiresAt">, nowSec: number): string {
  if (g.scope === "run") return "This run only";
  if (!g.expiresAt) return "Today";
  const mins = Math.max(0, Math.round((g.expiresAt - nowSec) / 60));
  if (mins < 60) return `${mins} min left`;
  return `${Math.round(mins / 60)} h left`;
}
