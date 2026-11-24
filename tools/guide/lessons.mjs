// Parser for Guide lessons (guide/*.md). Format:
//
//   ---
//   id: first-5-minutes
//   title: First 5 minutes with Lens
//   summary: One line shown in the lesson list.
//   minutes: 5
//   order: 1
//   requires: config.voice exists        (optional condition; lesson greyed out when false)
//   requiresNote: Voice arrives in a later build.
//   ---
//
//   ## Step title
//   show: settings:theme                 (optional "Show me" target: surface[:tab[:label]])
//   anchor: dock.search                  (optional data-guide-id to highlight)
//   check: config.dock.style == slim     (optional completion condition)
//   success: Done! That's the Slim dock.  (optional message when the check passes)
//
//   Free text for the step (plain Markdown-lite).
//
// Plain JS so Node (build) and bun (tests) can both import it.

const KEYS = new Set(["show", "anchor", "check", "success", "hint"]);

export function parseLesson(text, source = "lesson") {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!fm) throw new Error(`${source}: missing front-matter`);
  const meta = {};
  for (const line of fm[1].split("\n")) {
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  for (const k of ["id", "title", "summary"]) {
    if (!meta[k]) throw new Error(`${source}: front-matter needs "${k}"`);
  }
  if (!/^[a-z0-9-]+$/.test(meta.id)) throw new Error(`${source}: id must be kebab-case`);
  const body = text.slice(fm[0].length);
  const chunks = body.split(/^##\s+/m).slice(1);
  if (!chunks.length) throw new Error(`${source}: a lesson needs at least one "## Step"`);
  const steps = chunks.map((chunk, i) => {
    const lines = chunk.split("\n");
    const title = lines.shift().trim();
    const step = { n: i + 1, title, text: "" };
    const rest = [];
    let inKeys = true;
    for (const line of lines) {
      const m = line.match(/^([a-z]+):\s*(.*)$/);
      if (inKeys && m && KEYS.has(m[1])) {
        step[m[1]] = m[2].trim();
        continue;
      }
      if (inKeys && line.trim() === "") continue;
      inKeys = false;
      rest.push(line);
    }
    step.text = rest.join("\n").trim();
    if (step.show) step.target = parseTarget(step.show, `${source} step ${i + 1}`);
    return step;
  });
  return {
    id: meta.id,
    title: meta.title,
    summary: meta.summary,
    minutes: Number(meta.minutes) || Math.max(1, Math.round(steps.length / 2)),
    order: Number(meta.order) || 99,
    requires: meta.requires || null,
    requiresNote: meta.requiresNote || null,
    steps,
    source,
  };
}

/** "settings:theme:Mouse pointer" → {surface:"settings", tab:"theme", label:"Mouse pointer"} */
export function parseTarget(spec, where = "target") {
  const [surface, tab, ...label] = spec.split(":");
  const allowed = ["settings", "command", "mini", "dock", "topbar", "palette", "browser", "guide", "doc"];
  if (!allowed.includes(surface)) throw new Error(`${where}: unknown surface "${surface}"`);
  const t = { surface };
  if (surface === "doc") {
    if (tab) t.doc = [tab, ...label].join(":");
    return t;
  }
  if (surface === "settings") {
    if (tab) t.tab = tab;
    if (label.length) t.label = label.join(":");
  } else if (tab) {
    t.anchor = [tab, ...label].join(":");
  }
  return t;
}
