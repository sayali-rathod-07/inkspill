import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { BookSummary } from "./types.ts";
import { useStore } from "./store.ts";
import { api } from "./lib/api.ts";
import { timeAgo } from "./lib/util.ts";
import { Writer } from "./write/Writer.tsx";
import { StudioPage } from "./studio/StudioPage.tsx";
import { CastPage } from "./cast/CastPage.tsx";
import { PublishPage } from "./publish/PublishPage.tsx";
import { PrintBook } from "./publish/PrintBook.tsx";
import { SharedReader } from "./publish/SharedReader.tsx";
import { PublicReader } from "./publish/PublicReader.tsx";
import { Reader, ReaderLoading, usePagination } from "./reader/Reader.tsx";

export function App() {
  const loadMe = useStore((s) => s.loadMe);
  const meLoaded = useStore((s) => s.meLoaded);
  useEffect(() => { void loadMe(); }, [loadMe]);
  if (!meLoaded) return <ReaderLoading />;
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/read/:bookId" element={<PublicReader />} />
      <Route path="/book/:bookId" element={<BookShell />}>
        <Route index element={<Navigate to="write" replace />} />
        <Route path="write/:chapterId?" element={<Writer />} />
        <Route path="studio/:doodleId?" element={<StudioPage />} />
        <Route path="cast" element={<CastPage />} />
        <Route path="read" element={<ReadPage />} />
        <Route path="publish" element={<PublishPage />} />
      </Route>
      <Route path="/print/:bookId" element={<PrintBook />} />
      <Route path="/r/:slug" element={<SharedReader />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Logo() {
  return (
    <Link to="/" className="logo">
      <svg viewBox="0 0 32 32" width="26" height="26"><path d="M8 26c2-8 6-16 16-20-4 6-6 12-7 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="9" cy="26" r="3.2" fill="#ffcf3f" /></svg>
      InkSpill
    </Link>
  );
}

function UserMenu() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const flush = useStore((s) => s.flush);
  const nav = useNavigate();
  const loc = useLocation();
  if (!me) {
    const next = encodeURIComponent(loc.pathname);
    return (
      <span className="user-menu">
        <Link className="button" to={`/login?next=${next}`}>Log in</Link>
        <Link className="button primary" to={`/signup?next=${next}`}>Sign up</Link>
      </span>
    );
  }
  return (
    <span className="user-menu">
      <span className="who" title={`@${me.username}`}>👋 {me.displayName}</span>
      <button onClick={async () => { await flush(); await api.logout(); setMe(null); nav("/"); }}>Log out</button>
    </span>
  );
}

function BookCard({ b }: { b: BookSummary }) {
  return (
    <div className="book-card">
      <Link to={`/read/${b.id}`} className="book-cover" style={b.coverSrc ? { backgroundImage: `url(${b.coverSrc})` } : undefined}>
        <span>{b.title}</span>
      </Link>
      <div className="book-info">
        <Link to={`/read/${b.id}`}><b>{b.title}</b></Link>
        {b.subtitle && <span>{b.subtitle}</span>}
        <em>by {b.ownerName || b.author || "someone"} · {b.chapters} chapters · {b.words.toLocaleString()} words · {timeAgo(b.updatedAt)}</em>
        <div className="btn-row">
          <Link className="button" to={`/read/${b.id}`}>📖 Read</Link>
          {b.mine && <Link className="button primary" to={`/book/${b.id}/write`}>✎ Write</Link>}
          {b.mine && b.visibility === "private" && <span className="pill">🔒 private</span>}
        </div>
      </div>
    </div>
  );
}

function Library() {
  const me = useStore((s) => s.me);
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  useEffect(() => { api.books().then(setBooks).catch(() => setBooks([])); }, [me?.id]);
  const mine = books?.filter((b) => b.mine) ?? [];
  const others = books?.filter((b) => !b.mine && b.visibility === "public") ?? [];

  return (
    <div className="home">
      <header className="home-head">
        <Logo />
        <p>Write it. Doodle it. Publish it.</p>
        <UserMenu />
      </header>
      <main className="home-main">
        {me ? (
          <>
            <h1>Your books</h1>
            <div className="book-grid">
              {mine.map((b) => <BookCard key={b.id} b={b} />)}
              <form className="book-card new" onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const b = await api.createBook(title || "Untitled Chronicles", "");
                  nav(`/book/${b.id}/cast`);
                } catch (x) { setErr((x as Error).message); }
              }}>
                <div className="book-cover blank"><span>+</span></div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title of a new book" />
                <button className="primary">Start a new book</button>
                {err && <p className="ai-error">{err}</p>}
              </form>
            </div>
          </>
        ) : (
          <section className="hero">
            <h1>Illustrated stories, written and doodled by real people.</h1>
            <p>Read anything in the library below. Want to write your own? Make a free account — you get the writing desk, a doodle studio with characters that stay consistent, and a page-flip reader for your friends.</p>
            <div className="btn-row">
              <Link className="button primary big-link" to="/signup">✍️ Start writing — it's free</Link>
              <Link className="button big-link" to="/login">I have an account</Link>
            </div>
          </section>
        )}

        <h1 className="lib-title">{me ? "From the library" : "The library"}</h1>
        {books === null ? <p className="muted">Loading…</p> : others.length === 0 ? <p className="muted">No other books yet — invite your friends to write one!</p> : (
          <div className="book-grid">{others.map((b) => <BookCard key={b.id} b={b} />)}</div>
        )}
      </main>
    </div>
  );
}

