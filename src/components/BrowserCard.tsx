import React, { useEffect, useState } from "react";
import {
  blockingStatus, blockingUpdate, browserOpen, browserState, historyClear, permissionForget, permissionsList, settingsSet, type BlockingStatus, type BrowserSettings, type SitePermissions,
} from "../browser/api";
import { SitePermissionsList } from "../browser/SitePermissions";

const ENGINES: [string, string][] = [
  ["https://duckduckgo.com/?q={q}", "DuckDuckGo"],
  ["https://www.google.com/search?q={q}", "Google"],
  ["https://www.bing.com/search?q={q}", "Bing"],
  ["https://search.brave.com/search?q={q}", "Brave Search"],
  ["https://www.startpage.com/do/search?q={q}", "Startpage"],
];

/** Settings › AI & Command › Lens Browser. */
export function BrowserCard() {
  const [s, setS] = useState<BrowserSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [perms, setPerms] = useState<SitePermissions>({});
  const [lists, setLists] = useState<BlockingStatus | null>(null);
  useEffect(() => {
    browserState().then((v) => setS(v.state.settings)).catch(() => {});
    permissionsList().then(setPerms).catch(() => {});
    blockingStatus().then(setLists).catch(() => {});
  }, []);
  const save = (patch: Partial<BrowserSettings>) => {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    void settingsSet(next).catch((e) => setMsg(String(e)));
  };
  if (!s) return null;
  const toggle = (on: boolean, label: string, key: keyof BrowserSettings) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={() => save({ [key]: !on } as Partial<BrowserSettings>)} />
  );
  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Lens Browser</div>
          <div className="cc-desc">
            Spaces, vertical tabs, the Lens right-click menu, YouTube transcripts, and an agent that always asks before it submits. It keeps its own
            sign-ins, separate from your main browser, and nothing syncs.
          </div>
        </div>
        <button className="cc-btn" onClick={() => void browserOpen().catch((e) => setMsg(String(e)))}>Open</button>
      </div>
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Sleep tabs after</div>
          <div className="cc-desc">Sleeping tabs keep their place but free their memory. Tabs playing sound stay awake.</div>
        </div>
        <select className="cc-input" aria-label="Sleep tabs after" value={s.sleepAfterMin} onChange={(e) => save({ sleepAfterMin: Number(e.target.value) })}>
          {[0, 5, 15, 30, 60, 240].map((m) => (
            <option key={m} value={m}>{m === 0 ? "Never" : m < 60 ? `${m} min` : `${m / 60} h`}</option>
          ))}
        </select>
      </div>
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Tabs awake at most</div>
          <div className="cc-desc">Older tabs sleep first.</div>
        </div>
        <select className="cc-input" aria-label="Tabs awake at most" value={s.maxLiveTabs} onChange={(e) => save({ maxLiveTabs: Number(e.target.value) })}>
          {[2, 4, 6, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div className="cc-label">Search with</div>
        <select className="cc-input" aria-label="Search engine" value={s.searchUrl} onChange={(e) => save({ searchUrl: e.target.value })}>
          {ENGINES.map(([u, n]) => <option key={u} value={u}>{n}</option>)}
        </select>
      </div>
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Lens blocks ads and trackers</div>
          <div className="cc-desc">
            Filters what pages load (scripts, images, frames) with EasyList and EasyPrivacy, downloaded from easylist.to and refreshed weekly, plus Lens's own short list.
            Only Lens Browser's tabs are affected. Turn it off for one site with the shield in the address bar.
          </div>
          {lists ? <BlockingLists status={lists} onUpdate={() => void blockingUpdate().then(setLists).catch((e) => setMsg(String(e)))} /> : null}
          {(s.blockingAllow ?? []).length ? (
            <ul className="cc-list" aria-label="Sites where ads are allowed">
              {(s.blockingAllow ?? []).map((site) => (
                <li key={site} className="cc-row">
                  <span className="cc-desc">{site}</span>
                  <button className="cc-btn-ghost" data-weight="medium" onClick={() => save({ blockingAllow: (s.blockingAllow ?? []).filter((x) => x !== site) })}>Block again</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {toggle(s.blockTrackers, "Lens blocks ads and trackers", "blockTrackers")}
      </div>
      <div className="cc-row cc-row-gap">
        <div>
          <div className="cc-label">Site icons</div>
          <div className="cc-desc">Lens fetches each site's icon once, from that site, and keeps it on this PC. Off: letter icons, nothing fetched.</div>
        </div>
        {toggle(s.favicons !== false, "Site icons", "favicons")}
      </div>
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Lens right-click menu on pages</div>
          <div className="cc-desc">Hold Shift while right-clicking for the page's own menu.</div>
        </div>
        {toggle(s.lensContextMenu, "Lens right-click menu on pages", "lensContextMenu")}
      </div>
      <div className="cc-row cc-row-gap">
        <div>
          <div className="cc-label">Lens buttons on pages</div>
          <div className="cc-desc">A tiny Lens orb beside tweets, YouTube's player, videos, images, 3D models, code and downloads. Applies to tabs opened after you turn it on.</div>
        </div>
        {toggle(!!s.pageMarks, "Lens buttons on pages", "pageMarks")}
      </div>
      <div className="cc-row cc-row-gap">
        <div>
          <div className="cc-label">Site permissions</div>
          <div className="cc-desc">Camera, microphone, location, notifications, clipboard and several downloads at once. Sites ask first; forget an answer and the site asks again.</div>
          <SitePermissionsList saved={perms} onForget={(o, k) => void permissionForget(o, k).then(setPerms).catch((e) => setMsg(String(e)))} />
        </div>
      </div>
      <div className="cc-row" style={{ marginTop: 12, justifyContent: "flex-start", gap: 8 }}>
        <button className="cc-btn-ghost" onClick={() => void historyClear(Date.now() - 3600_000).then(() => setMsg("Cleared the last hour of history.")).catch((e) => setMsg(String(e)))}>Clear last hour</button>
        <button className="cc-btn-ghost" onClick={() => void historyClear(0).then(() => setMsg("Cleared all browsing history.")).catch((e) => setMsg(String(e)))}>Clear all history</button>
      </div>
      {msg ? <div className="cc-desc" role="status" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>
  );
}

/** Which filter lists are loaded, when they were fetched, and their licences. */
function BlockingLists({ status, onUpdate }: { status: BlockingStatus; onUpdate(): void }) {
  const when = (ms: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "not yet");
  return (
    <div className="cc-desc cc-lists">
      <span className="cc-num">{status.rules.toLocaleString()} rules</span>
      {status.lists.map((l) => (
        <span key={l.id}> · {l.name} ({when(l.fetchedMs)}, {l.licence.split(",")[0]})</span>
      ))}{" "}
      <button className="cc-btn-ghost" data-weight="medium" disabled={status.updating} onClick={onUpdate}>{status.updating ? "Updating…" : "Update now"}</button>
    </div>
  );
}
