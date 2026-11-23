// Lens Now Playing: big artwork hero, synced lyrics, a queue (Spotify, when connected) or
// "Recently played in Lens", and a floating player bar — over a frosted, artwork-tinted
// background. Works with any app that publishes a Windows media session. docs/MUSIC.md.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Disc3, Heart, ListMusic, Maximize2, Minimize2, Moon, MoreHorizontal, Mic2, Pause, Play, Repeat, Repeat1,
  Shuffle, SkipBack, SkipForward, Speaker, Volume2,
} from "lucide-react";
import { music, useNowPlaying, type LyricsResult, type MusicConfig, type Played, type PlaylistItem, type Queue } from "./api";
import {
  currentLine, endTimeLabel, formatTime, heroGradient, initials, lineOpacity, lineState, queueRemaining, sourceCaps,
  splitArtists, splitTitle, hexToRgb, luminance, type NowPlaying as NP, type RGB,
} from "./model";
import { placeholderArt, samplePalette } from "./art";
import "./music.css";

export type NowPlayingMode = "compact" | "expanded" | "fullscreen";

interface Props {
  mode?: NowPlayingMode;
  onMode?: (m: NowPlayingMode) => void;
  onClose?: () => void;
  /** Tests and the gallery can pass a fixed snapshot/position. */
  fixed?: { now: NP; position: number };
}

const SLEEP_CHOICES: { label: string; minutes: number | null; end?: boolean }[] = [
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "45 minutes", minutes: 45 },
  { label: "1 hour", minutes: 60 },
  { label: "End of track", minutes: null, end: true },
  { label: "Off", minutes: null },
];

/** The window is always dark-tinted from the artwork (its text is light), so light packs
 *  use a near-black base for the gradient instead of their paper colour. */
function cssBase(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--lens-pack-base").trim();
  const rgb = hexToRgb(v.startsWith("#") ? v : "#09090b");
  return rgb && luminance(rgb) < 0.12 ? v : "#0b0b0e";
}

