import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Book, PaperId } from "../types.ts";
import { paginate, pageGeometry, type Page, type PaginateOpts } from "./paginate.ts";
import { BookPage, type PageHandlers } from "./BookPage.tsx";
import { DoodleSvg } from "../doodle/DoodleSvg.tsx";
import { CastMapSvg } from "../cast/CastMapSvg.tsx";
import { PAPERS } from "../doodle/theme.ts";
import { playRustle } from "../lib/rustle.ts";
import { safeLink } from "../doodle/sanitize.ts";

export function usePagination(book: Book | null, opts: PaginateOpts = {}, delay = 350) {
  const [state, setState] = useState<{ pages: Page[]; chapterStart: Record<string, number> } | null>(null);
  const key = JSON.stringify(opts);
  useEffect(() => {
    if (!book) return;
    let alive = true;
    const t = setTimeout(() => {
      paginate(book, opts).then((r) => alive && setState(r)).catch((e) => console.error("pagination failed", e));
    }, state ? delay : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, key]);
  return state;
}

const useNarrow = () => {
  const q = "(max-width: 820px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
};

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

export function Reader({ book, pages, chapterStart, toolbarExtra, onChapter, side }: {
  book: Book;
  pages: Page[];
  chapterStart: Record<string, number>;
  toolbarExtra?: ReactNode;
  onChapter?: (chapterId: string | null) => void;
  side?: ReactNode;
}) {
  const narrow = useNarrow();
  const [modePref, setModePref] = useState<"auto" | "book" | "scroll">(() => (store.get("ink.mode") as "auto") ?? "auto");
  const mode = modePref === "auto" ? (narrow ? "scroll" : "book") : modePref;
  const [paper, setPaper] = useState<PaperId>(book.paper);
  const [sound, setSound] = useState(() => store.get("ink.sound") !== "off");
  const [lightbox, setLightbox] = useState<string | "cast" | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const view = useMemo(() => ({ ...book, paper }), [book, paper]);

  useEffect(() => setPaper(book.paper), [book.paper]);
  useEffect(() => store.set("ink.sound", sound ? "on" : "off"), [sound]);
  useEffect(() => store.set("ink.mode", modePref), [modePref]);

  const handlers: PageHandlers = { onDoodle: (id) => setLightbox(id), onCast: () => setLightbox("cast") };

  return (
    <div className={`reader mode-${mode}`}>
      <div className="reader-bar">
        <button onClick={() => setTocOpen((v) => !v)}>☰ Contents</button>
        <div className="seg">
          <button className={mode === "book" ? "on" : ""} onClick={() => setModePref("book")} title="Two-page spreads">📖 Book</button>
          <button className={mode === "scroll" ? "on" : ""} onClick={() => setModePref("scroll")} title="Webtoon scroll">📜 Scroll</button>
        </div>
        <select value={paper} onChange={(e) => setPaper(e.target.value as PaperId)} title="Paper">
          {Object.values(PAPERS).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className={sound ? "on" : ""} onClick={() => setSound((s) => !s)} title="Page-turn sound">{sound ? "🔊" : "🔈"}</button>
        {toolbarExtra}
      </div>

      <div className="reader-main">
        {tocOpen && (
          <nav className="reader-toc" onClick={() => setTocOpen(false)}>
            <h4>{book.title}</h4>
            {book.chapters.filter((c) => chapterStart[c.id] !== undefined).map((c) => (
              <button key={c.id} onClick={() => jumpRef.current?.(chapterStart[c.id], c.id)}>
                <span className="n">{book.chapters.indexOf(c) + 1}</span> {c.title}
              </button>
            ))}
          </nav>
        )}
        {mode === "book" ? (
          <Spreads book={view} pages={pages} handlers={handlers} sound={sound} onChapter={onChapter} jumpRef={jumpRef} />
        ) : (
          <Scroll book={view} chapterIds={Object.keys(chapterStart)} handlers={handlers} onChapter={onChapter} jumpRef={jumpRef} />
        )}
        {side}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {lightbox === "cast" ? (
            <CastMapSvg book={view} className="lightbox-svg" />
          ) : book.doodles[lightbox] ? (
            <>
              <DoodleSvg doodle={book.doodles[lightbox]} cast={book.characters} className="lightbox-svg" />
              <p>{book.doodles[lightbox].title}</p>
            </>
          ) : null}
          <button className="close">×</button>
        </div>
      )}
    </div>
  );
}

