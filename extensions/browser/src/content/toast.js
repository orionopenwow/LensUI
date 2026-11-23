// A one-line toast in the page after a micro-save ("Saved to Shelf"). Injected on demand into the
// active tab (isolated world); lives in a closed Shadow DOM so page CSS can't touch it, and
// removes itself after a moment. No window, no focus change.
//
// Must stay self-contained: `scripting.executeScript({ func })` serialises this one function.

export function showLensToast(title, detail, tone) {
  const ID = "lens-micro-toast-host";
  const old = document.getElementById(ID);
  if (old) old.remove();
  const host = document.createElement("div");
  host.id = ID;
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);pointer-events:none;";
  const root = host.attachShadow({ mode: "closed" });
  const dark = !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = dark ? "#18181b" : "#ffffff";
  const fg = dark ? "#fafafa" : "#18181b";
  const muted = dark ? "#a1a1aa" : "#52525b";
  const line = dark ? "#3f3f46" : "#e4e4e7";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const style = document.createElement("style");
  style.textContent = `
    .t{font:13px/20px system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;gap:12px;
      min-width:240px;max-width:420px;padding:8px 16px 8px 12px;border-radius:12px;background:${bg};color:${fg};
      border:1px solid ${line};box-shadow:0 8px 24px rgba(0,0,0,.25);${reduce ? "" : "animation:in 160ms cubic-bezier(.22,1,.36,1);"}}
    .i{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:none;
      background:${tone === "muted" ? line : fg};color:${tone === "muted" ? fg : bg};font-weight:700}
    .b{min-width:0}.h{font-weight:600}.d{font-size:12px;line-height:16px;color:${muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`;
  const box = document.createElement("div");
  box.className = "t";
  box.setAttribute("role", "status");
  const icon = document.createElement("div");
  icon.className = "i";
  icon.textContent = tone === "error" ? "!" : "✓";
  const body = document.createElement("div");
  body.className = "b";
  const h = document.createElement("div");
  h.className = "h";
  h.textContent = String(title || "").slice(0, 80);
  const d = document.createElement("div");
  d.className = "d";
  d.textContent = String(detail || "").slice(0, 140);
  body.append(h);
  if (detail) body.append(d);
  box.append(icon, body);
  root.append(style, box);
  (document.body || document.documentElement).append(host);
  setTimeout(() => host.remove(), 2400);
  return true;
}
