import { memo } from "react";
import type { Book } from "../types.ts";
import type { Page, PageItem } from "./paginate.ts";
import { pageGeometry } from "./paginate.ts";
import { DoodleSvg } from "../doodle/DoodleSvg.tsx";
import { CharacterAvatar } from "../doodle/rig.tsx";
import { THEMES } from "../doodle/theme.ts";
import { safeLink } from "../doodle/sanitize.ts";
import { toEmbed } from "../lib/embed.ts";

export interface PageHandlers {
  onDoodle?: (doodleId: string) => void;
  onJump?: (pageIndex: number) => void;
  onCast?: () => void;
  onAudio?: (url: string, title: string) => void;
}

export const BookPage = memo(function BookPage({ page, book, side, handlers, bleed = 0 }: {
  page: Page | null;
  book: Book;
  side: "left" | "right";
  handlers?: PageHandlers;
  bleed?: number;
}) {
  const g = pageGeometry(book.trim);
  const style = { width: g.W + bleed * 2, height: g.H + bleed * 2 };
  if (!page) return <div className="book-page empty" style={style} />;
  const inner = side === "left" ? "right" : "left";
  const pad = {
    top: g.m.top + bleed, bottom: g.m.bottom + bleed,
    [inner]: g.m.inner + bleed, [side === "left" ? "left" : "right"]: g.m.outer + bleed,
  } as React.CSSProperties;
  const cls = `book-page paper-${book.paper} side-${side} kind-${page.kind}`;

  return (
    <div className={cls} style={style}>
      <div className="paper-grain" />
      <PageBody page={page} book={book} pad={pad} side={side} handlers={handlers} bleed={bleed} g={g} />
      <div className={`gutter-shade ${side}`} />
    </div>
  );
});

