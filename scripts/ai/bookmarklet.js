// Lens bookmarklet — for browsers where the extension isn't installed.
// It copies the page's text to the clipboard, then opens a lens:// link with the URL and title.
// Lens shows the request and reads the clipboard only when you click Send.
// Needs Settings › Connections › "lens://links" turned on.
//
// Make a bookmark whose URL is the single line printed by `node scripts/ai/bookmarklet.js`.

const source = `(() => {
  const sel = String(getSelection() || "");
  const text = (sel || document.body.innerText || "").slice(0, 200000);
  const go = () => {
    const q = new URLSearchParams({ url: location.href, title: document.title.slice(0, 300), clip: "1" });
    location.href = "lens://summarize?" + q.toString();
  };
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(go, () => {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); go();
  });
})()`;

export const bookmarklet = "javascript:" + encodeURIComponent(source.replace(/\n\s*/g, " "));

if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("bookmarklet.js")) {
  console.log(bookmarklet);
}
