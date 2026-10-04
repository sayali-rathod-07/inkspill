import { create } from "zustand";
import type { Book, PublicUser } from "./types.ts";
import { api } from "./lib/api.ts";

type SaveState = "saved" | "dirty" | "saving" | "error";

interface Store {
  book: Book | null;
  save: SaveState;
  saveError: string | null;
  me: PublicUser | null;
  meLoaded: boolean;
  unlimitedAi: boolean;
  aiDailyLimit: number;
  loadMe: () => Promise<void>;
  setMe: (u: PublicUser | null) => void;
  ai: boolean;
  provider: "anthropic" | "gemini" | null;
  load: (id: string) => Promise<void>;
  /** Apply a mutation to a copy of the book, then autosave. */
  update: (fn: (draft: Book) => void) => void;
  flush: () => Promise<void>;
  setAi: (on: boolean, provider?: "anthropic" | "gemini" | null) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>((set, get) => ({
  book: null,
  save: "saved",
  saveError: null,
  me: null,
  meLoaded: false,
  unlimitedAi: false,
  aiDailyLimit: 25,
  loadMe: async () => {
    const [r, st] = await Promise.all([api.me().catch(() => ({ user: null, unlimitedAi: false })), api.status().catch(() => null)]);
    set({ me: r.user, unlimitedAi: r.unlimitedAi, meLoaded: true, ...(st ? { ai: st.ai, provider: st.provider, aiDailyLimit: st.aiDailyLimit } : {}) });
  },
  setMe: (me) => set({ me, book: null }),
  ai: false,
  provider: null,
  setAi: (ai, provider = null) => set({ ai, provider }),
  load: async (id) => {
    if (get().book?.id === id) return;
    await get().flush();
    const book = await api.book(id);
    set({ book, save: "saved" });
  },
  update: (fn) => {
    const cur = get().book;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    set({ book: next, save: "dirty" });
    clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), 900);
  },
  flush: async () => {
    clearTimeout(timer);
    const { book, save } = get();
    if (!book || save === "saved" || save === "saving") return;
    set({ save: "saving" });
    try {
      await api.saveBook(book);
      // Only mark saved if nothing changed while the request was in flight.
      if (get().book === book) set({ save: "saved", saveError: null });
      else { set({ save: "dirty" }); timer = setTimeout(() => void get().flush(), 400); }
    } catch (e) {
      const status = (e as { status?: number }).status;
      set({ save: "error", saveError: status === 401 ? "You were logged out — log in again to keep saving." : status === 403 ? "You can't edit this book." : null });
      if (status !== 401 && status !== 403) timer = setTimeout(() => void get().flush(), 4000);
    }
  },
}));

window.addEventListener("beforeunload", (e) => {
  if (useStore.getState().save !== "saved") {
    void useStore.getState().flush();
    e.preventDefault();
  }
});
