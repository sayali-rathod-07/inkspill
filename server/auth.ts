import type { NextFunction, Request, Response } from "express";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { nanoid } from "nanoid";
import type { PublicUser } from "../src/types.ts";
import type { Store } from "./storage.ts";

interface UserRecord extends PublicUser { salt: string; hash: string; createdAt: number }
interface Session { userId: string; expires: number }

const SESSION_DAYS = 30;
const COOKIE = "inkspill_session";

// Accounts are few, so they live in memory and are written through to the store.
let store: Store;
let users: UserRecord[] = [];
let sessions: Record<string, Session> = {};

const persist = (id: "users" | "sessions", value: unknown) =>
  store.put("meta", id, value).catch((e) => console.error(`Couldn't save ${id}:`, e));
const saveUsers = () => persist("users", users);
const saveSessions = () => persist("sessions", sessions);

export async function initAuth(s: Store, dataDir: string) {
  store = s;
  // One-time move of accounts saved by an earlier version (data/users.json → store).
  for (const id of ["users", "sessions"] as const) {
    const old = path.join(dataDir, `${id}.json`);
    if (existsSync(old) && !(await store.get("meta", id))) {
      await store.put("meta", id, JSON.parse(readFileSync(old, "utf8")));
      renameSync(old, old + ".migrated");
    }
  }
  users = (await store.get<UserRecord[]>("meta", "users")) ?? [];
  sessions = (await store.get<Record<string, Session>>("meta", "sessions")) ?? {};
  const now = Date.now();
  for (const [k, x] of Object.entries(sessions)) if (x.expires < now) delete sessions[k];
}

/** The site owner: INKSPILL_OWNER if set, otherwise the very first account ever created. */
export const ownerUsername = () => (process.env.INKSPILL_OWNER || "").trim().toLowerCase() || users[0]?.username || null;
const configuredOwner = () => (process.env.INKSPILL_OWNER || "").trim().toLowerCase() || null;
export const ownerIsConfigured = () => configuredOwner() !== null;
export const isOwnerUser = (u: PublicUser | null) => Boolean(u && ownerUsername() && u.username === ownerUsername());
export const userCount = () => users.length;
export const publicUser = (u: UserRecord): PublicUser => ({ id: u.id, username: u.username, displayName: u.displayName });
export const findUser = (id: string) => users.find((u) => u.id === id) ?? null;

const hash = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString("hex");

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(req: Request, res: Response, token: string | null) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const parts = [
    `${COOKIE}=${token ?? ""}`, "Path=/", "HttpOnly", "SameSite=Lax",
    token ? `Max-Age=${SESSION_DAYS * 86400}` : "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function currentUser(req: Request): PublicUser | null {
  const token = parseCookies(req)[COOKIE];
  const s = token ? sessions[token] : undefined;
  if (!s || s.expires < Date.now()) return null;
  const u = findUser(s.userId);
  return u ? publicUser(u) : null;
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: "Please log in first." });
  res.locals.user = u;
  next();
}

// Simple brute-force protection: max 10 failed logins per IP+username per 15 minutes.
const failures = new Map<string, { n: number; until: number }>();

export async function signup(req: Request, res: Response, onFirstUser: (u: PublicUser) => Promise<void>) {
  const { username: rawName, password, displayName } = req.body as { username?: string; password?: string; displayName?: string };
  const username = (rawName ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) return res.status(400).json({ error: "Username: 3–24 letters, numbers, dots, dashes or underscores." });
  if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (users.some((u) => u.username === username)) return res.status(409).json({ error: "That username is taken." });
  const salt = randomBytes(16).toString("hex");
  const u: UserRecord = { id: nanoid(10), username, displayName: (displayName ?? "").trim().slice(0, 40) || username, salt, hash: hash(password, salt), createdAt: Date.now() };
  users.push(u);
  await saveUsers();
  await onFirstUser(publicUser(u));
  startSession(req, res, u);
  res.json({ user: publicUser(u) });
}

export function login(req: Request, res: Response) {
  const { username: rawName, password } = req.body as { username?: string; password?: string };
  const username = (rawName ?? "").trim().toLowerCase();
  const key = `${req.ip}|${username}`;
  const f = failures.get(key);
  if (f && f.n >= 10 && f.until > Date.now()) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const u = users.find((x) => x.username === username);
  const ok = u && password && timingSafeEqual(Buffer.from(hash(password, u.salt), "hex"), Buffer.from(u.hash, "hex"));
  if (!u || !ok) {
    failures.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    return res.status(401).json({ error: "Wrong username or password." });
  }
  failures.delete(key);
  startSession(req, res, u);
  res.json({ user: publicUser(u) });
}

function startSession(req: Request, res: Response, u: UserRecord) {
  const token = randomBytes(32).toString("hex");
  sessions[token] = { userId: u.id, expires: Date.now() + SESSION_DAYS * 86400_000 };
  saveSessions();
  setSessionCookie(req, res, token);
}

export function logout(req: Request, res: Response) {
  const token = parseCookies(req)[COOKIE];
  if (token && sessions[token]) { delete sessions[token]; saveSessions(); }
  setSessionCookie(req, res, null);
  res.json({ ok: true });
}

// ---- AI usage limits (per user per day; the owner is unlimited) ----
const usage = new Map<string, { day: string; n: number }>();
export const aiDailyLimit = () => Number(process.env.AI_DAILY_LIMIT || 25);

export function takeAiCredit(u: PublicUser): { ok: true } | { ok: false; error: string } {
  if (isOwnerUser(u)) return { ok: true };
  const day = new Date().toISOString().slice(0, 10);
  const cur = usage.get(u.id);
  const n = cur && cur.day === day ? cur.n : 0;
  if (n >= aiDailyLimit()) return { ok: false, error: `You've used today's ${aiDailyLimit()} AI requests. They reset tomorrow — you can keep editing by hand meanwhile.` };
  usage.set(u.id, { day, n: n + 1 });
  return { ok: true };
}
