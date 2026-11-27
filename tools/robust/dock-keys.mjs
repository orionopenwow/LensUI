// Dock keys, the Dock's menu and its notice, driven in the real page (docs/features/dock.md).
//
//   node tools/robust/build.mjs && node tools/robust/dock-keys.mjs
//
// Checks, on every screen edge where it matters:
//   * B-106: an action Lens Core refuses is said in the Dock's notice, with no unhandled rejection;
//   * B-110: the right-click menus stay inside the screen and under the Top Bar;
//   * B-109: the menu's icon sizes change the size in use, also on a style that caps it;
//   * Dock keys: arrows move between icons, typing finds an app, the arrow that points into the
//     screen opens the window list and moves into it, Esc gives focus back;
//   * menus are menus (roles, focus in from the keyboard, focus back on Esc);
//   * every Dock control declares a press weight (DESIGN §5.2);
//   * the flourishes exist, animate transform and opacity only, and stop under reduced motion.
// It also saves the scenes (menus, notice, find, window list, search home) in three packs to
// tools/robust/out/dock-scenes/ for review.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve, launch, openSurface, setConfig, PRESETS, here } from "./lib.mjs";

const outDir = join(here, "out", "dock-scenes");
mkdirSync(outDir, { recursive: true });
const server = await serve();
const browser = await launch();
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };
const fresh = (opts = {}) => openSurface(browser, server.base, { surface: "dock", settle: 800, reducedMotion: true, fixedTime: "2026-01-15T10:30:00", ...opts });
const APP = ".dock-item-wrap[data-dock-drag-key] .dock-item";
const active = (p) => p.evaluate(() => {
  const a = document.activeElement;
  return { cls: String(a?.className ?? ""), label: a?.getAttribute("aria-label") ?? a?.textContent?.trim().slice(0, 40) ?? "", wrap: a?.closest("[data-dock-drag-key]")?.getAttribute("data-dock-drag-key") ?? "" };
});
const box = (p, sel) => p.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: window.innerWidth, vh: window.innerHeight };
}, sel);
const shot = async (p, name) => writeFileSync(join(outDir, `${name}.png`), await p.screenshot({ animations: "disabled", caret: "hide" }));
const done = async (p, name) => {
  // Not the Dock's: src/failsafe/FailsafeNotices.tsx loops over a null reply 2.5 s after load in
  // this harness (the mock answers unknown commands with null). Reported in the PR, left alone.
  const rejections = (await p.collectRejections()).filter((r) => !/notices is not iterable/.test(r));
  check(p.problems.errors.length === 0, `${name}: ${p.problems.errors[0]}`);
  check(rejections.length === 0, `${name}: unhandled rejection: ${rejections[0]}`);
  await p.context().close();
};

