import { useEffect, useMemo, useState } from "react";
import type { PaperId, ReadStats, ReaderComment, ShareInfo, ThemeId, TrimId } from "../types.ts";
import { useStore } from "../store.ts";
import { usePagination } from "../reader/Reader.tsx";
import { TRIMS, pageGeometry } from "../reader/paginate.ts";
import { PAPERS, THEME_LIST } from "../doodle/theme.ts";
import { api } from "../lib/api.ts";
import { download } from "../lib/fonts.ts";
import { buildEpub } from "./epub.ts";
import { bookWords, setBookTheme, timeAgo } from "../lib/util.ts";
import { toEmbed } from "../lib/embed.ts";
import { ColorField } from "../studio/Inspector.tsx";
import { BookPage } from "../reader/BookPage.tsx";
import type { Page } from "../reader/paginate.ts";
import type { BookDesign } from "../types.ts";
import { useNavigate } from "react-router-dom";

const PAPER_STOCK = {
  white: { label: "White paper (B&W interior)", inPerPage: 0.002252 },
  cream: { label: "Cream paper (B&W interior)", inPerPage: 0.0025 },
  color: { label: "Premium colour interior", inPerPage: 0.002347 },
};

export function PublishPage() {
  const book = useStore((s) => s.book)!;
  const update = useStore((s) => s.update);
  const flush = useStore((s) => s.flush);
  const pag = usePagination(book);
  const [stock, setStock] = useState<keyof typeof PAPER_STOCK>("color");
  const [bleed, setBleed] = useState(true);
  const [marks, setMarks] = useState(false);
  const [epubMsg, setEpubMsg] = useState<string | null>(null);
  const [lowRes, setLowRes] = useState<{ title: string; dpi: number }[] | null>(null);

  const pageCount = pag?.pages.length ?? 0;
  const printPages = pageCount + (pageCount % 2);
  const spine = printPages * PAPER_STOCK[stock].inPerPage;
  const t = TRIMS[book.trim];

  // Check that uploaded images are sharp enough for print (≥ 300 DPI at their printed width).
  useEffect(() => {
    let alive = true;
    const { CW } = pageGeometry(book.trim);
    const printedIn = CW / 80;
    const checks = Object.values(book.doodles).flatMap((d) =>
      d.elements.filter((e) => e.type === "image").map(async (e) => {
        if (e.type !== "image") return null;
        const img = new Image();
        img.src = e.src;
        await img.decode().catch(() => null);
        if (!img.naturalWidth) return null;
        const fraction = e.w / d.width;
        const dpi = Math.round(img.naturalWidth / (printedIn * fraction));
        return dpi < 300 ? { title: d.title, dpi } : null;
      }),
    );
    Promise.all(checks).then((r) => alive && setLowRes(r.filter(Boolean) as { title: string; dpi: number }[]));
    return () => { alive = false; };
  }, [book.doodles, book.trim]);

  const epub = async () => {
    try {
      const blob = await buildEpub(book, setEpubMsg);
      download(blob, `${book.title.replace(/[^\w-]+/g, "-")}.epub`);
      setEpubMsg("Done ✓");
    } catch (e) {
      setEpubMsg("Failed: " + (e as Error).message);
    }
  };

  return (
    <div className="publish">
      <StatsCard />

      <VisibilityCard />

      <BookColoursCard />

      <section className="pub-card">
        <h3>📕 Book details</h3>
        <div className="row2">
          <label>Title<input value={book.title} onChange={(e) => update((b) => { b.title = e.target.value; })} /></label>
          <label>Author<input value={book.author} onChange={(e) => update((b) => { b.author = e.target.value; })} /></label>
        </div>
        <label>Subtitle<input value={book.subtitle} onChange={(e) => update((b) => { b.subtitle = e.target.value; })} /></label>
        <label>Dedication <span className="muted small">(optional page in the front matter)</span><textarea rows={2} value={book.dedication} onChange={(e) => update((b) => { b.dedication = e.target.value; })} /></label>
        <div className="row3">
          <label>Doodle style<select value={book.theme} onChange={(e) => update((b) => setBookTheme(b, e.target.value as ThemeId))}>{THEME_LIST.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Page colours<select value={book.paper} onChange={(e) => update((b) => { b.paper = e.target.value as PaperId; delete b.design; })}>{Object.values(PAPERS).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Trim size<select value={book.trim} onChange={(e) => update((b) => { b.trim = e.target.value as TrimId; })}>{Object.entries(TRIMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        </div>
        <label>Cover art<select value={book.coverDoodleId ?? ""} onChange={(e) => update((b) => { b.coverDoodleId = e.target.value || undefined; })}>
          <option value="">None</option>
          {Object.values(book.doodles).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select></label>
        <p className="muted small">Changing the doodle style updates all your doodles (except any you gave their own style in the Studio).</p>
      </section>

      <section className="pub-card">
        <h3>🖨 Print-on-demand PDF</h3>
        <div className="stats">
          <div><b>{pag ? pageCount : "…"}</b><span>pages</span></div>
          <div><b>{bookWords(book).toLocaleString()}</b><span>words</span></div>
          <div><b>{spine.toFixed(3)}"</b><span>spine width</span></div>
          <div><b>{(t.w * 2 + spine + (bleed ? 0.25 : 0)).toFixed(3)}" × {(t.h + (bleed ? 0.25 : 0)).toFixed(3)}"</b><span>full cover size</span></div>
        </div>
        <label>Interior stock (for spine maths)
          <select value={stock} onChange={(e) => setStock(e.target.value as keyof typeof PAPER_STOCK)}>{Object.entries(PAPER_STOCK).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </label>
        <label className="row"><input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} /> Add 0.125" bleed (needed when art runs to the edge, e.g. the cover)</label>
        <label className="row"><input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} /> Show trim marks (proofing only — don't upload with marks)</label>
        <button className="primary big" onClick={async () => { await flush(); window.open(`/print/${book.id}?bleed=${bleed ? 1 : 0}&marks=${marks ? 1 : 0}`, "_blank"); }}>Open print layout → Save as PDF</button>
        <ul className="pub-notes">
          <li>All doodles and text are <b>vector</b>, so they print razor-sharp at any DPI.</li>
          <li>{lowRes === null ? "Checking image resolution…" : lowRes.length ? <>⚠️ Low-resolution images (aim for 300 DPI): {lowRes.map((r) => `${r.title} (${r.dpi} DPI)`).join(", ")}</> : "✓ All uploaded images are 300 DPI or better at print size."}</li>
          <li>The PDF is RGB. Amazon KDP and IngramSpark accept RGB and convert it to CMYK themselves. If a printer insists on CMYK, convert the PDF in Acrobat (Print Production → Convert Colors) — browsers can't produce CMYK.</li>
          <li>Use Chrome's print dialog: Destination “Save as PDF”, Margins “None”, and tick “Background graphics”.</li>
        </ul>
      </section>

      <section className="pub-card">
        <h3>📱 EPUB 3 (fixed layout)</h3>
        <p>Keeps every page exactly as designed, with doodles as crisp vectors and fonts embedded. Works in Apple Books, Kobo and Kindle (via Kindle Create / KDP upload).</p>
        <button className="primary" disabled={!!epubMsg && !/Done|Failed/.test(epubMsg)} onClick={() => void epub()}>⤓ Download .epub</button>
        {epubMsg && <span className="small"> {epubMsg}</span>}
      </section>

      <SoundtrackCard />

      <WebShare />

      <DangerZone />
    </div>
  );
}

function StatsCard() {
  const book = useStore((s) => s.book)!;
  const [stats, setStats] = useState<ReadStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.stats(book.id).then(setStats).catch((e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, [book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxCh = Math.max(1, ...(stats?.chapters.map((c) => c.readers) ?? [1]));
  const maxDay = Math.max(1, ...(stats?.recent.map((d) => d.readers) ?? [1]));
  return (
    <section className="pub-card stats-card">
      <h3>📊 Readers <button className="refresh" onClick={() => void load()} title="Refresh">↻</button></h3>
      {err && <div className="ai-error">{err}</div>}
      {!stats ? <p className="muted">Loading…</p> : stats.readers === 0 ? (
        <p>No readers yet. Share your book's link (below) and you'll see people show up here. Your own visits aren't counted.</p>
      ) : (
        <>
          <div className="stats">
            <div><b>{stats.readers.toLocaleString()}</b><span>people have read it</span></div>
            <div><b>{stats.last7Days.toLocaleString()}</b><span>in the last 7 days</span></div>
            <div><b>{stats.finished.toLocaleString()}</b><span>reached the last chapter</span></div>
            <div><b>{stats.opens.toLocaleString()}</b><span>times opened</span></div>
          </div>
          <div className="lbl">Readers per day (last 14 days)</div>
          <div className="spark" role="img" aria-label="Readers per day">
            {stats.recent.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.readers} reader${d.readers === 1 ? "" : "s"}`}>
                <i style={{ height: `${(d.readers / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="lbl">How far people got</div>
          <ul className="reach">
            {stats.chapters.map((c, i) => (
              <li key={c.id}>
                <span className="t">{i + 1}. {c.title}</span>
                <span className="bar"><i style={{ width: `${(c.readers / maxCh) * 100}%` }} /></span>
                <b>{c.readers}</b>
              </li>
            ))}
          </ul>
          <p className="muted small">A reader is one person on one browser — the same friend on phone and laptop counts twice. No names or personal data are stored.</p>
        </>
      )}
    </section>
  );
}

function BookColoursCard() {
  const book = useStore((s) => s.book)!;
  const update = useStore((s) => s.update);
  const preset = PAPERS[book.paper] ?? PAPERS.cream;
  const d = book.design ?? {};
  const set = (k: keyof BookDesign, v?: string) => update((b) => {
    const next = { ...(b.design ?? {}), [k]: v };
    if (!v) delete next[k];
    b.design = Object.keys(next).length ? next : undefined;
  });
  const ch = book.chapters[0];
  const sample: Page = {
    kind: "text", num: 7, chapterId: ch?.id, chapterNum: 1, chapterTitle: ch?.title ?? "Chapter One",
    items: [
      { t: "head", num: 1, title: ch?.title ?? "Chapter One" },
      { t: "p", blockId: "s1", text: ch?.blocks.filter((b) => b.type === "text").map((b) => b.text).join(" ").slice(0, 900) || "Once upon a chaotic time…", drop: true },
    ],
  };
  const cover: Page = { kind: "cover", num: 1, items: [] };
  return (
    <section className="pub-card colours-card">
      <h3>🎨 Book colours</h3>
      <p>Choose the colours of your pages and cover. Readers see your colours (they can still switch to another paper in the reader if they like).</p>
      <div className="lbl">Start from a colour set</div>
      <div className="paper-grid">
        {Object.values(PAPERS).map((p) => (
          <button key={p.id} className={`paper-tile ${book.paper === p.id && !book.design ? "on" : ""}`} onClick={() => update((b) => { b.paper = p.id; delete b.design; })} title={p.name}>
            <span className="pt-cover" style={{ background: p.cover, color: p.coverText }}>Aa</span>
            <span className="pt-page" style={{ background: p.color, color: p.ink }}><i style={{ background: p.accent }} />text</span>
            <b>{p.name}</b>
          </button>
        ))}
      </div>
      <div className="colours-grid">
        <div>
          <div className="lbl">Make it yours {book.design && <button className="link" onClick={() => update((b) => { delete b.design; })}>reset to {preset.name}</button>}</div>
          <ColorField label="Page colour" value={d.page ?? preset.color} options={["#ffffff", "#fdfaf3", "#f8f1e1", "#eaf6ef", "#eaf2fb", "#fbecef", "#f3edfa", "#fff6d6", "#1e1c27", "#14213d"]} onPick={(c) => set("page", c)} onReset={d.page ? () => set("page") : undefined} />
          <ColorField label="Text colour" value={d.text ?? preset.ink} options={["#1f1f24", "#2c241b", "#1b2738", "#33202a", "#2b2140", "#3a2c1a", "#ebe6f5", "#ffffff"]} onPick={(c) => set("text", c)} onReset={d.text ? () => set("text") : undefined} />
          <ColorField label="Highlights (drop caps, chapter numbers, captions)" value={d.accent ?? preset.accent} onPick={(c) => set("accent", c)} onReset={d.accent ? () => set("accent") : undefined} />
          <ColorField label="Cover colour" value={d.cover ?? preset.cover} onPick={(c) => set("cover", c)} onReset={d.cover ? () => set("cover") : undefined} />
          <ColorField label="Cover title colour" value={d.coverText ?? preset.coverText} options={["#ffffff", "#fff4dc", "#ffd27a", "#1d1b2e", "#2c241b"]} onPick={(c) => set("coverText", c)} onReset={d.coverText ? () => set("coverText") : undefined} />
        </div>
        <div className="colours-preview" aria-label="Preview">
          <div className="cp-page"><div style={{ transform: "scale(0.36)", transformOrigin: "0 0" }}><BookPage page={cover} book={book} side="right" /></div></div>
          <div className="cp-page"><div style={{ transform: "scale(0.36)", transformOrigin: "0 0" }}><BookPage page={sample} book={book} side="left" /></div></div>
        </div>
      </div>
    </section>
  );
}

function VisibilityCard() {
  const book = useStore((s) => s.book)!;
  const update = useStore((s) => s.update);
  const [copied, setCopied] = useState(false);
  const isPublic = (book.visibility ?? "public") === "public";
  const url = `${location.origin}/read/${book.id}`;
  return (
    <section className="pub-card vis-card">
      <h3>🌍 Who can read this book</h3>
      <div className="seg">
        <button className={isPublic ? "on" : ""} onClick={() => update((b) => { b.visibility = "public"; })}>🌍 Public — in the library</button>
        <button className={!isPublic ? "on" : ""} onClick={() => update((b) => { b.visibility = "private"; })}>🔒 Private — only me</button>
      </div>
      <p>{isPublic ? "Anyone can find this book in the library and read every chapter. Only you can edit it." : "Hidden from the library. You can still share chosen chapters with a private (optionally password-protected) link below."}</p>
      {isPublic && (
        <div className="share-box">
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
          <button onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy link"}</button>
          <a className="button" href={url} target="_blank" rel="noreferrer">Open ↗</a>
        </div>
      )}
    </section>
  );
}

function SoundtrackCard() {
  const book = useStore((s) => s.book)!;
  const update = useStore((s) => s.update);
  const url = book.music?.url ?? "";
  const valid = !url || toEmbed(url);
  const embed = toEmbed(url);
  return (
    <section className="pub-card">
      <h3>♫ Book soundtrack</h3>
      <p>Paste a <b>Spotify</b> playlist, album or song link (or a YouTube playlist). Readers get a <b>♫ Music</b> button that plays it in a little player while they flip pages, and you can play it while writing too.</p>
      <label>Spotify / YouTube link
        <input value={url} placeholder="https://open.spotify.com/playlist/…" onChange={(e) => update((b) => { b.music = { url: e.target.value.trim(), title: b.music?.title || "Sukoon Vibes" }; if (!b.music.url) delete b.music; })} />
      </label>
      {!valid && <div className="ai-error">That doesn't look like a Spotify or YouTube link. In Spotify: open the playlist → ⋯ → Share → Copy link to playlist.</div>}
      {url && (
        <label>Name shown on the button
          <input value={book.music?.title ?? ""} placeholder="Sukoon Vibes" onChange={(e) => update((b) => { if (b.music) b.music.title = e.target.value; })} />
        </label>
      )}
      {embed && <iframe title="Soundtrack preview" src={embed.src} width="100%" height={embed.height} style={{ border: 0, borderRadius: 12 }} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />}
      <p className="muted small">Free to use. Listeners logged in to Spotify in their browser hear full songs; others get 30-second previews (Spotify's rule).</p>
    </section>
  );
}

function DangerZone() {
  const book = useStore((s) => s.book)!;
  const flush = useStore((s) => s.flush);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const matches = typed.trim() === book.title.trim();
  return (
    <section className="pub-card danger-card">
      <h3>🗑 Delete this book</h3>
      {!open ? (
        <>
          <p>Permanently removes the book, its chapters, doodles, share links and comments. This can't be undone — download an EPUB first if you want a copy.</p>
          <button className="danger" onClick={() => setOpen(true)}>Delete this book…</button>
        </>
      ) : (
        <>
          <p>To confirm, type the book's title: <b>{book.title}</b></p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={book.title} autoFocus />
          <div className="btn-row">
            <button className="danger solid" disabled={!matches || busy} onClick={async () => {
              setBusy(true); setErr(null);
              try {
                await flush();
                await api.deleteBook(book.id);
                useStore.setState({ book: null, save: "saved" });
                nav("/", { replace: true });
              } catch (e) { setErr((e as Error).message); setBusy(false); }
            }}>{busy ? "Deleting…" : "Delete forever"}</button>
            <button onClick={() => { setOpen(false); setTyped(""); }}>Cancel</button>
          </div>
          {err && <div className="ai-error">{err}</div>}
        </>
      )}
    </section>
  );
}

function WebShare() {
  const book = useStore((s) => s.book)!;
  const flush = useStore((s) => s.flush);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [comments, setComments] = useState<ReaderComment[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = share ? `${location.origin}/r/${share.slug}` : "";

  useEffect(() => {
    api.share(book.id).then((r) => {
      setShare(r.share);
      setComments(r.comments);
      setChosen(r.share?.chapterIds ?? book.chapters.slice(0, 1).map((c) => c.id));
    });
  }, [book.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byChapter = useMemo(() => {
    const m = new Map<string, ReaderComment[]>();
    for (const c of comments) m.set(c.chapterId, [...(m.get(c.chapterId) ?? []), c]);
    return m;
  }, [comments]);

  const publish = async (opts: { removePassword?: boolean } = {}) => {
    setBusy(true);
    await flush();
    const r = await api.publish(book.id, chosen, pw || undefined, opts.removePassword);
    setShare(r.share);
    setComments(r.comments);
    setPw("");
    setBusy(false);
  };

  return (
    <section className="pub-card">
      <h3>🔗 Private share link</h3>
      <p>Share only some chapters (e.g. drafts) with a separate link, optionally password-protected. Readers get the page-flip reader (or scroll on phones) and can leave comments on each chapter.</p>
      <div className="lbl">Chapters to publish</div>
      <ul className="pub-chapters">
        {book.chapters.map((c, i) => (
          <li key={c.id}>
            <label className="row">
              <input type="checkbox" checked={chosen.includes(c.id)} onChange={(e) => setChosen(e.target.checked ? book.chapters.filter((x) => x.id === c.id || chosen.includes(x.id)).map((x) => x.id) : chosen.filter((x) => x !== c.id))} />
              <span>{i + 1}. {c.title}</span>
              {byChapter.get(c.id)?.length ? <em className="small">💬 {byChapter.get(c.id)!.length}</em> : null}
            </label>
          </li>
        ))}
      </ul>
      <div className="row2">
        <label>{share?.hasPassword ? "Change password" : "Password (optional)"}<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={share?.hasPassword ? "•••••• (unchanged)" : "Leave empty for anyone with the link"} /></label>
        <div className="btn-row end">
          <button className="primary" disabled={busy || !chosen.length} onClick={() => void publish()}>{share ? "Update published chapters" : "Publish"}</button>
          {share?.hasPassword && <button disabled={busy} onClick={() => void publish({ removePassword: true })}>Remove password</button>}
        </div>
      </div>
      {share && (
        <div className="share-box">
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
          <button onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy"}</button>
          <a className="button" href={url} target="_blank" rel="noreferrer">Open ↗</a>
          <button className="danger" onClick={async () => { await api.unpublish(book.id); setShare(null); }}>Unpublish</button>
          <p className="muted small">Published {timeAgo(share.publishedAt)} · {share.chapterIds.length} chapter(s) · {share.hasPassword ? "🔒 password protected" : "anyone with the link"}.</p>
        </div>
      )}
      <div className="lbl">Reader feedback</div>
      {comments.length === 0 ? <p className="muted small">No comments yet.</p> : (
        <ul className="comments">
          {[...comments].reverse().map((c) => (
            <li key={c.id}>
              <div className="c-head"><b>{c.name}</b> on <em>{book.chapters.find((x) => x.id === c.chapterId)?.title ?? "a chapter"}</em> · {timeAgo(c.at)}</div>
              {c.quote && <blockquote>“{c.quote}”</blockquote>}
              <p>{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
