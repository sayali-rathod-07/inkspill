import express, { type NextFunction, type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Book, BookSummary, PolishMode, PublicUser, ReaderComment, ShareInfo } from "../src/types.ts";
import { buildSeedBook } from "./seed.ts";
import { aiEnabled, aiProvider, characterDna, doodleScene, polish } from "./ai.ts";
import {
  aiDailyLimit, currentUser, findUser, initAuth, isOwnerUser, login, logout, ownerIsConfigured, ownerUsername, requireUser, signup, takeAiCredit, userCount,
} from "./auth.ts";
import { openStore } from "./storage.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");
const store = openStore(DATA);
const UPLOAD_LIMIT_MB = Number(process.env.UPLOAD_LIMIT_MB || (store.kind === "postgres" ? 8 : 30));

// ---------- storage helpers ----------
const getBook = (id: string) => store.get<Book>("books", String(id));
const putBook = (b: Book) => store.put("books", b.id, b);
const allBooks = () => store.list<Book>("books");

interface ShareRecord extends ShareInfo { bookId: string; salt?: string; hash?: string; comments: ReaderComment[] }
const getShare = (slug: string) => store.get<ShareRecord>("shares", String(slug));
const findShareForBook = async (bookId: string) => (await store.list<ShareRecord>("shares")).find((s) => s.bookId === bookId) ?? null;
const getComments = async (bookId: string) => (await store.get<ReaderComment[]>("comments", bookId)) ?? [];

async function seedIfEmpty() {
  for (let n = 1; n <= 7; n++) {
    const name = `seed-ch${n}.jpg`;
    if (!(await store.hasFile(name))) await store.putFile(name, "image/jpeg", readFileSync(path.join(root, "server/seed/art", `ch${n}.jpg`)));
  }
  if ((await allBooks()).length) return;
  const book = buildSeedBook();
  book.visibility = "public";
  await putBook(book);
  console.log("Seeded “My Chaotic Chronicles” from your manuscript.");
}

/**
 * Books created before accounts existed have no owner. They go to INKSPILL_OWNER when that
 * username signs up — or, if INKSPILL_OWNER isn't set, to the very first account created.
 */
async function claimOwnerless(u: PublicUser) {
  if (ownerIsConfigured() ? u.username !== ownerUsername() : userCount() !== 1) return;
  for (const b of await allBooks()) {
    if (!b.ownerId) {
      b.ownerId = u.id;
      b.visibility ??= "public";
      await putBook(b);
      console.log(`Book “${b.title}” now belongs to @${u.username}.`);
    }
  }
}

const wordCount = (b: Book) =>
  b.chapters.reduce((n, c) => n + c.blocks.reduce((m, bl) => m + (bl.type === "text" && bl.text ? bl.text.split(/\s+/).filter(Boolean).length : 0), 0), 0);

function coverSrc(b: Book) {
  const d = b.coverDoodleId ? b.doodles[b.coverDoodleId] : undefined;
  const img = d?.elements.find((e) => e.type === "image");
  return img && img.type === "image" ? img.src : undefined;
}

const canEdit = (b: Book, u: PublicUser | null) => Boolean(u && b.ownerId === u.id);
const canRead = (b: Book, u: PublicUser | null) => (b.visibility ?? "public") === "public" || canEdit(b, u);

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use(express.json({ limit: "25mb" }));
const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

// Uploaded files are served as inert media only (no scripts can run from them).
app.get("/uploads/:name", wrap(async (req, res) => {
  const f = await store.getFile(String(req.params.name));
  if (!f) return res.status(404).end();
  res.setHeader("Content-Type", f.type);
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  res.end(f.data);
}));

app.get("/api/status", (_req, res) => res.json({ ai: aiEnabled(), provider: aiProvider(), aiDailyLimit: aiDailyLimit() }));

// ---------- accounts ----------
app.get("/api/me", (req, res) => {
  const u = currentUser(req);
  res.json({ user: u, unlimitedAi: isOwnerUser(u) });
});
app.post("/api/signup", wrap((req, res) => signup(req, res, claimOwnerless)));
app.post("/api/login", login);
app.post("/api/logout", logout);

