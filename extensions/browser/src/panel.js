// Side panel: streams answers from Lens. Everything is rendered with textContent (no HTML).
import { renderTranscript } from "./ui/transcript.js";
const api = globalThis.browser ?? globalThis.chrome;
const store = api.storage.session ?? api.storage.local;
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Lens Mini on top: the same tiles and Shelf strip as the popup and the in-page panel.
const listeners = new Set();
const dash = globalThis.LensDash.mount($("dash"), {
  surface: "panel",
  logo: "../icons/icon32.png",
  showAnswer: false, // answers stream into the list below
  showRecent: false,
  send: (msg) => api.runtime.sendMessage(msg),
  listen: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getContext: () => api.runtime.sendMessage({ type: "page-context" }),
});
// Follow Lens's theme for the answer list too (falls back to the browser's light/dark).
api.runtime.sendMessage({ type: "theme" }).then((r) => {
  const t = r?.theme;
  if (!t?.bg) return;
  const st = document.documentElement.style;
  st.setProperty("--bg", t.bg);
  st.setProperty("--fg", t.fg);
  st.setProperty("--accent", t.accent);
  st.colorScheme = t.scheme;
  if (t.scheme === "light") {
    st.setProperty("--card", "#ffffff");
    st.setProperty("--line", "#e4e4e7");
    st.setProperty("--muted", "#52525b");
  } else {
    st.setProperty("--card", `color-mix(in srgb, ${t.fg} 5%, ${t.bg})`);
    st.setProperty("--line", `color-mix(in srgb, ${t.fg} 15%, ${t.bg})`);
    st.setProperty("--muted", "#a1a1aa");
  }
}).catch(() => {});
api.tabs?.onActivated?.addListener(async () => dash.setContext(await api.runtime.sendMessage({ type: "page-context" })));


const STATE_TEXT = {
  sending: "Sending…",
  pending: "Waiting for you to confirm in Lens",
  running: "Answering…",
  answered: "",
  declined: "Declined in Lens",
  failed: "Failed",
};

function engineBadge(engine) {
  if (engine === "local") return el("span", "badge local", "Local");
  if (engine === "claude") return el("span", "badge claude", "Claude");
  return el("span", "badge", engine ? String(engine) : "—");
}

function renderAnswer(rec) {
  const card = el("article", "card");
  card.dataset.clientId = rec.clientId;
  const head = el("div", "row");
  const label = [rec.label, rec.variant?.replace("_", " "), rec.targetLang].filter(Boolean).join(" · ");
  head.append(el("span", "title", label), engineBadge(rec.engine));
  card.append(head);
  if (rec.chips?.length) {
    const chips = el("div", "chips");
    chips.append(el("span", "chip", "Sent:"));
    for (const c of rec.chips) chips.append(el("span", "chip", c));
    card.append(chips);
  }
  const busy = ["sending", "pending", "running"].includes(rec.state);
  const st = STATE_TEXT[rec.state] ?? rec.state;
  if (st) {
    const s = el("div", "state");
    if (busy) s.append(el("span", "spinner"), document.createTextNode(" "));
    s.append(document.createTextNode(st));
    card.append(s);
  }
  if (rec.text) card.append(el("pre", "answer", rec.text));
  if (rec.error) card.append(el("div", "error", rec.error));
  if (rec.text && !busy) {
    const actions = el("div", "row");
    const copy = el("button", "", "Copy");
    copy.onclick = async () => {
      await navigator.clipboard.writeText(rec.text);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    };
    const shelf = el("button", "", "Add to Shelf");
    shelf.onclick = async () => {
      const r = await api.runtime.sendMessage({ type: "shelf-answer", text: rec.text, title: `${rec.label}: ${rec.source?.title || ""}`.trim(), url: rec.source?.url });
      shelf.textContent = r?.ok ? "On the Shelf" : "Couldn't add";
    };
    const open = el("button", "", "Open in Lens Command");
    open.onclick = () => api.runtime.sendMessage({ type: "open-command", ctx: { selection: rec.text, title: rec.source?.title, url: rec.source?.url } });
    actions.append(copy, shelf, open);
    card.append(actions);
  }
  return card;
}

async function render() {
  const { transcript } = await store.get("transcript");
  renderTranscript($("transcript"), transcript, (msg) => api.runtime.sendMessage(msg));
  const { answers = [] } = await store.get("answers");
  const box = $("answers");
  box.replaceChildren(...answers.map(renderAnswer));
  const { draft } = await store.get("draft");
  $("empty").hidden = answers.length > 0 || !!draft || !!transcript;
  $("answersHead").hidden = answers.length === 0;
  renderDraft(draft);
}

function renderDraft(draft) {
  const sec = $("draft");
  sec.hidden = !draft;
  if (!draft) return;
  const chips = $("draftChips");
  const c = draft.ctx || {};
  const list = [];
  if (c.selection) list.push(`Selection · ${c.selection.length.toLocaleString()} chars`);
  if (c.pageText) list.push(`Page · ${Math.round(c.pageText.length / 1024)} KB`);
  if (c.linkUrl) list.push("Link");
  if (c.imageUrl) list.push("Image");
  if (c.url) {
    try {
      list.push(new URL(c.url).hostname);
    } catch {
      /* ignore */
    }
  }
  chips.replaceChildren(...list.map((t) => el("span", "chip", t)));
  $("preferLocal").checked = draft.preferLocal !== false;
  $("draftBadge").textContent = $("preferLocal").checked ? "Local" : "Lens decides";
  $("question").focus();
}

$("preferLocal").addEventListener("change", () => {
  $("draftBadge").textContent = $("preferLocal").checked ? "Local" : "Lens decides";
});
$("cancelDraft").onclick = async () => {
  await store.remove("draft");
  render();
};
$("send").onclick = async () => {
  const { draft } = await store.get("draft");
  if (!draft) return;
  await api.runtime.sendMessage({ type: "ask", ctx: draft.ctx, question: $("question").value, preferLocal: $("preferLocal").checked });
  $("question").value = "";
};
$("question").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("send").click();
});

api.runtime.onMessage.addListener((m) => {
  for (const fn of listeners) fn(m);
  if (m?.type === "lens-answer" || m?.type === "lens-draft" || m?.type === "lens-transcript") render();
});
render();
