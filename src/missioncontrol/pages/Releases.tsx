import React, { useMemo, useState } from "react";
import { call, gh, R } from "../api";
import { L } from "../loaders";
import { ciHealth } from "../model/pulse";
import { board } from "../model/pulse";
import { bumps, releaseChecklist, validTag, type ReleaseConfig } from "../model/release";
import { Btn, LoadState, Mono, Muted, Page, Pill, Section, copyText, fmtDate, useConfirm, useLoad } from "../ui";

export function Releases() {
  const confirm = useConfirm();
  const docs = useLoad("docs", L.docs);
  const status = useLoad("status", L.status);
  const releases = useLoad("releases", L.releases);
  const checks = useLoad("mainChecks", L.mainChecks);
  const prs = useLoad("prs", L.prs);
  const local = useLoad("local", L.local);
  const cfg = useLoad("releaseConfig", () => call<ReleaseConfig>("mc_release_config"));
  const head = useLoad("mainHead", () => gh<{ sha: string; commit?: { message?: string } }>(`${R}/commits/main`));
  const version = status.data?.version ?? "0.0.0";
  const b = bumps(version);
  const [tag, setTag] = useState("");
  const unreleasedCount = (docs.data?.unreleased ?? []).reduce((n, s) => n + s.items.length, 0);
  const health = ciHealth(checks.data?.data.check_runs ?? []);
  const list = useMemo(
    () => releaseChecklist(cfg.data ?? null, { unreleasedCount, mainGreen: checks.data ? health.health === "green" : null, versionMatches: tag ? tag.replace(/^v/, "").split("-")[0] === version : null, openBlocked: board(prs.data?.prs ?? []).BLOCKED.length }),
    [cfg.data, unreleasedCount, checks.data, health.health, tag, version, prs.data]
  );
  const sha = head.data?.data.sha ?? "";
  return (
    <Page title="Releases" sub="Prepare a release. Tagging is the owner's action and asks twice; signing secrets are checked by name only.">
      <Section title="Unreleased" sub={`${unreleasedCount} entries in CHANGELOG.md`}>
        <LoadState load={docs}>
          {(d) => (
            <div className="mc-cols">
              {d.unreleased.map((s) => (
                <div key={s.name} className="mc-col">
                  <h3 className="mc-h3">{s.name}</h3>
                  <ul className="mc-ul">
                    {s.items.map((i, k) => (
                      <li key={k}>{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {!d.unreleased.length ? <p className="mc-empty">No Unreleased section.</p> : null}
            </div>
          )}
        </LoadState>
      </Section>

      <Section title="Version" sub={`now ${version}`}>
        {b ? (
          <div className="mc-actions">
            {(["patch", "minor", "major"] as const).map((k) => (
              <Btn key={k} weight="medium" onClick={() => setTag(`v${b[k]}`)}>
                {k} → {b[k]}
              </Btn>
            ))}
          </div>
        ) : null}
        <p className="mc-body">
          Bump the same version in <Mono>src-tauri/tauri.conf.json</Mono>, <Mono>src-tauri/Cargo.toml</Mono> and <Mono>package.json</Mono>, move the Unreleased entries under it in a release PR, merge it, then tag.
        </p>
        {tag ? <Btn onClick={() => copyText(`npm pkg set version=${tag.slice(1)} && git commit -am "Release ${tag}"`, "Copied the bump commands")}>Copy bump commands</Btn> : null}
      </Section>

      <Section title="Release checklist">
        <ul className="mc-checklist">
          {list.map((c) => (
            <li key={c.id} className={c.ok ? "is-done" : ""}>
              <Pill tone={c.ok === null ? "muted" : c.ok ? "ok" : "bad"}>{c.ok === null ? "?" : c.ok ? "yes" : "no"}</Pill> {c.label} <Muted>{c.hint}</Muted>
            </li>
          ))}
        </ul>
        {cfg.data?.secretsReadable ? <p className="mc-foot">Secret names found: {cfg.data.secretNames.join(", ") || "none"}. Values are never read.</p> : null}
      </Section>

      <Section title="Tag" sub="Starts .github/workflows/release.yml">
        <div className="mc-actions">
          <input className="mc-input" aria-label="Tag" placeholder="v0.4.0" value={tag} onChange={(e) => setTag(e.target.value.trim())} />
          <Muted>
            at main <Mono>{sha.slice(0, 7) || "?"}</Mono>
          </Muted>
          <Btn weight="heavy" variant="danger" disabled={!validTag(tag) || sha.length !== 40} onClick={() => confirm({ kind: "tag", tag, sha })}>
            Create tag {tag || "…"}…
          </Btn>
        </div>
        {tag && !validTag(tag) ? <p className="mc-error">Use v&lt;major&gt;.&lt;minor&gt;.&lt;patch&gt;, optionally -beta.N, -rc.N or -nightly.N.</p> : null}
        <p className="mc-muted">By hand instead: git tag {tag || "v0.4.0"} {sha.slice(0, 7) || "<sha>"} &amp;&amp; git push origin {tag || "v0.4.0"}</p>
      </Section>

      <Section title="Channels" sub="Releases and their updater manifests">
        <LoadState load={releases}>
          {(r) => (
            <ul className="mc-list">
              {(Array.isArray(r.data) ? r.data : []).map((x) => (
                <li key={x.tag_name} className="mc-row">
                  <Pill tone={x.draft ? "muted" : x.prerelease ? "warn" : "ok"}>{x.draft ? "draft" : x.prerelease ? "beta" : "stable"}</Pill>
                  <span className="mc-row-main">
                    {x.tag_name} {x.name !== x.tag_name ? <Muted>{x.name}</Muted> : null}
                  </span>
                  <Muted>
                    {fmtDate(x.published_at)} · {x.assets.some((a) => a.name === "latest.json") ? "latest.json" : "no manifest"} · {x.assets.length} assets
                  </Muted>
                </li>
              ))}
            </ul>
          )}
        </LoadState>
      </Section>

      <Section title="Kill switches" sub="features.json on this PC; remote kill switches ship with a release">
        <LoadState load={local}>
          {(l) => (
            <ul className="mc-list">
              {l.killSwitches.map((k) => (
                <li key={k.id} className="mc-row">
                  <Pill tone={k.killed ? "bad" : "ok"}>{k.killed ? "off" : "on"}</Pill>
                  <span className="mc-row-main">{k.label}</span>
                  <Mono>{k.id}</Mono>
                </li>
              ))}
            </ul>
          )}
        </LoadState>
      </Section>
    </Page>
  );
}