// ── B-106: a refused action is said out loud ────────────────────────────────────────────────
{
  const p = await fresh();
  // An app that isn't running: clicking it asks Lens Core to open it.
  const idle = p.locator(`.dock-item-wrap[data-dock-drag-key]:not(:has(.dock-indicator)) .dock-item`).first();
  if (await idle.count()) {
    await p.evaluate(() => { window.__lensFailOnce.launch_app_cmd = 1; });
    await idle.click();
    await p.waitForTimeout(400);
    const text = await p.locator(".dock-notice.is-error").first().textContent().catch(() => null);
    check(!!text && /^Couldn't open /.test(text), `B-106: no notice after a refused launch (got ${JSON.stringify(text)})`);
    check((await p.locator(".dock-notice-anchor[role=status]").count()) === 1, "B-106: the notice is not a live region");
    await shot(p, "notice-obsidian");
  } else failures.push("B-106: the harness has no pinned app that isn't running");
  await done(p, "notice");
}

// ── B-110: menus stay on screen, on every edge, with a Top Bar ──────────────────────────────
for (const edge of ["bottom", "top", "left", "right"]) {
  for (const [kind, target] of [["dock", ".dock-divider"], ["app", APP]]) {
    for (const which of ["first", "last"]) {
      const p = await fresh({ height: 620 });
      await setConfig(p, new Function("c", `c.dock.position = "${edge}"; c.topBar = { ...(c.topBar || {}), enabled: true, height: 34 };`));
      await p.waitForTimeout(350);
      const loc = which === "first" ? p.locator(target).first() : p.locator(target).last();
      await loc.click({ button: "right" });
      await p.waitForTimeout(350);
      const b = await box(p, ".dock-ctx-menu");
      const name = `B-110 ${edge}/${kind}/${which}`;
      if (!b) failures.push(`${name}: the menu did not open`);
      else {
        const topMin = edge === "top" ? 0 : 34;
        check(b.left >= 0 && b.right <= b.vw && b.top >= topMin && b.bottom <= b.vh, `${name}: menu off screen ${JSON.stringify(b)}`);
      }
      await done(p, name);
    }
  }
}

// ── B-109: the menu's icon sizes ────────────────────────────────────────────────────────────
for (const style of ["floating", "slim", "taskbar"]) {
  const p = await fresh();
  await setConfig(p, new Function("c", `c.dock.style = "${style}";`));
  await p.waitForTimeout(350);
  await p.locator(".dock-divider").first().click({ button: "right" });
  await p.waitForTimeout(250);
  await p.locator(".dcm-size", { hasText: "52" }).click();
  await p.waitForTimeout(350);
  const size = await p.evaluate(() => getComputedStyle(document.querySelector(".dock-stage")).getPropertyValue("--dock-full-icon-size").trim());
  check(size === "52px", `B-109 ${style}: picked 52 px, the Dock uses ${size}`);
  const on = await p.locator('.dcm-size[aria-checked="true"]').textContent().catch(() => "");
  check(on?.trim() === "52", `B-109 ${style}: the menu marks ${JSON.stringify(on)} as chosen`);
  await done(p, `B-109 ${style}`);
}

// ── Dock keys ───────────────────────────────────────────────────────────────────────────────
{
  const p = await fresh();
  await setConfig(p, (c) => { c.dock.livePreviews = false; });
  await p.waitForTimeout(300);
  const names = await p.evaluate(() => Array.from(document.querySelectorAll(".dock-icons-row .dock-item")).map((el) => el.getAttribute("aria-label") ?? ""));
  check(names.length >= 4 && names.every(Boolean), `keys: every Dock icon needs a name (${JSON.stringify(names)})`);
  await p.locator(".dock-icons-row .dock-item").first().focus();
  await p.keyboard.press("ArrowRight");
  check((await active(p)).label === names[1], `keys: → should focus the second icon, focused ${JSON.stringify(await active(p))}`);
  await p.keyboard.press("End");
  check((await active(p)).label === names[names.length - 1], "keys: End should focus the last icon");
  await p.keyboard.press("ArrowRight");
  check((await active(p)).label === names[names.length - 1], "keys: → on the last icon stays there");
  await p.keyboard.press("Home");
  check((await active(p)).label === names[0], "keys: Home should focus the first icon");

  // Type to find: the last icon's name ("Settings") is unique from its first three letters.
  const goal = names[names.length - 1];
  for (const ch of goal.slice(0, 3).toLowerCase()) await p.keyboard.press(ch);
  await p.waitForTimeout(120);
  const hit = await active(p);
  check(hit.label.toLowerCase().startsWith(goal.slice(0, 3).toLowerCase()), `keys: typing "${goal.slice(0, 3)}" focused ${JSON.stringify(hit.label)}`);
  const marks = await p.evaluate(() => ({ hit: document.querySelectorAll('.dock-item-wrap[data-find="hit"]').length, miss: document.querySelectorAll('.dock-item-wrap[data-find="miss"]').length, chip: document.querySelector(".dock-find-text")?.textContent ?? null, dim: getComputedStyle(document.querySelector('.dock-item-wrap[data-find="miss"]') ?? document.body).opacity }));
  check(marks.hit >= 1 && marks.miss >= 1, `keys: find should mark hits and misses (${JSON.stringify(marks)})`);
  check(marks.chip === goal.slice(0, 3).toLowerCase(), `keys: the find chip shows ${JSON.stringify(marks.chip)}`);
  check(Number(marks.dim) < 1, "keys: icons that don't match should step back");
  await shot(p, "find-obsidian");
  await p.waitForTimeout(1300);
  const after = await p.evaluate(() => document.querySelectorAll(".dock-item-wrap[data-find]").length + document.querySelectorAll(".dock-find-chip").length);
  check(after === 0, "keys: the find should end by itself after a pause");

  // Esc ends a find without leaving the icon.
  await p.keyboard.press("s");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  check((await p.evaluate(() => document.querySelectorAll(".dock-item-wrap[data-find]").length)) === 0, "keys: Esc should end the find");
  check((await active(p)).cls.includes("dock-item"), "keys: Esc during a find keeps focus on the Dock");
  await done(p, "keys");
}

// The window list from the keyboard, on each edge.
for (const edge of ["bottom", "top", "left", "right"]) {
  const into = { bottom: "ArrowUp", top: "ArrowDown", left: "ArrowRight", right: "ArrowLeft" }[edge];
  const p = await fresh();
  await setConfig(p, new Function("c", `c.dock.livePreviews = false; c.dock.position = "${edge}";`));
  await p.waitForTimeout(350);
  const running = p.locator(`.dock-item-wrap[data-dock-drag-key]:has(.dock-indicator) .dock-item`).first();
  await running.focus();
  const opener = await active(p);
  await p.keyboard.press(into);
  await p.waitForTimeout(350);
  const inList = await active(p);
  check(inList.cls.includes("dock-win-row-main"), `keys ${edge}: ${into} should move into the window list, focused ${JSON.stringify(inList)}`);
  const b = await box(p, ".dock-hover-card");
  check(!!b && b.left >= 0 && b.right <= b.vw && b.top >= 0 && b.bottom <= b.vh, `keys ${edge}: window list off screen ${JSON.stringify(b)}`);
  if (edge === "bottom") await shot(p, "windows-obsidian");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  const back = await active(p);
  check(back.wrap === opener.wrap && back.cls.includes("dock-item"), `keys ${edge}: Esc should give focus back to the icon, focused ${JSON.stringify(back)}`);
  check((await p.locator(".dock-hover-card:not([inert])").count()) === 0, `keys ${edge}: Esc should close the window list`);
  await done(p, `keys ${edge}`);
}

// ── The menu is a menu ──────────────────────────────────────────────────────────────────────
{
  const p = await fresh();
  const icon = p.locator(APP).first();
  await icon.focus();
  const opener = await active(p);
  // The context-menu key on a focused icon.
  await icon.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  await p.waitForTimeout(350);
  const m = await p.evaluate(() => {
    const menu = document.querySelector(".dock-ctx-menu");
    return {
      role: menu?.getAttribute("role"),
      named: !!menu?.getAttribute("aria-label"),
      rows: menu ? Array.from(menu.querySelectorAll("button")).filter((b) => !/^menuitem/.test(b.getAttribute("role") ?? "") && !b.closest(".lens-pan-panel")).map((b) => b.textContent?.trim() || b.getAttribute("aria-label")) : ["(no menu)"],
      focusInside: !!document.activeElement?.closest(".dock-ctx-menu"),
    };
  });
  check(m.role === "menu" && m.named, `menu: needs role and name (${JSON.stringify(m)})`);
  check(m.rows.length === 0, `menu: rows without a menu item role: ${JSON.stringify(m.rows)}`);
  check(m.focusInside, "menu: opened from the keyboard, focus should be inside it");
  const first = (await active(p)).label;
  await p.keyboard.press("ArrowDown");
  check((await active(p)).label !== first, "menu: ↓ should move to the next row");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(350);
  check((await active(p)).wrap === opener.wrap, `menu: Esc should give focus back to the icon (${JSON.stringify(await active(p))})`);
  await done(p, "menu");
}

// ── Press weights and flourishes ────────────────────────────────────────────────────────────
for (const reducedMotion of [false, true]) {
  const p = await fresh({ reducedMotion });
  await p.locator(".dock-divider").first().click({ button: "right" });
  await p.waitForTimeout(300);
  const unweighted = await p.evaluate(() =>
    Array.from(document.querySelectorAll(".dock-item, .dock-search-mag-btn, .dock-close-badge, .dock-ctx-item, .dock-ctx-edge-btn, .dock-sys-btn"))
      .filter((el) => !el.closest(".lens-pan-panel") && !["light", "medium", "heavy"].includes(el.getAttribute("data-weight") ?? ""))
      .map((el) => el.getAttribute("aria-label") || el.textContent?.trim() || el.className),
  );
  check(unweighted.length === 0, `feel: Dock controls without a press weight: ${JSON.stringify(unweighted.slice(0, 6))}`);
  await p.keyboard.press("Escape");
  const badge = await p.evaluate(() => {
    const el = document.querySelector(".dock-badge-roll");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { name: cs.animationName, ms: parseFloat(cs.animationDuration) * (cs.animationDuration.endsWith("ms") ? 1 : 1000) };
  });
  check(!!badge && badge.name === "dock-badge-roll", `feel: the badge roll is missing (${JSON.stringify(badge)})`);
  if (badge) check(reducedMotion ? badge.ms <= 1 : badge.ms > 1 && badge.ms <= 240, `feel: badge roll runs ${badge.ms} ms with reducedMotion=${reducedMotion}`);
  // The home rows of the search panel arrive in order (first six only).
  await p.locator(".dock-search-mag-btn").first().click();
  await p.waitForTimeout(500);
  const rows = await p.evaluate(() => Array.from(document.querySelectorAll(".dsd-recent-row")).map((el) => { const cs = getComputedStyle(el); return { name: cs.animationName, delay: cs.animationDelay }; }));
  check(rows.length > 0 && rows.slice(0, 6).every((r) => r.name === "dsd-row-in") && rows.slice(6).every((r) => r.name === "none"), `feel: home rows should stagger, first six only (${JSON.stringify(rows.slice(0, 7))})`);
  if (rows.length > 1) check(reducedMotion ? parseFloat(rows[1].delay) === 0 : parseFloat(rows[1].delay) > 0, `feel: stagger delay ${rows[1].delay} with reducedMotion=${reducedMotion}`);
  await done(p, `feel reducedMotion=${reducedMotion}`);
}

// ── Scenes for review: three packs ──────────────────────────────────────────────────────────
for (const preset of PRESETS) {
  const light = preset.includes("daylight");
  const open = () => fresh({ preset, colorScheme: light ? "light" : "dark" });
  let p = await open();
  await p.locator(".dock-divider").first().click({ button: "right" });
  await p.waitForTimeout(350);
  await shot(p, `dock-menu-${preset}`);
  await done(p, `scene dock-menu ${preset}`);
  p = await open();
  await p.locator(`.dock-item-wrap[data-dock-drag-key]:has(.dock-indicator) .dock-item`).first().click({ button: "right" });
  await p.waitForTimeout(350);
  await shot(p, `app-menu-${preset}`);
  await done(p, `scene app-menu ${preset}`);
  p = await open();
  await p.locator(".dock-search-mag-btn").first().click();
  await p.waitForTimeout(600);
  await shot(p, `search-home-${preset}`);
  await done(p, `scene search-home ${preset}`);
}

await browser.close();
server.close();
if (failures.length) {
  console.log(`[dock-keys] ${failures.length} failure(s):\n  ` + failures.join("\n  "));
  process.exit(1);
}
console.log(`[dock-keys] keys, menus, notice, sizes and flourishes all hold; scenes in ${outDir}`);
