// Small drawn icons the Dock uses when an app or folder has none of its own.
import { AppWindow, FileText, Folder, Globe, Terminal } from "lucide-react";

export function DockMatteFolderSvg({ color }: { color: string }) {
  const map: Record<string, { back: string; top: string; bot: string }> = {
    cobalt: { back: "#0284c7", top: "#38bdf8", bot: "#0369a1" },
    amber: { back: "#b45309", top: "#fbbf24", bot: "#d97706" },
    emerald: { back: "#047857", top: "#34d399", bot: "#059669" },
    minimal: { back: "#a1a1aa", top: "#fafafa", bot: "#d4d4d8" },
  };
  const p = map[color] ?? map.cobalt;
  const gid = `dmf-${color}`;
  return (
    <svg viewBox="0 0 64 56" width="34" height="30" className="dsd-folder-svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.top} />
          <stop offset="100%" stopColor={p.bot} />
        </linearGradient>
      </defs>
      <path
        d="M4 12C4 8.7 6.7 6 10 6H23C24.9 6 26.7 6.9 27.8 8.4L30 11.2C30.8 12.1 31.9 12.6 33 12.6H54C57.3 12.6 60 15.3 60 18.6V46C60 49.3 57.3 52 54 52H10C6.7 52 4 49.3 4 46V12Z"
        fill={p.back}
      />
      <rect x="4" y="17" width="56" height="35" rx="7" fill={`url(#${gid})`} />
      <path d="M11 18H53" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function FallbackAppIcon({ hint }: { hint?: string | null }) {
  switch (hint) {
    case "folder":
      return <Folder size={20} strokeWidth={1.8} />;
    case "terminal":
      return <Terminal size={20} strokeWidth={1.8} />;
    case "globe":
      return <Globe size={20} strokeWidth={1.8} />;
    case "file-text":
      return <FileText size={20} strokeWidth={1.8} />;
    default:
      return <AppWindow size={20} strokeWidth={1.8} />;
  }
}
