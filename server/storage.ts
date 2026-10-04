// Persistence: local files by default, or Postgres when DATABASE_URL is set (for free hosts whose disks are wiped).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

export type Collection = "books" | "shares" | "comments" | "meta";

export interface StoredFile { type: string; data: Buffer }

export interface Store {
  kind: "files" | "postgres";
  get<T>(col: Collection, id: string): Promise<T | null>;
  put(col: Collection, id: string, value: unknown): Promise<void>;
  remove(col: Collection, id: string): Promise<void>;
  list<T>(col: Collection): Promise<T[]>;
  putFile(name: string, type: string, data: Buffer): Promise<void>;
  getFile(name: string): Promise<StoredFile | null>;
  hasFile(name: string): Promise<boolean>;
}

const safe = (id: string) => id.replace(/[^\w.-]/g, "");

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg" };

class FileStore implements Store {
  kind = "files" as const;
  constructor(private dir: string) {
    for (const c of ["books", "shares", "comments", "meta", "uploads"]) mkdirSync(path.join(dir, c), { recursive: true });
  }
  private p(col: Collection, id: string) { return path.join(this.dir, col, `${safe(id)}.json`); }
  async get<T>(col: Collection, id: string) {
    const p = this.p(col, id);
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
  }
  async put(col: Collection, id: string, value: unknown) { writeFileSync(this.p(col, id), JSON.stringify(value)); }
  async remove(col: Collection, id: string) { const p = this.p(col, id); if (existsSync(p)) rmSync(p); }
  async list<T>(col: Collection) {
    const d = path.join(this.dir, col);
    return readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(d, f), "utf8")) as T);
  }
  async putFile(name: string, _type: string, data: Buffer) { writeFileSync(path.join(this.dir, "uploads", safe(name)), data); }
  async getFile(name: string) {
    const p = path.join(this.dir, "uploads", safe(name));
    if (!existsSync(p)) return null;
    return { type: MIME[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream", data: readFileSync(p) };
  }
  async hasFile(name: string) { return existsSync(path.join(this.dir, "uploads", safe(name))); }
}

class PgStore implements Store {
  kind = "postgres" as const;
  private pool: pg.Pool;
  private ready: Promise<void>;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX || 5), ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
    this.ready = this.pool.query(`
      CREATE TABLE IF NOT EXISTS docs (col text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (col, id));
      CREATE TABLE IF NOT EXISTS files (name text PRIMARY KEY, type text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    `).then(() => undefined);
  }
  async get<T>(col: Collection, id: string) {
    await this.ready;
    const r = await this.pool.query("SELECT data FROM docs WHERE col = $1 AND id = $2", [col, id]);
    return (r.rows[0]?.data as T) ?? null;
  }
  async put(col: Collection, id: string, value: unknown) {
    await this.ready;
    await this.pool.query(
      "INSERT INTO docs (col, id, data) VALUES ($1, $2, $3) ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [col, id, JSON.stringify(value)],
    );
  }
  async remove(col: Collection, id: string) { await this.ready; await this.pool.query("DELETE FROM docs WHERE col = $1 AND id = $2", [col, id]); }
  async list<T>(col: Collection) {
    await this.ready;
    return (await this.pool.query("SELECT data FROM docs WHERE col = $1", [col])).rows.map((r) => r.data as T);
  }
  async putFile(name: string, type: string, data: Buffer) {
    await this.ready;
    await this.pool.query("INSERT INTO files (name, type, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING", [name, type, data]);
  }
  async getFile(name: string) {
    await this.ready;
    const r = await this.pool.query("SELECT type, data FROM files WHERE name = $1", [name]);
    return r.rows[0] ? { type: r.rows[0].type as string, data: r.rows[0].data as Buffer } : null;
  }
  async hasFile(name: string) {
    await this.ready;
    return (await this.pool.query("SELECT 1 FROM files WHERE name = $1", [name])).rowCount! > 0;
  }
}

export function openStore(dataDir: string): Store {
  return process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore(dataDir);
}
