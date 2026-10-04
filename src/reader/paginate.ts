import type { Book, Chapter, TrimId } from "../types.ts";
import { fontsReady } from "../lib/fonts.ts";

export const TRIMS: Record<TrimId, { w: number; h: number; label: string }> = {
  "5x8": { w: 5, h: 8, label: '5" × 8" (novel)' },
  "5.5x8.5": { w: 5.5, h: 8.5, label: '5.5" × 8.5" (digest)' },
  "6x9": { w: 6, h: 9, label: '6" × 9" (trade paperback)' },
  "7x10": { w: 7, h: 10, label: '7" × 10" (illustrated)' },
  "8.5x8.5": { w: 8.5, h: 8.5, label: '8.5" × 8.5" (square comic)' },
};

/** Page geometry in CSS px. 1 inch = 80px on the logical page. */
export function pageGeometry(trim: TrimId) {
  const t = TRIMS[trim] ?? TRIMS["6x9"];
  const W = Math.round(t.w * 80), H = Math.round(t.h * 80);
  const m = { top: 58, bottom: 60, inner: 54, outer: 42 };
  return { W, H, m, CW: W - m.inner - m.outer, CH: H - m.top - m.bottom };
}

export type PageItem =
  | { t: "p"; blockId: string; text: string; drop?: boolean; cont?: boolean }
  | { t: "doodle"; blockId: string; doodleId: string; caption?: string; h: number }
  | { t: "scene"; blockId: string; text: string }
  | { t: "note"; blockId: string; text: string }
  | { t: "audio"; blockId: string; caption: string; url: string }
  | { t: "head"; num: number; title: string; note?: string };

export type PageKind = "cover" | "title" | "dedication" | "cast" | "toc" | "part" | "opener" | "text" | "end";

