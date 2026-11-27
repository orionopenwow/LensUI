// Magnification: icons near the pointer grow (transform only, so the Dock's size and the native
// click region never change); neighbours are pushed apart so nothing overlaps.
// Low latency by construction (docs/DOCK_SMOOTHNESS.md › Frontend):
//  - pointer moves are coalesced to one update per frame (rAF), however fast the mouse reports;
//  - icon centres are measured once when the pointer enters (transforms don't move layout),
//    so a move is pure arithmetic with no layout reads;
//  - a value is written only when it changed, so icons far from the pointer aren't restyled.
import { useEffect, useRef, type RefObject } from "react";

export interface MagnificationParams {
  /** Off, or held off for now (searching, a menu is open). */
  enabled: boolean;
  vertical: boolean;
  iconSize: number;
  /** Largest scale, under the pointer. */
  scale: number;
  /** How many icons either side grow. */
  range: number;
}

export function useMagnification(pillRef: RefObject<HTMLElement | null>) {
  const mag = useRef<{ raf: number; pos: number | null; kids: HTMLElement[]; centres: number[]; eligible: boolean[]; written: string[] }>({ raf: 0, pos: null, kids: [], centres: [], eligible: [], written: [] });
  const params = useRef<MagnificationParams>({ enabled: false, vertical: false, iconSize: 44, scale: 1, range: 2 });
  useEffect(() => () => { if (mag.current.raf) cancelAnimationFrame(mag.current.raf); }, []);

  const measure = () => {
    const m = mag.current;
    const row = pillRef.current?.querySelector(".dock-icons-row");
    m.kids = row ? (Array.from(row.children) as HTMLElement[]) : [];
    m.eligible = m.kids.map((el) => el.classList.contains("dock-item-wrap") && !el.classList.contains("dock-search-slot"));
    m.centres = m.kids.map((el) => (params.current.vertical ? el.offsetTop + el.offsetHeight / 2 : el.offsetLeft + el.offsetWidth / 2));
    m.written = m.kids.map(() => "");
  };
  const clear = () => {
    const m = mag.current;
    if (m.raf) cancelAnimationFrame(m.raf);
    m.raf = 0;
    m.pos = null;
    const row = pillRef.current?.querySelector(".dock-icons-row");
    if (row) {
      for (const el of Array.from(row.children) as HTMLElement[]) {
        el.style.removeProperty("--mag-s");
        el.style.removeProperty("--mag-x");
      }
    }
    m.kids = [];
  };
  const paint = () => {
    const m = mag.current;
    const p = params.current;
    m.raf = 0;
    if (m.pos === null) return;
    // The row changed under the pointer (an app opened or closed): measure again.
    const row = pillRef.current?.querySelector(".dock-icons-row");
    if (!row || row.children.length !== m.kids.length || !m.kids[0]?.isConnected) measure();
    const unit = p.iconSize + 6;
    const reach = (p.range + 0.5) * unit;
    const scales = m.centres.map((c, i) => {
      if (!m.eligible[i]) return 1;
      const d = Math.abs((m.pos as number) - c);
      if (d >= reach) return 1;
      const t = Math.cos((d / reach) * (Math.PI / 2));
      return 1 + (p.scale - 1) * t * t;
    });
    const extras = scales.map((sc) => (sc - 1) * p.iconSize);
    const total = extras.reduce((a, b) => a + b, 0);
    let before = 0;
    m.kids.forEach((el, i) => {
      const shift = before + extras[i] / 2 - total / 2;
      before += extras[i];
      const sv = scales[i].toFixed(3);
      const xv = `${shift.toFixed(1)}px`;
      const key = `${sv}|${xv}`;
      if (m.written[i] === key) return;
      m.written[i] = key;
      el.style.setProperty("--mag-s", sv);
      el.style.setProperty("--mag-x", xv);
    });
  };
  const apply = (clientX: number, clientY: number) => {
    const pill = pillRef.current;
    if (!pill || !params.current.enabled) return;
    const m = mag.current;
    if (!m.kids.length) measure();
    const pr = pill.getBoundingClientRect();
    // Centres are relative to the row's offset parent; the pill is that parent for every style.
    m.pos = params.current.vertical ? clientY - pr.top : clientX - pr.left;
    if (!m.raf) m.raf = requestAnimationFrame(paint);
  };

  return {
    /** Set on every render with the values in force. */
    params,
    apply,
    clear,
  };
}
