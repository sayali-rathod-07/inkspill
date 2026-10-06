import { nanoid } from "nanoid";
import type { Book, Chapter, ThemeId } from "../types.ts";

export const uid = (n = 8) => nanoid(n);

/**
 * Keep chapters in outline order: all of Part One's chapters, then Part Two's, and so on.
 * Chapter numbers come from this order. Order within a part is preserved.
 */
export function orderChaptersByPart(b: Book) {
  const rank = new Map(b.parts.map((p, i) => [p.id, i]));
  const fallback = b.parts.length;
  const sorted = b.chapters
    .map((c, i) => ({ c, i, r: rank.get(c.partId) ?? fallback }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.c);
  if (sorted.some((c, i) => c !== b.chapters[i])) b.chapters = sorted;
}

/**
 * Change the book's drawing style. Doodles that were following the book's style move with it;
 * doodles you deliberately gave a different style keep theirs.
 */
export function setBookTheme(b: Book, theme: ThemeId) {
  const old = b.theme;
  b.theme = theme;
  for (const d of Object.values(b.doodles)) if (d.theme === old) d.theme = theme;
}
export const words = (s = "") => s.split(/\s+/).filter(Boolean).length;
export const chapterWords = (c: Chapter) => c.blocks.reduce((n, b) => n + (b.type === "text" ? words(b.text) : 0), 0);
export const bookWords = (b: Book) => b.chapters.reduce((n, c) => n + chapterWords(c), 0);
export const chapterNumber = (b: Book, id: string) => b.chapters.findIndex((c) => c.id === id) + 1;

/** Characters mentioned in a chapter (by name or alias). */
export function chapterCast(book: Book, ch: Chapter): string[] {
  const text = ch.blocks.map((b) => b.text ?? "").join(" ");
  return book.characters
    .filter((c) => [c.name, c.name.split(" ")[0], ...c.aliases].some((n) => n.length > 2 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)))
    .map((c) => c.id);
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const timeAgo = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
};
