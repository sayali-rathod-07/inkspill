import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Book } from "../types.ts";
import { paginate, pageGeometry } from "../reader/paginate.ts";
import { BookPage } from "../reader/BookPage.tsx";
import { FONT_FILES, fontFaceCss } from "../lib/fonts.ts";
import bookCss from "../reader/book.css?raw";

const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Make React's HTML output XHTML-safe (void elements closed, named entities avoided). */
function toXhtml(html: string) {
  return html
    .replace(/<(img|br|hr|input|source|meta|link)([^>]*?)(?<!\/)>/g, "<$1$2/>")
    .replace(/&nbsp;/g, "&#160;");
}

/** EPUB 3 fixed-layout export: every page keeps its exact layout, doodles stay vector. */
export async function buildEpub(book: Book, onProgress?: (msg: string) => void): Promise<Blob> {
  onProgress?.("Typesetting pages…");
  const { pages } = await paginate(book);
  const g = pageGeometry(book.trim);
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  onProgress?.("Embedding fonts…");
  for (const f of FONT_FILES) zip.file(`OEBPS/fonts/${f.file}`, await (await fetch(f.url)).arrayBuffer());
  const css = `${fontFaceCss((f) => `../fonts/${f.file}`)}
html, body { margin: 0; padding: 0; width: ${g.W}px; height: ${g.H}px; }
button { font: inherit; color: inherit; }
${bookCss}`;
  zip.file("OEBPS/css/book.css", css);

  // Collect and embed uploaded images.
  const images = new Map<string, string>();
  const manifestImages: string[] = [];
  const pageFiles: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    if (i % 8 === 0) onProgress?.(`Rendering page ${i + 1} of ${pages.length}…`);
    const side = i === 0 ? "right" : i % 2 ? "left" : "right";
    let html = renderToStaticMarkup(createElement(BookPage, { page: pages[i], book, side }));
    for (const m of html.matchAll(/href="(\/uploads\/[^"]+)"/g)) {
      const src = m[1];
      if (!images.has(src)) {
        const name = `img${images.size + 1}.${src.split(".").pop()}`;
        images.set(src, name);
        zip.file(`OEBPS/images/${name}`, await (await fetch(src)).arrayBuffer());
        manifestImages.push(name);
      }
    }
    html = html.replace(/href="(\/uploads\/[^"]+)"/g, (_m, src: string) => `href="../images/${images.get(src)}"`);
    const name = `p${String(i + 1).padStart(4, "0")}.xhtml`;
    pageFiles.push(name);
    zip.file(`OEBPS/pages/${name}`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head><meta charset="UTF-8"/><title>${xmlEsc(book.title)} — ${i + 1}</title>
<meta name="viewport" content="width=${g.W}, height=${g.H}"/>
<link rel="stylesheet" href="../css/book.css"/></head>
<body>${toXhtml(html)}</body></html>`);
  }

  const chapterStarts = pages
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => (p.kind === "opener" || p.kind === "text") && p.chapterId && pages[i - 1]?.chapterId !== p.chapterId);
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="UTF-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="pages/${pageFiles[0]}">Cover</a></li>
${chapterStarts.map(({ p, i }) => `<li><a href="pages/${pageFiles[i]}">${p.chapterNum}. ${xmlEsc(p.chapterTitle ?? "")}</a></li>`).join("\n")}
</ol></nav></body></html>`);

  const mime = (n: string) => (n.endsWith(".png") ? "image/png" : n.endsWith(".svg") ? "image/svg+xml" : n.endsWith(".webp") ? "image/webp" : n.endsWith(".gif") ? "image/gif" : "image/jpeg");
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:inkspill:${xmlEsc(book.id)}</dc:identifier>
    <dc:title>${xmlEsc(book.title)}</dc:title>
    <dc:creator>${xmlEsc(book.author || "Unknown")}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:spread">landscape</meta>
    <meta property="rendition:orientation">auto</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="css/book.css" media-type="text/css"/>
${FONT_FILES.map((f, i) => `    <item id="font${i}" href="fonts/${f.file}" media-type="font/woff2"/>`).join("\n")}
${manifestImages.map((n, i) => `    <item id="img${i}" href="images/${n}" media-type="${mime(n)}"/>`).join("\n")}
${pageFiles.map((n, i) => `    <item id="pg${i + 1}" href="pages/${n}" media-type="application/xhtml+xml" properties="svg"/>`).join("\n")}
  </manifest>
  <spine>
${pageFiles.map((_n, i) => `    <itemref idref="pg${i + 1}" properties="${i === 0 ? "rendition:page-spread-center" : i % 2 ? "page-spread-left" : "page-spread-right"}"/>`).join("\n")}
  </spine>
</package>`);

  onProgress?.("Zipping…");
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}