function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/";
  const setMe = useStore((s) => s.setMe);
  const loadMe = useStore((s) => s.loadMe);
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = mode === "signup" ? await api.signup(username, password, displayName) : await api.login(username, password);
      setMe(r.user);
      await loadMe();
      nav(next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h2>{mode === "signup" ? "Make your free account" : "Welcome back"}</h2>
        {mode === "signup" && (
          <label>Your name (shown as the author)<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Sayali Rathod" maxLength={40} /></label>
        )}
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="e.g. sayali" autoCapitalize="none" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : ""} required /></label>
        {err && <div className="ai-error">{err}</div>}
        <button className="primary big" disabled={busy}>{busy ? "…" : mode === "signup" ? "Create account" : "Log in"}</button>
        <p className="small muted">
          {mode === "signup" ? <>Already have one? <Link to={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></> : <>New here? <Link to={`/signup?next=${encodeURIComponent(next)}`}>Make an account</Link></>}
          {" · "}<Link to="/">Browse the library</Link>
        </p>
      </form>
    </div>
  );
}

function BookShell() {
  const { bookId } = useParams();
  const me = useStore((s) => s.me);
  const book = useStore((s) => s.book);
  const save = useStore((s) => s.save);
  const saveError = useStore((s) => s.saveError);
  const ai = useStore((s) => s.ai);
  const provider = useStore((s) => s.provider);
  const load = useStore((s) => s.load);
  const [err, setErr] = useState<string | null>(null);
  const [notMine, setNotMine] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    if (!me) return;
    setNotMine(false);
    load(bookId!)
      .then(() => { const b = useStore.getState().book as { canEdit?: boolean } | null; if (b && !b.canEdit) setNotMine(true); })
      .catch((e) => setErr((e as Error).message));
  }, [bookId, load, me]);

  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (notMine) return <Navigate to={`/read/${bookId}`} replace />;
  if (err) return <div className="gate"><h2>{err}</h2><Link to="/">← Back to the library</Link></div>;
  if (!book || book.id !== bookId) return <ReaderLoading />;

  const tabs = [
    ["write", "✍️ Write"],
    ["studio", "🎨 Doodle Studio"],
    ["cast", "🧍 Cast"],
    ["read", "📖 Read"],
    ["publish", "🚀 Publish"],
  ];
  return (
    <div className="shell">
      <header className="topbar">
        <Logo />
        <span className="book-title">{book.title}</span>
        <nav className="tabs">
          {tabs.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "on" : "")}>{label}</NavLink>)}
        </nav>
        <span className={`save ${save}`} title={saveError ?? undefined}>{save === "saved" ? "✓ Saved" : save === "saving" ? "Saving…" : save === "error" ? (saveError ?? "⚠ Not saved — retrying") : "Editing…"}</span>
        <span className={`ai-dot ${ai ? "on" : ""}`} title={ai ? "AI connected" : "AI is off on this server"}>AI {ai ? (provider === "gemini" ? "· Gemini" : "· Claude") : "off"}</span>
        <UserMenu />
      </header>
      <Outlet />
    </div>
  );
}

function ReadPage() {
  const book = useStore((s) => s.book)!;
  const pag = usePagination(book);
  if (!pag) return <ReaderLoading />;
  return <Reader book={book} pages={pag.pages} chapterStart={pag.chapterStart} />;
}
