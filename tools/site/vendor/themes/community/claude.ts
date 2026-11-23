import type { ThemePack } from "../packs";

/**
 * Community theme packs from the Claude Code ecosystem: Anthropic's own example desktop themes and
 * the most popular community theme repos. Lens imports only palettes (colours are facts) and always
 * credits and links the original. No artwork, backdrop code, logos or wordmarks are copied: animated
 * backdrops map to the closest Lens Playground scene instead.
 *
 * Full table with links and licences: docs/THEMES_CLAUDE.md.
 */

export const CLAUDE_COLLECTION = "Claude Code";

type Src = NonNullable<ThemePack["source"]>;

const ANTHROPIC_EXAMPLES: Src = {
  name: "Theme Examples (claude-plugins-official)",
  author: "Anthropic",
  url: "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/theme-examples",
  license: "Apache-2.0",
};
const CLAUDE_VSCODE: Src = {
  name: "Claude Code Theme (unofficial)",
  author: "ashwingopalsamy",
  url: "https://github.com/ashwingopalsamy/claude-code-theme",
  license: "MIT",
};
const RETRO: Src = {
  name: "Claude Themes (unofficial claude.ai reskin)",
  author: "clausqr",
  url: "https://clausqr.github.io/claude-themes/GALLERY",
  license: "MIT",
};
const WHITELABEL: Src = {
  name: "Claude White-Label Themes (unofficial)",
  author: "jakubkrzysztofsikora",
  url: "https://github.com/jakubkrzysztofsikora/claude-theme",
  license: "MIT",
};
const matcra = (plugin: string, upstream: string): Src => ({
  name: `claude-themes · ${plugin} (palette from ${upstream})`,
  author: "matcra587",
  url: `https://github.com/matcra587/claude-themes/tree/main/plugins/${plugin}`,
  license: "MIT",
});

type Look = Pick<ThemePack, "iconTheme" | "iconShape" | "folderTheme" | "frameStyle" | "controlStyle">;
const SOFT: Look = { iconTheme: "frosted-glass", iconShape: "squircle", folderTheme: "accent", frameStyle: "accent-glow", controlStyle: "traffic-muted" };
const PAPER: Look = { iconTheme: "native", iconShape: "rounded", folderTheme: "ember", frameStyle: "obsidian-hairline", controlStyle: "minimal-dots" };
const PHOSPHOR: Look = { iconTheme: "monochrome", iconShape: "rounded", folderTheme: "neon", frameStyle: "neon", controlStyle: "accent-pills" };
const EDITOR: Look = { iconTheme: "obsidian-squircle", iconShape: "squircle", folderTheme: "accent", frameStyle: "obsidian-hairline", controlStyle: "traffic-classic" };

interface Def {
  id: string;
  label: string;
  base: string;
  accent: string;
  light?: boolean;
  radius: number;
  look: Look;
  dock: string;
  description: string;
  source: Src;
  /** The palette was derived from a picture rather than read from a palette file. */
  inspiredBy?: boolean;
  backdrop?: { scene: string; original: string };
  aliases?: string[];
}

const make = (d: Def): ThemePack => ({
  id: `cc-${d.id}`,
  label: d.label,
  tier: "Community",
  ...(d.light ? { scheme: "light" as const } : {}),
  base: d.base,
  accent: d.accent,
  accentMode: "custom",
  tint: 0,
  radius: d.radius,
  ...d.look,
  dockStyle: d.dock,
  description: d.description,
  aliases: d.aliases ?? [d.label.toLowerCase()],
  collection: CLAUDE_COLLECTION,
  source: d.source,
  ...(d.inspiredBy ? { inspiredBy: true } : {}),
  ...(d.backdrop
    ? { backdrop: { scene: d.backdrop.scene, note: `Original animated backdrop available at ${d.backdrop.original}`, url: d.backdrop.original } }
    : {}),
});

