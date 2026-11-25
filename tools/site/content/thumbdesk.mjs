// "Play from the couch": ThumbDesk, the companion app from the makers of Lens
// (github.com/orionopenwow/ThumbDesk, MIT). Self-contained so the home page can place it with one
// line; it sits after Lens Apps, before the themes. Images are ThumbDesk's own (docs/media/shot-
// thumbdesk-*.webp, resized from its repository's docs/assets), credited below the exhibit.
import { esc } from "../lib/markdown.mjs";

export const THUMBDESK = {
  home: "https://orionopenwow.github.io/ThumbDesk/",
  repo: "https://github.com/orionopenwow/ThumbDesk",
  latest: "https://github.com/orionopenwow/ThumbDesk/releases/latest",
  version: "2.3.0",
};

const POINTS = [
  ["Two sticks, one desktop", "A 120 Hz cursor on the left stick, a precise one on the right, clicks and scroll on the buttons."],
  ["Say it or press it", "Map any button, or a spoken phrase, to a shortcut, a command or a script."],
  ["Steps aside for games", "Pauses itself when a game with anti-cheat or a Steam game has focus."],
];

const PAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9h10a4 4 0 0 1 3.9 4.9l-.8 3.3a2.2 2.2 0 0 1-3.8 1L14.6 16H9.4l-1.7 2.2a2.2 2.2 0 0 1-3.8-1l-.8-3.3A4 4 0 0 1 7 9z"/><path d="M8 12v2M7 13h2M15.5 12.5h.01M17 14h.01"/></svg>`;

export function thumbdeskSection() {
  return `
<section id="couch" class="sec xsec" aria-labelledby="couch-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${PAD}</span>From the makers of Lens</p><h2 id="couch-h">Run the desktop from the couch.</h2><p>ThumbDesk turns an Xbox or PlayStation controller into a mouse, a keyboard and a voice remote for the whole PC. Get it in one click from Lens Apps, pin it to the Dock, and Lens shows when it's listening.</p></div>
    <article class="ov td-ov">
      <a class="ov-media" href="${THUMBDESK.home}" aria-label="ThumbDesk's website">
        <picture>
          <source media="(prefers-reduced-motion: reduce)" srcset="media/shot-thumbdesk-studio.webp">
          <img src="media/shot-thumbdesk-demo.webp" alt="ThumbDesk: the controller studio, with button mappings, the radial menu and the gyro lab" loading="lazy" width="800" height="531">
        </picture>
      </a>
      <div class="ov-body">
        <ul class="td-points">${POINTS.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}</ul>
        <p class="td-actions"><a class="btn primary small" href="${THUMBDESK.latest}">Get ThumbDesk ${esc(THUMBDESK.version)}</a><a class="btn small" href="${THUMBDESK.home}">See how it works</a></p>
        <p class="fine">Free and open source (MIT). Windows, with macOS and Linux builds. Images from <a href="${THUMBDESK.repo}">ThumbDesk's repository</a>. Lens only reads ThumbDesk's status; it never sends input for it.</p>
      </div>
    </article>
  </div>
</section>`;
}
