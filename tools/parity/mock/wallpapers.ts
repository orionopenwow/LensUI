// Sample Wallpaper Switcher library for the parity harness: a dozen "pictures" drawn as small SVG
// landscapes from their own five colours, so the picker's fan, palette chips and colour-matched
// backdrop can be checked in a browser. Mirrors src-tauri/src/wallpapers (LibraryView).

type Meta = { favorite: boolean; hidden: boolean; tags: string[]; collections: string[]; width: number; height: number; palette: string[]; phash: string; thumbed: boolean };

const svg = (p: string[], seed: number) => {
  const sun = 60 + ((seed * 53) % 130);
  const hill = (y: number, a: number, c: string) =>
    `<path d="M0 ${y} C 40 ${y - a}, 90 ${y + a * 0.6}, 128 ${y - a * 0.5} S 220 ${y - a}, 256 ${y + a * 0.2} V160 H0 Z" fill="${c}"/>`;
  const body =
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[4]}"/><stop offset="0.55" stop-color="${p[3]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient></defs>` +
    `<rect width="256" height="160" fill="url(#s)"/><circle cx="${sun}" cy="${44 + (seed % 3) * 9}" r="${14 + (seed % 4) * 3}" fill="${p[4]}" opacity="0.9"/>` +
    hill(104, 22, p[2]) + hill(122, 16, p[1]) + hill(140, 12, p[0]);
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 160" preserveAspectRatio="xMidYMid slice">${body}</svg>`)}`;
};

const PICS: [string, string[], Partial<Meta>][] = [
  ["Dune ridge at dusk", ["#2B1B24", "#6B2F3A", "#C4573F", "#F0A15C", "#FCE3B0"], { favorite: true, collections: ["Warm"], tags: ["desert"] }],
  ["Fjord morning", ["#0E1C2B", "#1F4460", "#3F7F9B", "#8FC3D4", "#E6F3F5"], { collections: ["Calm"], tags: ["water"] }],
  ["Pine fog", ["#0F1A16", "#1F3A30", "#4B6F5C", "#9DB8A6", "#E3ECE4"], { collections: ["Calm"], tags: ["forest"] }],
  ["Neon alley", ["#120B24", "#3A1466", "#B0199B", "#FF5FA8", "#7CF5FF"], { tags: ["city"] }],
  ["Glacier lake", ["#10222E", "#1D5B6E", "#3BA7A8", "#A4E0D5", "#F4FBF7"], { favorite: true, collections: ["Calm"], tags: ["water"] }],
  ["Canyon noon", ["#3A1A12", "#8A3B1E", "#D0703A", "#F2B36C", "#FBE9C8"], { collections: ["Warm"], tags: ["desert"] }],
  ["Lavender field", ["#1D1630", "#4A3478", "#8B6BC7", "#D3B8F0", "#FFE9D6"], { tags: ["field"] }],
  ["Night ferry", ["#060912", "#101C3A", "#28407A", "#F2B441", "#FFF1C2"], { collections: ["Night"], tags: ["city", "water"] }],
  ["Moss and stone", ["#161914", "#3B4532", "#75845A", "#BFC79A", "#EEF0DD"], { tags: ["forest"] }],
  ["Coral reef", ["#06222B", "#0D5A66", "#19A6A0", "#FF8C6B", "#FFE1C4"], { favorite: true, tags: ["water"] }],
  ["Paper cranes", ["#2A2A2E", "#6D6A72", "#B9B3B8", "#E9E2DD", "#FBF8F3"], { collections: ["Calm"] }],
  ["Aurora camp", ["#04121A", "#0D3B3A", "#1FA57A", "#6CF0B0", "#E4FFF2"], { collections: ["Night"], tags: ["sky"] }],
  ["Old film scan", ["#1E1A16", "#4E4034", "#8C7458", "#CDB692", "#F1E6D0"], { hidden: true }],
];

const id = (i: number) => (0x9e3779b97f4an + BigInt(i) * 0x1000193n).toString(16).padStart(16, "0").slice(-16);

export const sampleItems = () =>
  PICS.map(([name, palette, over], i) => ({
    id: id(i),
    path: `C:\\Users\\u\\Pictures\\Wallpapers\\${name}.jpg`,
    name: `${name}.jpg`,
    folder: "C:\\Users\\u\\Pictures\\Wallpapers",
    kind: "image",
    bytes: 2_400_000 + i * 310_000,
    modifiedMs: 1_760_000_000_000 + i * 86_400_000,
    thumb: svg(palette, i + 3),
    // Two pairs share a hash so "Look-alikes" has something to review.
    meta: { favorite: false, hidden: false, tags: [], collections: [], width: 3840, height: 2400, palette, phash: i === 6 ? id(1).replace(/.$/, "0") : id(i), thumbed: true, ...over },
  }));

let settings: any = {
  folders: ["C:\\Users\\u\\Pictures\\Wallpapers"],
  collections: ["Calm", "Warm", "Night"],
  auto: { enabled: false, everyMinutes: 30, atSignIn: false, order: "random", source: "", dayNight: false, daySource: "", nightSource: "", dayHour: 7, nightHour: 19, crossfadeMs: 900 },
  ofTheDay: false,
};
const items = sampleItems();
let current = items[0].id;

const view = () => ({ settings, items, current, lastChangeMs: Date.now() - 12 * 60_000, missing: [], suggested: ["C:\\Users\\u\\Pictures", "C:\\Windows\\Web\\Wallpaper"], truncated: false });

export const wallpaperHandlers: Record<string, (a: any) => any> = {
  wallpapers_library_cmd: () => view(),
  wallpapers_save_settings_cmd: (a) => {
    settings = a.settings;
    return view();
  },
  wallpapers_set_meta_cmd: () => null,
  wallpapers_read_cmd: () => Promise.reject("Only pictures in a watched folder have a preview."),
  wallpapers_save_thumb_cmd: () => "",
  wallpapers_set_cmd: (a) => {
    current = a.id;
    const it = items.find((i) => i.id === a.id) ?? items[0];
    return { id: it.id, name: it.name, file: `lib-${it.id}.jpg`, crossfadeMs: 900 };
  },
  wallpapers_step_cmd: () => {
    const next = items[(items.findIndex((i) => i.id === current) + 1) % items.length];
    current = next.id;
    return { id: next.id, name: next.name, file: `lib-${next.id}.jpg`, crossfadeMs: 900 };
  },
  wallpapers_tick_cmd: () => null,
  wallpapers_recycle_cmd: () => null,
  wallpapers_reveal_cmd: () => null,
};
