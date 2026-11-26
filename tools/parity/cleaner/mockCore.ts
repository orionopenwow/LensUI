// Parity mock for Lens Cleaner: the base harness mock plus every cleaner command with sample data
// modelled on a real "almost full" 238 GB laptop drive. Nothing touches the file system.
import { invoke as baseInvoke } from "../mock/core";
import { emitLocal } from "../mock/event";

export { convertFileSrc, isTauri } from "../mock/core";

const GB = 1_000_000_000;
const MB = 1_000_000;
const params = new URLSearchParams(location.search);
const scene = params.get("scene") || "home";
const live = scene === "flow";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const item = (path: string, size: number, ageDays = 0, note?: string, link?: string) => ({ path, size, ageDays, note: note ?? null, link: link ?? null });
const cat = (id: string, title: string, description: string, cost: string, icon: string, safety: string, method: string, preTicked: boolean, size: number, count: number, items: any[] = [], extra: any = {}) => ({
  id,
  title,
  description,
  cost,
  icon,
  safety,
  method,
  preTicked,
  size,
  count,
  items,
  partial: false,
  action: null,
  ...extra,
});

const U = "C:\\Users\\levi";
export const REPORT = {
  categories: [
    cat("browser-cache", "Browser cache", "Copies of websites your browsers saved to load pages faster. Your logins, history and passwords stay.", "Sites load a little slower the first time.", "globe", "SAFE", "deleteFiles", true, 9.8 * GB, 48211, [
      item(`${U}\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data\\data_3`, 412 * MB, 2),
      item(`${U}\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Code Cache\\js\\index`, 188 * MB, 5),
      item(`${U}\\AppData\\Local\\Mozilla\\Firefox\\Profiles\\x8f2.default\\cache2\\entries\\9A1F`, 96 * MB, 1),
    ]),
    cat("temp", "Temporary files", "Leftovers apps made while working. Only files older than a day.", "Nothing you'll notice. Files still in use are skipped.", "clock", "SAFE", "deleteFiles", true, 6.4 * GB, 9120, [item(`${U}\\AppData\\Local\\Temp\\NVIDIA Corporation\\NV_Cache.bin`, 1.2 * GB, 12), item(`${U}\\AppData\\Local\\Temp\\vs_setup_bootstrapper.log`, 220 * MB, 30)]),
    cat("app-cache", "App caches", "Discord, VS Code, Slack, Teams, Spotify and developer tools keep copies they can fetch again.", "Apps re-download what they need.", "box", "SAFE", "deleteFiles", true, 5.1 * GB, 12880, [item(`${U}\\AppData\\Local\\Spotify\\Data\\a1\\b2.file`, 2.2 * GB, 3), item(`${U}\\AppData\\Roaming\\discord\\Cache\\Cache_Data\\f_00a1`, 610 * MB, 1)]),
    cat("recycle-bin", "Recycle Bin", "Things you already deleted. Emptying it makes that permanent.", "Once emptied, those files are gone for good.", "trash", "SAFE", "emptyRecycleBin", true, 4.2 * GB, 311),
    cat("shader-cache", "Shader cache", "Graphics your GPU pre-built for games. Safe to clear; games rebuild it.", "Games may stutter for a minute the next time you play.", "cpu", "SAFE", "deleteFiles", false, 3.4 * GB, 2210, [item(`${U}\\AppData\\Local\\NVIDIA\\DXCache\\c2f1a.toc`, 820 * MB, 20)]),
    cat("crash-reports", "Crash reports", "Memory dumps and error reports from apps that crashed.", "Old crash details are gone.", "alert", "SAFE", "deleteFiles", true, 2.3 * GB, 41, [item(`${U}\\AppData\\Local\\CrashDumps\\Game.exe.14220.dmp`, 1.9 * GB, 44)]),
    cat("thumbnails", "Thumbnail cache", "Little previews File Explorer saved. Windows makes them again as you browse.", "Thumbnails redraw once.", "image", "SAFE", "deleteFiles", true, 1.3 * GB, 9),
    cat("windows-update", "Windows Update leftovers", "Old versions of system files replaced by updates. Windows' own tool removes them.", "You can't uninstall updates that are already installed. Needs admin (Windows asks).", "refresh", "ADMIN", "elevated", false, 8.9 * GB, 1204, [], { action: "component-cleanup" }),
    cat("windows-old", "Old Windows", "Your previous version of Windows, kept after an upgrade.", "You can't go back to that version. Windows removes it from its own page.", "history", "ADMIN", "openSettings", false, 24.1 * GB, 182_400, [], { action: "ms-settings:storagecleanup" }),
    cat("big-downloads", "Big downloads", "Large files in Downloads you haven't touched in a month.", "They go to the Recycle Bin, so you can still get them back.", "download", "REVIEW", "recycleFiles", false, 41.6 * GB, 6, [
      item(`${U}\\Downloads\\Dune Part Two 2160p.mkv`, 22.4 * GB, 96),
      item(`${U}\\Downloads\\raw-footage-wedding.zip`, 11.8 * GB, 210),
      item(`${U}\\Downloads\\ubuntu-24.04-desktop-amd64.iso`, 6.1 * GB, 140),
      item(`${U}\\Downloads\\podcast-ep-41-master.wav`, 1.3 * GB, 64),
    ]),
    cat("old-installers", "Old installers", "Setup files and disk images you've probably already installed.", "They go to the Recycle Bin.", "package", "REVIEW", "recycleFiles", false, 3.9 * GB, 23, [item(`${U}\\Downloads\\VisualStudioSetup.exe`, 4.2 * MB, 300), item(`${U}\\Downloads\\Blender-4.1-windows-x64.msi`, 340 * MB, 190), item(`${U}\\Downloads\\NVIDIA-GeForce-Experience.exe`, 160 * MB, 400)]),
    cat("duplicates", "Duplicate files", "Exact copies of big files in Downloads. We keep the original and offer the extras.", "Copies go to the Recycle Bin. Checked byte for byte.", "copy", "REVIEW", "recycleFiles", false, 7.2 * GB, 3, [item(`${U}\\Downloads\\raw-footage-wedding (1).zip`, 7.2 * GB, 30, "Same as raw-footage-wedding.zip")]),
    cat("unused-games", "Unplayed games", "Steam games you haven't opened in two months. Steam removes them; you can reinstall any time.", "Steam's own uninstaller runs. Saves usually stay in the cloud.", "gamepad", "REVIEW", "storeUninstall", false, 186.4 * GB, 3, [
      item("D:\\SteamLibrary\\steamapps\\common\\Call of Duty HQ", 142.8 * GB, 120, "Call of Duty", "steam://uninstall/1938090"),
      item("C:\\Program Files (x86)\\Steam\\steamapps\\common\\Red Dead Redemption 2", 121 * GB * 0.36, 230, "Red Dead Redemption 2", "steam://uninstall/1174180"),
    ]),
  ],
  safeBytes: 32.5 * GB,
  reviewBytes: 272.1 * GB,
  elapsedMs: 4100,
};

