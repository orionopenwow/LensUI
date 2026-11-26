// The Music first-run setup's steps (Settings › Music, until finished or skipped). Pure.
export interface SetupStep {
  id: "sources" | "lyrics" | "share";
  title: string;
  desc: string;
}

export function setupSteps(): SetupStep[] {
  return [
    { id: "sources", title: "Where your music comes from", desc: "Lens shows whatever plays in Windows' media controls. Spotify and your own lyrics files are optional extras." },
    { id: "lyrics", title: "Lyrics and scrobbling", desc: "Both are off until you turn them on, and each says exactly what it sends." },
    { id: "share", title: "Share and control", desc: "Optional: show what you're playing on Discord. A phone remote is a Tester mode preview." },
  ];
}

/** What the setup's summary says about the choices made (shown on Done in tests and the gallery). */
export function setupSummary(c: { enabled: boolean; lyrics: boolean; lyricsLrclib: boolean; lyricsFolder: string | null; lastfm: boolean; discord: boolean }): string[] {
  const out: string[] = [];
  out.push(c.enabled ? "Lens Music is on." : "Lens Music is off: turn it on at the top when you want it.");
  if (c.lyrics) out.push(c.lyricsLrclib ? "Synced lyrics from LRCLIB" + (c.lyricsFolder ? " and your folder." : ".") : "Synced lyrics from your folder only.");
  if (c.lastfm) out.push("Scrobbling to Last.fm.");
  if (c.discord) out.push("Showing on Discord.");
  return out;
}
