import { api } from "./api.ts";

/** A random anonymous ID for this browser, so the same reader isn't counted twice. */
function visitorId(): string {
  const make = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^\w-]/g, "");
  try {
    let v = localStorage.getItem("ink.visitor");
    if (!v) { v = make(); localStorage.setItem("ink.visitor", v); }
    return v;
  } catch {
    return (window as unknown as { __inkVisitor?: string }).__inkVisitor ??= make();
  }
}

const sent = new Set<string>();

/** Count a reader opening a book, or reaching a chapter (each sent once per page load). */
export function trackRead(bookId: string, chapterId?: string | null, share?: string) {
  const key = `${bookId}|${chapterId ?? ""}`;
  if (sent.has(key)) return;
  sent.add(key);
  api.trackRead(bookId, visitorId(), chapterId ?? undefined, share).catch(() => sent.delete(key));
}
