import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { feedsApi, rssSource, type FeedsSettings, type SourceView } from "../feeds/api";
import { SOURCES, sourceMeta } from "../feeds/model";
import { SourceDot } from "../feeds/FeedColumn";
import { browserOpen } from "../browser/api";
import "../feeds/Feeds.css";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const parseHhmm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return Math.min(1439, Math.max(0, (h || 0) * 60 + (m || 0)));
};

type Connect = "rss" | "bluesky" | "mastodon" | "github" | "x" | null;

/** Settings › Feeds. Credentials go straight to the sealed vault; this card never reads them back. */
export function FeedsCard() {
  const [s, setS] = useState<FeedsSettings | null>(null);
  const [sources, setSources] = useState<SourceView[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [connect, setConnect] = useState<Connect>(null);
  const [f, setF] = useState({ a: "", b: "", c: "" });

  useEffect(() => {
    feedsApi.settings().then(setS).catch(() => {});
    feedsApi.sources().then(setSources).catch(() => {});
    let un: (() => void) | null = null;
    // Mastodon sign-in: the backend hands us the server's own sign-in page to open.
    void listen<string>("lens://feeds/oauth-url", (e) => void browserOpen(e.payload).catch(() => {})).then((u) => (un = u));
    return () => un?.();
  }, []);

  if (!s) return null;
  const save = (patch: Partial<FeedsSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    void feedsApi.setSettings(next).then(setS).catch((e) => setMsg(String(e)));
  };
  const run = async (p: Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await p;
      setSources(await feedsApi.sources());
      setConnect(null);
      setF({ a: "", b: "", c: "" });
      setMsg(ok);
    } catch (e) {
      setMsg(String(e));
    }
  };
  const toggle = (on: boolean, label: string, onChange: () => void) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={onChange} />
  );
  const field = (k: "a" | "b" | "c", label: string, type = "text") => (
    <input className="cc-input" aria-label={label} placeholder={label} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} autoComplete="off" />
  );

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Feeds</div>
          <div className="cc-desc">One slim column for RSS, Bluesky, Mastodon, Reddit, GitHub and YouTube — official APIs and feeds only, no scraping. Tokens are sealed on this PC.</div>
        </div>
        {toggle(s.enabled, "Feeds", () => save({ enabled: !s.enabled }))}
      </div>

      <div className="cc-label" style={{ marginTop: 14 }}>Sources</div>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {sources.map((src) => (
          <div key={src.id} className="cc-row" style={{ gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <SourceDot source={src.kind} size={16} />
              <span style={{ minWidth: 0 }}>
                <div className="cc-label" style={{ fontSize: 12.5 }}>{src.label}</div>
                <div className="cc-desc">{src.connected ? sourceMeta(src.kind).route : "Needs sign-in again"}{src.dailyCap ? ` · max ${src.dailyCap} reads/day` : ""}</div>
              </span>
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {toggle(src.enabled, src.label, () => void run(feedsApi.toggleSource(src.id, !src.enabled), ""))}
              <button className="cc-btn" onClick={() => void run(feedsApi.removeSource(src.id), "Removed, and its sign-in was deleted.")}>Remove</button>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {(["rss", "bluesky", "mastodon", "github", "x"] as const).map((k) => (
          <button key={k} className={`cc-btn ${connect === k ? "active" : ""}`} onClick={() => setConnect(connect === k ? null : k)}>
            + {k === "rss" ? "Website / RSS / YouTube" : SOURCES[k].label}
          </button>
        ))}
      </div>

      {connect === "rss" ? (
        <div className="cc-row" style={{ marginTop: 8, gap: 6 }}>
          {field("a", "Feed URL or YouTube channel id (UC…)")}
          {field("b", "Name (optional)")}
          <button
            className="cc-btn"
            onClick={() =>
              void run(
                feedsApi.probe(f.a).then((p) => feedsApi.addSource(rssSource(p.url, f.b.trim() || p.title, p.kind === "youtube" ? "youtube" : "rss"))),
                "Feed added."
              )
            }
          >
            Add
          </button>
        </div>
      ) : null}
      {connect === "bluesky" ? (
        <div style={{ marginTop: 8 }}>
          <div className="cc-desc">Create an app password on Bluesky (Settings › Privacy and security › App passwords). Never use your main password.</div>
          <div className="cc-row" style={{ gap: 6, marginTop: 6 }}>
            {field("a", "Handle (you.bsky.social)")}
            {field("b", "App password", "password")}
            <button className="cc-btn" onClick={() => void run(feedsApi.connectBluesky(f.a, f.b), "Bluesky connected.")}>Connect</button>
          </div>
        </div>
      ) : null}
      {connect === "mastodon" ? (
        <div style={{ marginTop: 8 }}>
          <div className="cc-desc">Lens opens your server's own sign-in page; you approve there. Lens asks only to read your timeline and post when you approve.</div>
          <div className="cc-row" style={{ gap: 6, marginTop: 6 }}>
            {field("a", "Server (mastodon.social)")}
            <button className="cc-btn" onClick={() => void run(feedsApi.connectMastodon(f.a), "Mastodon connected.")}>Sign in</button>
          </div>
        </div>
      ) : null}
      {connect === "github" ? (
        <div style={{ marginTop: 8 }}>
          <div className="cc-desc">A classic personal access token with only the "notifications" scope.</div>
          <div className="cc-row" style={{ gap: 6, marginTop: 6 }}>
            {field("a", "GitHub username")}
            {field("b", "Token", "password")}
            <button className="cc-btn" onClick={() => void run(feedsApi.connectToken("github", f.a, f.b), "GitHub connected.")}>Connect</button>
          </div>
        </div>
      ) : null}
      {connect === "x" ? (
        <div style={{ marginTop: 8 }}>
          <div className="cc-desc">
            X's API is pay-per-use and billed to you. Without a key, add a profile or list as an official embedded timeline in the Feeds column instead. Lens never scrapes X.
          </div>
          <div className="cc-row" style={{ gap: 6, marginTop: 6 }}>
            {field("a", "Your X user id")}
            {field("b", "Your bearer token", "password")}
            {field("c", "Max reads/day (200)")}
            <button className="cc-btn" onClick={() => void run(feedsApi.connectToken("x", f.a, f.b, Number(f.c) || 200), "X connected — reads count against your own budget.")}>Connect</button>
          </div>
        </div>
      ) : null}

      <div className="cc-row" style={{ marginTop: 14 }}>
        <div>
          <div className="cc-label">Mute words</div>
          <div className="cc-desc">Words, @handles, or source:reddit — one per line. Muted posts are hidden everywhere, including the digest.</div>
        </div>
      </div>
      <textarea className="cc-input" aria-label="Mute words" rows={3} style={{ width: "100%", boxSizing: "border-box", marginTop: 6 }} defaultValue={s.mutes.join("\n")} onBlur={(e) => save({ mutes: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />

      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Quiet hours</div>
          <div className="cc-desc">No refreshes and no "new" pill between these times.</div>
        </div>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="cc-input" type="time" aria-label="Quiet from" value={hhmm(s.quietStartMin)} onChange={(e) => save({ quietStartMin: parseHhmm(e.target.value) })} />
          <input className="cc-input" type="time" aria-label="Quiet until" value={hhmm(s.quietEndMin)} onChange={(e) => save({ quietEndMin: parseHhmm(e.target.value) })} />
          {toggle(s.quietEnabled, "Quiet hours", () => save({ quietEnabled: !s.quietEnabled }))}
        </span>
      </div>

      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Refresh every</div>
          <div className="cc-desc">Each network also has its own polite rate limit.</div>
        </div>
        <select className="cc-input" aria-label="Refresh every" value={s.refreshMinutes} onChange={(e) => save({ refreshMinutes: Number(e.target.value) })}>
          {[5, 10, 15, 30, 60, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
        </select>
      </div>

      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">AI digest</div>
          <div className="cc-desc">Five bullets with sources. Runs on your local model unless your AI privacy setting allows cloud.</div>
        </div>
        {toggle(s.digestEnabled, "AI digest", () => save({ digestEnabled: !s.digestEnabled }))}
      </div>

      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">OPML</div>
          <div className="cc-desc">Bring your subscriptions from Feedly, Inoreader, NetNewsWire or any reader.</div>
        </div>
        <span style={{ display: "flex", gap: 6 }}>
          <label className="cc-btn">
            Import
            <input
              type="file"
              accept=".opml,.xml,text/xml"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void file.text().then((t) => run(feedsApi.importOpml(t).then((n) => setMsg(`${n} feeds added.`)), ""));
              }}
            />
          </label>
          <button
            className="cc-btn"
            onClick={() =>
              void feedsApi.exportOpml().then((xml) => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([xml], { type: "text/xml" }));
                a.download = "lens-feeds.opml";
                a.click();
              })
            }
          >
            Export
          </button>
        </span>
      </div>
      {msg ? <div className="cc-desc" role="status" style={{ marginTop: 10 }}>{msg}</div> : null}
    </div>
  );
}
