/**
 * Dynamic values without inline style objects (tools/polish inline-style ratchet): a ref callback
 * that sets CSS custom properties, read by classes in lab.css (`.bd-v-bg`, `.bd-v-w`, …).
 * `also` keeps an existing ref working on the same element.
 */
export function vars<T extends HTMLElement>(values: Record<string, string | undefined>, also?: { current: T | null }) {
  return (el: T | null) => {
    if (also) also.current = el;
    if (!el) return;
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) el.style.removeProperty(k);
      else el.style.setProperty(k, v);
    }
  };
}

export const grad = (colors: string[], deg = 135) => `linear-gradient(${deg}deg, ${colors.join(",")})`;
