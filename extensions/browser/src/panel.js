// Side panel: streams answers from Lens. Everything is rendered with textContent (no HTML).
const api = globalThis.browser ?? globalThis.chrome;
const store = api.storage.session ?? api.storage.local;
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function ping() {
  const r = await api.runtime.sendMessage({ type: "ping" }).catch(() => null);
  const dot = $("dot");
  if (r?.ok && r.state === "ready") {
    dot.className = "dot ok";
    $("status").textContent = "Connected";
  } else if (r?.state === "lens-offline") {
    dot.className = "dot off";
    $("status").textContent = "Lens isn't running";
  } else {
    dot.className = "dot bad";
    $("status").textContent = r?.error ? "Bridge not installed" : "Not connected";
    $("status").title = r?.error || "";
  }
}

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
  const { answers = [] } = await store.get("answers");
  const box = $("answers");
  box.replaceChildren(...answers.map(renderAnswer));
  const { draft } = await store.get("draft");
  $("empty").hidden = answers.length > 0 || !!draft;
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
  if (m?.type === "lens-answer" || m?.type === "lens-draft") render();
});
render();
ping();
