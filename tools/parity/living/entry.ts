// Living Themes gallery for screenshots and time-lapses (docs/LIVING_THEMES.md).
//   ?theme=<id>&iso=<instant>&lat=&lon=&weather=   one full-viewport frame, half resolution upscaled,
//                                                  exactly as the wallpaper draws it.
// window.render(iso) repaints at another instant; window.look(theme, iso, lat, lon) returns the
// glass/accent the tint controller would apply then (to dress the Dock and widgets pages).
import { makeFrame, type WeatherKind } from "../../../src/playground/living/sky";
import { painterById } from "../../../src/playground/living/themes";
import { packById } from "../../../src/themes/packs";
import { livingLook } from "../../../src/themes/living/tint";
import { DEFAULT_LIVING } from "../../../src/playground/living/settings";
import { sunTimes } from "../../../src/themes/schedule";

const q = new URLSearchParams(location.search);
const theme = q.get("theme") ?? "living-sky";
const lat = Number(q.get("lat") ?? "51.5");
const lon = Number(q.get("lon") ?? "-0.1");
const weather = (q.get("weather") ?? "clear") as WeatherKind;
const clouds = q.get("clouds") !== "0";
const root = document.getElementById("root")!;
const c = document.createElement("canvas");
root.append(c);
const p = painterById(theme)!;
const w = Math.round(innerWidth / 2), h = Math.round(innerHeight / 2);
c.width = w;
c.height = h;
c.style.width = `${innerWidth}px`;
c.style.height = `${innerHeight}px`;
const g = c.getContext("2d", { alpha: false })!;
const img = g.createImageData(w, h);
const px = new Uint32Array(img.data.buffer);
const state = p.init(w, h, 7);
let t = 20;

function render(iso: string, tt = t) {
  t = tt;
  const f = makeFrame({ date: new Date(iso), latitude: lat, longitude: lon, t, motion: 1, clouds, weather, view: { x0: 0, x1: 1 } });
  p.paint(px, w, h, f, state);
  g.putImageData(img, 0, 0);
  return { altitude: f.sun.altitude, stage: f.stage, moon: f.moon.phase };
}

function look(themeId: string, iso: string, la = lat, lo = lon, tint = true) {
  const pack = packById(themeId)!;
  return livingLook({ packId: pack.id, packBase: pack.base!, packAccent: pack.accent, packLight: pack.scheme === "light", date: new Date(iso), latitude: la, longitude: lo, tint, settings: { ...DEFAULT_LIVING, weather: { online: false, manual: weather } } });
}

(window as any).render = render;
(window as any).times = (dayIso: string) => {
  const st = sunTimes(new Date(dayIso), lat, lon);
  return { sunrise: st.sunrise?.toISOString() ?? null, sunset: st.sunset?.toISOString() ?? null };
};
(window as any).look = look;
(window as any).info = render(q.get("iso") ?? new Date().toISOString());
(window as any).ready = true;
