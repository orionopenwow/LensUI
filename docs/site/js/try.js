// try.html: every interactive demo, each started only when it scrolls near the screen.
import { initDockDemo } from "./dock-demo.js";
import { initThemeLab, initSand, initApprovals, initCommand, initVoice } from "./widgets.js";

const INIT = { dock: initDockDemo, themes: initThemeLab, sand: initSand, approvals: initApprovals, command: initCommand, voice: initVoice };
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  io.unobserve(e.target);
  INIT[e.target.dataset.widget]?.(e.target)?.catch?.((err) => {
    const n = document.createElement("p");
    n.className = "note warn";
    n.textContent = `This demo didn't load (${err.message}).`;
    e.target.append(n);
  });
}), { rootMargin: "300px" });
document.querySelectorAll("[data-widget]").forEach((w) => io.observe(w));
