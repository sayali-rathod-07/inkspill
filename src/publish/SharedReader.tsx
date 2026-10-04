import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Book, ReaderComment } from "../types.ts";
import { api } from "../lib/api.ts";
import { Reader, ReaderLoading, usePagination } from "../reader/Reader.tsx";
import { timeAgo } from "../lib/util.ts";

/** Public, optionally password-protected reader for serialised chapters. */
export function SharedReader() {
  const { slug } = useParams();
  const [book, setBook] = useState<Book | null>(null);
  const [comments, setComments] = useState<ReaderComment[]>([]);
  const [needPw, setNeedPw] = useState(false);
  const [pw, setPw] = useState(() => sessionStorage.getItem(`ink.pw.${slug}`) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);

  const load = useCallback(async (password?: string) => {
    try {
      const r = await api.shared(slug!, password);
      setBook(r.book);
      setComments(r.comments);
      setNeedPw(false);
      if (password) sessionStorage.setItem(`ink.pw.${slug}`, password);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) { setNeedPw(true); if (password) setError("That password didn't work."); }
      else setError(err.message);
    }
  }, [slug]);

  useEffect(() => { void load(pw || undefined); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const pag = usePagination(book);

  if (needPw) {
    return (
      <div className="gate">
        <form onSubmit={(e) => { e.preventDefault(); setError(null); void load(pw); }}>
          <h2>🔒 This book is password protected</h2>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
          <button className="primary">Open</button>
          {error && <p className="ai-error">{error}</p>}
        </form>
      </div>
    );
  }
  if (error) return <div className="gate"><h2>{error}</h2></div>;
  if (!book || !pag) return <ReaderLoading />;

  const chapter = book.chapters.find((c) => c.id === chapterId) ?? book.chapters[0];
  const here = comments.filter((c) => c.chapterId === chapter?.id);

  return (
    <div className="shared">
      <Reader
        book={book}
        pages={pag.pages}
        chapterStart={pag.chapterStart}
        onChapter={setChapterId}
        toolbarExtra={<button className={panel ? "on" : ""} onClick={() => setPanel((p) => !p)}>💬 Comments {comments.length ? `(${comments.length})` : ""}</button>}
        side={panel && chapter ? (
          <CommentPanel post={(c) => api.comment(slug!, c, pw || undefined)} chapterId={chapter.id} chapterTitle={chapter.title} comments={here} onAdd={(c) => setComments((cs) => [...cs, c])} onClose={() => setPanel(false)} />
        ) : null}
      />
    </div>
  );
}

export function CommentPanel({ post, chapterId, chapterTitle, comments, onAdd, onClose, signedInAs }: {
  post: (c: Omit<ReaderComment, "id" | "at">) => Promise<ReaderComment>;
  chapterId: string; chapterTitle: string; comments: ReaderComment[]; onAdd: (c: ReaderComment) => void; onClose: () => void; signedInAs?: string;
}) {
  const [name, setName] = useState(() => { try { return localStorage.getItem("ink.name") ?? ""; } catch { return ""; } });
  const [text, setText] = useState("");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection()?.toString().trim() ?? "";
      if (s.length > 3 && s.length < 400) setQuote(s);
    };
    document.addEventListener("mouseup", onSel);
    return () => document.removeEventListener("mouseup", onSel);
  }, []);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      try { localStorage.setItem("ink.name", name); } catch { /* ignore */ }
      onAdd(await post({ chapterId, name, text, quote: quote || undefined }));
      setText("");
      setQuote("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="comment-panel">
      <button className="close" onClick={onClose}>×</button>
      <h4>Comments on “{chapterTitle}”</h4>
      <ul className="comments">
        {comments.length === 0 && <li className="muted small">Be the first to leave a note for the author.</li>}
        {comments.map((c) => (
          <li key={c.id}>
            <div className="c-head"><b>{c.name}</b> · {timeAgo(c.at)}</div>
            {c.quote && <blockquote>“{c.quote}”</blockquote>}
            <p>{c.text}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        {quote && <blockquote className="quoting">“{quote}” <button type="button" onClick={() => setQuote("")}>×</button></blockquote>}
        <p className="muted small">Tip: highlight a line in the book to quote it.</p>
        {signedInAs ? <p className="small">Commenting as <b>{signedInAs}</b></p> : <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />}
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What did you think?" />
        <button className="primary" disabled={busy || !text.trim()}>Post comment</button>
      </form>
    </aside>
  );
}
