const api = globalThis.browser ?? globalThis.chrome;
const store = api.storage.session ?? api.storage.local;
const $ = (id) => document.getElementById(id);

async function init() {
  const r = await api.runtime.sendMessage({ type: "ping" }).catch(() => null);
  if (r?.ok && r.state === "ready") {
    $("dot").className = "dot ok";
    $("status").textContent = `Connected · Lens ${r.lens ?? ""}`.trim();
  } else if (r?.state === "lens-offline") {
    $("dot").className = "dot off";
    $("status").textContent = "Lens isn't running";
  } else {
    $("dot").className = "dot bad";
    $("status").textContent = "Not connected";
    $("hint").textContent = r?.error || "Install the browser bridge from Lens: Settings → Connections.";
  }
  const { answers = [] } = await store.get("answers");
  const last = answers[0];
  if (last) {
    $("lastTitle").textContent = last.label || "Last answer";
    $("last").textContent = last.text || last.error || last.state;
    const b = document.createElement("span");
    b.className = `badge ${last.engine === "local" ? "local" : last.engine === "claude" ? "claude" : ""}`;
    b.textContent = last.engine === "local" ? "Local" : last.engine === "claude" ? "Claude" : "—";
    $("lastBadge").replaceChildren(b);
  }
}

$("openPanel").onclick = async () => {
  // Firefox only opens the sidebar synchronously inside the click.
  if (api.sidebarAction) {
    api.sidebarAction.open();
    window.close();
    return;
  }
  const win = await api.windows.getCurrent();
  if (api.sidePanel) await api.sidePanel.open({ windowId: win.id }).catch(() => {});
  window.close();
};
$("command").onclick = async () => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  await api.runtime.sendMessage({ type: "open-command", ctx: { url: tab?.url, title: tab?.title } });
  window.close();
};
init();
