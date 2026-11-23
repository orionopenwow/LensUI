// The one-click "Get" on the open-source app cards: the Lens Apps flow, simulated (nothing downloads).
import { reducedMotion } from "./site.js";

const STAGES = ["Finding package", "Downloading", "Verifying", "Installing"];
const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 40) : ms));

export function init() {
  document.querySelectorAll(".app-card [data-get]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.busy) return;
    if (b.classList.contains("done")) { b.textContent = "Get"; b.classList.remove("done"); b.removeAttribute("aria-label"); return; }
    b.dataset.busy = "1";
    b.classList.add("busy");
    for (const [i, st] of STAGES.entries()) {
      if (st === "Downloading") for (let p = 0; p <= 100; p += 25) { b.textContent = `${p}%`; b.style.setProperty("--p", `${p}%`); await sleep(150); }
      else { b.textContent = st.split(" ")[0]; await sleep(360); }
      b.style.setProperty("--p", `${Math.round(((i + 1) / STAGES.length) * 100)}%`);
    }
    b.classList.remove("busy");
    b.classList.add("done");
    b.textContent = "Open";
    b.setAttribute("aria-label", `Open ${b.dataset.get} (simulated)`);
    delete b.dataset.busy;
  }));
}
