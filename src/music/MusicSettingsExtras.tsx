// Settings › Music additions: the first-run mini setup, Immersive and artwork colours, lyric
// translation, Discord Rich Presence and the grouped Tweaks rows. Everything that talks to another
// program or service starts off and says what it sends. Rendered inside MusicCard.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { glide } from "../ui/motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openExternal } from "../ai/open";
import { EVENT_REMOTE, music, type DiscordStatus, type EqStatus, type MusicConfig, type RemoteInfo } from "./api";
import { encodeQr, qrSvg } from "./qr";
import { remoteLine } from "./remoteText";
import { defaultLanguage } from "./translate";
import { setupSteps, type SetupStep } from "./setup";

type Save = (patch: Partial<MusicConfig>) => void;

const Toggle: React.FC<{ on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, label, onChange, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} data-weight="medium" className={`cc-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
);

const Row: React.FC<{ label: string; desc?: React.ReactNode; children: React.ReactNode }> = ({ label, desc, children }) => (
  <div className="cc-row lm-set-row">
    <div className="lm-set-text">
      <div className="cc-label">{label}</div>
      {desc && <div className="cc-desc">{desc}</div>}
    </div>
    {children}
  </div>
);

const scrollToGuide = (id: string) => document.querySelector(`[data-guide-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

// ------------------------------------------------------------------------------ first-run setup

export const MusicSetup: React.FC<{ cfg: MusicConfig; save: Save; spotifyConnected: boolean; lastfmConnected: boolean }> = ({ cfg, save, spotifyConnected, lastfmConnected }) => {
  const steps = setupSteps();
  const [i, setI] = useState(0);
  const dir = useRef(1);
  const body = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Content swaps slide 6 px in the direction of travel and crossfade (DESIGN.md §5.3).
  useLayoutEffect(() => {
    glide(body.current, { x: 6 * dir.current, opacity: 0 }, { x: 0, opacity: 1 }, { duration: "base", ease: "out" });
  }, [i]);
  const go = (n: number) => {
    dir.current = n > i ? 1 : -1;
    setI(Math.max(0, Math.min(steps.length - 1, n)));
  };
  const step: SetupStep = steps[i];
  const finish = () => save({ setupDone: true });
  return (
    <section ref={root} className="lm-setup" aria-label="Set up Lens Music" data-guide-id="music.setup">
      <div className="lm-setup-head">
        <div className="cc-label">Set up Lens Music</div>
        <span className="lm-setup-count lm-mono">{i + 1} of {steps.length}</span>
      </div>
      <div ref={body} className="lm-setup-body">
        <div className="lm-setup-title">{step.title}</div>
        <div className="cc-desc">{step.desc}</div>
        {step.id === "sources" && (
          <>
            <Row label="Windows media controls" desc="Spotify, Apple Music, browser tabs and any player that shows up in Windows' media controls. This is Lens Music itself.">
              <Toggle on={cfg.enabled} label="Lens Music" onChange={(v) => save({ enabled: v })} />
            </Row>
            <Row label="Spotify" desc={spotifyConnected ? "Connected: your real queue and playlists show in Now Playing." : "Optional: your real queue, playlists and likes, with your own free Spotify developer app."}>
              <button type="button" data-weight="medium" className="cc-btn cc-btn-ghost" onClick={() => scrollToGuide("music.spotify")}>{spotifyConnected ? "Connected" : "Connect…"}</button>
            </Row>
            <Row label="Your .lrc lyrics folder" desc='Optional. Files named "Artist - Title.lrc" are used first, and stay on this PC.'>
              <input className="cc-input lm-set-input" defaultValue={cfg.lyricsFolder ?? ""} placeholder="C:\Music\Lyrics" aria-label="Lyrics folder"
                onBlur={(e) => save({ lyricsFolder: e.target.value.trim() || null, lyrics: e.target.value.trim() ? true : cfg.lyrics })} />
            </Row>
          </>
        )}
        {step.id === "lyrics" && (
          <>
            <Row label="Synced lyrics from LRCLIB" desc="Sends only the title, artist, album and length to LRCLIB, a free open lyrics database. Answers are cached on this PC.">
              <Toggle on={cfg.lyrics && cfg.lyricsLrclib} label="Synced lyrics from LRCLIB" disabled={!cfg.enabled} onChange={(v) => save({ lyrics: v || !!cfg.lyricsFolder, lyricsLrclib: v })} />
            </Row>
            <Row label="Scrobble to Last.fm" desc={lastfmConnected ? "Connected." : "Sends what you listened to, to your own Last.fm account. Connect it further down."}>
              <button type="button" data-weight="medium" className="cc-btn cc-btn-ghost" onClick={() => scrollToGuide("music.lastfm")}>{lastfmConnected ? "Connected" : "Set up…"}</button>
            </Row>
          </>
        )}
        {step.id === "share" && (
          <>
            <Row label="Discord" desc="Shows what you're listening to on your Discord profile, through the Discord app on this PC. Needs your own Discord application ID.">
              <button type="button" data-weight="medium" className="cc-btn cc-btn-ghost" onClick={() => scrollToGuide("music.discord")}>Set up…</button>
            </Row>
            <Row label="Control from your phone" desc="Lens Remote, a small remote on your home network, is a Tester mode preview for now (Settings › About & Testing). It stays off until you turn it on further down.">
              <span className="cc-desc">Preview</span>
            </Row>
          </>
        )}
      </div>
      <div className="lm-setup-actions">
        <button type="button" data-weight="light" className="cc-btn cc-btn-ghost" onClick={finish}>Skip</button>
        <span className="lm-spacer" />
        {i > 0 && <button type="button" data-weight="medium" className="cc-btn cc-btn-ghost" onClick={() => go(i - 1)}>Back</button>}
        {i < steps.length - 1 ? (
          <button type="button" data-weight="medium" className="cc-btn" onClick={() => go(i + 1)}>Next</button>
        ) : (
          <button type="button" data-weight="heavy" className="cc-btn" onClick={finish}>Done</button>
        )}
      </div>
    </section>
  );
};

// ------------------------------------------------------------------------------ Immersive + art colours

export const MusicImmersiveRows: React.FC<{ cfg: MusicConfig; save: Save; off: boolean }> = ({ cfg, save, off }) => (
  <>
    <div className="cc-label lm-settings-head">Immersive</div>
    <div className="cc-desc">
      Now Playing full screen on one monitor: big artwork, its colours drifting slowly behind it, and big synced lyrics. Open it with the button in Now Playing (or F11), from the Dock music card, or type "immersive" in Command. Esc leaves. It never opens over a full-screen game or film.
    </div>
    <Row label="Artwork colours in Now Playing" desc="Buttons and the seek bar take a colour from the artwork when it's readable (4.5:1 or better). Otherwise your theme accent.">
      <Toggle on={cfg.artTint} label="Artwork colours in Now Playing" disabled={off} onChange={(v) => save({ artTint: v })} />
    </Row>
  </>
);

export const MusicImmersiveTweaks: React.FC<{ cfg: MusicConfig; save: Save; off: boolean }> = ({ cfg, save, off }) => (
  <>
    <Row label="Hide the cursor and controls after" desc={`${cfg.immersiveIdleS} s without moving the mouse`}>
      <input type="range" min={1} max={10} step={1} value={cfg.immersiveIdleS} disabled={off} aria-label="Idle seconds" onChange={(e) => save({ immersiveIdleS: Number(e.target.value) })} />
    </Row>
    <Row label="Lyrics in Immersive" desc="Synced lyrics beside the artwork, when the song has them.">
      <Toggle on={cfg.immersiveLyrics} label="Lyrics in Immersive" disabled={off} onChange={(v) => save({ immersiveLyrics: v })} />
    </Row>
    <Row label="Sound glow in Immersive" desc="A glow along the bottom edge that breathes with your speakers' volume level (a single number; no sound is recorded). Still when motion is reduced.">
      <Toggle on={cfg.immersiveGlow} label="Sound glow in Immersive" disabled={off} onChange={(v) => save({ immersiveGlow: v })} />
    </Row>
  </>
);

// ------------------------------------------------------------------------------ lyric translation

const VIEWS: [MusicConfig["lyricsView"], string][] = [["original", "Original"], ["translated", "Translated"], ["both", "Both"]];

export const MusicLyricExtras: React.FC<{ cfg: MusicConfig; save: Save }> = ({ cfg, save }) => {
  const fallback = defaultLanguage(typeof navigator !== "undefined" ? navigator.language : "en");
  return (
    <>
      <Row label="Offer translations" desc="Adds Translate to the lyrics. Lens's AI translates them: your local model when one is running, otherwise the AI chosen in Settings › AI, under its privacy mode (Local only never sends anything; Ask each time asks first). The lyric lines are all it sends. Translations are saved on this PC.">
        <Toggle on={cfg.lyricsTranslate} label="Offer translations" onChange={(v) => save({ lyricsTranslate: v })} />
      </Row>
      {cfg.lyricsTranslate && (
        <>
          <Row label="Translate into" desc={`Leave empty for your Windows language (${fallback}).`}>
            <input className="cc-input lm-set-input" defaultValue={cfg.lyricsTranslateTo} placeholder={fallback} aria-label="Translate into"
              onBlur={(e) => save({ lyricsTranslateTo: e.target.value.trim() })} />
          </Row>
          <Row label="Show" desc="What the lyrics show once a song is translated. You can switch in Now Playing too.">
            <span className="cc-chip-grid lm-set-chips" role="radiogroup" aria-label="Lyrics shown">
              {VIEWS.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={cfg.lyricsView === id} data-weight="medium" className={`cc-chip ${cfg.lyricsView === id ? "active" : ""}`} onClick={() => save({ lyricsView: id })}>{label}</button>
              ))}
            </span>
          </Row>
        </>
      )}
    </>
  );
};

