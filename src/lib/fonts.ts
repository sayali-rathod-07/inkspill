import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/600.css";
import "@fontsource/patrick-hand/400.css";
import "@fontsource/bangers/400.css";
import "@fontsource/caveat/700.css";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/800.css";

import literata400 from "@fontsource/literata/files/literata-latin-400-normal.woff2?url";
import literata400i from "@fontsource/literata/files/literata-latin-400-italic.woff2?url";
import literata600 from "@fontsource/literata/files/literata-latin-600-normal.woff2?url";
import patrick from "@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?url";
import bangers from "@fontsource/bangers/files/bangers-latin-400-normal.woff2?url";
import caveat from "@fontsource/caveat/files/caveat-latin-700-normal.woff2?url";
import baloo600 from "@fontsource/baloo-2/files/baloo-2-latin-600-normal.woff2?url";
import baloo800 from "@fontsource/baloo-2/files/baloo-2-latin-800-normal.woff2?url";

export const FONT_FILES = [
  { family: "Literata", weight: 400, style: "normal", url: literata400, file: "literata-400.woff2" },
  { family: "Literata", weight: 400, style: "italic", url: literata400i, file: "literata-400i.woff2" },
  { family: "Literata", weight: 600, style: "normal", url: literata600, file: "literata-600.woff2" },
  { family: "Patrick Hand", weight: 400, style: "normal", url: patrick, file: "patrick-hand.woff2" },
  { family: "Bangers", weight: 400, style: "normal", url: bangers, file: "bangers.woff2" },
  { family: "Caveat", weight: 700, style: "normal", url: caveat, file: "caveat-700.woff2" },
  { family: "Baloo 2", weight: 600, style: "normal", url: baloo600, file: "baloo2-600.woff2" },
  { family: "Baloo 2", weight: 800, style: "normal", url: baloo800, file: "baloo2-800.woff2" },
];

export const fontFaceCss = (urlFor: (f: (typeof FONT_FILES)[number]) => string) =>
  FONT_FILES.map((f) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};src:url("${urlFor(f)}") format("woff2");}`).join("\n");

export async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** Ensure every font is ready before measuring text. */
export async function fontsReady() {
  await Promise.all(FONT_FILES.map((f) => document.fonts.load(`${f.style} ${f.weight} 20px "${f.family}"`).catch(() => null)));
  await document.fonts.ready;
}

/** Serialise an on-screen SVG into a standalone file with fonts and images embedded. */
export async function standaloneSvg(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-editor-only]").forEach((n) => n.remove());
  for (const img of Array.from(clone.querySelectorAll("image"))) {
    const href = img.getAttribute("href");
    if (href && !href.startsWith("data:")) img.setAttribute("href", await toDataUrl(href).catch(() => href));
  }
  const used = new Set(Array.from(clone.querySelectorAll("text")).map((t) => t.getAttribute("font-family")?.replace(/["']/g, "").split(",")[0].trim()));
  const faces: string[] = [];
  for (const f of FONT_FILES.filter((f) => used.has(f.family))) {
    faces.push(`@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};src:url("${await toDataUrl(f.url)}") format("woff2");}`);
  }
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = faces.join("\n");
  clone.insertBefore(style, clone.firstChild);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  return new XMLSerializer().serializeToString(clone);
}

export async function svgToPng(svgText: string, width: number, height: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
