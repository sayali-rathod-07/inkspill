// Reader counting: one anonymous random ID per browser (no names, emails or IPs are stored).
import { createHash } from "node:crypto";
import type { Book, ReadStats } from "../src/types.ts";
import type { Store } from "./storage.ts";

interface ReaderRec { first: number; last: number; ch: string[] }
interface StatsDoc { opens: number; readers: Record<string, ReaderRec> }

const MAX_READERS = 50_000;
const DAY = 86_400_000;

// Serialise read-modify-write per book so simultaneous readers don't overwrite each other.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  queues.set(key, next.catch(() => undefined));
  return next;
}

const hashVisitor = (v: string) => createHash("sha256").update("inkspill:" + v).digest("base64url").slice(0, 16);

export function recordRead(store: Store, book: Book, visitor: string, chapterId?: string) {
  if (!/^[\w-]{8,64}$/.test(visitor)) return Promise.resolve();
  return serial(book.id, async () => {
    const doc = (await store.get<StatsDoc>("stats", book.id)) ?? { opens: 0, readers: {} };
    const key = hashVisitor(visitor);
    const now = Date.now();
    let r = doc.readers[key];
    if (!r) {
      if (Object.keys(doc.readers).length >= MAX_READERS) return;
      r = doc.readers[key] = { first: now, last: now, ch: [] };
    }
    if (!chapterId) doc.opens++;
    if (chapterId && book.chapters.some((c) => c.id === chapterId) && !r.ch.includes(chapterId)) r.ch.push(chapterId);
    r.last = now;
    await store.put("stats", book.id, doc);
  });
}

export async function readerCount(store: Store, bookId: string) {
  const doc = await store.get<StatsDoc>("stats", bookId);
  return doc ? Object.keys(doc.readers).length : 0;
}

export async function summarize(store: Store, book: Book): Promise<ReadStats> {
  const doc = (await store.get<StatsDoc>("stats", book.id)) ?? { opens: 0, readers: {} };
  const rs = Object.values(doc.readers);
  const now = Date.now();
  const last = book.chapters[book.chapters.length - 1]?.id;
  const recent: ReadStats["recent"] = [];
  for (let d = 13; d >= 0; d--) {
    const start = new Date(now - d * DAY);
    start.setUTCHours(0, 0, 0, 0);
    const end = start.getTime() + DAY;
    recent.push({ day: start.toISOString().slice(0, 10), readers: rs.filter((r) => r.last >= start.getTime() && r.first < end).length });
  }
  return {
    readers: rs.length,
    opens: doc.opens,
    last7Days: rs.filter((r) => r.last >= now - 7 * DAY).length,
    finished: last ? rs.filter((r) => r.ch.includes(last)).length : 0,
    chapters: book.chapters.map((c) => ({ id: c.id, title: c.title, readers: rs.filter((r) => r.ch.includes(c.id)).length })),
    recent,
  };
}