const node = (id: number, name: string, path: string, size: number, kind = "dir", children: any[] = [], extra: any = {}) => ({ id, name, path, size, files: Math.round(size / 900_000), kind, hasChildren: kind === "dir", ageDays: 12, note: null, children, ...extra });
const C = "C:\\";
const users = node(1, "Users", "C:\\Users", 98.4 * GB, "dir", [
  node(11, "levi", `${U}`, 96.1 * GB, "dir", [node(111, "Downloads", `${U}\\Downloads`, 52.3 * GB), node(112, "AppData", `${U}\\AppData`, 28.2 * GB), node(113, "Videos", `${U}\\Videos`, 9.4 * GB), node(114, "Documents", `${U}\\Documents`, 4.1 * GB)]),
  node(12, "Public", "C:\\Users\\Public", 2.3 * GB),
]);
const ROOT_KIDS = [
  users,
  node(2, "Program Files (x86)", "C:\\Program Files (x86)", 54.2 * GB, "dir", [node(21, "Steam", "C:\\Program Files (x86)\\Steam", 49.6 * GB), node(22, "Microsoft", "C:\\Program Files (x86)\\Microsoft", 3.1 * GB)]),
  node(3, "Windows", "C:\\Windows", 31.7 * GB, "dir", [node(31, "WinSxS", "C:\\Windows\\WinSxS", 14.2 * GB), node(32, "System32", "C:\\Windows\\System32", 8.8 * GB), node(33, "SoftwareDistribution", "C:\\Windows\\SoftwareDistribution", 4.4 * GB)], { note: "Includes files Windows shares through hard links, so its real use is smaller." }),
  node(4, "Program Files", "C:\\Program Files", 22.9 * GB, "dir", [node(41, "NVIDIA Corporation", "C:\\Program Files\\NVIDIA Corporation", 6.2 * GB), node(42, "Adobe", "C:\\Program Files\\Adobe", 5.4 * GB)]),
  node(5, "pagefile.sys", "C:\\pagefile.sys", 16 * GB, "locked", [], { hasChildren: false }),
  node(6, "hiberfil.sys", "C:\\hiberfil.sys", 12.7 * GB, "locked", [], { hasChildren: false }),
  node(7, "ProgramData", "C:\\ProgramData", 9.1 * GB),
  node(8, "System Volume Information", "C:\\System Volume Information", 3.6 * GB, "locked", [], { hasChildren: false }),
  node(-1, "Smaller items", "", 0.6 * GB, "file", [], { id: 4294967295, hasChildren: false, note: "smaller" }),
];
const ALL = [...ROOT_KIDS, ...ROOT_KIDS.flatMap((n) => n.children), ...users.children[0].children];
const rootNode = node(0, "C:\\", C, ROOT_KIDS.reduce((s, n) => s + n.size, 0), "dir", ROOT_KIDS);
const byId = (id: number) => (id === 0 ? rootNode : ALL.find((n) => n.id === id) ?? rootNode);
const crumbs = (id: number) => {
  if (id === 0) return [rootNode];
  if (id === 11) return [rootNode, users, byId(11)];
  if (String(id).length === 2 && id !== 11) return [rootNode, byId(Math.floor(id / 10)), byId(id)];
  return [rootNode, byId(id)];
};
const strip = (n: any, depth: number): any => ({ ...n, children: depth > 1 ? (n.children ?? []).map((c: any) => strip(c, depth - 1)) : [] });
const BIG = [
  node(201, "Dune Part Two 2160p.mkv", `${U}\\Downloads\\Dune Part Two 2160p.mkv`, 22.4 * GB, "file"),
  node(202, "pagefile.sys", "C:\\pagefile.sys", 16 * GB, "locked"),
  node(203, "raw-footage-wedding.zip", `${U}\\Downloads\\raw-footage-wedding.zip`, 11.8 * GB, "file"),
  node(204, "raw-footage-wedding (1).zip", `${U}\\Downloads\\raw-footage-wedding (1).zip`, 7.2 * GB, "file"),
  node(205, "ubuntu-24.04-desktop-amd64.iso", `${U}\\Downloads\\ubuntu-24.04-desktop-amd64.iso`, 6.1 * GB, "file"),
  node(206, "WSL ext4.vhdx", `${U}\\AppData\\Local\\Packages\\CanonicalGroup\\LocalState\\ext4.vhdx`, 5.8 * GB, "file"),
  node(207, "Graduation 4K.mp4", `${U}\\Videos\\Graduation 4K.mp4`, 4.9 * GB, "file"),
  node(208, "obs-recording-2026-10-04.mkv", `${U}\\Videos\\obs-recording-2026-10-04.mkv`, 3.2 * GB, "file"),
  node(209, "podcast-ep-41-master.wav", `${U}\\Downloads\\podcast-ep-41-master.wav`, 1.3 * GB, "file"),
].filter((n) => n.kind === "file");
const TYPE: Record<string, string> = { mkv: "video", mp4: "video", zip: "archive", iso: "disk", vhdx: "disk", wav: "other" };