const ex = (id: string, label: string, base: string, accent: string, light: boolean, scene: string | null, description: string, look: Look = light ? PAPER : SOFT, dock = "floating"): Def => ({
  id,
  label,
  base,
  accent,
  light,
  radius: light ? 12 : 12,
  look,
  dock,
  description,
  source: ANTHROPIC_EXAMPLES,
  inspiredBy: true,
  ...(scene ? { backdrop: { scene, original: ANTHROPIC_EXAMPLES.url } } : {}),
});

const DEFS: Def[] = [
  // ---- Anthropic: Theme Examples (the 20 classic scenes) ----
  ex("honu-lagoon", "Honu Lagoon", "#E6FBFF", "#22838A", true, "flow", "Pale lagoon cyan with deep reef teal. From Anthropic's ASCII lagoon scene."),
  ex("koi-mosaic", "Koi Mosaic", "#EEF8F1", "#0D5A66", true, "ink", "Mint pond tiles with deep koi-pond teal."),
  ex("halftone-dawn", "Halftone Dawn", "#F6EAD9", "#D9603A", true, "sky-clock", "Warm riso paper with a terracotta sunrise ink."),
  ex("halftone-dusk", "Halftone Dusk", "#1F2336", "#D45C3D", false, "sky-clock", "Night-blue stock with an ember sun in breathing dots."),
  ex("plotter-tide", "Plotter Tide", "#F4EFE4", "#C4552D", true, "flow", "Warm plotter paper with rust tide lines.", PAPER, "slim"),
  ex("plotter-tide-night", "Plotter Tide, Night", "#141A27", "#E98A5E", false, "flow", "Blue-black paper with pale coral plotter ink.", SOFT, "slim"),
  ex("dither-dunes", "Dither Dunes", "#F1E8D6", "#C8573A", true, "sand", "One-bit sand paper with a terracotta sun."),
  ex("dither-dunes-night", "Dither Dunes Night", "#1C1712", "#D9603A", false, "sand", "Umber night with an ember sun over dotted dunes."),
  ex("paper-garden", "Paper Garden", "#FBF6EC", "#DC6549", true, "ink", "Warm white sheet with one coral bloom.", PAPER, "minimal"),
  ex("paper-garden-kraft", "Paper Garden, Kraft", "#35312A", "#E58267", false, "ink", "Dark kraft paper with a soft coral bloom.", SOFT, "minimal"),
  ex("night-reef", "Night Reef", "#0A1430", "#9DB4FF", false, "flow", "Deep night lagoon with a glowing periwinkle."),
  ex("snow-pines", "Snow Pines", "#14143A", "#FFB65C", false, "rain", "Indigo dusk forest with a warm lantern glow."),
  ex("braille-stars", "Braille Stars", "#0A1430", "#8EA6FF", false, "constellation", "Navy night sky drawn in soft blue dots.", SOFT, "slim"),
  ex("block-clouds", "Block Clouds", "#0D173F", "#F0CF52", false, "starfield", "Teletext night blue with a yellow block moon.", PHOSPHOR, "split"),
  ex("vector-range", "Vector Range", "#0E2F27", "#FFB454", false, "constellation", "Phosphor-green ridge with an amber beam.", PHOSPHOR, "split"),
  ex("departure-board", "Departure Board", "#1A120B", "#F2A53A", false, null, "Dark station brown with amber LED letters.", PHOSPHOR, "taskbar"),
  ex("blueprint", "Blueprint", "#0C2444", "#F2C14E", false, "constellation", "Cyanotype blue with a golden comet.", EDITOR, "studio"),
  ex("deep-water", "Deep Water", "#062C3A", "#9FE9F5", false, "flow", "Deep sea teal with falling light."),
  ex("aurora", "Aurora (Claude)", "#14123A", "#9F7BFF", false, "aurora", "Violet night with northern-lights purple.", SOFT, "floating"),
  ex("ember", "Ember", "#2A0D12", "#FF7A2A", false, "ink", "Deep wine dark with rising orange embers."),

  // ---- Claude Code colours for VS Code (unofficial) ----
  { id: "claude-dark", label: "Claude Dark", base: "#141413", accent: "#D4967E", radius: 10, look: EDITOR, dock: "floating", description: "Claude Code's warm near-black with soft clay. Unofficial port.", source: CLAUDE_VSCODE, aliases: ["claude dark", "claude"] },
  { id: "claude-light", label: "Claude Light", light: true, base: "#FAF9F5", accent: "#CC785C", radius: 10, look: { ...EDITOR, iconTheme: "native" }, dock: "floating", description: "Ivory paper with Claude clay. Unofficial port.", source: CLAUDE_VSCODE },
  { id: "claude-dusk", label: "Claude Dusk", base: "#262624", accent: "#D97757", radius: 10, look: EDITOR, dock: "slim", description: "Warm charcoal with the brand coral. Unofficial port.", source: CLAUDE_VSCODE },
  { id: "claude-midnight", label: "Claude Midnight", base: "#000000", accent: "#D97757", radius: 10, look: EDITOR, dock: "minimal", description: "True black for OLED with the brand coral. Unofficial port.", source: CLAUDE_VSCODE },
  { id: "claude-dark-brand", label: "Claude Dark Brand", base: "#141413", accent: "#C96442", radius: 10, look: EDITOR, dock: "taskbar", description: "Warm near-black with deep rust buttons. Unofficial port.", source: CLAUDE_VSCODE },
  { id: "claude-light-brand", label: "Claude Light Brand", light: true, base: "#FAF9F5", accent: "#C96442", radius: 10, look: { ...EDITOR, iconTheme: "native" }, dock: "taskbar", description: "Ivory with deep rust buttons. Unofficial port.", source: CLAUDE_VSCODE },

  // ---- Retro phosphor palettes (clausqr/claude-themes) ----
  { id: "retro-amber", label: "Amber Monitor", base: "#0A0500", accent: "#FFB000", radius: 2, look: PHOSPHOR, dock: "taskbar", description: "IBM 5151 amber phosphor on black.", source: RETRO, aliases: ["amber monitor"] },
  { id: "retro-green", label: "Green Phosphor", base: "#001A00", accent: "#33FF33", radius: 2, look: PHOSPHOR, dock: "taskbar", description: "Hercules-style green phosphor.", source: RETRO },
  { id: "retro-white", label: "Paper-White Mono", base: "#0A0A0A", accent: "#E6E6E6", radius: 2, look: { ...PHOSPHOR, folderTheme: "minimal" }, dock: "taskbar", description: "MDA paper-white phosphor, fixed-pitch feel.", source: RETRO },
  { id: "retro-cga", label: "CGA-4", base: "#000000", accent: "#55FFFF", radius: 0, look: PHOSPHOR, dock: "taskbar", description: "IBM CGA palette 1: black, white, cyan and magenta.", source: RETRO },
  { id: "retro-crt", label: "CRT", base: "#001A00", accent: "#39FF55", radius: 4, look: PHOSPHOR, dock: "slim", description: "Late-80s green CRT. Pairs with Lens Rain or Starfield.", source: RETRO, backdrop: { scene: "rain", original: RETRO.url } },
  { id: "retro-synthwave", label: "Synthwave", base: "#0D0B1E", accent: "#FF2A6D", radius: 8, look: { ...PHOSPHOR, folderTheme: "rose" }, dock: "split", description: "Outrun night sky with hot-pink horizon.", source: RETRO, backdrop: { scene: "aurora", original: RETRO.url } },

  // ---- Terminal palettes from matcra587/claude-themes (variants Lens didn't have) ----
  { id: "catppuccin-latte", label: "Catppuccin Latte", light: true, base: "#EFF1F5", accent: "#1E66F5", radius: 12, look: { ...SOFT, iconTheme: "native" }, dock: "floating", description: "Catppuccin's light flavour.", source: matcra("catppuccin", "catppuccin/palette"), aliases: ["latte"] },
  { id: "catppuccin-frappe", label: "Catppuccin Frappé", base: "#303446", accent: "#F4B8E4", radius: 12, look: { ...SOFT, folderTheme: "violet" }, dock: "floating", description: "Catppuccin's muted mid-dark flavour.", source: matcra("catppuccin", "catppuccin/palette"), aliases: ["frappe", "frappé"] },
  { id: "catppuccin-macchiato", label: "Catppuccin Macchiato", base: "#24273A", accent: "#F5BDE6", radius: 12, look: { ...SOFT, folderTheme: "violet" }, dock: "floating", description: "Catppuccin's deeper dark flavour.", source: matcra("catppuccin", "catppuccin/palette"), aliases: ["macchiato"] },
  { id: "gruvbox-light", label: "Gruvbox Light", light: true, base: "#FBF1C7", accent: "#458588", radius: 6, look: PAPER, dock: "taskbar", description: "Gruvbox's retro cream light mode.", source: matcra("gruvbox", "gruvbox-community/gruvbox") },
  { id: "rose-pine-moon", label: "Rosé Pine Moon", base: "#232136", accent: "#C4A7E7", radius: 14, look: { ...SOFT, iconShape: "circle", folderTheme: "rose" }, dock: "floating", description: "Rosé Pine's moonlit violet variant.", source: matcra("rose-pine", "rose-pine/kitty"), aliases: ["rose pine moon"] },
  { id: "rose-pine-dawn", label: "Rosé Pine Dawn", light: true, base: "#FAF4ED", accent: "#907AA9", radius: 14, look: { ...PAPER, iconShape: "circle", folderTheme: "rose" }, dock: "floating", description: "Rosé Pine's soft dawn light mode.", source: matcra("rose-pine", "rose-pine/kitty"), aliases: ["rose pine dawn"] },
  { id: "solarized-light", label: "Solarized Light", light: true, base: "#FDF6E3", accent: "#268BD2", radius: 8, look: PAPER, dock: "studio", description: "Classic Solarized cream with blue.", source: matcra("solarized", "altercation/solarized") },
  { id: "everforest-light", label: "Everforest Light", light: true, base: "#FDF6E3", accent: "#8DA101", radius: 8, look: { ...PAPER, folderTheme: "emerald" }, dock: "slim", description: "Everforest's warm light mode with moss green.", source: matcra("everforest", "sainnhe/everforest") },
  { id: "github-dark", label: "GitHub Dark", base: "#0D1117", accent: "#58A6FF", radius: 6, look: EDITOR, dock: "taskbar", description: "GitHub's default dark.", source: matcra("github", "primer/github-vscode-theme") },
  { id: "github-dark-dimmed", label: "GitHub Dark Dimmed", base: "#22272E", accent: "#539BF5", radius: 6, look: EDITOR, dock: "taskbar", description: "GitHub's softer dimmed dark.", source: matcra("github", "primer/github-vscode-theme") },
  { id: "github-light", label: "GitHub Light", light: true, base: "#FFFFFF", accent: "#0969DA", radius: 6, look: { ...EDITOR, iconTheme: "native" }, dock: "taskbar", description: "GitHub's default light.", source: matcra("github", "primer/github-vscode-theme") },
  { id: "one-dark", label: "One Dark", base: "#282C34", accent: "#61AFEF", radius: 8, look: EDITOR, dock: "floating", description: "Atom's One Dark.", source: matcra("one-dark", "joshdick/onedark.vim") },
  { id: "onehalf-light", label: "One Half Light", light: true, base: "#FAFAFA", accent: "#0184BC", radius: 8, look: { ...EDITOR, iconTheme: "native" }, dock: "floating", description: "One Half's clean light mode.", source: matcra("one-dark", "sonph/onehalf") },
  { id: "monokai", label: "Monokai", base: "#272822", accent: "#86B42B", radius: 6, look: EDITOR, dock: "split", description: "Classic Monokai olive-black with lime.", source: matcra("monokai", "microsoft/vscode") },
  { id: "monokai-pro", label: "Monokai Pro", base: "#2D2A2E", accent: "#FFD866", radius: 8, look: { ...EDITOR, folderTheme: "amber" }, dock: "split", description: "Monokai Pro's warm charcoal with yellow.", source: matcra("monokai-pro", "monokai-pro/konsole") },
  { id: "base16-ocean", label: "Base16 Ocean", base: "#2B303B", accent: "#8FA1B3", radius: 8, look: { ...EDITOR, folderTheme: "frost" }, dock: "slim", description: "Calm slate-blue Base16.", source: matcra("base16", "tinted-theming/schemes") },
  { id: "base16-eighties", label: "Base16 Eighties", base: "#2D2D2D", accent: "#6699CC", radius: 8, look: EDITOR, dock: "slim", description: "Base16 Eighties: soft grey with blue.", source: matcra("base16", "tinted-theming/schemes") },
  { id: "base16-cupcake", label: "Base16 Cupcake", light: true, base: "#FBF1F2", accent: "#7297B9", radius: 12, look: { ...PAPER, folderTheme: "rose" }, dock: "floating", description: "Base16 Cupcake: sweet pastel light.", source: matcra("base16", "tinted-theming/schemes") },

  // ---- Claude White-Label Themes (unofficial) ----
  { id: "wl-cyberpunk", label: "White-Label Cyberpunk", base: "#0A0612", accent: "#FF007F", radius: 4, look: PHOSPHOR, dock: "split", description: "Deep violet-black with neon pink.", source: WHITELABEL },
  { id: "wl-daltonized-dark", label: "Daltonized Dark", base: "#0B0E14", accent: "#648FFF", radius: 8, look: EDITOR, dock: "taskbar", description: "Colour-blind-safe dark: blue and amber cues.", source: WHITELABEL, aliases: ["daltonized", "colorblind dark", "colourblind dark"] },
  { id: "wl-daltonized-light", label: "Daltonized Light", light: true, base: "#FFFFFF", accent: "#3A56D4", radius: 8, look: { ...EDITOR, iconTheme: "native" }, dock: "taskbar", description: "Colour-blind-safe light: blue and ochre cues.", source: WHITELABEL, aliases: ["colorblind light", "colourblind light"] },
  { id: "wl-high-contrast", label: "High Contrast", base: "#000000", accent: "#00CCFF", radius: 4, look: { ...EDITOR, frameStyle: "neon" }, dock: "taskbar", description: "Pure black with bright cyan for maximum legibility.", source: WHITELABEL },
  { id: "wl-high-contrast-pro", label: "High Contrast Pro", base: "#000000", accent: "#FFE000", radius: 4, look: { ...EDITOR, frameStyle: "neon" }, dock: "taskbar", description: "Pure black with signal yellow.", source: WHITELABEL },
  { id: "wl-nature", label: "Nature", base: "#0F1F17", accent: "#4ADE80", radius: 12, look: { ...SOFT, folderTheme: "emerald" }, dock: "floating", description: "Forest-floor green with fresh leaf.", source: WHITELABEL },
  { id: "wl-warm-neutral", label: "Warm Neutral", light: true, base: "#F5F0E8", accent: "#A07818", radius: 10, look: PAPER, dock: "slim", description: "Oat paper with a brass accent.", source: WHITELABEL },
  { id: "wl-circit", label: "Circit", light: true, base: "#FCF9F5", accent: "#61409B", radius: 10, look: { ...PAPER, folderTheme: "violet" }, dock: "floating", description: "Warm white with royal purple.", source: WHITELABEL },
  { id: "wl-branded", label: "Terracotta", light: true, base: "#FDF6F0", accent: "#9A4822", radius: 10, look: PAPER, dock: "floating", description: "Peach paper with deep terracotta.", source: WHITELABEL },
];

export const CLAUDE_PACKS: ThemePack[] = DEFS.map(make);
