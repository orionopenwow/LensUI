// Dock search and docked Settings never stay open by mistake (docs/DOCK_SMOOTHNESS.md › Dismissal).
// Drives every close path and the races between open and close, then checks the final state: the
// search tray's DOM, the Dock's "fused" look, the Settings indicator, and the hide commands sent.
//
//   node tools/robust/build.mjs && node tools/robust/dock-dismiss.mjs
import { serve, launch, openSurface } from "./lib.mjs";

const open = async (p) => {
  await p.locator(".dock-search-mag-btn").first().evaluate((el) => el.click());
  await p.waitForTimeout(250);
};
const state = (p) =>
  p.evaluate(() => ({
    search: !!document.querySelector(".dock-search-glide-input"),
    expanded: !!document.querySelector(".dock-pill.is-expanded-launcher"),
    fused: !!document.querySelector(".dock-pill.is-fused-top"),
    settingsIndicator: !!document.querySelector("button[aria-label='Settings'] ~ .dock-indicator"),
  }));
const callsSince = (p, n) => p.evaluate((n) => (window.__lensCallLog || []).slice(n).map((c) => `${c.cmd}:${c.args?.label ?? ""}`), n);
const mark = (p) => p.evaluate(() => (window.__lensCallLog || []).length);
const emit = (p, ev, payload) => p.evaluate(([e, v]) => window.__lensEmit(e, v), [ev, payload]);

/** Search paths: each opens the tray, closes it one way, waits, and expects it gone. */
const SEARCH = {
  esc: async (p) => p.keyboard.press("Escape"),
  "second press": async (p) => p.locator(".dock-search-mag-btn").first().evaluate((el) => el.click()),
  "close button": async (p) => p.locator(".dock-launcher-drawer .lens-flyout-close").first().click(),
  "click outside (empty Dock window)": async (p) => p.mouse.click(20, 20),
  "focus to another app": async (p) =>
    p.evaluate(() => {
      Object.defineProperty(document, "hasFocus", { value: () => false, configurable: true });
      window.dispatchEvent(new Event("blur"));
    }),
  "focus lost right after opening": async (p) =>
    p.evaluate(() => {
      Object.defineProperty(document, "hasFocus", { value: () => false, configurable: true });
      window.dispatchEvent(new Event("blur"));
    }),
  "Dock auto-hides": async (p) => emit(p, "lens://dock-visible", false),
  "another pop-out opens": async (p) => emit(p, "lens://dock-search-open", false),
  "Settings opens": async (p) => emit(p, "lens://settings-open", true),
  "watcher dismisses stale menus": async (p) => emit(p, "lens://dock-dismiss-menus", null),
};

const server = await serve();
const browser = await launch();
const failures = [];
const fresh = () => openSurface(browser, server.base, { surface: "dock", settle: 800 });

for (const [name, close] of Object.entries(SEARCH)) {
  const p = await fresh();
  if (name !== "focus lost right after opening") await open(p);
  else await p.locator(".dock-search-mag-btn").first().evaluate((el) => el.click());
  const before = await state(p);
  if (!before.search && name !== "focus lost right after opening") failures.push(`search/${name}: did not open`);
  await close(p);
  await p.waitForTimeout(1200);
  const s = await state(p);
  if (s.search || s.expanded) failures.push(`search/${name}: still open (${JSON.stringify(s)})`);
  if (p.problems.errors.length) failures.push(`search/${name}: ${p.problems.errors[0]}`);
  await p.context().close();
}

// Races: a fast double press ends closed; open while the close glide runs ends open; a burst of
// five presses ends in the state of the last press.
{
  const p = await fresh();
  await p.locator(".dock-search-mag-btn").first().evaluate((el) => { el.click(); el.click(); });
  await p.waitForTimeout(900);
  if ((await state(p)).search) failures.push("race/double press: left open");
  await open(p);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(60); // mid-glide
  await p.locator(".dock-search-mag-btn").first().evaluate((el) => el.click());
  await p.waitForTimeout(900);
  const s = await state(p);
  if (!s.search) failures.push("race/open during close glide: ended closed");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
  for (let i = 0; i < 5; i++) {
    await p.locator(".dock-search-mag-btn").first().evaluate((el) => el.click());
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(900);
  if (!(await state(p)).search) failures.push("race/five presses: should end open");
  await p.context().close();
}

// Docked Settings: open via the backend's event, then each way it must go.
const SETTINGS = {
  "Dock auto-hides": async (p) => emit(p, "lens://dock-visible", false),
  "search opens": async (p) => open(p),
  "backend says closed": async (p) => { await p.evaluate(() => { window.__lensVisible = { settings: false }; }); await emit(p, "lens://settings-open", false); },
  "window gone without an event (reconcile)": async (p) => p.evaluate(() => { window.__lensVisible = { settings: false }; }),
};
for (const [name, close] of Object.entries(SETTINGS)) {
  const p = await fresh();
  await p.evaluate(() => { window.__lensVisible = { settings: true }; });
  await emit(p, "lens://settings-open", true);
  await p.waitForTimeout(250);
  const before = await state(p);
  if (!before.fused || !before.settingsIndicator) failures.push(`settings/${name}: open state not shown (${JSON.stringify(before)})`);
  const n = await mark(p);
  await close(p);
  await p.waitForTimeout(name.includes("reconcile") ? 2000 : 600);
  const s = await state(p);
  if (s.fused || s.settingsIndicator) failures.push(`settings/${name}: Dock still shows Settings open (${JSON.stringify(s)})`);
  const calls = await callsSince(p, n);
  if (["Dock auto-hides", "search opens"].includes(name) && !calls.includes("hide_surface:settings")) failures.push(`settings/${name}: Settings window not hidden (${calls.join(", ")})`);
  if (p.problems.errors.length) failures.push(`settings/${name}: ${p.problems.errors[0]}`);
  await p.context().close();
}

await browser.close();
server.close();
console.log(`[dock-dismiss] ${Object.keys(SEARCH).length} search paths, 3 races, ${Object.keys(SETTINGS).length} Settings paths`);
if (failures.length) {
  console.log(`[dock-dismiss] ${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("[dock-dismiss] every path ends closed (or open, for the races) and the Dock agrees");
