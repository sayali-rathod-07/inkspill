import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Book, ReaderComment } from "../types.ts";
import { api } from "../lib/api.ts";
import { Reader, ReaderLoading, usePagination } from "../reader/Reader.tsx";
import { CommentPanel } from "./SharedReader.tsx";
import { useStore } from "../store.ts";

/** Anyone can read a public book here; only its author gets an Edit button. */
export function PublicReader() {
  const { bookId } = useParams();
  const me = useStore((s) => s.me);
  const [book, setBook] = useState<(Book & { canEdit?: boolean; ownerName?: string }) | null>(null);
  const [comments, setComments] = useState<ReaderComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    setBook(null);
    api.book(bookId!).then(setBook).catch((e) => setError((e as Error).message));
    api.bookComments(bookId!).then(setComments).catch(() => setComments([]));
  }, [bookId, me?.id]);
  const pag = usePagination(book);

  if (error) return <div className="gate"><h2>{error}</h2><Link to="/">← Back to the library</Link></div>;
  if (!book || !pag) return <ReaderLoading />;
  const chapter = book.chapters.find((c) => c.id === chapterId) ?? book.chapters[0];

  return (
    <div className="shared">
      <Reader
        book={book}
        pages={pag.pages}
        chapterStart={pag.chapterStart}
        onChapter={setChapterId}
        toolbarExtra={
          <>
            <button className={panel ? "on" : ""} onClick={() => setPanel((p) => !p)}>💬 Comments {comments.length ? `(${comments.length})` : ""}</button>
            <span className="reader-by">by {book.ownerName || book.author}</span>
            <Link className="button reader-home" to="/">← Library</Link>
            {book.canEdit && <Link className="button primary" to={`/book/${book.id}/write`}>✎ Edit</Link>}
          </>
        }
        side={panel && chapter ? (
          <CommentPanel
            post={(c) => api.postBookComment(book.id, c)}
            signedInAs={me?.displayName}
            chapterId={chapter.id}
            chapterTitle={chapter.title}
            comments={comments.filter((c) => c.chapterId === chapter.id)}
            onAdd={(c) => setComments((cs) => [...cs, c])}
            onClose={() => setPanel(false)}
          />
        ) : null}
      />
    </div>
  );
}