export const NowPlayingView: React.FC<Props> = ({ mode: modeProp, onMode, onClose, fixed }) => {
  const live = useNowPlaying(8);
  const now = fixed?.now ?? live.now;
  const position = fixed?.position ?? live.position;
  const [cfg, setCfg] = useState<MusicConfig | null>(null);
  const [mode, setMode] = useState<NowPlayingMode>(modeProp ?? "expanded");
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [palette, setPalette] = useState<{ color: RGB; weight: number }[]>([]);
  const [history, setHistory] = useState<Played[]>([]);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [spotify, setSpotify] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const [showQueue, setShowQueue] = useState(true);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [volume, setVolume] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMode(modeProp ?? cfg?.windowStyle as NowPlayingMode ?? "expanded"), [modeProp, cfg?.windowStyle]);
  useEffect(() => {
    music.config().then(setCfg).catch(() => {});
    music.spotifyStatus().then((s) => setSpotify(s.connected)).catch(() => {});
    invoke<{ volume: number }>("get_quick_state_cmd").then((q) => setVolume(q.volume)).catch(() => {});
  }, []);

  const art = now?.artwork || (now?.hasSession ? placeholderArt(now.trackKey || now.title) : placeholderArt("lens"));
  const trackKey = now?.trackKey ?? "";
  useEffect(() => {
    let alive = true;
    samplePalette(art).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [art]);
  useEffect(() => {
    if (!trackKey) return;
    setLiked(false);
    music.lyrics().then(setLyrics).catch(() => setLyrics(null));
    music.history().then(setHistory).catch(() => {});
  }, [trackKey]);
  const caps = sourceCaps(now?.sessionId ?? "", spotify);
  useEffect(() => {
    if (!caps.queue) return setQueue(null);
    music.spotifyQueue().then(setQueue).catch(() => setQueue(null));
    music.spotifyPlaylists().then(setPlaylists).catch(() => {});
  }, [caps.queue, trackKey]);

  const changeMode = (m: NowPlayingMode) => {
    setMode(m);
    onMode?.(m);
  };

  // ---- keyboard: Space play/pause, ←/→ seek 5 s, N/P next/prev, L lyrics, Q queue, F fullscreen, Esc.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === " ") (e.preventDefault(), music.control("play_pause"));
      else if (e.key === "ArrowRight" && now?.controls.seek) music.control("seek", position + 5000);
      else if (e.key === "ArrowLeft" && now?.controls.seek) music.control("seek", Math.max(0, position - 5000));
      else if (e.key.toLowerCase() === "n") music.control("next");
      else if (e.key.toLowerCase() === "p") music.control("prev");
      else if (e.key.toLowerCase() === "l") setShowLyrics((v) => !v);
      else if (e.key.toLowerCase() === "q") setShowQueue((v) => !v);
      else if (e.key.toLowerCase() === "f") changeMode(mode === "fullscreen" ? "expanded" : "fullscreen");
      else if (e.key === "Escape") mode === "fullscreen" ? changeMode("expanded") : onClose?.();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const base = typeof document !== "undefined" ? cssBase() : "#09090b";
  const hero = useMemo(() => heroGradient(palette, base), [palette, base]);
  const { main, sub } = splitTitle(now?.title ?? "", now?.album ?? "");
  const artists = splitArtists(now?.artist ?? "");
  const playing = now?.status === "playing";
  const dur = now?.durationMs ?? 0;

  if (!now || !now.hasSession) {
    return (
      <div className={`lm-np lm-mode-${mode} lm-empty`} style={{ ["--lm-hero" as string]: hero }}>
        <div className="lm-backdrop" aria-hidden><div className="lm-hero-wash" />{cfg?.dither !== false && <div className="lm-dither" />}</div>
        <div className="lm-empty-card">
          <Disc3 size={28} aria-hidden />
          <div className="lm-empty-title">Nothing is playing</div>
          <div className="lm-empty-desc">Play something in Spotify, Apple Music, your browser or any player that shows up in Windows' media controls.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`lm-np lm-mode-${mode} ${showQueue ? "" : "lm-no-queue"}`} style={{ ["--lm-hero" as string]: hero }}>
      <div className="lm-backdrop" aria-hidden>
        <img src={art} alt="" className="lm-backdrop-art" />
        <div className="lm-hero-wash" />
        {cfg?.dither !== false && <div className="lm-dither" />}
      </div>

      {mode === "expanded" && <Sidebar now={now} history={history} playlists={playlists} spotify={caps.library} />}

      <main className="lm-main">
        <header className="lm-hero">
          <img className="lm-art" src={art} alt={`Artwork for ${now.title}`} />
          <div className="lm-hero-text">
            <h1 className="lm-title">{main || "Untitled"}</h1>
            {sub && <div className="lm-subtitle">{sub}</div>}
            {artists.length > 0 && (
              <div className="lm-artists">
                <span className="lm-avatars" aria-hidden>
                  {artists.slice(0, 4).map((a) => <span key={a} className="lm-avatar">{initials(a)}</span>)}
                </span>
                <span className="lm-artist-line">{artists.join(", ").replace(/, ([^,]*)$/, " & $1")}</span>
              </div>
            )}
            <div className="lm-chips">
              <span className="lm-chip"><Speaker size={12} aria-hidden />{now.sourceLabel}</span>
              {dur > 0 && <span className="lm-chip lm-mono">{formatTime(dur)}</span>}
              {lyrics?.found && <span className="lm-chip"><Mic2 size={12} aria-hidden />{lyrics.synced ? "Synced lyrics" : "Lyrics"}</span>}
            </div>
            <div className="lm-actions">
              <button type="button" className="lm-pill lm-pill-primary" onClick={() => music.control("play_pause")} disabled={!(playing ? now.controls.pause : now.controls.play)}>
                {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="lm-pill lm-pill-outline" disabled={!now.controls.shuffle} aria-pressed={!!now.shuffle}
                onClick={() => music.control("shuffle", now.shuffle ? 0 : 1)}>
                <Shuffle size={15} /> Shuffle
              </button>
              <span className="lm-spacer" />
              {now.sessions.length > 1 && (
                <label className="lm-source">
                  <span className="lm-sr">Source</span>
                  <select value={now.sessionId} onChange={(e) => music.selectSession(e.target.value)}>
                    {now.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.playing ? " · playing" : ""}</option>)}
                  </select>
                </label>
              )}
              <div className="lm-menu-wrap">
                <button type="button" className="lm-icon-btn" aria-label="More" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
                  <MoreHorizontal size={16} />
                </button>
                {moreOpen && (
                  <div className="lm-menu lm-menu-down" role="menu">
                    <button type="button" role="menuitem" onClick={() => (addToShelf(now), setMoreOpen(false))}>Add to Shelf</button>
                    <button type="button" role="menuitem" onClick={() => (navigator.clipboard?.writeText(songText(now)).catch(() => {}), setMoreOpen(false))}>Copy song and artist</button>
                  </div>
                )}
              </div>
            </div>
            {caps.note && <div className="lm-note">{caps.note}</div>}
          </div>
        </header>

        {showLyrics && <Lyrics result={lyrics} position={position} offset={cfg?.lyricsOffsetMs ?? 0} canSeek={now.controls.seek} enabled={!!cfg?.lyrics} />}
      </main>

      {showQueue && mode !== "compact" && (
        <QueuePanel now={now} position={position} queue={queue} history={history} connected={caps.queue}
          sleepOpen={sleepOpen} setSleepOpen={setSleepOpen} />
      )}

      <PlayerBar now={now} position={position} mode={mode} onMode={changeMode} volume={volume} setVolume={setVolume}
        showLyrics={showLyrics} setShowLyrics={setShowLyrics} showQueue={showQueue} setShowQueue={setShowQueue}
        art={art} likeUri={caps.like ? queue?.current?.uri ?? null : null} liked={liked} setLiked={setLiked} />
    </div>
  );
};