// A module-level ref so the TOC can drive whichever view is active.
const jumpRef: { current: ((pageIndex: number, chapterId?: string) => void) | null } = { current: null };

function Spreads({ book, pages, handlers, sound, onChapter, jumpRef: jr }: {
  book: Book; pages: Page[]; handlers: PageHandlers; sound: boolean; onChapter?: (id: string | null) => void; jumpRef: typeof jumpRef;
}) {
  const g = pageGeometry(book.trim);
  const spreads = useMemo(() => {
    const out: [Page | null, Page | null][] = [[null, pages[0] ?? null]];
    for (let i = 1; i < pages.length; i += 2) out.push([pages[i] ?? null, pages[i + 1] ?? null]);
    return out;
  }, [pages]);
  const posKey = `ink.pos.${book.id}`;
  const [s, setS] = useState(() => Math.min(Number(store.get(posKey) ?? 0) || 0, spreads.length - 1));
  const [anim, setAnim] = useState<null | { dir: 1 | -1; to: number }>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setScale(Math.max(0.3, Math.min((r.width - 48) / (g.W * 2), (r.height - 40) / g.H, 1.6)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [g.W, g.H]);

  useEffect(() => { if (s > spreads.length - 1) setS(Math.max(0, spreads.length - 1)); }, [spreads.length, s]);
  useEffect(() => {
    store.set(posKey, String(s));
    const p = spreads[s]?.[1] ?? spreads[s]?.[0];
    onChapter?.(p?.chapterId ?? null);
  }, [s, spreads, posKey, onChapter]);

  const go = useCallback((dir: 1 | -1) => {
    if (anim) return;
    const to = s + dir;
    if (to < 0 || to >= spreads.length) return;
    if (sound) playRustle();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setS(to); return; }
    setAnim({ dir, to });
  }, [anim, s, spreads.length, sound]);

  jr.current = (pageIndex) => {
    const to = pageIndex === 0 ? 0 : Math.floor((pageIndex + 1) / 2);
    if (sound) playRustle();
    setAnim(null);
    setS(Math.max(0, Math.min(spreads.length - 1, to)));
  };
  handlers.onJump = (i) => jr.current?.(i);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      if (e.key === "Home") setS(0);
      if (e.key === "End") setS(spreads.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, spreads.length]);

  const cur = spreads[s] ?? [null, null];
  const nxt = anim ? spreads[anim.to] : null;
  const baseLeft = anim ? (anim.dir === 1 ? cur[0] : nxt![0]) : cur[0];
  const baseRight = anim ? (anim.dir === 1 ? nxt![1] : cur[1]) : cur[1];
  const finish = () => { if (anim) { setS(anim.to); setAnim(null); } };
  const total = pages.length;
  const showing = [cur[0]?.num, cur[1]?.num].filter(Boolean).join("–");

  return (
    <div className="spreads" ref={wrap}>
      <button className="turn prev" onClick={() => go(-1)} disabled={s === 0} aria-label="Previous page">‹</button>
      <div className="spread-stage" style={{ width: g.W * 2, height: g.H, transform: `scale(${scale})` }}>
        <div className={`spread ${s === 0 && !anim ? "closed" : ""}`}>
          <div className="half left" onClick={() => go(-1)}>{baseLeft && <BookPage page={baseLeft} book={book} side="left" handlers={handlers} />}</div>
          <div className="half right" onClick={() => go(1)}>{baseRight && <BookPage page={baseRight} book={book} side="right" handlers={handlers} />}</div>
          {anim && (
            <div className={`leaf ${anim.dir === 1 ? "fwd" : "back"}`} onAnimationEnd={finish}>
              <div className="face front">
                {anim.dir === 1 ? cur[1] && <BookPage page={cur[1]} book={book} side="right" /> : cur[0] && <BookPage page={cur[0]} book={book} side="left" />}
                <div className="leaf-shade" />
              </div>
              <div className="face back">
                {anim.dir === 1 ? nxt![0] && <BookPage page={nxt![0]} book={book} side="left" /> : nxt![1] && <BookPage page={nxt![1]} book={book} side="right" />}
                <div className="leaf-shade" />
              </div>
            </div>
          )}
          {!(s === 0 && !anim) && <div className="spine" />}
        </div>
      </div>
      <button className="turn next" onClick={() => go(1)} disabled={s >= spreads.length - 1} aria-label="Next page">›</button>
      <div className="spread-nav">
        <input type="range" min={0} max={Math.max(0, spreads.length - 1)} value={s} onChange={(e) => { setAnim(null); setS(+e.target.value); }} />
        <span>{s === 0 ? "Cover" : `Pages ${showing} of ${total}`}</span>
      </div>
    </div>
  );
}

