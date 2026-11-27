// Lens Mission Control parity scenes (docs/MISSION_CONTROL.md): every page on sample data
// (?mcmock=1) in a dark, a coloured and a light pack, plus the confirm sheet and the onboarding
// screen. Fails on page errors, console errors, horizontal overflow, an unnamed control, or broken
// keyboard navigation. Uses the robustness harness (node tools/robust/build.mjs first).
//
//   node tools/robust/build.mjs && node tools/parity/mission/shoot.mjs
//   PARITY_OUT=/some/dir   also copy the PNGs there
//   PARITY_PRESETS=obsidian,alabaster-daylight
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, openSurface } from "../../robust/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, "shots");
mkdirSync(shots, { recursive: true });
const PAGES = ["pulse", "prs", "bugs", "suggestions", "checks", "roadmap", "quality", "releases", "dev", "local", "agents", "brain", "setup"];
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,catppuccin-mocha,alabaster-daylight").split(",");
const W = 1180;
const H = 760;

const server = await serve();
const browser = await launch();
let failed = 0;

async function shoot(name, preset, query, act) {
  const page = await openSurface(browser, server.base, { surface: "missioncontrol", preset, width: W, height: H, query, reducedMotion: true, settle: 900, colorScheme: preset.includes("daylight") ? "light" : "dark" });
  const problems = [...page.problems.errors];
  try {
    await page.waitForSelector("[data-mission-control]", { timeout: 5000 });
    if (act) await act(page, problems);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => {
      const c = document.querySelector(".mc-content");
      return c ? c.scrollWidth - c.clientWidth : 0;
    });
    if (overflow > 2) problems.push(`content overflows sideways by ${overflow}px`);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll(".mc-root button, .mc-root input, .mc-root textarea, .mc-root [role=switch]")]
        .filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim() || el.closest("label")))
        .map((el) => el.outerHTML.slice(0, 80))
    );
    if (unnamed.length) problems.push(`unnamed controls: ${unnamed.join(" | ")}`);
    if (await page.evaluate(() => !!document.querySelector(".mc-root [title]"))) problems.push("native title= tooltip");
  } catch (e) {
    problems.push(String(e.message || e));
  }
  problems.push(...page.problems.errors.filter((e) => !problems.includes(e)));
  const file = `${name}-${preset}.png`;
  await page.screenshot({ path: join(shots, file), animations: "disabled", caret: "hide" });
  if (process.env.PARITY_OUT) {
    mkdirSync(process.env.PARITY_OUT, { recursive: true });
    copyFileSync(join(shots, file), join(process.env.PARITY_OUT, file));
  }
  await page.context().close();
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${name} ${preset}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
}

for (const preset of PRESETS) {
  for (const p of PAGES) await shoot(p, preset, `mcmock=1&page=${p}`);
  // The two-step confirm for a heavy write (merge), opened from the PR page, then Esc.
  await shoot("confirm-merge", preset, "mcmock=1&page=prs", async (page, problems) => {
    await page.locator(".mc-card-row").filter({ hasText: "#126" }).first().click();
    await page.getByRole("button", { name: /^Merge #126/ }).click();
    await page.waitForSelector(".mc-confirm", { timeout: 3000 });
    await page.getByRole("button", { name: "Continue" }).click();
    if (!(await page.getByRole("button", { name: /^Yes, merge/ }).count())) problems.push("heavy action did not ask a second time");
  });
  // No token: the onboarding screen with the token permissions.
  await shoot("onboarding", preset, "mcmock=1&page=setup&token=none");
}

// Keyboard: Ctrl+2 opens Pull requests, ↓ in the sidebar moves on, Esc closes the confirm sheet.
{
  const page = await openSurface(browser, server.base, { surface: "missioncontrol", preset: "obsidian", width: W, height: H, query: "mcmock=1", reducedMotion: true, settle: 900 });
  const problems = [];
  await page.waitForSelector("[data-mission-control]");
  await page.keyboard.press("Control+2");
  if ((await page.getAttribute("[data-mission-control]", "data-page")) !== "prs") problems.push("Ctrl+2 did not open Pull requests");
  await page.locator('.mc-nav-btn[data-page="prs"]').focus();
  await page.keyboard.press("ArrowDown");
  if ((await page.getAttribute("[data-mission-control]", "data-page")) !== "bugs") problems.push("↓ in the sidebar did not move to Bugs");
  await page.keyboard.press("Control+8");
  await page.getByRole("button", { name: /^Create tag/ }).count();
  await page.keyboard.press("Control+9");
  await page.getByRole("button", { name: /^Sync to main/ }).click();
  await page.waitForSelector(".mc-confirm", { timeout: 3000 }).catch(() => problems.push("Sync to main did not ask"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if (await page.locator(".mc-confirm").count()) problems.push("Esc did not close the confirm sheet");
  problems.push(...page.problems.errors);
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "} keyboard${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
  await page.context().close();
}

await browser.close();
server.close();
console.log(`[parity:mission] ${failed ? `${failed} scene(s) failed` : "every page rendered cleanly"} → ${shots}`);
process.exit(failed ? 1 : 0);
