import { describe, expect, test } from "bun:test";
import { moonState, separation, skyStage, solarNoonUtcMinutes, starVisibility, sunPosition, TWILIGHT } from "../playground/living/astro";
import { makeFrame, paintSky, initSky, skyColours, project, DEFAULT_LAYOUT, type LivingInputs } from "../playground/living/sky";
import { LIVING_PAINTERS, constellationFor, goldenness, painterById, seasonOf, tideLevel, windowsLit } from "../playground/living/themes";
import { hashPixels } from "../playground/living/pixel";
import { locationFromTimeZone, normaliseLiving, parseLocation, DEFAULT_LIVING } from "../playground/living/settings";
import { kindFromWmo, refreshWeather, weatherUrl, WEATHER_TTL_MS, clearWeatherCache, currentWeather } from "../playground/living/weather";
import { renderScale, viewForMonitor, LIVING_SCENES } from "../playground/living/module";
import { sunTimes } from "../themes/schedule";
import { LIVING_PACKS, isLivingPack } from "../themes/living/packs";
import { INK_DARK, INK_LIGHT, livingLook, fitContrast } from "../themes/living/tint";
import { THEME_PACKS, COMMUNITY_PACKS, allPacks, applyThemePack, contrastRatio, packByAlias, packById } from "../themes/packs";
import { SCENES, sceneById } from "../playground/registry";

const at = (iso: string) => new Date(iso);

/** Finds when the apparent solar altitude crosses the sunrise/sunset threshold (bisection). */
function crossing(lat: number, lon: number, fromIso: string, toIso: string): Date {
  let a = at(fromIso).getTime(), b = at(toIso).getTime();
  const f = (t: number) => sunPosition(new Date(t), lat, lon).altitude - TWILIGHT.horizon;
  const fa = f(a);
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (Math.sign(f(m)) === Math.sign(fa)) a = m;
    else b = m;
  }
  return new Date((a + b) / 2);
}
const minutesBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000;

