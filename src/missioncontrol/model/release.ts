// Releases: the checklist before tagging, and the version bump helper.

export interface ReleaseConfig {
  secretNames: string[];
  secretsReadable: boolean;
  variables: { name: string; set: boolean }[];
  variablesReadable: boolean;
}

export interface CheckLine {
  id: string;
  label: string;
  ok: boolean | null;
  hint: string;
}

/** Names release.yml reads. Only names are ever compared; values are never fetched. */
export const SIGNING_SECRETS = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"];
export const PUBKEY_VARIABLE = "TAURI_UPDATER_PUBKEY";

export function releaseChecklist(cfg: ReleaseConfig | null, x: { unreleasedCount: number; mainGreen: boolean | null; versionMatches: boolean | null; openBlocked: number }): CheckLine[] {
  const has = (n: string) => (cfg?.secretsReadable ? cfg.secretNames.includes(n) : null);
  const pub = cfg?.variablesReadable ? (cfg.variables.find((v) => v.name === PUBKEY_VARIABLE)?.set ?? false) : null;
  return [
    { id: "ci", label: "main is green", ok: x.mainGreen, hint: "Latest commit's checks on Pulse." },
    { id: "changelog", label: "CHANGELOG has an Unreleased section with entries", ok: x.unreleasedCount > 0, hint: "Move them under the new version heading in the release PR." },
    { id: "version", label: "tauri.conf.json / Cargo.toml / package.json carry the new version", ok: x.versionMatches, hint: "release.yml refuses a tag that doesn't match tauri.conf.json." },
    ...SIGNING_SECRETS.map((n) => ({ id: n, label: `Secret ${n} exists`, ok: has(n), hint: cfg?.secretsReadable ? "Repo › Settings › Secrets and variables › Actions." : "The token can't list secrets (needs Secrets: read)." })),
    { id: PUBKEY_VARIABLE, label: `Variable ${PUBKEY_VARIABLE} is set (updater public key)`, ok: pub, hint: "Without it updates can't verify (docs/RELEASING.md)." },
    { id: "blocked", label: "No blocked PRs meant for this release", ok: x.openBlocked === 0, hint: "Or say in the release notes what waits for the next one." },
  ];
}

export function bumps(version: string): { patch: string; minor: string; major: string } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { patch: `${a}.${b}.${c + 1}`, minor: `${a}.${b + 1}.0`, major: `${a + 1}.0.0` };
}

export function validTag(tag: string): boolean {
  return /^v\d+\.\d+\.\d+(-(alpha|beta|rc|nightly)\.\d+)?$/.test(tag);
}
