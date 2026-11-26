// The Dashboard's X lane (wave M2). Owner decision: embed only. With the person's OK, X's own
// timeline embed loads in an isolated frame; "Open X" opens the web app in Lens Browser. Lens never
// scrapes X, holds no X key and stores nothing from it — only the handle you typed, on this PC.
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import { widgetsApi, type WidgetsApi } from "./api";

const KEY = "lens.dashboard.x";

interface XPrefs {
  consent: boolean;
  handle: string;
}

const read = (): XPrefs => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v === "object") return { consent: !!v.consent, handle: typeof v.handle === "string" ? v.handle : "" };
  } catch {
    /* fall through */
  }
  return { consent: false, handle: "" };
};
const write = (p: XPrefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage can be unavailable; the lane just asks again next time */
  }
};

/** A handle X accepts: 1–15 letters, digits or underscores, with or without @. */
export function cleanHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : null;
}

export const embedUrl = (handle: string) => `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}?dnt=true`;

export const XLane: React.FC<{ api?: WidgetsApi; fetchOff?: boolean; initial?: XPrefs }> = ({ api = widgetsApi, fetchOff = false, initial }) => {
  const [prefs, setPrefs] = useState<XPrefs>(() => initial ?? read());
  const [draft, setDraft] = useState(prefs.handle);
  const handle = cleanHandle(draft);
  const save = (p: XPrefs) => {
    setPrefs(p);
    write(p);
  };
  const openX = (
    <button type="button" className="mwg-btn" onClick={() => void api.openUrl("https://x.com/home")}>
      <ExternalLink size={12} aria-hidden /> Open X
    </button>
  );

  if (!prefs.consent || !prefs.handle) {
    return (
      <div className="mwg mwg-consent" data-view="x-consent">
        <p>Show a public X timeline here using X's own embed.</p>
        <label className="mwg-field">
          <span>Account</span>
          <input value={draft} placeholder="@handle" onChange={(e) => setDraft(e.currentTarget.value)} />
        </label>
        <p className="mwg-fine">
          The embed loads from syndication.twitter.com in a separate, locked-down frame. X sees that you viewed it, like any embed. Lens doesn't read or keep anything from it.
        </p>
        <div className="mwg-bar">
          <button type="button" className="mwg-btn mwg-primary" disabled={!handle} onClick={() => handle && save({ consent: true, handle })}>
            Allow and show
          </button>
          {openX}
        </div>
      </div>
    );
  }

  return (
    <div className="mwg mwg-x" data-view="x">
      <div className="mwg-bar">
        {openX}
        <button type="button" className="mwg-link" onClick={() => save({ consent: false, handle: prefs.handle })}>
          Turn off embed
        </button>
      </div>
      {fetchOff ? (
        <p className="mwg-note">Widget fetching is turned off, so the embed is hidden.</p>
      ) : (
        <iframe
          className="mwg-x-frame"
          aria-label={`X timeline for @${prefs.handle}`}
          src={embedUrl(prefs.handle)}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
    </div>
  );
};
