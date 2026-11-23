// Settings for the in-page Lens buttons ("lensMarks"). Site access is requested from the browser
// only for the placements turned on, and the script is (re)registered by background.js.
const api = globalThis.browser ?? globalThis.chrome;
const M = globalThis.LensMarks;
const $ = (id) => document.getElementById(id);
let marks = M.sanitizeSettings(null);

function originsFor(s) {
  return M.scriptMatches({ ...s, on: true }).matches;
}

async function save(next, msg) {
  marks = M.sanitizeSettings(next);
  await api.storage.local.set({ lensMarks: marks });
  await api.runtime.sendMessage({ type: "marks-sync" }).catch(() => {});
  $("marksHint").textContent = msg || "Saved.";
  render();
}

async function want(next) {
  const origins = originsFor(next);
  if (origins.length) {
    const ok = await api.permissions.request({ origins }).catch(() => false);
    if (!ok) {
      $("marksHint").textContent = "The browser didn't allow access to those sites, so nothing changed.";
      return;
    }
  }
  await save(next);
}

function render() {
  $("marksOn").checked = marks.on;
  $("marksBox").hidden = !marks.on;
  $("marksAdapters").replaceChildren(
    ...M.ADAPTERS.map((a) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      label.className = "switch-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = marks.adapters.includes(a.id);
      cb.addEventListener("change", () => {
        const adapters = cb.checked ? [...marks.adapters, a.id] : marks.adapters.filter((x) => x !== a.id);
        (cb.checked ? want : save)({ ...marks, adapters });
      });
      label.append(cb, " " + a.label + (a.hosts.length ? "" : " (any site)"));
      li.append(label);
      return li;
    }),
  );
}

$("marksOn").addEventListener("change", (e) => {
  const on = e.target.checked;
  const next = { ...marks, on, adapters: on && !marks.adapters.length ? M.ONBOARDING.slice() : marks.adapters };
  (on ? want : save)(next);
});
api.storage.local.get("lensMarks").then((r) => {
  marks = M.sanitizeSettings(r.lensMarks);
  render();
});