// ------------------------------------------------------------------------------ Discord

export const MusicDiscordRows: React.FC<{ cfg: MusicConfig; save: Save; off: boolean }> = ({ cfg, save, off }) => {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [appId, setAppId] = useState(cfg.discordAppId);
  useEffect(() => setAppId(cfg.discordAppId), [cfg.discordAppId]);
  useEffect(() => {
    if (!cfg.discord) return setStatus(null);
    const read = () => music.discordStatus().then(setStatus).catch(() => {});
    read();
    // Status text only (not an animation): refreshed every few seconds while the switch is on.
    const t = window.setInterval(read, 3000);
    return () => window.clearInterval(t);
  }, [cfg.discord, cfg.discordAppId]);
  const validId = /^\d{17,20}$/.test(appId.trim());
  return (
    <div data-guide-id="music.discord">
      <Row label="Show on Discord" desc="“Listening to” on your Discord profile: the song, the artist and the time left. Lens talks only to the Discord app on this PC; Lens itself sends nothing over the internet, and Discord shares it with the people who can see your profile.">
        <Toggle on={cfg.discord} label="Show on Discord" disabled={off || !validId} onChange={(v) => save({ discord: v })} />
      </Row>
      <ol className="cc-desc lm-set-steps">
        <li>Create an application at discord.com/developers/applications (any name, e.g. "Lens Music": Discord shows it as "Listening to Lens Music").</li>
        <li>Copy its Application ID and paste it here.</li>
      </ol>
      <div className="cc-row lm-set-inline">
        <input className="cc-input lm-set-input-wide" placeholder="Application ID (17–20 digits)" aria-label="Discord application ID" value={appId} disabled={off}
          onChange={(e) => setAppId(e.target.value)} onBlur={() => validId && appId.trim() !== cfg.discordAppId && save({ discordAppId: appId.trim() })} />
        <button type="button" data-weight="medium" className="cc-btn" disabled={off || !validId || appId.trim() === cfg.discordAppId} onClick={() => save({ discordAppId: appId.trim() })}>Save</button>
      </div>
      {cfg.discord && (
        <>
          <Row label="Private listening" desc="While on, Discord shows nothing. Turn it on before a guilty-pleasure playlist; turn it off to share again.">
            <Toggle on={cfg.discordPrivate} label="Private listening" onChange={(v) => save({ discordPrivate: v })} />
          </Row>
          <Row label="Show time left" desc="The progress bar under the song in Discord.">
            <Toggle on={cfg.discordShowProgress} label="Show time left" onChange={(v) => save({ discordShowProgress: v })} />
          </Row>
          {status && <div className="cc-desc lm-card-note" role="status">{status.status}</div>}
          <div className="cc-desc">Artwork: Discord can only show pictures from the web, so it shows the album art when Spotify is connected (Discord loads it from Spotify) and no picture otherwise.</div>
        </>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------ Lens Remote (Tester mode)

export const MusicRemoteRows: React.FC<{ cfg: MusicConfig; save: Save; off: boolean; tester: boolean }> = ({ cfg, save, off, tester }) => {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    music.remoteStatus().then(setInfo).catch(() => {});
    const un = listen<RemoteInfo>(EVENT_REMOTE, (e) => setInfo(e.payload));
    // Status text only: refreshed while this page is open (phones paired, the code used up).
    const t = window.setInterval(() => music.remoteStatus().then(setInfo).catch(() => {}), 2000);
    return () => {
      window.clearInterval(t);
      un.then((f) => f()).catch(() => {});
    };
  }, []);
  if (!tester) return null;
  const qr = info?.pairUrl ? qrDataUrl(info.pairUrl) : null;
  const run = (p: Promise<RemoteInfo>) => p.then((i) => (setInfo(i), setError(null))).catch((e) => setError(String(e)));
  return (
    <div data-guide-id="music.remote">
      <div className="cc-label lm-settings-head">Lens Remote <span className="lm-badge">Tester preview</span></div>
      <div className="cc-desc">
        Control the music from your phone on the same home network: play, pause, skip, seek, volume and what's playing. Off until you turn it on, it stops by itself after {cfg.remoteIdleMin} minutes without use, and a Remote pill shows in the Top Bar while it's on.
      </div>
      <details className="lm-remote-risk">
        <summary className="cc-desc">What this does and doesn't protect</summary>
        <ul className="cc-desc lm-set-steps">
          <li>Plain HTTP on your home network: there's no certificate Lens could use, so the traffic isn't encrypted. Someone who can read your Wi-Fi traffic could copy a phone's session and control playback until the Remote stops.</li>
          <li>The QR code holds a one-time code; once a phone uses it, it's gone. At most three phones.</li>
          <li>Only devices on the same home network (same /24) are answered; requests from elsewhere, from other websites or with a wrong code are refused, and too many wrong codes block that device for 5 minutes.</li>
          <li>It can only do what your media keys and volume slider do.</li>
          <li>Lens doesn't change the Windows Firewall. Windows may ask once whether Lens may use the network: allow Private networks only.</li>
        </ul>
      </details>
      <Row label="Lens Remote" desc={remoteLine(info)}>
        <Toggle on={!!info?.on} label="Lens Remote" disabled={off} onChange={(v) => run(v ? music.remoteStart() : music.remoteStop())} />
      </Row>
      {info?.on && (
        <div className="lm-remote-pair">
          {qr ? (
            <>
              <img className="lm-remote-qr" src={qr} alt="Pairing code for Lens Remote" />
              <div className="cc-desc">Scan with your phone's camera, or open <span className="lm-mono lm-remote-url">{info.pairUrl}</span>. The code works once.</div>
            </>
          ) : (
            <div className="cc-desc">The code was used. <button type="button" data-weight="medium" className="cc-btn cc-btn-ghost" onClick={() => run(music.remotePair())}>Pair another phone</button></div>
          )}
        </div>
      )}
      <Row label="Stop after" desc={`${cfg.remoteIdleMin} minutes without a request`}>
        <input type="range" min={5} max={60} step={5} value={cfg.remoteIdleMin} disabled={off} aria-label="Stop Lens Remote after" onChange={(e) => save({ remoteIdleMin: Number(e.target.value) })} />
      </Row>
      {error && <div className="cc-desc lm-card-note error" role="alert">{error}</div>}
    </div>
  );
};

/** The pairing QR as an image (generated on this PC; nothing is fetched). */
export function qrDataUrl(text: string): string | null {
  try {
    return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(encodeQr(text)))}`;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------ Equalizer (Equalizer APO bridge)

export const MusicEqualizerRows: React.FC = () => {
  const [eq, setEq] = useState<EqStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    music.eqStatus().then(setEq).catch(() => {});
  }, []);
  const set = (id: string) => music.eqSet(id).then((s) => (setEq(s), setError(null))).catch((e) => setError(String(e)));
  return (
    <div data-guide-id="music.equalizer">
      <div className="cc-label lm-settings-head">Equalizer</div>
      <div className="cc-desc">
        Lens doesn't process sound itself. It works with <button type="button" data-weight="light" className="md-link" onClick={() => openExternal("https://sourceforge.net/projects/equalizerapo/")}>Equalizer APO</button>, a free system-wide equalizer by Jonas Thedering: Lens switches its presets (10 bands, 32 Hz – 16 kHz) by adding one marked line to its config and one file beside it. Off takes exactly those out again, and so does Remove all Lens changes.
      </div>
      {!eq ? null : eq.installed ? (
        <>
          <div className="cc-chip-grid lm-eq-presets" role="radiogroup" aria-label="Equalizer preset">
            <button type="button" role="radio" aria-checked={eq.active === ""} data-weight="medium" className={`cc-chip ${eq.active === "" ? "active" : ""}`} onClick={() => set("off")}>Off</button>
            {eq.presets.map(([id, name]) => (
              <button key={id} type="button" role="radio" aria-checked={eq.active === id} data-weight="medium" className={`cc-chip ${eq.active === id ? "active" : ""}`} onClick={() => set(id)}>{name}</button>
            ))}
          </div>
          <div className="cc-row lm-set-inline">
            <button type="button" data-weight="medium" className="cc-btn cc-btn-ghost" onClick={() => music.eqOpenEditor().catch((e) => setError(String(e)))}>Open Equalizer APO</button>
            <span className="cc-desc">For your own curves, devices and filters.</span>
          </div>
        </>
      ) : (
        <div className="cc-row lm-set-inline">
          <span className="cc-desc">Equalizer APO isn't installed.</span>
          <button type="button" data-weight="medium" className="cc-btn" onClick={() => invoke("open_surface", { label: "apps" }).catch(() => openExternal("https://sourceforge.net/projects/equalizerapo/"))}>Get it in Lens Apps</button>
        </div>
      )}
      <Row label="Spatial sound" desc="Windows Sonic and other spatial sound formats are switched per device in Windows; apps can't change them. This opens the page where you can.">
        <button type="button" data-weight="medium" className="cc-btn cc-btn-ghost" onClick={() => invoke("open_windows_setting_cmd", { uri: "ms-settings:sound" }).catch(() => {})}>Sound settings</button>
      </Row>
      {error && <div className="cc-desc lm-card-note error" role="alert">{error}</div>}
    </div>
  );
};