function songText(n: NP): string {
  return [n.title, n.artist].filter(Boolean).join(" — ");
}

/** "Add this song to Shelf": a text item (title, artist, album, source). */
function addToShelf(n: NP) {
  const text = [n.title, n.artist && `by ${n.artist}`, n.album && `from ${n.album}`, `(${n.sourceLabel})`].filter(Boolean).join(" ");
  invoke("shelf_add", {
    item: { kind: "text", title: songText(n), text, html: null, url: null, path: null, source_app: n.sourceLabel, tags: ["music"], local_only: null },
    shelf: null,
  }).catch(() => {});
}

// ------------------------------------------------------------------------------ sidebar

const Bars: React.FC = () => (
  <span className="lm-bars" aria-label="Playing"><i /><i /><i /></span>
);

const Sidebar: React.FC<{ now: NP; history: Played[]; playlists: PlaylistItem[]; spotify: boolean }> = ({ now, history, playlists, spotify }) => (
  <aside className="lm-side" aria-label="Library">
    <div className="lm-side-head">Library</div>
    <div className="lm-side-section">Playing on this PC <span className="lm-count">{now.sessions.length}</span></div>
    {now.sessions.map((s) => (
      <button key={s.id} type="button" className={`lm-side-row ${s.active ? "active" : ""}`} onClick={() => music.selectSession(s.id)}>
        <span className="lm-side-thumb"><Speaker size={14} aria-hidden /></span>
        <span className="lm-side-text"><span className="lm-side-title">{s.title || s.label}</span><span className="lm-side-sub">{s.label}</span></span>
        {s.playing && <Bars />}
      </button>
    ))}
    {spotify && playlists.length > 0 && (
      <>
        <div className="lm-side-section">Playlists <span className="lm-count">{playlists.length}</span></div>
        {playlists.slice(0, 12).map((p) => (
          <div key={p.uri} className="lm-side-row">
            {p.image ? <img className="lm-side-thumb" src={p.image} alt="" /> : <span className="lm-side-thumb"><ListMusic size={14} aria-hidden /></span>}
            <span className="lm-side-text"><span className="lm-side-title">{p.name}</span><span className="lm-side-sub">Playlist · {p.count}</span></span>
          </div>
        ))}
      </>
    )}
    {history.length > 0 && (
      <>
        <div className="lm-side-section">Recents <span className="lm-count">{Math.min(history.length, 8)}</span></div>
        {history.slice(0, 8).map((h, i) => (
          <div key={`${h.title}-${h.atMs}`} className={`lm-side-row ${i === 0 && h.title === now.title ? "active" : ""}`}>
            <img className="lm-side-thumb" src={placeholderArt(h.title + h.artist, 64)} alt="" />
            <span className="lm-side-text"><span className="lm-side-title">{h.title}</span><span className="lm-side-sub">{h.artist || h.sourceLabel}</span></span>
            {i === 0 && h.title === now.title && now.status === "playing" && <Bars />}
          </div>
        ))}
      </>
    )}
  </aside>
);