describe("NOAA solar position", () => {
  test("London, June solstice: noon altitude matches 90 − φ + δ", () => {
    const noon = solarNoonUtcMinutes(at("2024-06-21T00:00:00Z"), -0.1278);
    expect(Math.abs(noon - 722.3)).toBeLessThan(1.5); // 12:02 UTC
    const s = sunPosition(new Date(Date.UTC(2024, 5, 21) + noon * 60_000), 51.5074, -0.1278);
    expect(Math.abs(s.altitude - 61.95)).toBeLessThan(0.15);
    expect(Math.abs(s.azimuth - 180)).toBeLessThan(0.5);
    expect(Math.abs(s.declination - 23.44)).toBeLessThan(0.05);
  });

  // Published sunrise/sunset times (local clock times converted to UTC).
  const RISE_SET: [string, number, number, string, string, string, string][] = [
    ["London 2024-06-21", 51.5074, -0.1278, "2024-06-21T03:00:00Z", "2024-06-21T05:00:00Z", "2024-06-21T03:43:00Z", "2024-06-21T20:21:00Z"],
    ["New York 2024-06-21", 40.7128, -74.006, "2024-06-21T08:30:00Z", "2024-06-21T10:30:00Z", "2024-06-21T09:25:00Z", "2024-06-22T00:31:00Z"],
    ["Sydney 2024-12-21", -33.8688, 151.2093, "2024-12-20T17:30:00Z", "2024-12-20T20:00:00Z", "2024-12-20T18:41:00Z", "2024-12-21T09:05:00Z"],
  ];
  for (const [name, lat, lon, from, to, rise, set] of RISE_SET) {
    test(`${name}: sunrise and sunset within 2 minutes of published times`, () => {
      expect(minutesBetween(crossing(lat, lon, from, to), at(rise))).toBeLessThan(2);
      const setFrom = new Date(at(set).getTime() - 3_600_000).toISOString();
      const setTo = new Date(at(set).getTime() + 3_600_000).toISOString();
      expect(minutesBetween(crossing(lat, lon, setFrom, setTo), at(set))).toBeLessThan(2);
    });
  }

  test("agrees with the Theme Schedule's sunrise/sunset within 3 minutes across cities and dates", () => {
    const places: [number, number][] = [[51.5, -0.1], [40.7, -74], [-33.9, 151.2], [1.3, 103.8], [64.1, -21.9], [35.7, 139.7]];
    const dates = ["2025-01-15", "2025-03-20", "2025-06-21", "2025-09-23", "2025-12-21"];
    for (const [lat, lon] of places) {
      for (const d of dates) {
        const st = sunTimes(at(`${d}T12:00:00Z`), lat, lon);
        if (st.polar) continue;
        const r = st.sunrise!;
        const ours = crossing(lat, lon, new Date(r.getTime() - 2 * 3_600_000).toISOString(), new Date(r.getTime() + 2 * 3_600_000).toISOString());
        expect(minutesBetween(ours, r)).toBeLessThan(3);
      }
    }
  });

  test("equator at the March equinox: the Sun passes almost overhead", () => {
    const noon = solarNoonUtcMinutes(at("2024-03-20T00:00:00Z"), 0);
    const s = sunPosition(new Date(Date.UTC(2024, 2, 20) + noon * 60_000), 0, 0);
    expect(s.altitude).toBeGreaterThan(89.5);
  });

  test("polar night and midnight sun (Tromsø, 69.65°N)", () => {
    // December: the Sun never rises; its noon altitude is about 90 − 69.65 − 23.44 = −3.1°.
    let maxDec = -90;
    for (let m = 0; m < 1440; m += 10) maxDec = Math.max(maxDec, sunPosition(new Date(Date.UTC(2024, 11, 21) + m * 60_000), 69.65, 18.96).altitude);
    expect(maxDec).toBeLessThan(-2.5);
    expect(maxDec).toBeGreaterThan(-3.6);
    expect(skyStage(maxDec)).toBe("civil");
    // June: the Sun never sets; lowest ≈ 69.65 + 23.44 − 90 = 3.1° (+ refraction).
    let minJun = 90;
    for (let m = 0; m < 1440; m += 10) minJun = Math.min(minJun, sunPosition(new Date(Date.UTC(2024, 5, 21) + m * 60_000), 69.65, 18.96).altitude);
    expect(minJun).toBeGreaterThan(2.8);
    expect(minJun).toBeLessThan(3.8);
    expect(sunTimes(at("2024-06-21T12:00:00Z"), 69.65, 18.96).polar).toBe("day");
    expect(sunTimes(at("2024-12-21T12:00:00Z"), 69.65, 18.96).polar).toBe("night");
  });

  test("total solar eclipse, Dallas 2024-04-08 18:42 UTC: Sun and Moon coincide", () => {
    const d = at("2024-04-08T18:42:00Z");
    const s = sunPosition(d, 32.78, -96.8);
    const m = moonState(d, 32.78, -96.8);
    expect(separation(s, m)).toBeLessThan(2);
    expect(Math.abs(s.altitude - 64.6)).toBeLessThan(1);
    expect(m.illumination).toBeLessThan(0.01);
  });
});

