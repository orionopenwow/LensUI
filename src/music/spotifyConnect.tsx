// Connect Spotify: one sign-in flow shared by Settings > Music and the queue panel in Now Playing.
// Lens binds the sign-in port before the browser opens, so a busy port is reported here in plain
// words (or a fallback port is used and named) instead of the sign-in just never arriving.
import React, { useCallback, useEffect, useState } from "react";
import { openExternal } from "../ai/open";
import { music, type SpotifyStatus } from "./api";
import { connectError } from "./model";

export const DEFAULT_REDIRECTS = ["http://127.0.0.1:43117/callback", "http://127.0.0.1:43118/callback", "http://127.0.0.1:43119/callback"];

export function useSpotifyConnect(onConnected?: (s: SpotifyStatus) => void) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const connect = useCallback(async (clientId: string) => {
    setError(null);
    setNotice(null);
    try {
      const begin = await music.spotifyBegin(clientId.trim());
      setNotice(begin.notice ?? null);
      setConnecting(true);
      openExternal(begin.url);
      await music.spotifyFinish();
      setNotice(null);
      onConnected?.(await music.spotifyStatus());
    } catch (e) {
      setError(connectError(e));
    } finally {
      setConnecting(false);
    }
  }, [onConnected]);
  return { connecting, error, notice, connect };
}

/** The redirect addresses to register, the usual one first. */
export const RedirectList: React.FC<{ uris: string[] }> = ({ uris }) => (
  <>
    <span className="lm-mono">{uris[0]}</span>
    {uris.length > 1 && (
      <span> (optional, used only when that port is busy: {uris.slice(1).map((u, i) => <React.Fragment key={u}>{i > 0 && ", "}<span className="lm-mono">{u}</span></React.Fragment>)})</span>
    )}
  </>
);

/** The inline version for the queue panel: one button that opens the three steps in place. */
export const SpotifyConnectInline: React.FC<{ onConnected: () => void }> = ({ onConnected }) => {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [uris, setUris] = useState<string[]>(DEFAULT_REDIRECTS);
  const { connecting, error, notice, connect } = useSpotifyConnect(useCallback((s: SpotifyStatus) => s.connected && onConnected(), [onConnected]));
  useEffect(() => {
    if (!open) return;
    music.spotifyStatus().then((s) => s.redirectUris?.length && setUris(s.redirectUris)).catch(() => {});
  }, [open]);
  if (!open) {
    return <button type="button" data-weight="medium" className="lm-connect-btn" onClick={() => setOpen(true)}>Connect Spotify</button>;
  }
  const ready = clientId.trim().length === 32;
  return (
    <div className="lm-connect" role="group" aria-label="Connect Spotify">
      <ol className="lm-connect-steps">
        <li>Create a free app at <button type="button" data-weight="light" className="lm-connect-link" onClick={() => openExternal("https://developer.spotify.com/dashboard")}>developer.spotify.com/dashboard</button>.</li>
        <li>Add the redirect URI <RedirectList uris={uris} /> and tick Web API.</li>
        <li>Paste the app's client ID below. The sign-in is stored encrypted on this PC.</li>
      </ol>
      <input className="lm-connect-input lm-mono" placeholder="Client ID (32 characters)" aria-label="Spotify client ID" value={clientId} spellCheck={false}
        onChange={(e) => setClientId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ready && !connecting && void connect(clientId)} />
      <div className="lm-connect-actions">
        <button type="button" data-weight="heavy" className="lm-connect-btn" disabled={connecting || !ready} onClick={() => void connect(clientId)}>{connecting ? "Waiting for Spotify…" : "Connect"}</button>
        <button type="button" data-weight="medium" className="lm-connect-btn ghost" disabled={connecting} onClick={() => setOpen(false)}>Not now</button>
      </div>
      {notice && <div className="lm-connect-note" role="status">{notice}</div>}
      {error && <div className="lm-connect-note error" role="alert">{error}</div>}
      <div className="lm-connect-note">Spotify's rule for personal apps: the app owner needs Premium.</div>
    </div>
  );
};