// ------------------------------------------------------------------------------ lyrics

const Lyrics: React.FC<{ result: LyricsResult | null; position: number; offset: number; canSeek: boolean; enabled: boolean }> = ({ result, position, offset, canSeek, enabled }) => {
  const box = useRef<HTMLDivElement>(null);
  const lines = result?.lines ?? [];
  const synced = !!result?.synced;
  const cur = synced ? currentLine(lines, position, offset) : -1;
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${Math.max(0, cur)}"]`);
    if (!el || !box.current || !synced) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box.current.scrollTo({ top: Math.max(0, el.offsetTop - box.current.clientHeight * 0.3), behavior: reduced ? "auto" : "smooth" });
  }, [cur, synced]);
  if (!enabled) return <div className="lm-lyrics lm-lyrics-empty">Turn on lyrics in Settings → Music to see synced lyrics here.</div>;
  if (!result) return <div className="lm-lyrics lm-lyrics-empty">Looking for lyrics…</div>;
  if (result.instrumental) return <div className="lm-lyrics lm-lyrics-empty">Instrumental</div>;
  if (!result.found) return <div className="lm-lyrics lm-lyrics-empty">{result.note ?? "No lyrics for this track."}</div>;
  return (
    <section className="lm-lyrics" ref={box} aria-label="Lyrics" aria-live="off">
      {lines.map((l, i) => (
        <button key={i} type="button" data-i={i} data-state={synced ? lineState(i, cur) : "plain"}
          className="lm-line" style={synced ? { opacity: lineOpacity(i, cur) } : undefined}
          disabled={!synced || !canSeek} onClick={() => music.control("seek", l.startMs)}>
          {l.text || "♪"}
        </button>
      ))}
      {result.source === "lrclib" && (
        <div className="lm-credit lm-mono">Lyrics from <a href="https://lrclib.net" onClick={(e) => e.preventDefault()}>LRCLIB</a></div>
      )}
    </section>
  );
};

// ------------------------------------------------------------------------------ queue