function PageBody({ page, book, pad, side, handlers, bleed, g }: {
  page: Page; book: Book; pad: React.CSSProperties; side: "left" | "right"; handlers?: PageHandlers; bleed: number; g: ReturnType<typeof pageGeometry>;
}) {
  const theme = THEMES[book.theme];
  switch (page.kind) {
    case "cover": {
      const d = book.coverDoodleId ? book.doodles[book.coverDoodleId] : undefined;
      return (
        <div className="bp-cover" style={{ padding: bleed }}>
          <div className="cover-title">
            <h1>{book.title}</h1>
            {book.subtitle && <h3>{book.subtitle}</h3>}
          </div>
          {d && <DoodleSvg doodle={d} cast={book.characters} className="cover-art" />}
          <div className="cover-author">{book.author}</div>
        </div>
      );
    }
    case "title":
      return (
        <div className="bp-titlepage" style={pad}>
          <h1>{book.title}</h1>
          {book.subtitle && <h3>{book.subtitle}</h3>}
          <div className="squiggle" />
          <p className="by">{book.author}</p>
        </div>
      );
    case "dedication":
      return <div className="bp-dedication" style={pad}><p>{book.dedication}</p></div>;
    case "cast": {
      const inMap = new Set(book.cast.nodes.map((n) => n.charId));
      const groups = book.cast.groups.length ? book.cast.groups : [{ id: "all", label: "", charIds: [...inMap], color: theme.accent }];
      const names = new Map(book.characters.map((c) => [c.id, c.name.split(" ")[0]]));
      return (
        <div className="bp-cast" style={pad} onClick={(e) => { if (handlers?.onCast) { e.stopPropagation(); handlers.onCast(); } }} title={handlers?.onCast ? "Open the full cast map" : undefined}>
          <h2>Meet the Cast</h2>
          {groups.map((gr) => (
            <section key={gr.id}>
              {gr.label && <h4 style={{ color: gr.color }}>{gr.label}</h4>}
              <div className="cast-grid">
                {gr.charIds.map((id) => book.characters.find((c) => c.id === id)).filter(Boolean).map((c) => (
                  <div key={c!.id} className="cast-cell">
                    <CharacterAvatar dna={c!.dna} theme={theme} size={44} />
                    <b>{c!.name.split(" ")[0]}</b>
                    <span>{c!.role.split("·")[0]}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {book.cast.edges.length > 0 && (
            <p className="cast-links">
              {book.cast.edges.map((e) => `${names.get(e.from)} & ${names.get(e.to)}: ${e.label}`).join(" · ")}
            </p>
          )}
          {handlers?.onCast && <p className="tap">tap to open the family map ↗</p>}
        </div>
      );
    }
    case "toc":
      return (
        <div className="bp-toc" style={pad}>
          <h2>Contents</h2>
          <ol>
            {page.toc?.map((t, i) => (
              <li key={i}>
                {t.part && (i === 0 || page.toc![i - 1].part !== t.part) && <div className="toc-part">{t.part}</div>}
                <button onClick={(e) => { e.stopPropagation(); handlers?.onJump?.(t.page - 1); }}>
                  <span className="n">{t.num}</span>
                  <span className="t">{t.title}</span>
                  <span className="dots" />
                  <span className="pg">{t.page}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      );
    case "part":
      return <div className="bp-part" style={pad}><div className="orn">✦</div><h2>{page.partTitle}</h2><div className="orn">✦</div></div>;
    case "opener": {
      const ch = book.chapters.find((c) => c.id === page.chapterId);
      const d = ch?.artDoodleId ? book.doodles[ch.artDoodleId] : undefined;
      return (
        <div className="bp-opener" style={pad}>
          <div className="n">Chapter {page.chapterNum}</div>
          <h2>{page.chapterTitle}</h2>
          {d && (
            <button className="opener-art" onClick={(e) => { e.stopPropagation(); handlers?.onDoodle?.(d.id); }} title="View full size">
              <DoodleSvg doodle={d} cast={book.characters} />
            </button>
          )}
          {ch?.contentNote && <p className="cn">Content note: {ch.contentNote}</p>}
          <div className="folio">{page.num}</div>
        </div>
      );
    }
    case "end":
      return <div className="bp-end" style={pad}><p>The End</p><span>…for now.</span></div>;
    case "text":
      return (
        <>
          <div className="running-head" style={{ top: 26 + bleed, [side === "left" ? "left" : "right"]: g.m.outer + bleed, [side === "left" ? "right" : "left"]: g.m.inner + bleed }}>
            {side === "left" ? book.title : page.chapterTitle}
          </div>
          <div className="bp-content" style={{ position: "absolute", top: g.m.top + bleed, left: (side === "left" ? g.m.outer : g.m.inner) + bleed, width: g.CW, height: g.CH }}>
            {page.items.map((it, i) => <Item key={i} it={it} book={book} handlers={handlers} />)}
          </div>
          <div className="folio" style={{ bottom: 26 + bleed, [side === "left" ? "left" : "right"]: g.m.outer + bleed }}>{page.num}</div>
        </>
      );
  }
}

function Item({ it, book, handlers }: { it: PageItem; book: Book; handlers?: PageHandlers }) {
  switch (it.t) {
    case "p":
      return <p className={`bp-p${it.drop ? " drop" : ""}${it.cont ? " cont" : ""}`}>{it.text}</p>;
    case "doodle": {
      const d = book.doodles[it.doodleId];
      return (
        <figure className="bp-fig">
          <button style={{ height: it.h }} onClick={(e) => { e.stopPropagation(); handlers?.onDoodle?.(it.doodleId); }} title="View full size">
            {d && <DoodleSvg doodle={d} cast={book.characters} style={{ width: "100%", height: "100%" }} />}
          </button>
          {it.caption && <figcaption>{it.caption}</figcaption>}
        </figure>
      );
    }
    case "scene":
      return <div className="bp-scene"><span>{it.text}</span></div>;
    case "note":
      return <aside className="bp-note">{it.text}</aside>;
    case "audio": {
      const url = safeLink(it.url);
      const isFile = !!url && /\.(mp3|m4a|wav|ogg)(\?|$)/i.test(url);
      return (
        <div className="bp-audio">
          <span>♫</span>
          <div>
            {it.caption || "Listen"}
            {url && toEmbed(url) && handlers?.onAudio && <button className="play-here" onClick={(e) => { e.stopPropagation(); handlers.onAudio!(url, it.caption || "Music"); }}> ▶ play</button>}
            {url && !isFile && !(toEmbed(url) && handlers?.onAudio) && <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}> ▶ play</a>}
            {url && isFile && <audio src={url} controls preload="none" />}
          </div>
        </div>
      );
    }
    case "head":
      return (
        <header className="bp-head">
          <div className="n">Chapter {it.num}</div>
          <h2>{it.title}</h2>
          {it.note && <p className="cn">Content note: {it.note}</p>}
        </header>
      );
  }
}
