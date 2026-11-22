/**
 * Lens UI i18n — deliberately tiny: flat string dictionaries (locales/*.ts), `{name}` interpolation, English fallback.
 *
 *   import { useT } from "../i18n";
 *   const t = useT(config?.theme.locale);
 *   <button aria-label={t("topbar.notifications")}>
 *
 * Locale resolution: the `locale` setting ("auto" or a code such as "de") → Windows UI language
 * (WebView2 reports it as navigator.language) → "en". Missing keys fall back to English, then to the key.
 */
import { useEffect, useMemo, useState } from "react";
import en from "./locales/en";
import es from "./locales/es";
import de from "./locales/de";

type Dict = Record<string, string>;

export const LOCALES: { code: string; label: string; reviewed: boolean }[] = [
  { code: "en", label: "English", reviewed: true },
  { code: "es", label: "Español (draft)", reviewed: false },
  { code: "de", label: "Deutsch (draft)", reviewed: false },
];

const DICTS: Record<string, Dict> = { en, es, de };

let current = "en";
const listeners = new Set<(code: string) => void>();

/** "de-AT" → "de"; unknown languages → "en". */
export function resolveLocale(setting?: string | null, systemLanguage?: string): string {
  const pick = (raw?: string | null) => {
    if (!raw) return null;
    const base = raw.trim().toLowerCase().split(/[-_]/)[0];
    return base in DICTS ? base : null;
  };
  if (setting && setting !== "auto") {
    const chosen = pick(setting);
    if (chosen) return chosen;
  }
  const sys =
    systemLanguage ?? (typeof navigator !== "undefined" ? navigator.language : undefined);
  return pick(sys) ?? "en";
}

export function setLocale(setting?: string | null): string {
  const next = resolveLocale(setting);
  if (next !== current) {
    current = next;
    if (typeof document !== "undefined") document.documentElement.lang = next;
    listeners.forEach((fn) => fn(next));
  }
  return current;
}

export function getLocale(): string {
  return current;
}

/** Translate `key`, replacing `{name}` placeholders from `vars`. */
export function t(key: string, vars?: Record<string, string | number>, locale = current): string {
  const raw: string | undefined = DICTS[locale]?.[key] ?? DICTS.en[key];
  let text = raw ?? key;
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  }
  return text;
}

/** React hook: re-renders the component when the locale changes. Pass the `locale` setting. */
export function useT(setting?: string | null) {
  const [code, setCode] = useState(() => setLocale(setting));
  useEffect(() => {
    setCode(setLocale(setting));
  }, [setting]);
  useEffect(() => {
    const fn = (c: string) => setCode(c);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return useMemo(
    () => (key: string, vars?: Record<string, string | number>) => t(key, vars, code),
    [code]
  );
}
