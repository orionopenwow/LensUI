// Injected into a YouTube tab (world: MAIN) only after the user clicks "Get transcript"
// (the click grants activeTab for that tab). Reads the caption tracks the player already has
// and fetches the chosen track from youtube.com itself — the same request the player makes
// when you turn captions on. Nothing else on the page is read, and nothing is sent anywhere
// but back to the extension.
//
// Must stay self-contained: `scripting.executeScript({ func })` serialises this one function.

export function ytPageTranscript(preferLang) {
  // assertTimedtextUrl: only same-origin YouTube caption URLs are ever fetched (build check).
  const assertTimedtextUrl = (raw) => {
    const u = new URL(raw, location.origin);
    if (u.origin !== location.origin || u.pathname !== "/api/timedtext") throw new Error("Unexpected caption URL");
    u.searchParams.set("fmt", "json3");
    return u.toString();
  };
  const host = location.hostname.replace(/^(www|m)\./, "");
  if (host !== "youtube.com") return Promise.resolve({ ok: false, reason: "not-youtube" });

  let pr = null;
  try {
    const player = document.getElementById("movie_player");
    pr = player && typeof player.getPlayerResponse === "function" ? player.getPlayerResponse() : null;
  } catch {
    pr = null;
  }
  // On a fresh load ytInitialPlayerResponse is the current video; after in-app navigation the
  // player's own response is the reliable one, so it wins when both exist.
  if (!pr) pr = globalThis.ytInitialPlayerResponse || null;
  const details = (pr && pr.videoDetails) || {};
  const current = new URLSearchParams(location.search).get("v") || (location.pathname.match(/\/shorts\/([\w-]+)/) || [])[1];
  if (details.videoId && current && details.videoId !== current) {
    return Promise.resolve({ ok: false, reason: "stale", message: "Reload the video page, then try again." });
  }
  const meta = {
    title: details.title || document.title.replace(/ - YouTube$/, ""),
    channel: details.author || "",
    lengthSeconds: Number(details.lengthSeconds) || 0,
    videoId: details.videoId || current || "",
  };
  const list = (((pr && pr.captions) || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
  const tracks = list.map((t) => ({
    languageCode: t.languageCode || "",
    name: (t.name && (t.name.simpleText || (t.name.runs || []).map((r) => r.text).join(""))) || t.languageCode || "",
    kind: t.kind || "",
    baseUrl: t.baseUrl || "",
  }));
  if (!tracks.length) return Promise.resolve({ ok: false, reason: "no-captions", meta });

  const base = (l) => String(l || "").toLowerCase().split("-")[0];
  const want = base(preferLang || "en");
  const human = (t) => t.kind !== "asr";
  const track =
    tracks.find((t) => base(t.languageCode) === want && human(t)) ||
    tracks.find((t) => base(t.languageCode) === want) ||
    tracks.find((t) => base(t.languageCode) === "en" && human(t)) ||
    tracks.find((t) => base(t.languageCode) === "en") ||
    tracks[0];

  let url;
  try {
    url = assertTimedtextUrl(track.baseUrl);
  } catch (e) {
    return Promise.resolve({ ok: false, reason: "bad-url", meta });
  }
  return fetch(url, { credentials: "same-origin" })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((body) => ({
      ok: true,
      meta,
      language: track.name || track.languageCode,
      languageCode: track.languageCode,
      auto: track.kind === "asr",
      tracks: tracks.map((t) => ({ languageCode: t.languageCode, name: t.name, kind: t.kind })),
      body: body.length > 4_000_000 ? body.slice(0, 4_000_000) : body,
    }))
    .catch((e) => ({ ok: false, reason: "fetch-failed", message: String(e && e.message || e), meta }));
}
