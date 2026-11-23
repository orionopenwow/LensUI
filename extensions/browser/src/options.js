// Extension settings: selection button (off / chosen sites / all sites), default action, and
// the "never on this site" list. Access to a site is requested from the browser when you turn
// the button on for it, and given back when you remove it.
const api = globalThis.browser ?? globalThis.chrome;
const L = globalThis.LensSel;
const $ = (id) => document.getElementById(id);
let settings = L.sanitizeSettings(null);

async function load() {
  const r = await api.storage.local.get("lensSettings");
  settings = L.sanitizeSettings(r.lensSettings);
  render();
}

async function save(next, message = "Saved.") {
  settings = L.sanitizeSettings(next);
  await api.storage.local.set({ lensSettings: settings });
  await api.runtime.sendMessage({ type: "sync-content-scripts" }).catch(() => {});
  $("saved").textContent = message;
  render();
}

function listItems(ul, items, onRemove) {
  ul.replaceChildren(
    ...items.map((h) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = h;
      const b = document.createElement("button");
      b.textContent = "Remove";
      b.addEventListener("click", () => onRemove(h));
      li.append(span, b);
      return li;
    }),
  );
}

function render() {
  for (const r of document.querySelectorAll("input[name=mode]")) r.checked = r.value === settings.selectionButton;
  $("sitesBox").hidden = settings.selectionButton !== "sites";
  $("defaultAction").value = settings.defaultAction;
  listItems($("sites"), settings.sites, async (h) => {
    await api.permissions.remove({ origins: L.originsFor({ selectionButton: "sites", sites: [h] }) }).catch(() => {});
    await save({ ...settings, sites: settings.sites.filter((x) => x !== h) }, `Removed ${h}.`);
  });
  listItems($("never"), settings.never, (h) => save({ ...settings, never: settings.never.filter((x) => x !== h) }, `Removed ${h}.`));
  $("copyGuard").checked = settings.copyGuard === "all";
  $("define").checked = settings.define === "all";
  $("defineMode").value = settings.defineMode;
  if (!$("translateTo").options.length) {
    for (const l of L.TRANSLATE_LANGS) $("translateTo").append(new Option(l, l));
  }
  $("translateTo").value = settings.translateTo;
  $("builtin").textContent = L.BUILTIN_DENY.join(", ") + ", and any sign-in, checkout or payment page.";
  $("permHint").textContent =
    settings.selectionButton === "all"
      ? "Your browser lets Lens read pages only to place the dot; text is sent to Lens only when you click a tile."
      : "";
}

for (const r of document.querySelectorAll("input[name=mode]")) {
  r.addEventListener("change", async () => {
    const mode = r.value;
    if (mode !== "off") {
      // Must be called directly from the click for the browser to show its prompt.
      const origins = L.originsFor({ ...settings, selectionButton: mode });
      if (origins.length) {
        const ok = await api.permissions.request({ origins }).catch(() => false);
        if (!ok) {
          $("saved").textContent = "The browser didn't grant access, so the button stays off.";
          return render();
        }
      }
    }
    await save({ ...settings, selectionButton: mode });
  });
}

$("addSite").addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = L.normalizeHost($("siteInput").value);
  if (!h) return ($("saved").textContent = "That isn't a web address.");
  if (L.isDeniedUrl(`https://${h}/`, []).denied) return ($("saved").textContent = `Lens never runs on ${h}.`);
  const ok = await api.permissions.request({ origins: L.originsFor({ selectionButton: "sites", sites: [h] }) }).catch(() => false);
  if (!ok) return ($("saved").textContent = "The browser didn't grant access to that site.");
  $("siteInput").value = "";
  await save({ ...settings, selectionButton: "sites", sites: [...settings.sites, h] }, `Added ${h}.`);
});

$("addNever").addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = L.normalizeHost($("neverInput").value);
  if (!h) return ($("saved").textContent = "That isn't a web address.");
  $("neverInput").value = "";
  await save({ ...settings, never: [...settings.never, h], sites: settings.sites.filter((x) => x !== h) }, `Lens won't show up on ${h}.`);
});

/** Turning a helper on asks the browser for access to sites (it runs before pages load). */
async function toggleFeature(feature, on, label) {
  if (on) {
    const ok = await api.permissions.request({ origins: ["https://*/*", "http://*/*"] }).catch(() => false);
    if (!ok) {
      $("saved").textContent = "The browser didn't grant access, so this stays off.";
      return render();
    }
  }
  await save({ ...settings, [feature]: on ? "all" : "off" }, on ? `${label} is on.` : `${label} is off.`);
}
$("copyGuard").addEventListener("change", (e) => toggleFeature("copyGuard", e.target.checked, "Copy guard"));
$("define").addEventListener("change", (e) => toggleFeature("define", e.target.checked, "Double-click define"));
$("defineMode").addEventListener("change", (e) => save({ ...settings, defineMode: e.target.value }));
$("translateTo").addEventListener("change", (e) => save({ ...settings, translateTo: e.target.value }));

$("defaultAction").addEventListener("change", (e) => save({ ...settings, defaultAction: e.target.value }));

load();
