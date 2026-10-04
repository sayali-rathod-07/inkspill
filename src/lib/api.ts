import type {
  Book, BookSummary, PublicUser, CharacterDNA, DoodleAiRequest, DoodleAiResponse, PolishMode, PolishResponse, ReaderComment, ShareInfo,
} from "../types.ts";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export type LoadedBook = Book & { canEdit?: boolean; ownerName?: string };

export const api = {
  status: () => req<{ ai: boolean; provider: "anthropic" | "gemini" | null; aiDailyLimit: number }>("/api/status"),
  me: () => req<{ user: PublicUser | null; unlimitedAi: boolean }>("/api/me"),
  signup: (username: string, password: string, displayName: string) =>
    req<{ user: PublicUser }>("/api/signup", { method: "POST", body: JSON.stringify({ username, password, displayName }) }),
  login: (username: string, password: string) => req<{ user: PublicUser }>("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req("/api/logout", { method: "POST" }),
  bookComments: (id: string) => req<ReaderComment[]>(`/api/books/${id}/comments`),
  postBookComment: (id: string, c: Omit<ReaderComment, "id" | "at">) => req<ReaderComment>(`/api/books/${id}/comments`, { method: "POST", body: JSON.stringify(c) }),
  books: () => req<BookSummary[]>("/api/books"),
  createBook: (title: string, author: string) => req<Book>("/api/books", { method: "POST", body: JSON.stringify({ title, author }) }),
  book: (id: string) => req<LoadedBook>(`/api/books/${id}`),
  saveBook: (b: Book) => req<{ ok: true; updatedAt: number }>(`/api/books/${b.id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteBook: (id: string) => req(`/api/books/${id}`, { method: "DELETE" }),
  upload: async (file: Blob) => {
    const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": file.type }, body: file });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Upload failed");
    return body as { url: string };
  },
  doodle: (r: DoodleAiRequest) => req<DoodleAiResponse>("/api/ai/doodle", { method: "POST", body: JSON.stringify(r) }),
  polish: (mode: PolishMode, text: string, context: string) =>
    req<PolishResponse>("/api/ai/polish", { method: "POST", body: JSON.stringify({ mode, text, context }) }),
  characterDna: (name: string, description: string) =>
    req<CharacterDNA>("/api/ai/character", { method: "POST", body: JSON.stringify({ name, description }) }),
  share: (bookId: string) => req<{ share: ShareInfo | null; comments: ReaderComment[] }>(`/api/books/${bookId}/share`),
  publish: (bookId: string, chapterIds: string[], password?: string, removePassword?: boolean) =>
    req<{ share: ShareInfo; comments: ReaderComment[] }>(`/api/books/${bookId}/share`, { method: "POST", body: JSON.stringify({ chapterIds, password, removePassword }) }),
  unpublish: (bookId: string) => req(`/api/books/${bookId}/share`, { method: "DELETE" }),
  shared: (slug: string, password?: string) =>
    req<{ book: Book; comments: ReaderComment[] }>(`/api/share/${slug}`, { headers: password ? { "x-share-password": password } : {} }),
  comment: (slug: string, c: Omit<ReaderComment, "id" | "at">, password?: string) =>
    req<ReaderComment>(`/api/share/${slug}/comments`, { method: "POST", body: JSON.stringify(c), headers: password ? { "x-share-password": password } : {} }),
};