export interface Page {
  kind: PageKind;
  items: PageItem[];
  chapterId?: string;
  chapterNum?: number;
  chapterTitle?: string;
  partTitle?: string;
  num: number;
  toc?: { title: string; num: number; page: number; part?: string }[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Markup used only for measuring; BookPage renders the same classes. */
export function itemHtml(it: PageItem): string {
  switch (it.t) {
    case "p": return `<p class="bp-p${it.drop ? " drop" : ""}${it.cont ? " cont" : ""}">${esc(it.text)}</p>`;
    case "doodle": return `<figure class="bp-fig"><div style="height:${it.h}px"></div>${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ""}</figure>`;
    case "scene": return `<div class="bp-scene"><span>${esc(it.text)}</span></div>`;
    case "note": return `<aside class="bp-note">${esc(it.text)}</aside>`;
    case "audio": return `<div class="bp-audio"><span>♫</span><div>${esc(it.caption || "Listen")}</div></div>`;
    case "head": return `<header class="bp-head"><div class="n">Chapter ${it.num}</div><h2>${esc(it.title)}</h2>${it.note ? `<p class="cn">Content note: ${esc(it.note)}</p>` : ""}</header>`;
  }
}

export interface PaginateOpts {
  chapterIds?: string[];
  frontMatter?: boolean;
}

export async function paginate(book: Book, opts: PaginateOpts = {}): Promise<{ pages: Page[]; chapterStart: Record<string, number> }> {
  await fontsReady();
  const { CW, CH } = pageGeometry(book.trim);
  const host = document.createElement("div");
  host.className = `book-page-measure paper-${book.paper}`;
  host.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;width:${CW}px;`;
  const box = document.createElement("div");
  box.className = "bp-content";
  box.style.cssText = `width:${CW}px;`;
  host.appendChild(box);
  document.body.appendChild(host);

  const pages: Page[] = [];
  const chapterStart: Record<string, number> = {};
  const push = (p: Omit<Page, "num">) => { pages.push({ ...p, num: pages.length + 1 }); return pages[pages.length - 1]; };

  try {
    const chapters = book.chapters.filter((c) => !opts.chapterIds || opts.chapterIds.includes(c.id));
    if (opts.frontMatter !== false) {
      push({ kind: "cover", items: [] });
      push({ kind: "title", items: [] });
      if (book.dedication.trim()) push({ kind: "dedication", items: [] });
      if (book.cast.inFrontMatter && book.cast.nodes.length) push({ kind: "cast", items: [] });
      push({ kind: "toc", items: [], toc: [] });
    }

    const fits = (items: PageItem[]) => {
      box.innerHTML = items.map(itemHtml).join("");
      return box.scrollHeight <= CH + 0.5;
    };

    let lastPart = "";
    for (const ch of chapters) {
      const num = book.chapters.indexOf(ch) + 1;
      const part = book.parts.find((p) => p.id === ch.partId);
      if (opts.frontMatter !== false && part && book.parts.length > 1 && part.id !== lastPart) {
        push({ kind: "part", items: [], partTitle: part.title });
      }
      lastPart = part?.id ?? "";
      const base = { chapterId: ch.id, chapterNum: num, chapterTitle: ch.title };
      chapterStart[ch.id] = pages.length;
      const art = ch.artDoodleId ? book.doodles[ch.artDoodleId] : undefined;

      let cur: PageItem[] = [];
      if (art) {
        push({ ...base, kind: "opener", items: [] });
      } else {
        cur.push({ t: "head", num, title: ch.title, note: ch.contentNote });
      }
      let first = true;
      const flush = () => { push({ ...base, kind: "text", items: cur }); cur = []; };

      for (const b of ch.blocks) {
        const item = toItem(b, book, CW, first);
        if (!item) continue;
        if (item.t === "p") first = false;

        if (item.t === "doodle") {
          const capH = item.caption ? 34 : 0;
          if (!fits([...cur, item])) {
            // Shrink to fit if it's close, otherwise move to the next page.
            const room = CH - (cur.length ? measureH(box, cur) : 0) - capH - 18;
            if (cur.length && room >= item.h * 0.62) item.h = Math.floor(room);
            else {
              if (cur.length) flush();
              if (!fits([item])) item.h = Math.max(80, CH - capH - 18);
            }
          }
          cur.push(item);
          continue;
        }

        if (fits([...cur, item])) { cur.push(item); continue; }

        if (item.t === "p") {
          // Split the paragraph across pages at a word boundary.
          let rest = item.text;
          let cont = item.cont ?? false;
          let drop = item.drop;
          while (rest) {
            const words = rest.split(" ");
            let lo = 0, hi = words.length;
            while (lo < hi) {
              const mid = Math.ceil((lo + hi) / 2);
              if (fits([...cur, { ...item, text: words.slice(0, mid).join(" "), cont, drop }])) lo = mid;
              else hi = mid - 1;
            }
            if (lo === 0) {
              if (!cur.length) lo = Math.max(1, Math.min(words.length, 40)); // pathological: force progress
              else { flush(); continue; }
            }
            cur.push({ ...item, text: words.slice(0, lo).join(" "), cont, drop });
            rest = words.slice(lo).join(" ");
            drop = false;
            if (rest) { flush(); cont = true; }
          }
        } else {
          if (cur.length) flush();
          cur.push(item);
        }
      }
      if (cur.length) flush();
    }

    if (opts.frontMatter !== false) push({ kind: "end", items: [] });

    const toc = pages.find((p) => p.kind === "toc");
    if (toc) {
      toc.toc = chapters.map((c) => ({
        title: c.title, num: book.chapters.indexOf(c) + 1, page: chapterStart[c.id] + 1,
        part: book.parts.length > 1 ? book.parts.find((p) => p.id === c.partId)?.title : undefined,
      }));
    }
  } finally {
    host.remove();
  }
  return { pages, chapterStart };
}

function measureH(box: HTMLElement, items: PageItem[]) {
  box.innerHTML = items.map(itemHtml).join("");
  return box.scrollHeight;
}

function toItem(b: Chapter["blocks"][number], book: Book, CW: number, first: boolean): PageItem | null {
  switch (b.type) {
    case "text":
      return b.text?.trim() ? { t: "p", blockId: b.id, text: b.text.trim(), drop: first } : null;
    case "doodle": {
      const d = b.doodleId ? book.doodles[b.doodleId] : undefined;
      if (!d) return null;
      return { t: "doodle", blockId: b.id, doodleId: d.id, caption: b.caption, h: Math.round((CW * d.height) / d.width) };
    }
    case "scene":
      return { t: "scene", blockId: b.id, text: b.text ?? "" };
    case "note":
      return b.text?.trim() ? { t: "note", blockId: b.id, text: b.text } : null;
    case "audio":
      return { t: "audio", blockId: b.id, caption: b.caption ?? "", url: b.url ?? "" };
  }
}
