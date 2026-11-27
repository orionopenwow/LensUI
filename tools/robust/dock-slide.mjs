// Auto-hide is a slide, never a snap (docs/DOCK_SMOOTHNESS.md › Slide). For each Dock style and
// edge, hides and reveals the Dock and samples the pill's position every frame; fails when one
// frame covers too much of the way (a jump), when the move is over in too few frames, or when an
// interrupted hide doesn't come straight back. With reduced motion the hide must be instant.
//
//   node tools/robust/build.mjs && node tools/robust/dock-slide.mjs
import { serve, launch, openSurface } from "./lib.mjs";

const CASES = [
  ...["floating", "slim", "taskbar", "studio", "minimal", "split", "islands", "unified"].map((style) => ({ style, edge: "bottom" })),
  { style: "floating", edge: "top" },
  { style: "floating", edge: "left" },
  { style: "taskbar", edge: "right" },
];
/** Most of the way one frame may cover, and the fewest frames a slide may take (a ~160–200 ms slide at 60 Hz). */
const MAX_STEP = 0.35;
const MIN_FRAMES = 8;

/** In the page: flips visibility and records the pill's offset along the hide axis each frame. */
function sample({ visible, ms, reverseAt }) {
  return new Promise((done) => {
    const pill = document.querySelector(".dock-pill");
    const stage = document.querySelector(".dock-stage");
    const vertical = /dock-edge-(left|right)/.test(stage.className);
    const pos = () => {
      const r = pill.getBoundingClientRect();
      return vertical ? r.left : r.top;
    };
    const out = [pos()];
    window.__lensEmit("lens://dock-visible", visible);
    const t0 = performance.now();
    let reversed = false;
    const tick = () => {
      out.push(pos());
      const t = performance.now() - t0;
      if (reverseAt && !reversed && t >= reverseAt) {
        reversed = true;
        window.__lensEmit("lens://dock-visible", !visible);
      }
      if (t < ms) requestAnimationFrame(tick);
      else done(out);
    };
    requestAnimationFrame(tick);
  });
}

function judge(trace, label) {
  const p = [];
  const start = trace[0];
  const end = trace[trace.length - 1];
  const total = Math.abs(end - start);
  if (total < 8) return [`${label}: the Dock did not move (${start} → ${end})`];
  let maxStep = 0;
  let moving = 0;
  for (let i = 1; i < trace.length; i++) {
    const d = Math.abs(trace[i] - trace[i - 1]);
    maxStep = Math.max(maxStep, d);
    if (d > 0.5) moving++;
  }
  if (process.env.DOCK_SLIDE_VERBOSE === "1") console.log(`  ${label}: max step ${Math.round((maxStep / total) * 100)} %, ${moving} frames`);
  if (maxStep / total > MAX_STEP) p.push(`${label}: one frame jumped ${Math.round((maxStep / total) * 100)} % of the way`);
  if (moving < MIN_FRAMES) p.push(`${label}: over in ${moving} frames`);
  return p;
}

const server = await serve();
const browser = await launch();
const failures = [];
for (const c of CASES) {
  const page = await openSurface(browser, server.base, { surface: "dock", width: c.edge === "left" || c.edge === "right" ? 760 : 1920, height: c.edge === "left" || c.edge === "right" ? 1080 : 760, settle: 900 });
  await page.evaluate(({ style, edge }) => {
    const cfg = JSON.parse(JSON.stringify(window.__lensConfig()));
    cfg.dock.style = style;
    cfg.dock.position = edge;
    window.__lensSetConfig(cfg);
    window.__lensEmit("lens://config-updated", cfg);
  }, c);
  await page.waitForTimeout(500);
  const name = `${c.style}-${c.edge}`;
  const hide = await page.evaluate(sample, { visible: false, ms: 520 });
  failures.push(...judge(hide, `${name} hide`));
  const reveal = await page.evaluate(sample, { visible: true, ms: 520 });
  failures.push(...judge(reveal, `${name} reveal`));
  // Interrupted: start hiding, change mind after 90 ms. It must turn around without a jump and end
  // where it started.
  const back = await page.evaluate(sample, { visible: false, ms: 620, reverseAt: 90 });
  let maxStep = 0;
  for (let i = 1; i < back.length; i++) maxStep = Math.max(maxStep, Math.abs(back[i] - back[i - 1]));
  const travel = Math.abs(hide[hide.length - 1] - hide[0]) || 1;
  if (maxStep / travel > MAX_STEP) failures.push(`${name} interrupted: jumped ${Math.round((maxStep / travel) * 100)} % in one frame`);
  if (Math.abs(back[back.length - 1] - back[0]) > 1) failures.push(`${name} interrupted: ended ${Math.round(back[back.length - 1] - back[0])} px away from where it started`);
  if (page.problems.errors.length) failures.push(`${name}: page error ${page.problems.errors[0]}`);
  await page.context().close();
}

// Reduced motion: hiding is immediate (no slide to wait for).
{
  const page = await openSurface(browser, server.base, { surface: "dock", reducedMotion: true, settle: 900 });
  const trace = await page.evaluate(sample, { visible: false, ms: 200 });
  const total = Math.abs(trace[trace.length - 1] - trace[0]);
  const settledBy = trace.findIndex((v) => Math.abs(v - trace[trace.length - 1]) < 1);
  if (total < 8 || settledBy > 3) failures.push(`reduced motion: hide not instant (settled after ${settledBy} frames)`);
  await page.context().close();
}

await browser.close();
server.close();
console.log(`[dock-slide] ${CASES.length} style/edge cases × hide, reveal, interrupted; reduced motion`);
if (failures.length) {
  console.log(`[dock-slide] ${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("[dock-slide] every hide and reveal is a smooth slide");
