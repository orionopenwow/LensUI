// Screen points for the real-Windows E2E (no Windows calls here, so bun tests can check them).

/** A point on the screen outside `rect` (a window's {x, y, w, h} in screen px), halfway into the
 *  free strip to its right (else its left), 30 % down the screen: away from the Top Bar, the Dock
 *  and the desktop folder tab (left edge, mid-height), so the click lands on the bare desktop.
 *  Null when neither side leaves `min` px.
 *
 *  Why (B-131): topbar-quicksettings-dismiss › other-flyout clicked a fixed point (25 % across,
 *  70 % down) to "click outside" the Launcher, but the Launcher is a centred 780×640 window, so on
 *  the 1024×768 runner that point is inside it, on its app grid: the click opened whichever app
 *  sat there, and the Launcher closed only if that launch came back before the check. */
export function pointOutside(rect, screen, min = 40) {
  const left = rect.x - (screen.x ?? 0);
  const right = (screen.x ?? 0) + screen.w - (rect.x + rect.w);
  const y = Math.round((screen.y ?? 0) + screen.h * 0.3);
  if (right >= min) return { x: Math.round(rect.x + rect.w + right / 2), y };
  if (left >= min) return { x: Math.round((screen.x ?? 0) + left / 2), y };
  return null;
}

/** Whether (x, y) lies inside rect. */
export function inside(rect, x, y) {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}
