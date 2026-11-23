// Micro-save, extension side: what gets saved and what the toast says. Pure, for `bun test`.

export function microItem(ctx) {
  if (ctx.selection) return { kind: "selection", text: ctx.selection, title: ctx.title, url: ctx.url };
  if (ctx.imageUrl) return { kind: "image", url: ctx.imageUrl, title: ctx.title };
  if (ctx.linkUrl) return { kind: "text", title: ctx.linkText || ctx.linkUrl, url: ctx.linkUrl };
  return { kind: "text", title: ctx.title, url: ctx.url };
}

export function microToast(reply) {
  if (!reply?.ok) return ["Couldn't save to your Shelf", reply?.error || "Is Lens running?", "error"];
  const m = reply.micro || {};
  if (m.duplicate) return ["Already on your Shelf", "", "muted"];
  if (m.merged) return ["Added to the same note", m.approxTokens ? `~${m.approxTokens.toLocaleString()} tokens` : "", "ok"];
  return ["Saved to Shelf", m.approxTokens ? `~${m.approxTokens.toLocaleString()} tokens` : "", "ok"];
}
