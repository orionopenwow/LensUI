// The transcript card in the side panel (YouTube "Get transcript"). DOM built with textContent only.
import { formatTimestamp, paragraphs, timeLink, toMarkdown, toSrt } from "../youtube.js";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * rec: the stored transcript ({ state, url, meta, language, auto, segments, summary, error }).
 * send: (msg) => Promise (runtime.sendMessage).
 */
export function renderTranscript(box, rec, send) {
  box.replaceChildren();
  box.hidden = !rec;
  if (!rec) return;
  const head = el("div", "row");
  head.append(el("span", "title", rec.meta?.title || "YouTube transcript"));
  if (rec.state === "ready") head.append(el("span", "badge local", rec.auto ? "Auto captions" : "Captions"));
  box.append(head);

  if (rec.state === "loading") {
    const s = el("div", "state");
    s.append(el("span", "spinner"), document.createTextNode(" Reading the captions…"));
    box.append(s);
    return;
  }
  if (rec.state === "failed") {
    box.append(el("div", "error", rec.error || "Couldn't read this video's captions."));
    return;
  }
  if (rec.state === "no-captions") {
    box.append(el("div", "state", "This video has no captions. Lens can transcribe it on your PC if you've set up web-link transcription (it uses yt-dlp)."));
    const row = el("div", "row");
    const t = el("button", "primary", "Transcribe in Lens");
    t.onclick = async () => {
      const r = await send({ type: "transcript-transcribe" });
      t.textContent = r?.ok ? "Sent to Lens — confirm there" : "Couldn't reach Lens";
    };
    row.append(t);
    box.append(row);
    return;
  }

  const chips = el("div", "chips");
  const bits = [rec.meta?.channel, rec.meta?.lengthSeconds ? formatTimestamp(rec.meta.lengthSeconds) : null, rec.language,
    rec.summary ? `${rec.summary.words.toLocaleString()} words · ~${rec.summary.approxTokens.toLocaleString()} tok` : null].filter(Boolean);
  for (const b of bits) chips.append(el("span", "chip", b));
  box.append(chips);

  const actions = el("div", "row wrap");
  const btn = (label, fn, cls = "") => {
    const b = el("button", cls, label);
    b.onclick = () => fn(b);
    actions.append(b);
    return b;
  };
  btn("Add to Shelf", async (b) => {
    const r = await send({ type: "transcript-shelf" });
    b.textContent = r?.ok ? "On the Shelf" : "Couldn't add";
  }, "primary");
  btn("Summarise", () => send({ type: "transcript-run", kind: "summarize", variant: "key_points" }));
  btn("Copy Markdown", async (b) => {
    await navigator.clipboard.writeText(toMarkdown(rec));
    b.textContent = "Copied";
    setTimeout(() => (b.textContent = "Copy Markdown"), 1500);
  });
  btn("Export SRT", () => download(`${rec.meta?.title || "transcript"}.srt`, toSrt(rec.segments), "application/x-subrip"));
  box.append(actions);

  const ask = el("div", "row");
  const q = el("input", "ask-input");
  q.placeholder = "Ask about this video…";
  q.setAttribute("aria-label", "Ask about this video");
  const go = el("button", "", "Ask");
  const send1 = () => q.value.trim() && send({ type: "transcript-run", kind: "ask", question: q.value.trim() }).then(() => (q.value = ""));
  go.onclick = send1;
  q.addEventListener("keydown", (e) => e.key === "Enter" && send1());
  ask.append(q, go);
  box.append(ask);

  const list = el("ol", "transcript");
  for (const p of paragraphs(rec.segments).slice(0, 400)) {
    const li = el("li");
    const link = timeLink(rec.url, p.start);
    const stamp = el("a", "stamp", formatTimestamp(p.start));
    if (link) {
      stamp.href = link;
      stamp.target = "_blank";
      stamp.rel = "noreferrer";
    }
    li.append(stamp, el("span", "", ` ${p.text}`));
    list.append(li);
  }
  box.append(list);
}
