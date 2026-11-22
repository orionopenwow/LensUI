// @ts-nocheck -- node-only test file (node:test types are not a project dependency); run with run.mjs.
/**
 * Unit tests for the pure Playground simulations (no DOM). Run:
 *   node src/playground/tests/run.mjs
 * (bundles this file with esbuild and runs it with node:test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY, FIRE, PLANT, SAND, SandSim, SMOKE, STONE, WATER } from "../scenes/sandSim";
import { FluidSim } from "../scenes/fluidSim";
import { capFps } from "../runner";
import { normaliseOptions } from "../types";
import { sandScene } from "../scenes/sand";
import { dayWindow, setSkyLocation, sunHeight } from "../scenes/skyclock";
import { bytesToB64, b64ToBytes, makeRng } from "../util";

const run = (sim: SandSim, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};

test("sand falls straight down onto the floor", () => {
  const sim = new SandSim(9, 10, 1);
  sim.set(4, 0, SAND);
  run(sim, 20);
  assert.equal(sim.get(4, 9), SAND);
  assert.equal(sim.count(SAND), 1);
});

test("sand piles into a pyramid (slides diagonally)", () => {
  const sim = new SandSim(21, 12, 2);
  for (let k = 0; k < 30; k++) {
    sim.set(10, 0, SAND);
    run(sim, 3);
  }
  run(sim, 60);
  assert.equal(sim.count(SAND), 30);
  // Bottom row wider than a single column, centre column tallest.
  let bottom = 0;
  for (let x = 0; x < 21; x++) if (sim.get(x, 11) === SAND) bottom++;
  assert.ok(bottom >= 5, `bottom row ${bottom}`);
  const height = (x: number) => {
    let h = 0;
    for (let y = 11; y >= 0 && sim.get(x, y) === SAND; y--) h++;
    return h;
  };
  assert.ok(height(10) >= height(3) && height(10) >= height(17));
});

test("stone never moves and blocks sand", () => {
  const sim = new SandSim(5, 8, 3);
  for (let x = 0; x < 5; x++) sim.set(x, 5, STONE);
  sim.set(2, 0, SAND);
  run(sim, 30);
  assert.equal(sim.get(2, 4), SAND);
  for (let x = 0; x < 5; x++) assert.equal(sim.get(x, 5), STONE);
});

test("water spreads flat; sand sinks below water", () => {
  const sim = new SandSim(12, 6, 4);
  for (let x = 4; x < 8; x++) for (let y = 0; y < 3; y++) sim.set(x, y, WATER);
  run(sim, 120);
  let bottomWater = 0;
  for (let x = 0; x < 12; x++) if (sim.get(x, 5) === WATER) bottomWater++;
  assert.equal(sim.count(WATER), 12);
  assert.equal(bottomWater, 12, "12 water cells spread into a 12-wide layer");
  sim.set(6, 0, SAND);
  run(sim, 80);
  assert.equal(sim.get(6, 5) === SAND || sim.get(5, 5) === SAND || sim.get(7, 5) === SAND, true, "sand reached the floor");
  assert.equal(sim.count(WATER), 12, "water conserved");
});

test("fire burns vines, makes smoke, and burns out", () => {
  const sim = new SandSim(20, 10, 5);
  for (let x = 2; x < 18; x++) sim.set(x, 9, PLANT);
  sim.set(2, 8, FIRE);
  let sawSmoke = false;
  for (let i = 0; i < 600; i++) {
    sim.step();
    if (sim.count(SMOKE) > 0) sawSmoke = true;
  }
  assert.ok(sawSmoke);
  assert.ok(sim.count(PLANT) < 16, "some vine burned");
  assert.equal(sim.count(FIRE), 0, "fire burns out");
});

test("water puts fire out", () => {
  const sim = new SandSim(5, 5, 6);
  sim.set(2, 4, FIRE);
  sim.set(2, 3, WATER);
  sim.set(1, 4, WATER);
  sim.set(3, 4, WATER);
  sim.step();
  assert.notEqual(sim.get(2, 4), FIRE);
});

test("vines grow into water", () => {
  const sim = new SandSim(8, 4, 7);
  for (let x = 0; x < 8; x++) sim.set(x, 3, WATER);
  sim.set(0, 2, STONE);
  sim.set(0, 3, PLANT);
  run(sim, 400);
  assert.ok(sim.count(PLANT) > 1);
});

test("simulation is deterministic for a seed", () => {
  const mk = () => {
    const s = new SandSim(40, 30, 42);
    s.paint(20, 3, 4, SAND, 0.6);
    s.paint(10, 5, 3, WATER, 0.6);
    s.paint(30, 25, 2, FIRE);
    run(s, 50);
    return s.cell.join("");
  };
  assert.equal(mk(), mk());
});

test("save / load round trip, including resize", () => {
  const sim = new SandSim(64, 36, 8);
  sim.paint(20, 30, 5, SAND);
  sim.paint(40, 30, 5, STONE);
  sim.set(10, 10, FIRE);
  const bytes = sim.serialize();
  assert.ok(bytes.length < 64 * 36, "compressed");
  const again = new SandSim(64, 36, 9);
  assert.ok(again.load(bytes));
  assert.equal(again.count(SAND), sim.count(SAND));
  assert.equal(again.count(STONE), sim.count(STONE));
  assert.equal(again.count(FIRE), 0, "fire is not saved");
  const bigger = new SandSim(128, 72, 9);
  assert.ok(bigger.load(bytes));
  assert.ok(bigger.count(STONE) > sim.count(STONE));
  assert.equal(new SandSim(4, 4).load(Uint8Array.from([1, 2, 3])), false);
  const b64 = bytesToB64(bytes);
  assert.deepEqual(b64ToBytes(b64), bytes);
});

test("eraser clears", () => {
  const sim = new SandSim(20, 20, 1);
  sim.paint(10, 10, 4, STONE);
  sim.paint(10, 10, 6, EMPTY);
  assert.equal(sim.count(STONE), 0);
});

test("fluid: projection removes divergence", () => {
  const f = new FluidSim(48, 32);
  const rng = makeRng(3);
  // A swirl of cursor-like splats (smooth, divergent), as the scene produces.
  for (let k = 0; k < 12; k++) f.splat(6 + rng() * 36, 6 + rng() * 20, rng() * 4 - 2, rng() * 4 - 2, 4, 0, 0, 0);
  const before = f.divergence();
  f.iterations = 200;
  f.project();
  const after = f.divergence();
  assert.ok(after < before * 0.25, `divergence ${before.toFixed(2)} -> ${after.toFixed(2)}`);
});

test("fluid: a splat is carried downstream and fades", () => {
  const f = new FluidSim(64, 32);
  f.dissipation = 0.99;
  for (let i = 0; i < f.n; i++) f.u[i] = 0.5; // uniform flow to the right, 0.5 cells/step
  f.splat(16, 16, 0, 0, 3, 1, 0.5, 0.2);
  const dye0 = f.totalDye();
  const centroid = () => {
    let s = 0, sx = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const v = f.r[y * f.w + x];
      s += v;
      sx += v * x;
    }
    return sx / s;
  };
  const c0 = centroid();
  for (let k = 0; k < 20; k++) f.step(1);
  const c1 = centroid();
  assert.ok(c1 > c0 + 4, `centroid ${c0.toFixed(1)} -> ${c1.toFixed(1)}`);
  assert.ok(f.totalDye() < dye0, "dye dissipates");
  assert.ok(Number.isFinite(f.totalDye()));
});

test("fluid: deterministic", () => {
  const mk = () => {
    const f = new FluidSim(32, 24);
    f.splat(10, 12, 3, -1, 3, 1, 1, 1);
    for (let k = 0; k < 10; k++) f.step(1);
    return Array.from(f.r.slice(0, 64)).map((v) => v.toFixed(6)).join(",");
  };
  assert.equal(mk(), mk());
});

test("frame caps", () => {
  assert.equal(capFps(144), 60);
  assert.equal(capFps(60), 60);
  assert.equal(capFps(45), 30);
  assert.equal(capFps(15), 15);
  assert.equal(capFps(0), 15);
});

test("settings schema normalisation", () => {
  const o = normaliseOptions(sandScene, { brush: 999, material: "lava", grain: "6", junk: 1 });
  assert.equal(o.brush, 14);
  assert.equal(o.material, "sand");
  assert.equal(o.grain, "6");
  assert.equal("junk" in o, false);
});

test("sky clock: sun height and default day", () => {
  setSkyLocation(0, 0);
  const { rise, set } = dayWindow(new Date(2026, 5, 21));
  assert.equal(rise, 6.5);
  assert.equal(set, 18.5);
  assert.ok(Math.abs(sunHeight(12.5, rise, set) - 1) < 1e-9);
  assert.ok(Math.abs(sunHeight(rise, rise, set)) < 1e-9);
  assert.ok(sunHeight(0.5, rise, set) < -0.9);
  setSkyLocation(51.5, -0.1); // London, midsummer: long day
  const lon = dayWindow(new Date(2026, 5, 21, 12));
  assert.ok(lon.set - lon.rise > 16 && lon.set - lon.rise < 17, `day length ${(lon.set - lon.rise).toFixed(1)}h`);
  // Sunset after local midnight (location far from the machine's time zone) still works.
  assert.ok(sunHeight(lon.rise + 0.1, lon.rise, lon.set) > 0);
  assert.ok(sunHeight(lon.set + 0.1, lon.rise, lon.set) < 0);
  assert.ok(sunHeight(lon.rise + 24 - 0.1, lon.rise, lon.set) < 0);
  setSkyLocation(0, 0);
});
