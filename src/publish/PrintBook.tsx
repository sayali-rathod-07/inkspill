import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { Book } from "../types.ts";
import { api } from "../lib/api.ts";
import { usePagination } from "../reader/Reader.tsx";
import { BookPage } from "../reader/BookPage.tsx";
import { TRIMS, pageGeometry } from "../reader/paginate.ts";

/** Print-ready layout: one trim-sized page per sheet, optional 0.125" bleed and trim marks. */
export function PrintBook() {
  const { bookId } = useParams();
  const [sp] = useSearchParams();
  const bleedOn = sp.get("bleed") === "1";
  const marks = sp.get("marks") === "1";
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => { api.book(bookId!).then(setBook); }, [bookId]);
  const pag = usePagination(book);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (pag && !printed) {
      setPrinted(true);
      setTimeout(() => window.print(), 800);
    }
  }, [pag, printed]);

  if (!book || !pag) return <div className="reader-loading"><div className="ink-spinner" /> Preparing print layout…</div>;
  const t = TRIMS[book.trim];
  const g = pageGeometry(book.trim);
  const bleed = bleedOn ? 10 : 0; // 0.125in on the 80px/in logical page
  const inch = (px: number) => `${px / 80}in`;
  const pw = g.W + bleed * 2, ph = g.H + bleed * 2;

  return (
    <div className="print-root">
      <style>{`
        @page { size: ${inch(pw)} ${inch(ph)}; margin: 0; }
        html, body { margin: 0; background: #888; }
        @media print { html, body { background: none; } .print-help { display: none; } .print-sheet { margin: 0 !important; box-shadow: none !important; } }
      `}</style>
      <div className="print-help">
        <b>{book.title}</b> · {t.w}" × {t.h}" trim{bleedOn ? " + 0.125\" bleed" : ""} · {pag.pages.length} pages.
        In the print dialog choose <b>Save as PDF</b>, margins <b>None</b>, and turn on <b>Background graphics</b>.
        <button onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      {pag.pages.map((p, i) => (
        <div key={i} className="print-sheet" style={{ width: inch(pw), height: inch(ph) }}>
          <div style={{ width: pw, height: ph, transform: `scale(${96 / 80})`, transformOrigin: "0 0" }}>
            <BookPage page={p} book={book} side={i === 0 ? "right" : i % 2 ? "left" : "right"} bleed={bleed} />
            {marks && bleed > 0 && (
              <svg className="trim-marks" width={pw} height={ph}>
                {[[bleed, 0, bleed, bleed * 0.8], [0, bleed, bleed * 0.8, bleed], [pw - bleed, 0, pw - bleed, bleed * 0.8], [pw, bleed, pw - bleed * 0.8, bleed],
                  [bleed, ph, bleed, ph - bleed * 0.8], [0, ph - bleed, bleed * 0.8, ph - bleed], [pw - bleed, ph, pw - bleed, ph - bleed * 0.8], [pw, ph - bleed, pw - bleed * 0.8, ph - bleed]]
                  .map(([x1, y1, x2, y2], k) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={0.5} />)}
              </svg>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
