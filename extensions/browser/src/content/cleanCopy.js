// Copy guard (opt-in: Settings → "Stop sites changing what you copy"). Registered at
// document_start, before the page's own scripts, on the sites the user allowed.
//
// Some sites listen for "copy" and rewrite the clipboard ("Read more at …", a tracking link, or
// nothing at all). This listener runs first, in the capture phase on window, and stops the event
// from reaching the page. The browser then copies exactly what you selected. Nothing is read,
// stored or sent.
(() => {
  if (window.__lensCopyGuard) return;
  window.__lensCopyGuard = true;
  const stop = (e) => {
    // Leave editable fields alone (editors implement their own copy).
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName || ""))) return;
    e.stopImmediatePropagation();
  };
  window.addEventListener("copy", stop, true);
  window.addEventListener("cut", stop, true);
})();