const QueuePanel: React.FC<{
  now: NP; position: number; queue: Queue | null; history: Played[]; connected: boolean; sleepOpen: boolean; setSleepOpen: (v: boolean) => void;
}> = ({ now, position, queue, history, connected, sleepOpen, setSleepOpen }) => {
  const remainingTrack = Math.max(0, now.durationMs - position);
  const items = connected && queue ? queue.items : [];
  const total = connected ? queueRemaining(remainingTrack, items) : remainingTrack;
  const repeat = now.repeat ?? "none";
  const sleepLabel = now.sleepEndOfTrack ? "End of track" : now.sleepAtMs ? `Pauses ${new Date(now.sleepAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  return (
    <aside className="lm-queue" aria-label="Queue">
      <div className="lm-q-head">
        <span className="lm-q-title">{connected ? "Queue" : "Up next"}</span>
        {connected && <span className="lm-q-count lm-mono">{items.length} items</span>}
      </div>
      <div className="lm-q-toggles">
        <button type="button" className={`lm-icon-btn ${now.shuffle ? "on" : ""}`} aria-label="Shuffle" aria-pressed={!!now.shuffle} disabled={!now.controls.shuffle}
          onClick={() => music.control("shuffle", now.shuffle ? 0 : 1)}><Shuffle size={15} /></button>
        <button type="button" className={`lm-icon-btn ${repeat === "list" ? "on" : ""}`} aria-label="Repeat all" aria-pressed={repeat === "list"} disabled={!now.controls.repeat}
          onClick={() => music.control("repeat", repeat === "list" ? 0 : 2)}><Repeat size={15} /></button>
        <button type="button" className={`lm-icon-btn ${repeat === "track" ? "on" : ""}`} aria-label="Repeat one" aria-pressed={repeat === "track"} disabled={!now.controls.repeat}
          onClick={() => music.control("repeat", repeat === "track" ? 0 : 1)}><Repeat1 size={15} /></button>
      </div>

      <div className="lm-q-section">Now Playing</div>
      <div className="lm-q-row active">
        <img className="lm-q-art" src={now.artwork || placeholderArt(now.trackKey, 96)} alt="" />
        <span className="lm-q-text"><span className="lm-q-name">{now.title}</span><span className="lm-q-sub">{[now.artist, now.album].filter(Boolean).join(" – ")}</span></span>
        {now.status === "playing" && <Bars />}
      </div>

      {connected ? (
        <>
          <div className="lm-q-section">Up next <span className="lm-q-hint">from Spotify</span></div>
          {items.length === 0 && <div className="lm-q-empty">Nothing queued. Spotify's AutoPlay picks the next song when this one ends.</div>}
          {items.map((t, i) => (
            <div key={`${t.uri}-${i}`} className="lm-q-row">
              {t.image ? <img className="lm-q-art" src={t.image} alt="" /> : <img className="lm-q-art" src={placeholderArt(t.uri, 96)} alt="" />}
              <span className="lm-q-text">
                <span className="lm-q-name">{t.title}{t.explicit && <span className="lm-explicit" aria-label="Explicit">E</span>}</span>
                <span className="lm-q-sub">{[t.artists, t.album].filter(Boolean).join(" – ")}</span>
              </span>
              <span className="lm-q-dur lm-mono">{formatTime(t.durationMs)}</span>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="lm-q-section">Recently played in Lens <span className="lm-q-hint">on this PC</span></div>
          {history.filter((h, i) => !(i === 0 && h.title === now.title)).slice(0, 12).map((h) => (
            <div key={`${h.title}-${h.atMs}`} className="lm-q-row">
              <img className="lm-q-art" src={placeholderArt(h.title + h.artist, 96)} alt="" />
              <span className="lm-q-text"><span className="lm-q-name">{h.title}</span><span className="lm-q-sub">{[h.artist, h.sourceLabel].filter(Boolean).join(" – ")}</span></span>
            </div>
          ))}
          {history.length <= 1 && <div className="lm-q-empty">Tracks you play show up here. {now.sourceLabel} doesn't share its queue with other apps.</div>}
        </>
      )}

      <div className="lm-q-foot">
        <span className="lm-mono">{now.durationMs > 0 ? endTimeLabel(total, new Date()) : "—"}</span>
        {sleepLabel && <span className="lm-q-sleep lm-mono">{sleepLabel}</span>}
        <span className="lm-spacer" />
        <div className="lm-menu-wrap">
          <button type="button" className={`lm-icon-btn ${sleepLabel ? "on" : ""}`} aria-label="Sleep timer" aria-expanded={sleepOpen} onClick={() => setSleepOpen(!sleepOpen)}>
            <Moon size={15} />
          </button>
          {sleepOpen && (
            <div className="lm-menu" role="menu">
              {SLEEP_CHOICES.map((c) => (
                <button key={c.label} type="button" role="menuitem" onClick={() => (music.sleep(c.minutes, !!c.end), setSleepOpen(false))}>{c.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

// ------------------------------------------------------------------------------ player bar

const PlayerBar: React.FC<{
  now: NP; position: number; mode: NowPlayingMode; onMode: (m: NowPlayingMode) => void; volume: number | null; setVolume: (v: number) => void;
  showLyrics: boolean; setShowLyrics: (v: boolean) => void; showQueue: boolean; setShowQueue: (v: boolean) => void; art: string;
  likeUri: string | null; liked: boolean; setLiked: (v: boolean) => void;
}> = ({ now, position, mode, onMode, volume, setVolume, showLyrics, setShowLyrics, showQueue, setShowQueue, art, likeUri, liked, setLiked }) => {
  const playing = now.status === "playing";
  const dur = now.durationMs;
  const pct = dur > 0 ? Math.min(100, (position / dur) * 100) : 0;
  const repeat = now.repeat ?? "none";
  const nextRepeat = repeat === "none" ? 2 : repeat === "list" ? 1 : 0;
  return (
    <div className="lm-bar" role="region" aria-label="Player">
      <div className="lm-scrub">
        <span className="lm-mono lm-time">{formatTime(position)}</span>
        <input type="range" min={0} max={Math.max(1, dur)} value={Math.min(position, dur)} disabled={!now.controls.seek || dur <= 0}
          aria-label="Seek" style={{ ["--lm-pct" as string]: `${pct}%` }}
          onChange={(e) => music.control("seek", Number(e.target.value))} />
        <span className="lm-mono lm-time">-{formatTime(Math.max(0, dur - position))}</span>
      </div>
      <div className="lm-bar-row">
        <div className="lm-bar-left">
          <button type="button" className={`lm-icon-btn ${now.shuffle ? "on" : ""}`} aria-label="Shuffle" disabled={!now.controls.shuffle} onClick={() => music.control("shuffle", now.shuffle ? 0 : 1)}><Shuffle size={16} /></button>
          <button type="button" className="lm-icon-btn" aria-label="Previous" disabled={!now.controls.prev} onClick={() => music.control("prev")}><SkipBack size={18} /></button>
          <button type="button" className="lm-icon-btn lm-play" aria-label={playing ? "Pause" : "Play"} disabled={!(playing ? now.controls.pause : now.controls.play)} onClick={() => music.control("play_pause")}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button type="button" className="lm-icon-btn" aria-label="Next" disabled={!now.controls.next} onClick={() => music.control("next")}><SkipForward size={18} /></button>
          <button type="button" className={`lm-icon-btn ${repeat !== "none" ? "on" : ""}`} aria-label="Repeat" disabled={!now.controls.repeat} onClick={() => music.control("repeat", nextRepeat)}>
            {repeat === "track" ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
          {likeUri && (
            <button type="button" className={`lm-icon-btn ${liked ? "on" : ""}`} aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"} aria-pressed={liked}
              onClick={() => music.spotifySave(likeUri, !liked).then(() => setLiked(!liked)).catch(() => {})}><Heart size={16} fill={liked ? "currentColor" : "none"} /></button>
          )}
          <button type="button" className={`lm-icon-btn ${showLyrics ? "on" : ""}`} aria-label="Lyrics" aria-pressed={showLyrics} onClick={() => setShowLyrics(!showLyrics)}><Mic2 size={16} /></button>
          <button type="button" className={`lm-icon-btn ${showQueue ? "on" : ""}`} aria-label="Queue" aria-pressed={showQueue} onClick={() => setShowQueue(!showQueue)}><ListMusic size={16} /></button>
        </div>
        <div className="lm-track-card">
          <img src={art} alt="" />
          <span className="lm-track-text"><span className="lm-track-name">{now.title}</span><span className="lm-track-sub">{[now.album, now.artist].filter(Boolean).join(" – ")}</span></span>
        </div>
        <div className="lm-bar-right">
          <Volume2 size={16} aria-hidden className="lm-dim" />
          <input type="range" className="lm-vol" min={0} max={100} value={volume ?? 50} aria-label="Volume" disabled={volume === null}
            style={{ ["--lm-pct" as string]: `${volume ?? 50}%` }}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              invoke("set_volume_cmd", { level: v }).catch(() => {});
            }} />
          <button type="button" className="lm-icon-btn" aria-label="Sound output" onClick={() => invoke("open_windows_setting_cmd", { uri: "ms-settings:sound" }).catch(() => {})}><Speaker size={16} /></button>
          <button type="button" className={`lm-icon-btn ${mode === "compact" ? "on" : ""}`} aria-label="Mini player" onClick={() => onMode(mode === "compact" ? "expanded" : "compact")}><Minimize2 size={16} /></button>
          <button type="button" className={`lm-icon-btn ${mode === "fullscreen" ? "on" : ""}`} aria-label="Full screen" onClick={() => onMode(mode === "fullscreen" ? "expanded" : "fullscreen")}><Maximize2 size={16} /></button>
        </div>
      </div>
    </div>
  );
};

export default NowPlayingView;