describe("Moon", () => {
  const FULL = ["2024-01-25T17:54:00Z", "2025-03-14T06:59:00Z", "2025-09-07T18:12:00Z"];
  const NEW = ["2024-01-11T11:57:00Z", "2024-04-08T18:21:00Z"];
  test("full moons: lit disc and phase ≈ 0.5", () => {
    for (const iso of FULL) {
      const m = moonState(at(iso), 0, 0);
      expect(m.illumination).toBeGreaterThan(0.99);
      expect(Math.abs(m.phase - 0.5)).toBeLessThan(0.02);
    }
  });
  test("new moons: dark disc and phase ≈ 0", () => {
    for (const iso of NEW) {
      const m = moonState(at(iso), 0, 0);
      expect(m.illumination).toBeLessThan(0.01);
      expect(Math.min(m.phase, 1 - m.phase)).toBeLessThan(0.02);
    }
  });
  test("quarters: first quarter waxing at 0.25, last quarter waning at 0.75", () => {
    const fq = moonState(at("2024-01-18T03:53:00Z"), 0, 0);
    expect(Math.abs(fq.phase - 0.25)).toBeLessThan(0.02);
    expect(fq.waxing).toBe(true);
    expect(Math.abs(fq.illumination - 0.5)).toBeLessThan(0.05);
    const lq = moonState(at("2024-02-02T23:18:00Z"), 0, 0);
    expect(Math.abs(lq.phase - 0.75)).toBeLessThan(0.02);
    expect(lq.waxing).toBe(false);
  });
  test("total lunar eclipse 2025-09-07: Moon opposite the Sun", () => {
    const d = at("2025-09-07T18:12:00Z");
    const s = sunPosition(d, 28.6, 77.2);
    const m = moonState(d, 28.6, 77.2);
    expect(separation(s, m)).toBeGreaterThan(176);
  });
  test("the bright limb faces the Sun", () => {
    // Evening crescent (waxing, Sun just set in the west): lit side points down-right towards the Sun.
    const d = at("2024-01-14T18:00:00Z");
    const m = moonState(d, 51.5, -0.1);
    const s = sunPosition(d, 51.5, -0.1);
    expect(m.waxing).toBe(true);
    const sunIsRight = s.azimuth > m.azimuth;
    const limbRight = Math.sin((m.brightLimb * Math.PI) / 180) > 0;
    expect(limbRight).toBe(sunIsRight);
  });
});

