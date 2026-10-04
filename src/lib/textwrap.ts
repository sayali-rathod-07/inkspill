let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, string[]>();

/** Greedy word-wrap using real font metrics (fonts must be loaded for exact results). */
export function wrapText(text: string, font: string, maxWidth: number): string[] {
  const key = font + "|" + maxWidth.toFixed(0) + "|" + text;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return text.split("\n");
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return [text];
  ctx.font = font;
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}

export function clearWrapCache() { cache.clear(); }
