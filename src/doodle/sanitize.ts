// Shared by server and browser: books are public, so anything rendered as markup must be inert.

const TAGS = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g"]);
const ATTRS = new Set([
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "points", "fill", "stroke",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "transform",
]);

/** Allow only simple drawing tags/attributes; strips scripts, event handlers, links, foreignObject and styles. */
export function sanitizeSvg(svg: string): string {
  return String(svg ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?([a-zA-Z][\w-]*)([^>]*)>|[<>]/g, (full, tag?: string, attrs = "") => {
    if (!tag) return "";
    const t = tag.toLowerCase();
    if (!TAGS.has(t)) return "";
    if (full.startsWith("</")) return `</${t}>`;
    const kept: string[] = [];
    for (const m of attrs.matchAll(/([a-zA-Z-:]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const name = m[1].toLowerCase();
      const value = (m[3] ?? m[4] ?? "").replace(/[<>"&]/g, "");
      if (ATTRS.has(name) && !/url\s*\(|javascript:|expression\s*\(/i.test(value)) kept.push(`${name}="${value}"`);
    }
    const selfClose = /\/\s*$/.test(attrs) ? "/" : "";
    return `<${t}${kept.length ? " " + kept.join(" ") : ""}${selfClose}>`;
  });
}

/** Links readers can click: web pages only. */
export function safeLink(url?: string): string | undefined {
  const u = (url ?? "").trim();
  return /^https?:\/\//i.test(u) || /^\/uploads\/[\w.-]+$/.test(u) ? u : undefined;
}

/** Image sources: uploaded files, web images, or inline raster data. */
export function safeImage(src?: string): string {
  const u = (src ?? "").trim();
  return /^\/uploads\/[\w.-]+$/.test(u) || /^https:\/\//i.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u) ? u : "";
}
