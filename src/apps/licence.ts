// Licences in plain words. Lens Apps links to other people's work, so every app says who made it,
// under which licence, and what that licence means for the person installing it. Pure: the
// detail page, the Library, the approval card and tests all read the same answer.
//
// This is a summary for people, not legal advice; the project's own licence text is what counts,
// and the wording here never claims more than the catalogue checked (`licenseVerified`).
import type { CatalogApp } from "./types";

export type LicenceFamily = "permissive" | "weakCopyleft" | "copyleft" | "networkCopyleft" | "freeware" | "unknown";

export interface LicenceInfo {
  family: LicenceFamily;
  /** Short name for a chip: "MIT", "GPL-3.0", "Free, not open source". */
  label: string;
  /** Two or three words for the kind of licence: "Permissive", "Copyleft". */
  kind: string;
  /** One or two plain sentences: what you may do, and the one rule that matters. */
  plain: string;
  /** True when the catalogue read the licence in the project's own repository. */
  verified: boolean;
  /** Said next to the label when the licence was not checked. */
  caveat: string | null;
}

const PLAIN: Record<LicenceFamily, { kind: string; plain: string }> = {
  permissive: {
    kind: "Permissive",
    plain: "Free to use, change and share, at home or at work. Anyone who passes it on keeps the author's copyright notice.",
  },
  weakCopyleft: {
    kind: "Weak copyleft",
    plain: "Free to use, change and share. Changes to the project's own files stay open under the same licence; what you make with it is yours.",
  },
  copyleft: {
    kind: "Copyleft",
    plain: "Free to use, change and share. Anyone who shares a changed version must share its source under the same licence. What you make with it is yours.",
  },
  networkCopyleft: {
    kind: "Network copyleft",
    plain: "Free to use, change and share. Anyone who shares a changed version, or runs one as an online service, must share its source under the same licence.",
  },
  freeware: {
    kind: "Free, not open source",
    plain: "Free to use, but the source isn't public and the publisher sets the terms. Read them before using it at work.",
  },
  unknown: {
    kind: "See the project",
    plain: "The project sets its own terms. Its repository has the exact licence.",
  },
};

/** The licence family for a catalogue licence string ("GPL-3.0-only", "MIT OR Apache-2.0", …). */
export function licenceFamily(licence: string, openSource = true): LicenceFamily {
  const l = licence.toLowerCase();
  if (!openSource || /\b(proprietary|freeware|closed)\b/.test(l)) return "freeware";
  // The strongest rule in the string decides, except in an "OR" choice, where the person may
  // pick the gentler licence.
  const rank = (part: string): LicenceFamily => {
    if (/\bagpl/.test(part)) return "networkCopyleft";
    if (/\blgpl|\bmpl|\bepl|\bcddl/.test(part)) return "weakCopyleft";
    if (/\bgpl/.test(part)) return "copyleft";
    if (/\b(mit|apache|bsd|isc|zlib|unlicense|cc0|0bsd|boost|bsl-1|permissive)\b/.test(part)) return "permissive";
    return "unknown";
  };
  const order: LicenceFamily[] = ["permissive", "weakCopyleft", "copyleft", "networkCopyleft", "unknown"];
  const parts = l.split(/\s+or\s+/).map(rank);
  return parts.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? "unknown";
}

/** Everything Lens says about an app's licence. */
export function licenceInfo(app: Pick<CatalogApp, "license" | "licenseVerified" | "openSource">): LicenceInfo {
  const family = licenceFamily(app.license, app.openSource);
  const named = /\b(mit|apache|bsd|isc|zlib|unlicense|cc0|a?gpl|lgpl|mpl|epl)\b/i.test(app.license);
  const label = family === "freeware" ? "Free, not open source" : named ? app.license.replace(/\s*\(.*\)\s*$/, "") : "Open source";
  const note = app.license.match(/\(([^)]+)\)\s*$/)?.[1]?.replace(/^\+\s*/, "") ?? null;
  const base = PLAIN[family];
  let plain = base.plain;
  if (family === "permissive" && !named) plain = "The project describes itself as permissively licensed: free to use, change and share. Its repository has the exact licence.";
  if (note && (named || family === "freeware")) plain += ` The catalogue notes: ${note}.`;
  return {
    family,
    label,
    kind: base.kind,
    plain,
    verified: app.licenseVerified,
    caveat: app.licenseVerified ? null : "Lens hasn't read this licence in the project's repository yet.",
  };
}

export interface Credit {
  /** "by <who>": the maintainer or organisation, falling back to the publisher. */
  by: string;
  /** "github.com/owner/repo", or the homepage's host when the source isn't public. */
  source: string;
  /** The address `source` opens (always one listed in the app's catalogue entry). */
  sourceUrl: string;
  /** Where the icon and screenshots come from, or why there are none. */
  media: string;
}

function hostAndPath(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** Who made an app and where it lives. Never invents a name: no author means the publisher. */
export function creditFor(app: Pick<CatalogApp, "author" | "publisher" | "repo" | "homepage" | "media">): Credit {
  const owner = app.repo?.match(/github\.com\/([^/]+)\//)?.[1] ?? null;
  return {
    by: app.author?.trim() || app.publisher.trim() || owner || "its own project",
    source: hostAndPath(app.repo ?? app.homepage),
    sourceUrl: app.repo ?? app.homepage,
    media: app.media.noMedia ?? `Icon and screenshots from ${app.media.credit}`,
  };
}

/** The line Lens shows wherever it names someone else's project (COMBINATOR §3.4). */
export const NOT_AFFILIATED = "Names belong to each project. Lens isn't affiliated with them.";
