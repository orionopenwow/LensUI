import React from "react";
import { L } from "../loaders";
import { ago, devFolderLine } from "../model/pulse";
import { Btn, LoadState, Mono, Muted, Page, Pill, Section, copyText, fmtDate, refreshAll, useConfirm, useLoad } from "../ui";

export function DevFolder() {
  const confirm = useConfirm();
  const git = useLoad("git", L.git);
  const local = useLoad("local", L.local);
  return (
    <Page title="Dev folder" sub="The checkout this dev build runs from. Git runs with fixed arguments; nothing here resets or deletes your work." actions={<Btn onClick={git.reload}>Refresh</Btn>}>
      <LoadState load={git} empty="No dev folder found. Set repoRoot in Setup.">
        {(g) => (
          <>
            <Section title="Status" sub={g.root ?? undefined}>
              <p className="mc-body">{devFolderLine(g)}</p>
              <div className="mc-actions">
                <Pill tone={g.dirty ? "warn" : "ok"}>{g.dirty ? `${g.status.changed.length} changed` : "clean"}</Pill>
                <Pill tone={g.behindMain ? "warn" : "ok"}>{g.behindMain ? `${g.behindMain} behind main` : "up to date"}</Pill>
                <Muted>head <Mono>{g.head.slice(0, 7)}</Mono> · last fetch {g.lastFetchMs ? ago(g.lastFetchMs) : "never"}</Muted>
              </div>
              {g.dirty ? (
                <ul className="mc-files">
                  {g.status.changed.slice(0, 30).map((f) => (
                    <li key={f} className="mc-mono">
                      {f}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Section>
            <Section title="Sync to main" sub="git fetch, then fast-forward only">
              <div className="mc-actions">
                <Btn weight="heavy" variant="primary" disabled={g.dirty || g.status.branch !== "main"} onClick={() => confirm({ kind: "syncDevFolder" }, refreshAll)}>
                  Sync to main…
                </Btn>
                {g.dirty ? <Muted>Refused while files are changed.</Muted> : g.status.branch !== "main" ? <Muted>Only on main (now {g.status.branch}).</Muted> : null}
              </div>
            </Section>
            <Section title="Dev build">
              <div className="mc-actions">
                <Btn weight="heavy" onClick={() => confirm({ kind: "relaunch" })}>Rebuild and relaunch…</Btn>
                <Btn onClick={() => confirm({ kind: "clearCache" }, refreshAll)}>Clear Mission Control cache…</Btn>
                <Btn onClick={() => local.data && copyText(local.data.logPath, "Copied the log path")}>Copy log path</Btn>
              </div>
              <p className="mc-muted">Logs: {local.data?.logPath ?? "…"} · crash reports: {local.data?.crashDir ?? "…"}</p>
            </Section>
            <Section title=".dev/" sub="gitignored, this PC only">
              <ul className="mc-files">
                {g.devFiles.map((f) => (
                  <li key={f.name}>
                    <Mono>
                      {f.name}
                      {f.dir ? "/" : ""}
                    </Mono>{" "}
                    {f.dir ? null : <Muted>{(f.bytes / 1024).toFixed(1)} kB</Muted>}
                  </li>
                ))}
              </ul>
              <p className="mc-muted">bun.lock.installed: when packages were last installed · base / base.launched: shows setup once after an update · mission-control/: cache, audit log, drafts, checks.</p>
            </Section>
            <Section title="Recent commits">
              <ul className="mc-list">
                {g.log.map((c) => (
                  <li key={c.sha} className="mc-row">
                    <Mono>{c.sha.slice(0, 7)}</Mono>
                    <span className="mc-row-main">{c.subject}</span>
                    <Muted>{fmtDate(c.date)}</Muted>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </LoadState>
    </Page>
  );
}
