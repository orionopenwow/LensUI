// Every pop-out opened from the Dock carries the same × (src/ui/FlyoutClose.tsx): present, named
// "Close", at least 20 px, the topmost thing at its spot (not under other content), not covering
// another control, shown while the panel is pointed at, and clicking it uses the panel's hide path.
//
//   node tools/robust/build.mjs && node tools/robust/flyout-close.mjs
import { serve, launch, openSurface } from "./lib.mjs";

const FLYOUTS = [
  { surface: "quicksettings", size: [404, 580], hide: "quicksettings" },
  { surface: "widgets", size: [360, 680], hide: "widgets" },
  { surface: "launcher", size: [780, 640], hide: "launcher" },
  { surface: "desktopfolder", size: [420, 640], open: async (p) => p.evaluate(() => document.querySelector(".df-tab")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))) },
  { surface: "nowplaying", size: [900, 600] },
];

const server = await serve();
const browser = await launch();
const failures = [];
for (const f of FLYOUTS) {
  const p = await openSurface(browser, server.base, { surface: f.surface, width: f.size[0], height: f.size[1], settle: 1200 });
  if (f.open) await f.open(p).catch(() => {});
  await p.waitForTimeout(500);
  const close = p.locator(".lens-flyout-close").first();
  if (!(await close.count())) {
    failures.push(`${f.surface}: no close button`);
    await p.context().close();
    continue;
  }
  const bb = await close.boundingBox();
  // Point at the panel near the button (not at it), as a person reaching for it would.
  await p.mouse.move(bb.x - 30, bb.y + 40);
  await p.waitForTimeout(300);
  const info = await close.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const covers = [...(el.parentElement?.querySelectorAll("button, input, a, [role=button], [role=tab]") ?? [])]
      .filter((x) => x !== el && !el.contains(x))
      .map((x) => x.getBoundingClientRect())
      .filter((q) => q.width && q.height && q.left < r.right - 1 && r.left < q.right - 1 && q.top < r.bottom - 1 && r.top < q.bottom - 1).length;
    return { w: r.width, h: r.height, onTop: at === el || el.contains(at), covers, opacity: Number(getComputedStyle(el).opacity), name: el.getAttribute("aria-label") };
  });
  const p0 = [];
  if (info.name !== "Close") p0.push(`named "${info.name}"`);
  if (info.w < 20 || info.h < 20) p0.push(`only ${Math.round(info.w)}×${Math.round(info.h)} px`);
  if (!info.onTop) p0.push("covered by other content");
  if (info.covers) p0.push(`covers ${info.covers} other control(s)`);
  if (info.opacity < 0.9) p0.push("not shown while the panel is pointed at");
  if (f.hide) {
    const from = await p.evaluate(() => (window.__lensCallLog || []).length);
    await close.click();
    await p.waitForTimeout(150);
    const calls = await p.evaluate((n) => (window.__lensCallLog || []).slice(n).map((c) => [c.cmd, c.args?.label]), from);
    if (!calls.some(([cmd, label]) => cmd === "hide_surface" && label === f.hide)) p0.push(`clicking it did not hide the ${f.hide} window (calls: ${JSON.stringify(calls).slice(0, 160)})`);
  }
  if (p.problems.errors.length) p0.push(`page error: ${p.problems.errors[0]}`);
  if (p0.length) failures.push(`${f.surface}: ${p0.join("; ")}`);
  await p.context().close();
}
await browser.close();
server.close();
console.log(`[flyout-close] ${FLYOUTS.length} pop-outs checked`);
if (failures.length) {
  console.log(`[flyout-close] ${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("[flyout-close] every pop-out has the same working × in the same place");