// ---------- books ----------
app.get("/api/books", wrap(async (req, res) => {
  const u = currentUser(req);
  const list: BookSummary[] = (await allBooks())
    .filter((b) => canRead(b, u))
    .map((b) => {
      const owner = b.ownerId ? findUser(b.ownerId) : null;
      return {
        id: b.id, title: b.title, subtitle: b.subtitle, author: b.author, updatedAt: b.updatedAt, chapters: b.chapters.length,
        words: wordCount(b), coverSrc: coverSrc(b), ownerName: owner?.displayName ?? b.author, ownerUsername: owner?.username ?? "",
        visibility: b.visibility ?? "public", mine: canEdit(b, u),
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
}));

app.post("/api/books", requireUser, wrap(async (req, res) => {
  const u = res.locals.user as PublicUser;
  const id = nanoid(10);
  const partId = nanoid(6);
  const book: Book = {
    id, ownerId: u.id, visibility: "public",
    title: String(req.body?.title || "Untitled Chronicles").slice(0, 120), subtitle: "", author: u.displayName, dedication: "",
    theme: "purple-ink", paper: "lavender", trim: "6x9", characters: [], parts: [{ id: partId, title: "Part One" }],
    chapters: [{ id: nanoid(8), partId, title: "Chapter One", status: "draft", blocks: [{ id: nanoid(8), type: "text", text: "" }] }],
    doodles: {}, cast: { inFrontMatter: false, nodes: [], edges: [], groups: [] }, updatedAt: Date.now(),
  };
  await putBook(book);
  res.json(book);
}));

app.get("/api/books/:id", wrap(async (req, res) => {
  const b = await getBook(String(req.params.id));
  const u = currentUser(req);
  if (!b || !canRead(b, u)) return res.status(404).json({ error: "Book not found" });
  const owner = b.ownerId ? findUser(b.ownerId) : null;
  res.json({ ...b, ownerName: owner?.displayName ?? b.author, canEdit: canEdit(b, u) });
}));

app.put("/api/books/:id", requireUser, wrap(async (req, res) => {
  const existing = await getBook(String(req.params.id));
  const u = res.locals.user as PublicUser;
  if (!existing || !canEdit(existing, u)) return res.status(403).json({ error: "Only the author can edit this book." });
  const book = req.body as Book & { canEdit?: boolean; ownerName?: string };
  if (!book || book.id !== existing.id || !Array.isArray(book.chapters)) return res.status(400).json({ error: "That doesn't look like this book." });
  delete book.canEdit;
  delete book.ownerName;
  book.ownerId = existing.ownerId;
  book.visibility = book.visibility === "private" ? "private" : "public";
  book.updatedAt = Date.now();
  await putBook(book);
  res.json({ ok: true, updatedAt: book.updatedAt });
}));

app.delete("/api/books/:id", requireUser, wrap(async (req, res) => {
  const b = await getBook(String(req.params.id));
  if (!b || !canEdit(b, res.locals.user)) return res.status(403).json({ error: "Only the author can delete this book." });
  await store.remove("books", b.id);
  res.json({ ok: true });
}));

// Public-book comments (anyone can leave one; the author sees them on the Publish page).
app.get("/api/books/:id/comments", wrap(async (req, res) => {
  const b = await getBook(String(req.params.id));
  if (!b || !canRead(b, currentUser(req))) return res.status(404).json({ error: "Book not found" });
  res.json(await getComments(b.id));
}));
app.post("/api/books/:id/comments", wrap(async (req, res) => {
  const b = await getBook(String(req.params.id));
  const u = currentUser(req);
  if (!b || !canRead(b, u)) return res.status(404).json({ error: "Book not found" });
  const c = makeComment(req.body, u);
  if (!c) return res.status(400).json({ error: "Comment text is required" });
  const list = await getComments(b.id);
  if (list.length > 5000) return res.status(429).json({ error: "This book has too many comments." });
  list.push(c);
  await store.put("comments", b.id, list);
  res.json(c);
}));

function makeComment(body: Partial<ReaderComment>, u: PublicUser | null): ReaderComment | null {
  const { name, text, chapterId, quote } = body ?? {};
  if (!text?.trim() || !chapterId) return null;
  return {
    id: nanoid(8), chapterId: String(chapterId).slice(0, 40), name: (u?.displayName || name || "Anonymous reader").toString().slice(0, 60),
    text: String(text).slice(0, 2000), quote: quote ? String(quote).slice(0, 400) : undefined, at: Date.now(),
  };
}

// Only plain images and audio; SVG is refused because it can carry scripts.
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/ogg": "ogg" };
app.post("/api/uploads", requireUser, express.raw({ type: () => true, limit: `${UPLOAD_LIMIT_MB}mb` }), wrap(async (req, res) => {
  const type = String(req.headers["content-type"] || "").split(";")[0];
  const ext = EXT[type];
  if (!ext) return res.status(415).json({ error: `Unsupported file type ${type || "(unknown)"}. Use PNG, JPEG, WebP, GIF or an audio file.` });
  const name = `${nanoid(14)}.${ext}`;
  await store.putFile(name, type, req.body as Buffer);
  res.json({ url: `/uploads/${name}` });
}));

// ---------- AI (logged-in users, with a daily allowance) ----------
const aiGate = (req: Request, res: Response, next: NextFunction) => {
  const credit = takeAiCredit(res.locals.user as PublicUser);
  if (!credit.ok) return res.status(429).json({ error: credit.error });
  next();
};
app.post("/api/ai/doodle", requireUser, aiGate, wrap(async (req, res) => res.json(await doodleScene(req.body))));
app.post("/api/ai/polish", requireUser, aiGate, wrap(async (req, res) => {
  const { mode, text, context } = req.body as { mode: PolishMode; text: string; context?: string };
  res.json(await polish(mode, String(text ?? "").slice(0, 8000), String(context ?? "").slice(0, 8000)));
}));
app.post("/api/ai/character", requireUser, aiGate, wrap(async (req, res) => res.json(await characterDna(req.body.name, req.body.description))));

// ---------- private share links ----------
const hashPw = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString("hex");
function checkPw(s: ShareRecord, pw: unknown) {
  if (!s.hash || !s.salt) return true;
  if (typeof pw !== "string") return false;
  const a = Buffer.from(hashPw(pw, s.salt), "hex"), b = Buffer.from(s.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
const shareInfo = (s: ShareRecord): ShareInfo => ({ slug: s.slug, chapterIds: s.chapterIds, hasPassword: Boolean(s.hash), publishedAt: s.publishedAt });
const ownBook = async (req: Request, res: Response): Promise<Book | null> => {
  const b = await getBook(String(req.params.id));
  if (!b || !canEdit(b, res.locals.user)) { res.status(403).json({ error: "Only the author can manage sharing." }); return null; }
  return b;
};

app.get("/api/books/:id/share", requireUser, wrap(async (req, res) => {
  const b = await ownBook(req, res);
  if (!b) return;
  const s = await findShareForBook(b.id);
  const publicComments = await getComments(b.id);
  res.json({ share: s ? shareInfo(s) : null, comments: [...(s?.comments ?? []), ...publicComments].sort((x, y) => x.at - y.at) });
}));

app.post("/api/books/:id/share", requireUser, wrap(async (req, res) => {
  const b = await ownBook(req, res);
  if (!b) return;
  const { chapterIds, password, removePassword } = req.body as { chapterIds: string[]; password?: string; removePassword?: boolean };
  const existing = await findShareForBook(b.id);
  const s: ShareRecord = existing ?? { slug: nanoid(10), bookId: b.id, chapterIds: [], hasPassword: false, publishedAt: 0, comments: [] };
  s.chapterIds = Array.isArray(chapterIds) ? chapterIds.map(String) : [];
  s.publishedAt = Date.now();
  if (password) { s.salt = randomBytes(12).toString("hex"); s.hash = hashPw(password, s.salt); }
  if (removePassword) { delete s.salt; delete s.hash; }
  s.hasPassword = Boolean(s.hash);
  await store.put("shares", s.slug, s);
  res.json({ share: shareInfo(s), comments: s.comments });
}));

app.delete("/api/books/:id/share", requireUser, wrap(async (req, res) => {
  const b = await ownBook(req, res);
  if (!b) return;
  const s = await findShareForBook(b.id);
  if (s) await store.remove("shares", s.slug);
  res.json({ ok: true });
}));

app.get("/api/share/:slug", wrap(async (req, res) => {
  const s = await getShare(String(req.params.slug));
  if (!s) return res.status(404).json({ error: "This link doesn't exist (or was unpublished)." });
  if (!checkPw(s, req.headers["x-share-password"])) return res.status(401).json({ needsPassword: true });
  const book = await getBook(s.bookId);
  if (!book) return res.status(404).json({ error: "Book not found" });
  const chapters = book.chapters.filter((c) => s.chapterIds.includes(c.id));
  const used = new Set<string>([book.coverDoodleId ?? "", ...chapters.flatMap((c) => [c.artDoodleId ?? "", ...c.blocks.map((b) => b.doodleId ?? "")])]);
  const doodles = Object.fromEntries(Object.entries(book.doodles).filter(([id]) => used.has(id)));
  res.json({ book: { ...book, chapters, doodles }, comments: s.comments });
}));

app.post("/api/share/:slug/comments", wrap(async (req, res) => {
  const s = await getShare(String(req.params.slug));
  if (!s) return res.status(404).json({ error: "Not found" });
  if (!checkPw(s, req.headers["x-share-password"])) return res.status(401).json({ needsPassword: true });
  const c = makeComment(req.body, currentUser(req));
  if (!c) return res.status(400).json({ error: "Comment text is required" });
  s.comments.push(c);
  await store.put("shares", s.slug, s);
  res.json(c);
}));

// ---------- production static ----------
if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = (err as { status?: number }).status;
  res.status(status && status >= 400 && status < 600 ? status : 500).json({ error: err.message || "Something went wrong" });
});

const port = Number(process.env.PORT || 8787);
await initAuth(store, DATA);
await seedIfEmpty();
app.listen(port, () => console.log(`InkSpill API on http://localhost:${port}  [storage: ${store.kind}] (AI ${aiEnabled() ? `on — ${aiProvider() === "gemini" ? "Gemini" : "Claude"}` : "off — add GEMINI_API_KEY or ANTHROPIC_API_KEY to .env"})`));