function Scroll({ book, chapterIds, handlers, onChapter, jumpRef: jr }: {
  book: Book; chapterIds: string[]; handlers: PageHandlers; onChapter?: (id: string | null) => void; jumpRef: typeof jumpRef;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chapters = book.chapters.filter((c) => chapterIds.includes(c.id));
  const cover = book.coverDoodleId ? book.doodles[book.coverDoodleId] : undefined;

  jr.current = (_p, chapterId) => {
    if (chapterId) ref.current?.querySelector(`[data-ch="${chapterId}"]`)?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const root = ref.current;
    if (!root || !onChapter) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) onChapter((vis.target as HTMLElement).dataset.ch ?? null);
    }, { root, rootMargin: "0px 0px -60% 0px" });
    root.querySelectorAll("[data-ch]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [onChapter, chapters.length]);

  return (
    <div className={`scroll-read paper-${book.paper}`} ref={ref}>
      <div className="paper-grain" />
      <header className="scroll-cover">
        {cover && <DoodleSvg doodle={cover} cast={book.characters} />}
        <h1>{book.title}</h1>
        {book.subtitle && <h3>{book.subtitle}</h3>}
        <p>{book.author}</p>
      </header>
      {chapters.map((ch) => {
        const art = ch.artDoodleId ? book.doodles[ch.artDoodleId] : undefined;
        let first = true;
        return (
          <section key={ch.id} data-ch={ch.id} className="scroll-ch">
            <div className="n">Chapter {book.chapters.indexOf(ch) + 1}</div>
            <h2>{ch.title}</h2>
            {ch.contentNote && <p className="cn">Content note: {ch.contentNote}</p>}
            {art && <button className="scroll-art" onClick={() => handlers.onDoodle?.(art.id)}><DoodleSvg doodle={art} cast={book.characters} /></button>}
            {ch.blocks.map((b) => {
              if (b.type === "text") {
                if (!b.text?.trim()) return null;
                const drop = first;
                first = false;
                return <p key={b.id} className={`bp-p${drop ? " drop" : ""}`}>{b.text}</p>;
              }
              if (b.type === "doodle" && b.doodleId && book.doodles[b.doodleId]) {
                return (
                  <figure key={b.id} className="scroll-fig">
                    <button onClick={() => handlers.onDoodle?.(b.doodleId!)}><DoodleSvg doodle={book.doodles[b.doodleId]} cast={book.characters} /></button>
                    {b.caption && <figcaption>{b.caption}</figcaption>}
                  </figure>
                );
              }
              if (b.type === "scene") return <div key={b.id} className="bp-scene"><span>{b.text}</span></div>;
              if (b.type === "note" && b.text) return <aside key={b.id} className="bp-note">{b.text}</aside>;
              if (b.type === "audio") return (
                <div key={b.id} className="bp-audio"><span>♫</span><div>{b.caption || "Listen"}{safeLink(b.url) && <a href={safeLink(b.url)} target="_blank" rel="noreferrer"> ▶ play</a>}</div></div>
              );
              return null;
            })}
          </section>
        );
      })}
      <div className="bp-end"><p>The End</p><span>…for now.</span></div>
    </div>
  );
}

export function ReaderLoading() {
  return <div className="reader-loading"><div className="ink-spinner" /> Typesetting your book…</div>;
}
