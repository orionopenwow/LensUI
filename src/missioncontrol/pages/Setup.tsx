import React, { useState } from "react";
import { call } from "../api";
import { L } from "../loaders";
import { Btn, LoadState, Mono, Muted, Page, Pill, Section, fmtDate, refreshAll, useLoad } from "../ui";
import { toast } from "../../ui";

/** Fine-grained token permissions, repository orionopenwow/LensUI only (docs/MISSION_CONTROL.md). */
export const TOKEN_SCOPES: { scope: string; access: string; why: string }[] = [
  { scope: "Metadata", access: "Read", why: "required by GitHub for every token" },
  { scope: "Contents", access: "Read and write", why: "read docs on other branches; draft PRs for QUEUE.md and dossiers; tags" },
  { scope: "Pull requests", access: "Read and write", why: "the PR board, comments, merge" },
  { scope: "Issues", access: "Read and write", why: "the bugs inbox, labels, closing with a note" },
  { scope: "Actions", access: "Read and write", why: "check runs, job logs, re-run failed jobs" },
  { scope: "Checks", access: "Read", why: "check runs per commit" },
  { scope: "Commit statuses", access: "Read", why: "status of main" },
  { scope: "Pages", access: "Read", why: "the Pages deploy on Pulse" },
  { scope: "Secrets", access: "Read", why: "secret NAMES for the release checklist (GitHub never returns values)" },
  { scope: "Variables", access: "Read", why: "whether TAURI_UPDATER_PUBKEY is set" },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    call<{ login?: string }>("mc_token_set", { token })
      .then((r) => {
        setToken("");
        toast(`Connected as ${r.login ?? "?"}. The token is in Windows Credential Manager.`, { kind: "success" });
        onDone();
        refreshAll();
      })
      .catch((e) => toast(String(e), { kind: "error" }))
      .finally(() => setBusy(false));
  };
  const probeGh = () =>
    call<string>("mc_token_probe")
      .then((s) => (s === "ghCli" ? (toast("Using the GitHub CLI's token (gh auth token).", { kind: "success" }), onDone(), refreshAll()) : toast("The GitHub CLI isn't signed in on this PC.", { kind: "error" })))
      .catch((e) => toast(String(e), { kind: "error" }));
  return (
    <Section title="Connect GitHub" sub="Once per PC">
      <ol className="mc-ol">
        <li>
          On GitHub: Settings › Developer settings › Fine-grained tokens › Generate new token. Resource owner <Mono>orionopenwow</Mono>, repository access <Mono>Only select repositories › LensUI</Mono>, expiry 90 days.
        </li>
        <li>Give it these repository permissions (nothing else):</li>
      </ol>
      <div className="mc-table-wrap">
        <table className="mc-table">
          <thead>
            <tr>
              <th scope="col">Permission</th>
              <th scope="col">Access</th>
              <th scope="col">Used for</th>
            </tr>
          </thead>
          <tbody>
            {TOKEN_SCOPES.map((s) => (
              <tr key={s.scope}>
                <td>{s.scope}</td>
                <td>{s.access}</td>
                <td>{s.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mc-body">Read-only use works with every "Read and write" set to "Read"; the write buttons then fail with 403 and say so.</p>
      <div className="mc-actions">
        <input className="mc-input mc-grow" type="password" autoComplete="off" spellCheck={false} aria-label="GitHub token" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" && token && save()} />
        <Btn weight="heavy" variant="primary" disabled={!token.trim() || busy} onClick={save}>
          {busy ? "Checking…" : "Save in Credential Manager"}
        </Btn>
        <Btn variant="ghost" onClick={probeGh}>Use gh CLI instead</Btn>
      </div>
      <p className="mc-muted">Stored as the Windows credential "LensMissionControl:github". It never goes into a file, a log, the audit log or an export; Lens sends it only to api.github.com.</p>
    </Section>
  );
}

export function Setup() {
  const status = useLoad("status", L.status);
  const docs = useLoad("docs", L.docs);
  const audit = useLoad("audit", () => call<string[]>("mc_audit", { limit: 200 }));
  return (
    <Page title="Setup & audit" sub="Token, hotkey, where data comes from, and every write Mission Control has made.">
      <LoadState load={status}>
        {(s) => (
          <>
            <Section title="GitHub">
              <div className="mc-actions">
                <Pill tone={s.tokenSource === "none" ? "bad" : "ok"}>{s.tokenSource === "credentialManager" ? "Token in Credential Manager" : s.tokenSource === "ghCli" ? "Using gh CLI" : "No token"}</Pill>
                {s.rate ? <Muted>{s.rate.remaining}/{s.rate.limit} API requests left this hour</Muted> : null}
                {s.offline ? <Pill tone="warn">offline: cached data</Pill> : null}
                {s.tokenSource === "credentialManager" ? (
                  <Btn variant="danger" onClick={() => call("mc_token_forget").then(() => { toast("Token removed from Credential Manager.", { kind: "success" }); status.reload(); })}>
                    Forget token
                  </Btn>
                ) : null}
              </div>
            </Section>
            {s.tokenSource === "none" ? <Onboarding onDone={status.reload} /> : null}
            <Section title="Hotkey" sub="None by default. Ctrl+Alt+M is the tiler's Monocle key, so it isn't offered.">
              <div className="mc-seg" role="radiogroup" aria-label="Mission Control hotkey">
                {["", ...s.hotkeyChoices].map((h) => (
                  <button
                    key={h || "none"}
                    type="button"
                    role="radio"
                    aria-checked={(s.hotkey ?? "") === h}
                    data-weight="medium"
                    className={(s.hotkey ?? "") === h ? "is-on" : ""}
                    onClick={() => call("mc_set_hotkey", { spec: h }).then(status.reload).catch((e) => toast(String(e), { kind: "error" }))}
                  >
                    {h || "None"}
                  </button>
                ))}
              </div>
            </Section>
            <Section title="Folders">
              <p className="mc-body">
                Dev folder <Mono>{s.repoRoot ?? "not found"}</Mono>
              </p>
              <p className="mc-body">
                Mission Control data <Mono>{s.dataDir}</Mono> (cache, audit.jsonl, drafts, checks, decisions; gitignored)
              </p>
              <p className="mc-body">Known flakes: {s.knownFlakes.join(", ")}</p>
            </Section>
          </>
        )}
      </LoadState>
      <Section title="Where the data comes from">
        <LoadState load={docs}>
          {(d) => (
            <>
              <ul className="mc-files">
                {Object.entries(d.sources).map(([k, v]) => (
                  <li key={k}>
                    <Mono>{k}</Mono> <Muted>{v === "git" ? "local git (origin/…)" : v === "folder" ? "dev folder" : "GitHub API"}</Muted>
                  </li>
                ))}
              </ul>
              {d.missing.length ? (
                <>
                  <h3 className="mc-h3">Not found</h3>
                  <ul className="mc-files">
                    {d.missing.map((m) => (
                      <li key={m} className="mc-muted">
                        {m}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </LoadState>
      </Section>
      <Section title="Audit log" sub=".dev/mission-control/audit.jsonl" actions={<Btn onClick={audit.reload}>Refresh</Btn>}>
        <LoadState load={audit}>
          {(lines) => (
            <ul className="mc-list">
              {lines
                .map((l) => {
                  try {
                    return JSON.parse(l) as { atMs: number; phase: string; action: string; target: string; outcome: string; detail: string };
                  } catch {
                    return null;
                  }
                })
                .filter((x): x is NonNullable<typeof x> => !!x)
                .reverse()
                .map((e, i) => (
                  <li key={i} className="mc-row is-stack">
                    <div className="mc-row-line">
                      <Pill tone={e.outcome === "ok" ? "ok" : e.outcome.startsWith("failed") ? "bad" : "muted"}>{e.phase}</Pill>
                      <span className="mc-row-main">
                        {e.action} · {e.target}
                      </span>
                      <Muted>{fmtDate(new Date(e.atMs).toISOString())} · {e.outcome}</Muted>
                    </div>
                    <div className="mc-row-sub">{e.detail}</div>
                  </li>
                ))}
              {!lines.length ? <li className="mc-empty">No writes yet.</li> : null}
            </ul>
          )}
        </LoadState>
      </Section>
    </Page>
  );
}
