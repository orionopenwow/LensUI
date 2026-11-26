// Control Center card: Settings → Music (docs/MUSIC.md). Everything is off by default; network
// features (lyrics, Spotify, Last.fm) are separate opt-ins and say exactly what they send.
import React, { useEffect, useState } from "react";
import { currentTokens, music, type LastfmStatus, type MusicConfig, type SpicetifyPreview, type SpotifyStatus } from "../music/api";
import { openExternal } from "../ai/open";
import { DEFAULT_REDIRECTS, RedirectList, useSpotifyConnect } from "../music/spotifyConnect";
import "../music/music.css";

const DEFAULT: MusicConfig = {
  enabled: false,
  priority: ["spotify", "applemusic"],
  deny: [],
  allowOnly: [],
  miniPlayer: "dock",
  themeFollows: false,
  themeIntensity: 0.6,
  restoreDelayS: 20,
  lyrics: false,
  lyricsLrclib: true,
  lyricsFolder: null,
  lyricsOffsetMs: 0,
  windowStyle: "expanded",
  dither: true,
  sceneReactive: false,
  history: true,
  lastfm: false,
};

const Toggle: React.FC<{ on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, label, onChange, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`cc-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
);

const Row: React.FC<{ label: string; desc?: React.ReactNode; children: React.ReactNode; top?: number }> = ({ label, desc, children, top = 12 }) => (
  <div className="cc-row" style={{ marginTop: top, gap: 16 }}>
    <div style={{ minWidth: 0 }}>
      <div className="cc-label">{label}</div>
      {desc && <div className="cc-desc">{desc}</div>}
    </div>
    {children}
  </div>
);

export const MusicCard: React.FC = () => {
  const [cfg, setCfg] = useState<MusicConfig>(DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [lastfm, setLastfm] = useState<LastfmStatus | null>(null);
  const [lfKey, setLfKey] = useState("");
  const [lfSecret, setLfSecret] = useState("");
  const [spice, setSpice] = useState<SpicetifyPreview | null>(null);
  const [spiceAck, setSpiceAck] = useState(false);
  const [spiceDone, setSpiceDone] = useState<string[] | null>(null);
  const [newSource, setNewSource] = useState("");

  useEffect(() => {
    // Older backends (or a failed read) can answer null: keep the defaults and merge what arrives.
    music.config().then((c) => c && setCfg({ ...DEFAULT, ...c })).catch(() => {});
    music.spotifyStatus().then(setSpotify).catch(() => {});
    music.lastfmStatus().then(setLastfm).catch(() => {});
  }, []);

  const save = (patch: Partial<MusicConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    music.setConfig(next).then((c) => c && setCfg({ ...DEFAULT, ...c })).catch((e) => setError(String(e)));
  };
  const off = !cfg.enabled;

  const spotifyConnect = useSpotifyConnect(setSpotify);
  const connecting = spotifyConnect.connecting;
  const connectSpotify = () => {
    setError(null);
    void spotifyConnect.connect(clientId);
  };

  return (
    <div className="cc-card">
      <Row label="Music" top={0} desc="One now-playing view for every app that shows up in Windows' media controls: Spotify, Apple Music, your browser, VLC and more.">
        <Toggle on={cfg.enabled} label="Music" onChange={(v) => save({ enabled: v })} />
      </Row>
      <div className="cc-desc" style={{ marginTop: 8 }}>
        Lens reads the title, artist, artwork and position Windows already shares, and controls playback the same way your media keys do. Nothing leaves this PC unless you turn on lyrics, Spotify or Last.fm below.
      </div>

      <div className="cc-label" style={{ marginTop: 16 }}>Mini player</div>
      <div className="cc-chip-grid">
        {(["dock", "topbar", "off"] as const).map((m) => (
          <button key={m} type="button" disabled={off} className={`cc-chip ${cfg.miniPlayer === m ? "active" : ""}`} onClick={() => save({ miniPlayer: m })}>
            {m === "dock" ? "In the Dock" : m === "topbar" ? "In the Top Bar" : "Hidden"}
          </button>
        ))}
      </div>

      <div className="cc-label" style={{ marginTop: 16 }}>Now Playing window</div>
      <div className="cc-chip-grid">
        {(["compact", "expanded", "fullscreen"] as const).map((m) => (
          <button key={m} type="button" disabled={off} className={`cc-chip ${cfg.windowStyle === m ? "active" : ""}`} onClick={() => save({ windowStyle: m })}>
            {m === "compact" ? "Compact" : m === "expanded" ? "Expanded" : "Full screen"}
          </button>
        ))}
      </div>
      <Row label="Dither texture" desc="Lens's halftone grain over the blurred artwork.">
        <Toggle on={cfg.dither} label="Dither texture" disabled={off} onChange={(v) => save({ dither: v })} />
      </Row>

      <Row label="Sources" desc="Apps shown first when several are playing. Hidden apps are never shown.">
        <span />
      </Row>
      <div className="cc-chip-grid">
        {cfg.priority.map((p, i) => (
          <span key={`p-${p}`} className="cc-chip active">
            {i + 1}. {p}
            <button type="button" aria-label={`Remove ${p}`} disabled={off} style={{ marginLeft: 6, background: "none", border: 0, color: "inherit", cursor: "pointer" }}
              onClick={() => save({ priority: cfg.priority.filter((x) => x !== p) })}>×</button>
          </span>
        ))}
        {cfg.deny.map((p) => (
          <span key={`d-${p}`} className="cc-chip">
            Hidden: {p}
            <button type="button" aria-label={`Show ${p} again`} disabled={off} style={{ marginLeft: 6, background: "none", border: 0, color: "inherit", cursor: "pointer" }}
              onClick={() => save({ deny: cfg.deny.filter((x) => x !== p) })}>×</button>
          </span>
        ))}
      </div>
      <div className="cc-row" style={{ marginTop: 8, gap: 8, justifyContent: "flex-start" }}>
        <input className="cc-input" style={{ width: 180 }} placeholder="e.g. spotify, msedge, vlc" aria-label="App name" value={newSource} disabled={off}
          onChange={(e) => setNewSource(e.target.value)} />
        <button type="button" className="cc-btn" disabled={off || !newSource.trim()} onClick={() => (save({ priority: [...cfg.priority, newSource.trim().toLowerCase()] }), setNewSource(""))}>Prefer</button>
        <button type="button" className="cc-btn cc-btn-ghost" disabled={off || !newSource.trim()} onClick={() => (save({ deny: [...cfg.deny, newSource.trim().toLowerCase()] }), setNewSource(""))}>Hide</button>
      </div>

      <Row label="Theme follows the music" desc="Fades your accent towards the artwork's colour while something plays, then back. Never during games or full-screen apps, and nothing is saved.">
        <Toggle on={cfg.themeFollows} label="Theme follows the music" disabled={off} onChange={(v) => save({ themeFollows: v })} />
      </Row>
      {cfg.themeFollows && !off && (
        <>
          <Row label="Strength" desc={`${Math.round(cfg.themeIntensity * 100)} %`}>
            <input type="range" min={0.1} max={1} step={0.05} value={cfg.themeIntensity} aria-label="Strength" onChange={(e) => save({ themeIntensity: Number(e.target.value) })} />
          </Row>
          <Row label="Back to your accent after" desc={`${cfg.restoreDelayS} s of silence`}>
            <input type="range" min={0} max={120} step={5} value={cfg.restoreDelayS} aria-label="Restore delay" onChange={(e) => save({ restoreDelayS: Number(e.target.value) })} />
          </Row>
        </>
      )}

      <Row label="Synced lyrics" desc={<>Asks <button type="button" className="md-link" onClick={() => openExternal("https://lrclib.net")}>LRCLIB</button>, a free open lyrics database, with only the song title, artist, album and length. Results are cached on this PC.</>}>
        <Toggle on={cfg.lyrics} label="Synced lyrics" disabled={off} onChange={(v) => save({ lyrics: v })} />
      </Row>
      {cfg.lyrics && !off && (
        <>
          <Row label="Use LRCLIB" desc="Turn off to use only your own .lrc files.">
            <Toggle on={cfg.lyricsLrclib} label="Use LRCLIB" onChange={(v) => save({ lyricsLrclib: v })} />
          </Row>
          <Row label="Your .lrc folder" desc='Files named "Artist - Title.lrc" or "Title.lrc" win over LRCLIB.'>
            <input className="cc-input" style={{ width: 220 }} defaultValue={cfg.lyricsFolder ?? ""} placeholder="C:\Music\Lyrics" aria-label="Lyrics folder"
              onBlur={(e) => save({ lyricsFolder: e.target.value.trim() || null })} />
          </Row>
          <Row label="Timing" desc={`${cfg.lyricsOffsetMs > 0 ? "+" : ""}${(cfg.lyricsOffsetMs / 1000).toFixed(1)} s (positive shows lines earlier)`}>
            <span style={{ display: "inline-flex", gap: 4 }}>
              <button type="button" className="cc-btn cc-btn-ghost" onClick={() => save({ lyricsOffsetMs: cfg.lyricsOffsetMs - 250 })} aria-label="Lyrics later">−0.25 s</button>
              <button type="button" className="cc-btn cc-btn-ghost" onClick={() => save({ lyricsOffsetMs: 0 })}>Reset</button>
              <button type="button" className="cc-btn cc-btn-ghost" onClick={() => save({ lyricsOffsetMs: cfg.lyricsOffsetMs + 250 })} aria-label="Lyrics earlier">+0.25 s</button>
            </span>
          </Row>
          <div className="cc-row" style={{ marginTop: 8, justifyContent: "flex-start" }}>
            <button type="button" className="cc-btn cc-btn-ghost" onClick={() => music.clearLyricsCache().catch((e) => setError(String(e)))}>Clear lyrics cache</button>
          </div>
        </>
      )}

      <Row label="Now Playing wallpaper moves to the music" desc="The Playground scene reads your speakers' volume level, a single number. No sound is recorded or stored.">
        <Toggle on={cfg.sceneReactive} label="Audio-reactive scene" disabled={off} onChange={(v) => save({ sceneReactive: v })} />
      </Row>
      <Row label="Recently played in Lens" desc="Keeps the last 100 songs on this PC so the Now Playing window can list them.">
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="cc-btn cc-btn-ghost" disabled={off} onClick={() => music.clearHistory().catch((e) => setError(String(e)))}>Clear</button>
          <Toggle on={cfg.history} label="Recently played" disabled={off} onChange={(v) => save({ history: v })} />
        </span>
      </Row>

      {/* ---------------------------------------------------------------- Spotify */}
      <div className="cc-label" style={{ marginTop: 20 }}>Connect Spotify (optional)</div>
      <div className="cc-desc">
        Windows only shares the current song. Connecting Spotify's official Web API adds your real queue, add to queue, your playlists, "More by" and saving songs.
        It uses your own free Spotify developer app; the sign-in is stored encrypted on this PC.
      </div>
      {spotify?.connected ? (
        <div className="cc-row" style={{ marginTop: 8 }}>
          <div className="cc-desc">Connected with client {spotify.clientId?.slice(0, 6)}…</div>
          <button type="button" className="cc-btn cc-btn-ghost" onClick={() => music.spotifyDisconnect().then(() => music.spotifyStatus().then(setSpotify))}>Disconnect</button>
        </div>
      ) : (
        <>
          <ol className="cc-desc" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>Create an app at <button type="button" className="md-link" onClick={() => openExternal("https://developer.spotify.com/dashboard")}>developer.spotify.com/dashboard</button>.</li>
            <li>Add the redirect URI <RedirectList uris={spotify?.redirectUris?.length ? spotify.redirectUris : DEFAULT_REDIRECTS} /> and tick Web API.</li>
            <li>Paste its client ID here. Spotify asks you to approve these permissions:</li>
          </ol>
          <ul className="cc-desc" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {(spotify?.scopes ?? []).map(([scope, why]) => <li key={scope}>{why} <span className="lm-mono" style={{ opacity: 0.6 }}>({scope})</span></li>)}
          </ul>
          <div className="cc-desc" style={{ marginTop: 4 }}>Spotify's rules for personal developer apps: the app owner needs Premium and only accounts you add to the app (up to 5) can use it.</div>
          <div className="cc-row" style={{ marginTop: 8, gap: 8, justifyContent: "flex-start" }}>
            <input className="cc-input" style={{ width: 280 }} placeholder="Client ID (32 characters)" aria-label="Spotify client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <button type="button" className="cc-btn" disabled={connecting || clientId.trim().length !== 32} onClick={connectSpotify}>{connecting ? "Waiting for Spotify…" : "Connect"}</button>
          </div>
          {spotifyConnect.notice && <div className="cc-desc lm-card-note" role="status">{spotifyConnect.notice}</div>}
          {spotifyConnect.error && <div className="cc-desc lm-card-note error" role="alert">{spotifyConnect.error}</div>}
        </>
      )}
      <div className="cc-desc" style={{ marginTop: 8 }}>
        Apple Music: Windows only shares what's playing, so Lens shows it like any other app. If you want Apple Music itself themed, Cider is a third-party client with its own themes.
      </div>

      {/* ---------------------------------------------------------------- Last.fm */}
      <Row label="Scrobble to Last.fm" desc="Sends songs you listened to (more than half, or 4 minutes) to your own Last.fm account.">
        <Toggle on={cfg.lastfm} label="Scrobble to Last.fm" disabled={off || !lastfm?.connected} onChange={(v) => save({ lastfm: v })} />
      </Row>
      {lastfm?.connected ? (
        <div className="cc-row" style={{ marginTop: 8 }}>
          <div className="cc-desc">Connected as {lastfm.username}</div>
          <button type="button" className="cc-btn cc-btn-ghost" onClick={() => music.lastfmDisconnect().then(() => (save({ lastfm: false }), music.lastfmStatus().then(setLastfm)))}>Disconnect</button>
        </div>
      ) : (
        <div className="cc-row" style={{ marginTop: 8, gap: 8, justifyContent: "flex-start", flexWrap: "wrap" }}>
          <input className="cc-input" style={{ width: 200 }} placeholder="API key" aria-label="Last.fm API key" value={lfKey} onChange={(e) => setLfKey(e.target.value)} />
          <input className="cc-input" type="password" style={{ width: 200 }} placeholder="Shared secret" aria-label="Last.fm shared secret" value={lfSecret} onChange={(e) => setLfSecret(e.target.value)} />
          {lastfm?.pending ? (
            <button type="button" className="cc-btn" onClick={() => music.lastfmFinish().then(() => music.lastfmStatus().then(setLastfm)).catch((e) => setError(String(e)))}>I approved it</button>
          ) : (
            <button type="button" className="cc-btn" disabled={!lfKey || !lfSecret} onClick={() => music.lastfmBegin(lfKey, lfSecret).then((u) => (openExternal(u), music.lastfmStatus().then(setLastfm))).catch((e) => setError(String(e)))}>Connect</button>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- Spicetify */}
      <div className="cc-label" style={{ marginTop: 20 }}>Spotify theme for Spicetify (optional)</div>
      <div className="cc-desc">
        Lens can write a "Lens" theme in your current colours for Spicetify, a separate tool that restyles the Spotify app. Lens never changes Spotify itself and never runs Spicetify:
        you apply the theme yourself. Spotify updates undo it, and changing the Spotify app may go against Spotify's terms, so it's your call.
      </div>
      <div className="cc-row" style={{ marginTop: 8, gap: 8, justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button type="button" className="cc-btn cc-btn-ghost" onClick={() => music.spicetifyPreview(currentTokens()).then(setSpice).catch((e) => setError(String(e)))}>Preview theme files</button>
        <label className="cc-desc" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={spiceAck} onChange={(e) => setSpiceAck(e.target.checked)} /> Also copy it into Spicetify's Themes folder
        </label>
        <button type="button" className="cc-btn" onClick={() => music.spicetifyExport(currentTokens(), spiceAck).then(setSpiceDone).catch((e) => setError(String(e)))}>Export theme</button>
      </div>
      {spiceDone && <div className="cc-desc" style={{ marginTop: 6 }}>Saved to: {spiceDone.join(" and ")}</div>}
      {spice && (
        <div className="cc-desc" style={{ marginTop: 8 }}>
          {spice.installed ? "Spicetify looks installed. Run:" : "Then run:"}
          <pre className="lm-mono" style={{ margin: "6px 0", padding: 8, borderRadius: 6, background: "var(--lens-bg-surface)", whiteSpace: "pre-wrap" }}>
            {spice.instructions.join("\n")}
          </pre>
          <details>
            <summary>color.ini and user.css</summary>
            <pre className="lm-mono" style={{ maxHeight: 200, overflow: "auto", fontSize: 11 }}>{spice.colorIni}</pre>
            <pre className="lm-mono" style={{ maxHeight: 200, overflow: "auto", fontSize: 11 }}>{spice.userCss}</pre>
          </details>
        </div>
      )}

      {error && <div className="cc-desc" role="alert" style={{ marginTop: 12, color: "var(--lens-danger)" }}>{error}</div>}
    </div>
  );
};

export default MusicCard;