const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 24 + i));
  const used = 196 * GB + i * 0.7 * GB + (i > 24 ? 9 * GB : 0) + Math.sin(i / 3) * 0.6 * GB;
  return { day: d.toISOString().slice(0, 10), used, free: 238 * GB - used };
});

let freed = false;
const handlers: Record<string, (a: any) => any> = {
  cleaner_overview: () => ({
    drives: [
      { root: "C:\\", total: 238 * GB, free: freed ? 42.1 * GB : 9.6 * GB, low: !freed },
      { root: "D:\\", total: 931 * GB, free: 412 * GB, low: false },
    ],
    storageSense: false,
    settings: { weekly: false, lowSpaceAlert: true, lowSpacePct: 10, lowSpaceGb: 10, history: true, explorerVerb: false, lastWeeklyMs: 0, lastAlertDay: "" },
    checklist: [
      ["recycle-bin", "Recycle Bin"],
      ["browser-cache", "Browser cache"],
      ["shader-cache", "Shader cache"],
      ["windows-update", "Windows Update"],
      ["big-downloads", "Big downloads"],
      ["windows-old", "Old Windows"],
      ["temp", "Temporary files"],
      ["app-cache", "App caches"],
      ["crash-reports", "Crash reports"],
      ["old-installers", "Old installers"],
      ["unused-games", "Unplayed games"],
      ["thumbnails", "Thumbnail cache"],
      ["delivery-optimization", "Delivery Optimization"],
      ["duplicates", "Duplicate files"],
    ],
  }),
  cleaner_scan: async () => {
    if (!live) return REPORT;
    const order = ["recycle-bin", "browser-cache", "shader-cache", "windows-update", "big-downloads", "windows-old", "temp", "app-cache", "crash-reports", "old-installers", "unused-games", "thumbnails", "delivery-optimization", "duplicates"];
    let safe = 0;
    for (let i = 0; i < order.length; i++) {
      await sleep(260);
      const c = REPORT.categories.find((x) => x.id === order[i]);
      if (c?.safety === "SAFE") safe += c.size;
      emitLocal("lens://cleaner/progress", { phase: "scan", category: order[i], size: c?.size ?? 0, bytes: safe, files: c?.count ?? 0, done: i + 1, total: order.length });
    }
    await sleep(300);
    return REPORT;
  },
  cleaner_cancel: () => null,
  cleaner_preview: (a) => {
    const smart = !!a?.smart;
    const cats: string[] = smart ? ["browser-cache", "temp", "app-cache", "recycle-bin", "crash-reports", "thumbnails"] : a?.categories ?? [];
    const entries = REPORT.categories.filter((c) => cats.includes(c.id) && c.method === "deleteFiles").flatMap((c) => c.items.map((i: any) => ({ category: c.id, path: i.path, size: i.size, action: "delete" })));
    const picks = (a?.picks ?? []).filter((p: any) => p.category !== "unused-games").map((p: any) => ({ category: p.category, path: p.path, size: p.size, action: "recycle" }));
    const steps = cats.includes("recycle-bin") ? [{ category: "recycle-bin", kind: "emptyBin", target: "", label: "Empty the Recycle Bin", size: 4.2 * GB }] : [];
    if (cats.includes("windows-update")) steps.push({ category: "windows-update", kind: "elevated", target: "component-cleanup", label: "Windows Update leftovers (Windows asks for permission)", size: 0 });
    const total = REPORT.categories.filter((c) => cats.includes(c.id) && c.method !== "openSettings").reduce((s, c) => s + c.size, 0) + picks.reduce((s: number, p: any) => s + p.size, 0);
    const count = REPORT.categories.filter((c) => cats.includes(c.id) && c.method === "deleteFiles").reduce((s, c) => s + c.count, 0) + picks.length;
    return { id: "plan-1", entries: [...entries, ...picks], entryCount: count, steps, total, permanent: false, refused: [] };
  },
  cleaner_preview_paths: (a) => {
    const entries = (a?.paths ?? []).map((p: string) => ({ category: "user", path: p, size: BIG.find((b) => b.path === p)?.size ?? 1 * GB, action: a?.permanent ? "delete" : "recycle" }));
    return { id: "plan-2", entries, entryCount: entries.length, steps: [], total: entries.reduce((s: number, e: any) => s + e.size, 0), permanent: !!a?.permanent, refused: [] };
  },
  cleaner_confirm_code: () => ({ code: "4827", expiresInMs: 120000, tries: 3 }),
  cleaner_run: async () => {
    if (live) await sleep(1400);
    freed = true;
    return { freed: 32.5 * GB, deleted: Array.from({ length: 12 }, (_, i) => `x${i}`), binned: ["a", "b", "c", "d"], skipped: [[`${U}\\AppData\\Local\\Temp\\chrome_drag1234\\lock`, "In use right now, so it was skipped."]], stepsDone: ["Empty the Recycle Bin"], dryRun: false };
  },
  cleaner_undo: () => ({ restored: ["a", "b", "c", "d"], left: [] }),
  cleaner_full_list: () => "C:\\Users\\levi\\AppData\\Roaming\\LensUI\\cleaner\\last-preview.txt",
  cleaner_space_scan: async (a) => {
    if (live) {
      for (let i = 1; i <= 6; i++) {
        await sleep(160);
        emitLocal("lens://cleaner/space-progress", { files: i * 61_000, bytes: i * 38 * GB, folders: i * 9000, current: `C:\\Users\\levi\\AppData\\Local\\Packages\\${i}` });
      }
    }
    return { root: a?.root ?? C, size: 228.4 * GB, files: 412_880, elapsedMs: 6200, cloudOnly: 18.2 * GB, cancelled: false };
  },
  cleaner_space_children: (a) => {
    const n = byId(a?.id ?? 0);
    const depth = a?.depth ?? 1;
    return { node: strip(n, 1), crumbs: crumbs(n.id).map((c: any) => strip(c, 1)), children: (n.children ?? []).map((c: any) => strip(c, depth)) };
  },
  cleaner_biggest: (a) => BIG.filter((b) => !a?.kind || a.kind === "all" || TYPE[b.name.split(".").pop()!.toLowerCase()] === a.kind),
  cleaner_reveal: () => null,
  cleaner_open: () => null,
  cleaner_apps: () => [
    { key: "k1", name: "Call of Duty", publisher: "Activision", size: 142.8 * GB, dataSize: 3.1 * GB, dataDirs: [`${U}\\AppData\\Local\\Activision`], icon: null, canUninstall: true },
    { key: "k2", name: "Adobe Premiere Pro 2026", publisher: "Adobe Inc.", size: 9.4 * GB, dataSize: 21.6 * GB, dataDirs: [`${U}\\AppData\\Roaming\\Adobe`], icon: null, canUninstall: true },
    { key: "k3", name: "Microsoft Visual Studio 2022", publisher: "Microsoft Corporation", size: 18.2 * GB, dataSize: 4.4 * GB, dataDirs: [], icon: null, canUninstall: true },
    { key: "k4", name: "Spotify", publisher: "Spotify AB", size: 0.4 * GB, dataSize: 6.2 * GB, dataDirs: [`${U}\\AppData\\Local\\Spotify`], icon: null, canUninstall: true },
    { key: "k5", name: "Discord", publisher: "Discord Inc.", size: 0.5 * GB, dataSize: 1.9 * GB, dataDirs: [`${U}\\AppData\\Roaming\\discord`], icon: null, canUninstall: true },
    { key: "k6", name: "Blender 4.2", publisher: "Blender Foundation", size: 1.6 * GB, dataSize: 0.3 * GB, dataDirs: [], icon: null, canUninstall: true },
  ],
  coreapp_open: () => null,
  cleaner_downloads_review: () => [
    { path: `${U}\\Downloads\\ubuntu-24.04-desktop-amd64.iso`, name: "ubuntu-24.04-desktop-amd64.iso", size: 6.1 * GB, kind: "disk", ageDays: 140, openedDays: 140, suggest: true, reason: "A setup file from 140 days ago. You've most likely installed it already." },
    { path: `${U}\\Downloads\\raw-footage-wedding.zip`, name: "raw-footage-wedding.zip", size: 11.8 * GB, kind: "archive", ageDays: 210, openedDays: 210, suggest: true, reason: "You already unzipped this; the folder next to it has the contents." },
    { path: `${U}\\Downloads\\Blender-4.1-windows-x64.msi`, name: "Blender-4.1-windows-x64.msi", size: 340 * MB, kind: "installer", ageDays: 190, openedDays: 190, suggest: true, reason: "A setup file from 190 days ago. You've most likely installed it already." },
    { path: `${U}\\Downloads\\Dune Part Two 2160p.mkv`, name: "Dune Part Two 2160p.mkv", size: 22.4 * GB, kind: "video", ageDays: 96, openedDays: 96, suggest: true, reason: "Big and not opened in 96 days." },
    { path: `${U}\\Downloads\\Tax return 2025.pdf`, name: "Tax return 2025.pdf", size: 2.1 * MB, kind: "document", ageDays: 220, openedDays: 30, suggest: false, reason: "Looks like something you'd want to keep." },
    { path: `${U}\\Downloads\\boarding-pass.png`, name: "boarding-pass.png", size: 0.4 * MB, kind: "image", ageDays: 3, openedDays: 3, suggest: false, reason: "Looks like something you'd want to keep." },
  ],
  cleaner_move: async () => {
    if (live) await sleep(800);
    return "D:\\Moved by Lens\\Dune Part Two 2160p.mkv";
  },
  cleaner_history: () => ({
    enabled: true,
    series: DAYS,
    growth: [
      { path: `${U}\\Videos`, before: 2.1 * GB, after: 9.4 * GB, delta: 7.3 * GB },
      { path: `${U}\\AppData\\Local\\Packages`, before: 11 * GB, after: 13.4 * GB, delta: 2.4 * GB },
      { path: `${U}\\Downloads`, before: 51.1 * GB, after: 52.3 * GB, delta: 1.2 * GB },
    ],
    sudden: 9.4 * GB,
  }),
  cleaner_settings_get: () => ({ weekly: false, lowSpaceAlert: true, lowSpacePct: 10, lowSpaceGb: 10, history: true, explorerVerb: false, lastWeeklyMs: 0, lastAlertDay: "" }),
  cleaner_settings_set: (a) => a?.next,
  cleaner_share: () => "C:\\Users\\levi\\AppData\\Roaming\\LensUI\\cleaner\\lens-cleaner-2026-11-22.png",
};

export async function invoke(cmd: string, args?: any) {
  const h = handlers[cmd];
  if (h) return h(args);
  return baseInvoke(cmd, args);
}
