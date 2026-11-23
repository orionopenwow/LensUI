// Home page: the live dock in the hero.
import { initDockDemo } from "./dock-demo.js";
document.querySelectorAll("[data-dock-stage]").forEach((s) => initDockDemo(s));