describe("twilight", () => {
  test("stage thresholds", () => {
    expect(skyStage(30)).toBe("day");
    expect(skyStage(6)).toBe("day");
    expect(skyStage(5.9)).toBe("golden");
    expect(skyStage(0)).toBe("golden");
    expect(skyStage(-0.3)).toBe("civil");
    expect(skyStage(-6)).toBe("civil");
    expect(skyStage(-6.01)).toBe("nautical");
    expect(skyStage(-12)).toBe("nautical");
    expect(skyStage(-12.01)).toBe("astronomical");
    expect(skyStage(-18)).toBe("astronomical");
    expect(skyStage(-18.01)).toBe("night");
  });
  test("stars fade in monotonically from −2° and are all out by astronomical twilight", () => {
    expect(starVisibility(0)).toBe(0);
    expect(starVisibility(-2)).toBe(0);
    expect(starVisibility(-16)).toBe(1);
    let prev = -1;
    for (let a = 10; a >= -20; a -= 0.5) {
      const v = starVisibility(a);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  test("the zenith brightens monotonically with the Sun's altitude through twilight into day", () => {
    let prev = -1;
    for (let a = -30; a <= 20; a += 1) {
      const z = skyColours(a).zenith;
      const l = 0.2126 * z.r + 0.7152 * z.g + 0.0722 * z.b;
      expect(l).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = l;
    }
  });
  test("sunrise is warm at the horizon, noon is blue, night is navy", () => {
    const rise = skyColours(0.5).horizon;
    expect(rise.r).toBeGreaterThan(rise.b + 60);
    const noon = skyColours(60).zenith;
    expect(noon.b).toBeGreaterThan(noon.r + 80);
    const night = skyColours(-30).zenith;
    expect(night.r + night.g + night.b).toBeLessThan(40);
  });
});

const input = (iso: string, lat = 51.5, lon = -0.13, extra: Partial<LivingInputs> = {}): LivingInputs => ({
  date: at(iso), latitude: lat, longitude: lon, t: 12, motion: 1, clouds: true, weather: "rain", view: { x0: 0, x1: 1 }, ...extra,
});

describe("painters", () => {
  test("every painter is deterministic for the same frame, size and seed", () => {
    for (const p of LIVING_PAINTERS) {
      for (const iso of ["2026-06-21T12:00:00Z", "2026-06-21T20:15:00Z", "2026-06-21T23:30:00Z"]) {
        const f = makeFrame(input(iso));
        const a = new Uint32Array(320 * 180), b = new Uint32Array(320 * 180);
        p.paint(a, 320, 180, f, p.init(320, 180, 7));
        p.paint(b, 320, 180, f, p.init(320, 180, 7));
        expect(hashPixels(a)).toBe(hashPixels(b));
      }
    }
  });
  test("the picture actually changes with the time of day", () => {
    for (const p of LIVING_PAINTERS) {
      const hashes = new Set<number>();
      for (const iso of ["2026-06-21T03:50:00Z", "2026-06-21T12:00:00Z", "2026-06-21T23:30:00Z"]) {
        const px = new Uint32Array(160 * 90);
        p.paint(px, 160, 90, makeFrame(input(iso)), p.init(160, 90, 7));
        hashes.add(hashPixels(px));
      }
      expect(hashes.size).toBe(3);
    }
  });
  test("Sun on screen: east in the morning (left), west in the evening (right), centred at noon", () => {
    const w = 400, h = 225;
    const xAt = (iso: string) => project(makeFrame(input(iso)).sun.altitude, makeFrame(input(iso)).sun.azimuth, makeFrame(input(iso)), w, h, DEFAULT_LAYOUT).x;
    expect(xAt("2026-06-21T06:00:00Z")).toBeLessThan(w * 0.4);
    expect(Math.abs(xAt("2026-06-21T12:02:00Z") - w / 2)).toBeLessThan(w * 0.02);
    expect(xAt("2026-06-21T18:00:00Z")).toBeGreaterThan(w * 0.6);
  });
  test("one continuous sky: two half-views tile the full view", () => {
    const f = makeFrame(input("2026-06-21T18:30:00Z", 51.5, -0.13, { clouds: false, motion: 0 }));
    const full = project(f.sun.altitude, f.sun.azimuth, f, 800, 200, DEFAULT_LAYOUT).x;
    const right = makeFrame(input("2026-06-21T18:30:00Z", 51.5, -0.13, { view: { x0: 0.5, x1: 1 }, clouds: false, motion: 0 }));
    const rx = project(right.sun.altitude, right.sun.azimuth, right, 400, 200, DEFAULT_LAYOUT).x;
    expect(Math.abs(400 + rx - full)).toBeLessThan(0.5);
    expect(viewForMonitor([{ id: "a", x: 0, width: 1920 }, { id: "b", x: 1920, width: 1920 }], "b")).toEqual({ x0: 0.5, x1: 1 });
    expect(viewForMonitor([], "b")).toEqual({ x0: 0, x1: 1 });
  });
  test("a still frame (motion 0) does not depend on the animation clock", () => {
    const p = painterById("living-sky")!;
    const a = new Uint32Array(200 * 120), b = new Uint32Array(200 * 120);
    p.paint(a, 200, 120, makeFrame(input("2026-06-21T23:30:00Z", 51.5, -0.13, { motion: 0, t: 1 })), p.init(200, 120, 3));
    p.paint(b, 200, 120, makeFrame(input("2026-06-21T23:30:00Z", 51.5, -0.13, { motion: 0, t: 999 })), p.init(200, 120, 3));
    expect(hashPixels(a)).toBe(hashPixels(b));
  });
  test("paintSky reports the Sun below the horizon at night and visible by day", () => {
    const s = initSky(1);
    const px = new Uint32Array(200 * 120);
    expect(paintSky(px, 200, 120, makeFrame(input("2026-06-21T12:00:00Z")), s).sun.visible).toBe(true);
    expect(paintSky(px, 200, 120, makeFrame(input("2026-06-21T23:30:00Z")), s).sun.visible).toBe(false);
  });

  test("frame time under 3 ms at half of 1080p (960×540), each painter in its own process", () => {
    const budget = Number(process.env.LIVING_FRAME_BUDGET_MS ?? 3);
    const script = new URL("../playground/living/bench.ts", import.meta.url).pathname;
    for (const p of LIVING_PAINTERS) {
      const out = Bun.spawnSync([process.execPath, script, p.id], { stdout: "pipe", stderr: "pipe" });
      const line = new TextDecoder().decode(out.stdout).trim().split("\n").pop() ?? "{}";
      const r = JSON.parse(line) as { p25: number; median: number; worstTime: string };
      // p25 is the steady-state cost; the median guards against a pathological path.
      expect({ id: p.id, ok: r.p25 < budget }).toEqual({ id: p.id, ok: true });
      expect({ id: p.id, ok: r.median < budget * 2.5 }).toEqual({ id: p.id, ok: true });
    }
  }, 120_000);
});

describe("family behaviour", () => {
  test("Seasons follow date and hemisphere", () => {
    expect(seasonOf(at("2026-04-15T12:00:00Z"), 51)).toBe("spring");
    expect(seasonOf(at("2026-07-15T12:00:00Z"), 51)).toBe("summer");
    expect(seasonOf(at("2026-10-15T12:00:00Z"), 51)).toBe("autumn");
    expect(seasonOf(at("2026-01-15T12:00:00Z"), 51)).toBe("winter");
    expect(seasonOf(at("2026-07-15T12:00:00Z"), -33)).toBe("winter");
    expect(seasonOf(at("2026-01-15T12:00:00Z"), -33)).toBe("summer");
  });
  test("Golden Hour peaks at the real sunset", () => {
    // London 2026-06-21: sunset ≈ 20:21 UTC. Scan the evening; the peak must be within 30 minutes of it.
    let best = 0, bestT = 0;
    for (let m = 17 * 60; m < 23 * 60; m += 2) {
      const d = new Date(Date.UTC(2026, 5, 21) + m * 60_000);
      const g = goldenness(makeFrame(input(d.toISOString())));
      if (g > best) {
        best = g;
        bestT = d.getTime();
      }
    }
    const st = sunTimes(at("2026-06-21T12:00:00Z"), 51.5, -0.13);
    expect(Math.abs(bestT - st.sunset!.getTime()) / 60_000).toBeLessThan(30);
    expect(goldenness(makeFrame(input("2026-06-21T12:00:00Z")))).toBeLessThan(0.01);
  });
  test("City Night: windows dark at noon, lit after sunset, thinner in the small hours", () => {
    expect(windowsLit(makeFrame(input("2026-12-10T12:00:00Z")))).toBe(0);
    const evening = windowsLit(makeFrame(input("2026-12-10T19:00:00Z")));
    const small = windowsLit(makeFrame(input("2026-12-10T03:00:00Z")));
    expect(evening).toBeGreaterThan(0.6);
    expect(small).toBeLessThan(evening / 2);
  });
  test("Tides: semidiurnal (two highs a lunar day), bigger at springs", () => {
    const series: number[] = [];
    for (let h = 0; h < 25; h += 0.25) series.push(tideLevel(makeFrame(input(new Date(Date.UTC(2025, 8, 7) + h * 3_600_000).toISOString()))));
    let highs = 0;
    for (let i = 1; i < series.length - 1; i++) if (series[i] > series[i - 1] && series[i] >= series[i + 1] && series[i] > 0.5) highs++;
    expect(highs).toBe(2);
    const spring = Math.max(...series);
    const neap: number[] = [];
    for (let h = 0; h < 25; h += 0.25) neap.push(tideLevel(makeFrame(input(new Date(Date.UTC(2025, 8, 14) + h * 3_600_000).toISOString()))));
    expect(spring).toBeGreaterThan(Math.max(...neap));
  });
  test("Moonlight picks the season's constellation per hemisphere", () => {
    expect(constellationFor(at("2026-01-10T00:00:00Z"), 51)).toBe("orion");
    expect(constellationFor(at("2026-08-10T00:00:00Z"), 51)).toBe("cygnus");
    expect(constellationFor(at("2026-06-10T00:00:00Z"), -33)).toBe("crux");
  });
});

describe("tint and packs", () => {
  const PLACES: [string, number, number][] = [["London", 51.5, -0.1], ["Sydney", -33.9, 151.2], ["Tromsø", 69.6, 19], ["Singapore", 1.3, 103.8]];
  const DATES = ["2026-03-20", "2026-06-21", "2026-09-23", "2026-12-21"];
  test("living looks keep ink and accent ≥ 4.5:1 on every surface, all packs, places and hours", () => {
    let checked = 0;
    for (const pack of [...LIVING_PACKS, ...THEME_PACKS.filter((p) => p.base)]) {
      for (const tint of [true, false]) {
        if (!tint && !isLivingPack(pack.id)) continue;
        for (const [, lat, lon] of PLACES) {
          for (const d of DATES) {
            for (let h = 0; h < 24; h += 3) {
              const look = livingLook({ packId: pack.id, packBase: pack.base!, packAccent: pack.accent, packLight: pack.scheme === "light", date: new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`), latitude: lat, longitude: lon, tint, settings: DEFAULT_LIVING });
              const ink = look.scheme === "light" ? INK_LIGHT : INK_DARK;
              for (const surface of [look.base, look.elevated]) {
                expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(look.accent, surface)).toBeGreaterThanOrEqual(4.5);
              }
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });
  test("living packs: light by day and dark at night (Sun-based, like the Theme Schedule)", () => {
    const p = LIVING_PACKS[0];
    const look = (iso: string, lat = 51.5, lon = -0.1) => livingLook({ packId: p.id, packBase: p.base!, packAccent: p.accent, packLight: false, date: at(iso), latitude: lat, longitude: lon, tint: true, settings: DEFAULT_LIVING });
    expect(look("2026-06-21T12:00:00Z").scheme).toBe("light");
    expect(look("2026-06-21T23:30:00Z").scheme).toBe("dark");
    expect(look("2026-12-21T11:00:00Z", 69.6, 19).scheme).toBe("dark"); // polar night
    expect(look("2026-06-21T23:00:00Z", 69.6, 19).scheme).toBe("light"); // midnight sun
  });
  test("non-living packs keep their own scheme when tinted", () => {
    const dark = THEME_PACKS.find((p) => p.id === "tokyo-night")!;
    const l = livingLook({ packId: dark.id, packBase: dark.base!, packAccent: dark.accent, packLight: false, date: at("2026-06-21T12:00:00Z"), latitude: 51.5, longitude: -0.1, tint: true, settings: DEFAULT_LIVING });
    expect(l.scheme).toBe("dark");
  });
  test("fitContrast keeps the hue family and reaches the target", () => {
    const out = fitContrast({ r: 120, g: 140, b: 200 }, ["#0B1230", "#141B38"], true);
    expect(contrastRatio(out, "#0B1230")).toBeGreaterThanOrEqual(4.5);
  });
  test("packs are registered without touching the community collection", () => {
    expect(LIVING_PACKS.length).toBe(9);
    for (const p of LIVING_PACKS) {
      expect(packById(p.id)).toBe(p);
      expect(allPacks()).toContain(p);
      expect(COMMUNITY_PACKS).not.toContain(p);
      expect(p.tier).toBe("Living");
      expect(contrastRatio(p.base!, "#FAFAFA")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.accent, p.base!)).toBeGreaterThanOrEqual(4.5);
      expect(p.recommended).toBeFalsy();
      // Each pack has its own living wallpaper (same id).
      expect(sceneById(p.id)?.id).toBe(p.id);
    }
    expect(packByAlias("northern lights")?.id).toBe("living-aurora");
    const cfg = applyThemePack({ theme: {}, windowControls: {}, dock: { pinnedFolders: [] } } as never, "living-sky");
    expect(cfg.theme.preset).toBe("living-sky");
  });
  test("living scenes are registered once, calm and capped at 10 fps", () => {
    for (const m of LIVING_SCENES) {
      expect(SCENES.filter((s) => s.id === m.id).length).toBe(1);
      expect(m.maxFps).toBeLessThanOrEqual(15);
      expect(m.maxFps).toBeGreaterThanOrEqual(6);
      expect(m.interactive).toBe(false);
    }
    expect(renderScale(1920)).toBe(0.5);
    expect(renderScale(3840)).toBeCloseTo(1 / 3);
  });
});

describe("privacy: location and weather", () => {
  test("defaults: tint off, live weather off, automatic location", () => {
    const s = normaliseLiving({});
    expect(s.tint).toBe(false);
    expect(s.weather.online).toBe(false);
    expect(s.location.mode).toBe("auto");
  });
  test("manual location parsing rounds to 0.1°", () => {
    expect(parseLocation("51.5074, -0.1278")).toEqual({ latitude: 51.5, longitude: -0.1, label: "51.5, -0.1" });
    expect(parseLocation("Tokyo")?.latitude).toBe(35.7);
    expect(parseLocation("100, 0")).toBeNull();
    expect(parseLocation("nowhere")).toBeNull();
  });
  test("time zone approximation", () => {
    expect(locationFromTimeZone("Europe/London", 0)).toEqual({ latitude: 51.5, longitude: -0.1 });
    expect(locationFromTimeZone("Etc/Unknown", 120)).toEqual({ latitude: 40, longitude: 30 });
    expect(locationFromTimeZone("Australia/Eucla", 525).latitude).toBeLessThan(0);
  });
  test("WMO codes map to the six looks", () => {
    expect(kindFromWmo(0)).toBe("clear");
    expect(kindFromWmo(3)).toBe("cloudy");
    expect(kindFromWmo(45)).toBe("fog");
    expect(kindFromWmo(61)).toBe("rain");
    expect(kindFromWmo(81)).toBe("rain");
    expect(kindFromWmo(73)).toBe("snow");
    expect(kindFromWmo(95)).toBe("storm");
  });
  test("the weather URL carries only coordinates rounded to 0.1°", () => {
    const u = new URL(weatherUrl(51.50741, -0.12781));
    expect(u.host).toBe("api.open-meteo.com");
    expect(u.searchParams.get("latitude")).toBe("51.5");
    expect(u.searchParams.get("longitude")).toBe("-0.1");
    expect([...u.searchParams.keys()].sort()).toEqual(["current", "latitude", "longitude"]);
  });
  test("no request when live weather is off; one cached request per 30 minutes when on", async () => {
    clearWeatherCache();
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ current: { weather_code: 63 } }) };
    };
    const off = normaliseLiving({ location: { mode: "manual", latitude: 48.85, longitude: 2.35, label: "" } });
    await refreshWeather(off, 1_000_000, fetcher);
    expect(calls.length).toBe(0);
    expect(currentWeather(off, 1_000_000)).toBe("clear");
    const on = normaliseLiving({ ...off, weather: { online: true, manual: "clear" } });
    await refreshWeather(on, 1_000_000, fetcher);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("latitude=48.9&longitude=2.4");
    await refreshWeather(on, 1_000_000 + WEATHER_TTL_MS - 1000, fetcher);
    expect(calls.length).toBe(1);
    expect(currentWeather(on, 1_000_000 + 60_000)).toBe("rain");
    await refreshWeather(on, 1_000_000 + WEATHER_TTL_MS + 1, fetcher);
    expect(calls.length).toBe(2);
    clearWeatherCache();
  });
});
