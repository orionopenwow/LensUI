import React, { useEffect, useState } from "react";
import {
  blockingStatus, blockingUpdate, browserOpen, browserState, faviconsClear, historyClear, linkRuleAdd, linkRuleRemove, permissionForget, permissionsList, sentRequests, settingsSet,
  type BlockingStatus, type BrowserSettings, type LinkRule, type SentRequest, type SitePermissions, type Space,
} from "../browser/api";
import { cleanValue, ruleLine, RULE_KINDS } from "../browser/linkRules";
import { SENDS } from "../browser/setupFlow";
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
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [sent, setSent] = useState<SentRequest[] | null>(null);
  useEffect(() => {
    browserState().then((v) => { setS(v.state.settings); setSpaces(v.state.spaces); }).catch(() => {});
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
        <span className="cc-btn-row">
          <button className="cc-btn-ghost" data-weight="medium" onClick={() => { const next = { ...s, setupSeen: false }; setS(next); void settingsSet(next).then(() => browserOpen()).catch((e) => setMsg(String(e))); }}>Run setup again</button>
          <button className="cc-btn" data-weight="medium" onClick={() => void browserOpen().catch((e) => setMsg(String(e)))}>Open</button>
        </span>
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
          <div className="cc-label">Link rules</div>
          <div className="cc-desc">Send links that arrive from another app or site to a space: "links from Slack go to Work", "github.com goes to Code". The first rule that fits wins.</div>
          <LinkRules rules={s.linkRules ?? []} spaces={spaces} onAdd={(w, v, sp) => void linkRuleAdd(w, v, sp).then((view) => setS(view.state.settings)).catch((e) => setMsg(String(e)))} onRemove={(id) => void linkRuleRemove(id).then((view) => setS(view.state.settings)).catch((e) => setMsg(String(e)))} />
        </div>
      </div>
      <div className="cc-row cc-row-gap">
        <div>
          <div className="cc-label">Privacy: what is sent</div>
          <div className="cc-desc">Besides the pages you open (which talk to their own sites, as in any browser), Lens Browser itself sends only these. No telemetry, no history, no page text.</div>
          <ul className="cc-list" aria-label="What Lens Browser sends">
            {SENDS.map((x) => <li key={x.what} className="cc-desc"><b>{x.what}</b> to {x.to}. {x.when}.</li>)}
          </ul>
          <span className="cc-btn-row">
            <button className="cc-btn-ghost" data-weight="medium" onClick={() => void sentRequests().then(setSent).catch((e) => setMsg(String(e)))}>Show what was sent this session</button>
            <button className="cc-btn-ghost" data-weight="medium" onClick={() => void faviconsClear().then(() => setMsg("Forgot every saved site icon.")).catch((e) => setMsg(String(e)))}>Forget site icons</button>
          </span>
          {sent ? (
            sent.length ? (
              <ul className="cc-list" aria-label="Sent this session">
                {sent.slice(0, 20).map((x, i) => <li key={i} className="cc-desc cc-num">{new Date(x.atMs).toLocaleTimeString()} · {x.purpose === "filter_list" ? "filter list" : "site icon"} · {x.host}{x.ok ? "" : " (failed)"}</li>)}
              </ul>
            ) : <div className="cc-desc">Nothing sent yet this session.</div>
          ) : null}
        </div>
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

/** Link rules: the list, and a one-line form to add one. */
function LinkRules({ rules, spaces, onAdd, onRemove }: { rules: LinkRule[]; spaces: Space[]; onAdd(when: LinkRule["when"], value: string, space: string): void; onRemove(id: string): void }) {
  const [when, setWhen] = useState<LinkRule["when"]>("domain");
  const [value, setValue] = useState("");
  const [space, setSpace] = useState(spaces[0]?.id ?? "");
  const clean = cleanValue(when, value);
  const kind = RULE_KINDS.find((k) => k.id === when)!;
  return (
    <div className="cc-rules">
      {rules.length ? (
        <ul className="cc-list" aria-label="Link rules">
          {rules.map((r) => (
            <li key={r.id} className="cc-row">
              <span className="cc-desc">{ruleLine(r, spaces)}</span>
              <button className="cc-btn-ghost" data-weight="medium" aria-label={`Remove: ${ruleLine(r, spaces)}`} onClick={() => onRemove(r.id)}>Remove</button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="cc-btn-row" role="group" aria-label="Add a link rule">
        <select className="cc-input" aria-label="Rule kind" value={when} onChange={(e) => setWhen(e.target.value as LinkRule["when"])}>
          {RULE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input className="cc-input" aria-label={kind.label} placeholder={kind.hint} value={value} onChange={(e) => setValue(e.target.value)} />
        <select className="cc-input" aria-label="Open in space" value={space || spaces[0]?.id || ""} onChange={(e) => setSpace(e.target.value)}>
          {spaces.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </select>
        <button className="cc-btn" data-weight="medium" disabled={!clean || !(space || spaces[0])} onClick={() => { onAdd(when, value, space || spaces[0].id); setValue(""); }}>Add</button>
      </div>
    </div>
  );
}
