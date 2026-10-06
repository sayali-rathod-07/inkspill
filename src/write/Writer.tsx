import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Block, BlockType, Book, Chapter, PaperId } from "../types.ts";
import { PAPERS } from "../doodle/theme.ts";
import { useStore } from "../store.ts";
import { Outliner } from "./Outliner.tsx";
import { PolishPanel } from "./PolishPanel.tsx";
import { QuickDoodle } from "./QuickDoodle.tsx";
import { DoodleSvg } from "../doodle/DoodleSvg.tsx";
import { usePagination } from "../reader/Reader.tsx";
import { BookPage } from "../reader/BookPage.tsx";
import { pageGeometry } from "../reader/paginate.ts";
import { bookWords, chapterWords, uid } from "../lib/util.ts";
import { api } from "../lib/api.ts";
import { newDoodle } from "../studio/StudioPage.tsx";

type Side = "preview" | "polish" | "settings" | "none";

export function Writer() {
  const book = useStore((s) => s.book)!;
  const update = useStore((s) => s.update);
  const { chapterId } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const ch = book.chapters.find((c) => c.id === chapterId) ?? book.chapters[0];
  const [side, setSide] = useState<Side>("preview");
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState<{ blockId: string; text: string; start: number; end: number } | null>(null);
  const [doodleFor, setDoodleFor] = useState<{ blockId: string; text: string } | null>(null);
  const [polishTarget, setPolishTarget] = useState<{ blockId: string; text: string } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chapterId && ch) nav(`/book/${book.id}/write/${ch.id}`, { replace: true });
  }, [chapterId, ch, book.id, nav]);

  useEffect(() => {
    const b = sp.get("block");
    if (b) setTimeout(() => editorRef.current?.querySelector(`[data-block="${b}"]`)?.scrollIntoView({ block: "center" }), 80);
  }, [sp, ch?.id]);

  const updateCh = useCallback((fn: (c: Chapter) => void) => update((b) => { const c = b.chapters.find((x) => x.id === ch.id); if (c) fn(c); }), [update, ch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ch) {
    return (
      <div className="empty-state">
        <p>No chapters yet.</p>
        <button className="primary" onClick={() => update((b) => { b.chapters.push({ id: uid(8), partId: b.parts[0]?.id ?? "", title: "Chapter One", status: "draft", blocks: [{ id: uid(8), type: "text", text: "" }] }); })}>+ Add a chapter</button>
      </div>
    );
  }

  const openPolish = (blockId: string, text: string) => { setPolishTarget({ blockId, text }); setSide("polish"); };

  return (
    <div className={`writer ${focus ? "focus" : ""} side-${side}`}>
      {!focus && <Outliner book={book} activeId={ch.id} onOpen={(id) => nav(`/book/${book.id}/write/${id}`)} onScene={(bid) => editorRef.current?.querySelector(`[data-block="${bid}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })} />}

      <main className="manuscript" ref={editorRef}>
        <div className="ms-top">
          <div className="seg">
            {!focus && (["preview", "polish", "settings"] as Side[]).map((s) => (
              <button key={s} className={side === s ? "on" : ""} onClick={() => setSide(side === s ? "none" : s)}>
                {s === "preview" ? "📖 Live pages" : s === "polish" ? "✨ Polish" : "⚙︎ Chapter"}
              </button>
            ))}
          </div>
          <button onClick={() => setFocus((f) => !f)} title="Distraction-free">{focus ? "Exit focus" : "◎ Focus"}</button>
        </div>
        <div className="ms-paper">
          <div className="ms-chapter-n">Chapter {book.chapters.indexOf(ch) + 1}</div>
          <input className="ms-title" value={ch.title} onChange={(e) => updateCh((c) => { c.title = e.target.value; })} placeholder="Chapter title" />
          <BlockList ch={ch} book={book} updateCh={updateCh} onSelection={setSel} onDoodle={setDoodleFor} onPolish={openPolish} sel={sel} />
          <div className="ms-foot">{chapterWords(ch).toLocaleString()} words in this chapter · {bookWords(book).toLocaleString()} in the book</div>
        </div>
      </main>

      {!focus && side !== "none" && (
        <aside className="writer-side">
          {side === "preview" && <LivePreview book={book} ch={ch} />}
          {side === "polish" && (
            <PolishPanel
              target={polishTarget ?? (sel ? { blockId: sel.blockId, text: sel.text } : null)}
              context={ch.blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n\n").slice(0, 6000)}
              onApply={(blockId, excerpt, replacement) => updateCh((c) => {
                const b = c.blocks.find((x) => x.id === blockId);
                if (b?.text?.includes(excerpt)) b.text = b.text.replace(excerpt, replacement);
              })}
              currentText={(id) => ch.blocks.find((b) => b.id === id)?.text ?? ""}
            />
          )}
          {side === "settings" && <ChapterSettings book={book} ch={ch} updateCh={updateCh} />}
        </aside>
      )}

      {doodleFor && (
        <QuickDoodle
          book={book}
          text={doodleFor.text}
          onClose={() => setDoodleFor(null)}
          onInsert={(doodle, openStudio) => {
            update((b) => {
              b.doodles[doodle.id] = doodle;
              const c = b.chapters.find((x) => x.id === ch.id)!;
              const i = c.blocks.findIndex((x) => x.id === doodleFor.blockId);
              c.blocks.splice(i + 1, 0, { id: uid(8), type: "doodle", doodleId: doodle.id, caption: "" });
            });
            setDoodleFor(null);
            if (openStudio) nav(`/book/${book.id}/studio/${doodle.id}`);
          }}
        />
      )}
    </div>
  );
}

function AutoText({ value, onChange, className, placeholder, onKeyDown, onSelect, dataBlock, autoFocusEnd }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; onSelect?: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  dataBlock?: string; autoFocusEnd?: number | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = t.scrollHeight + "px";
  }, [value]);
  useEffect(() => {
    if (autoFocusEnd != null && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(autoFocusEnd, autoFocusEnd);
    }
  }, [autoFocusEnd]);
  return <textarea ref={ref} rows={1} className={className} value={value} placeholder={placeholder} data-block={dataBlock}
    onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onSelect={onSelect} onMouseUp={onSelect} spellCheck />;
}

const INSERTS: { type: BlockType; label: string; hint: string }[] = [
  { type: "text", label: "¶ Paragraph", hint: "" },
  { type: "doodle", label: "🎨 Doodle", hint: "illustrate the paragraph above" },
  { type: "scene", label: "✦ Scene break", hint: "a new vignette" },
  { type: "note", label: "📝 Side note", hint: "margin aside / easter egg" },
  { type: "audio", label: "♫ Audio / playlist", hint: "link a song or recording" },
];

function BlockList({ ch, book, updateCh, onSelection, onDoodle, onPolish, sel }: {
  ch: Chapter; book: Book; updateCh: (fn: (c: Chapter) => void) => void;
  onSelection: (s: { blockId: string; text: string; start: number; end: number } | null) => void;
  onDoodle: (v: { blockId: string; text: string }) => void;
  onPolish: (blockId: string, text: string) => void;
  sel: { blockId: string; text: string } | null;
}) {
  const nav = useNavigate();
  const [focusReq, setFocusReq] = useState<{ id: string; pos: number } | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);

  const insert = (i: number, type: BlockType) => {
    setInsertAt(null);
    if (type === "doodle") { setPicker(i); return; }
    const id = uid(8);
    updateCh((c) => { c.blocks.splice(i, 0, { id, type, text: "", caption: type === "audio" ? "" : undefined, url: type === "audio" ? "" : undefined }); });
    setFocusReq({ id, pos: 0 });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block, i: number) => {
    const t = e.currentTarget;
    if (e.key === "Enter" && !e.shiftKey && b.type === "text") {
      e.preventDefault();
      const before = t.value.slice(0, t.selectionStart), after = t.value.slice(t.selectionEnd);
      const id = uid(8);
      updateCh((c) => {
        c.blocks[i].text = before;
        c.blocks.splice(i + 1, 0, { id, type: "text", text: after });
      });
      setFocusReq({ id, pos: 0 });
    }
    if (e.key === "Backspace" && t.selectionStart === 0 && t.selectionEnd === 0 && i > 0) {
      const prev = ch.blocks[i - 1];
      if (prev.type === "text" && b.type === "text") {
        e.preventDefault();
        const pos = (prev.text ?? "").length;
        updateCh((c) => { c.blocks[i - 1].text = (prev.text ?? "") + (b.text ?? ""); c.blocks.splice(i, 1); });
        setFocusReq({ id: prev.id, pos });
      } else if (!t.value) {
        e.preventDefault();
        updateCh((c) => { c.blocks.splice(i, 1); });
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent, i: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/\n\s*\n/.test(text)) return;
    e.preventDefault();
    const t = e.target as HTMLTextAreaElement;
    const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    const before = t.value.slice(0, t.selectionStart), after = t.value.slice(t.selectionEnd);
    updateCh((c) => {
      const blocks: Block[] = paras.map((p) => ({ id: uid(8), type: "text", text: p }));
      blocks[0].text = before + blocks[0].text;
      blocks[blocks.length - 1].text += after;
      c.blocks.splice(i, 1, ...blocks);
    });
  };

  const pickDoodle = (i: number, mode: "generate" | "blank" | string) => {
    setPicker(null);
    if (mode === "generate") {
      const prev = [...ch.blocks.slice(0, i)].reverse().find((b) => b.type === "text" && b.text?.trim());
      onDoodle({ blockId: prev?.id ?? ch.blocks[i - 1]?.id ?? "", text: prev?.text ?? "" });
      return;
    }
    let id = mode;
    useStore.getState().update((b) => {
      if (mode === "blank") {
        const d = newDoodle(b, { panels: 2, title: `${ch.title} doodle` });
        b.doodles[d.id] = d;
        id = d.id;
      }
      b.chapters.find((c) => c.id === ch.id)!.blocks.splice(i, 0, { id: uid(8), type: "doodle", doodleId: id, caption: "" });
    });
    if (mode === "blank") nav(`/book/${book.id}/studio/${id}`);
  };

  const Gutter = ({ i }: { i: number }) => (
    <div className={`gutter ${insertAt === i ? "open" : ""}`}>
      <button className="plus" onClick={() => setInsertAt(insertAt === i ? null : i)} title="Insert">+</button>
      {insertAt === i && (
        <div className="insert-menu">
          {INSERTS.map((x) => <button key={x.type} onClick={() => insert(i, x.type)}>{x.label}{x.hint && <em>{x.hint}</em>}</button>)}
        </div>
      )}
      {picker === i && (
        <div className="insert-menu doodle-pick">
          <button onClick={() => pickDoodle(i, "generate")}>✨ Draw from the paragraph above</button>
          <button onClick={() => pickDoodle(i, "blank")}>✎ Blank canvas in Studio</button>
          <div className="pick-grid">
            {Object.values(book.doodles).slice(0, 24).map((d) => (
              <button key={d.id} onClick={() => pickDoodle(i, d.id)} title={d.title}><DoodleSvg doodle={d} cast={book.characters} /></button>
            ))}
          </div>
          <button onClick={() => setPicker(null)}>Cancel</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="blocks">
      {ch.blocks.map((b, i) => (
        <div key={b.id} className={`blk blk-${b.type}`}>
          <Gutter i={i} />
          {b.type === "text" && (
            <div className="blk-text" onPaste={(e) => onPaste(e, i)}>
              <AutoText dataBlock={b.id} className="ms-p" value={b.text ?? ""} placeholder={i === 0 ? "Once upon a chaotic time…" : ""}
                autoFocusEnd={focusReq?.id === b.id ? focusReq.pos : null}
                onChange={(v) => updateCh((c) => { c.blocks[i].text = v; })}
                onKeyDown={(e) => onKey(e, b, i)}
                onSelect={(e) => {
                  const t = e.currentTarget;
                  const text = t.value.slice(t.selectionStart, t.selectionEnd);
                  onSelection(text.trim().length > 3 ? { blockId: b.id, text, start: t.selectionStart, end: t.selectionEnd } : null);
                }} />
              {sel?.blockId === b.id && (
                <div className="sel-bar" onMouseDown={(e) => e.preventDefault()}>
                  <button onClick={() => onDoodle({ blockId: b.id, text: sel.text })}>🎨 Doodle this</button>
                  <button onClick={() => onPolish(b.id, sel.text)}>✨ Polish</button>
                </div>
              )}
              <div className="blk-actions">
                <button title="Doodle this paragraph" onClick={() => onDoodle({ blockId: b.id, text: b.text ?? "" })}>🎨</button>
                <button title="Polish this paragraph" onClick={() => onPolish(b.id, b.text ?? "")}>✨</button>
              </div>
            </div>
          )}
          {b.type === "doodle" && (
            <div className="blk-doodle">
              {b.doodleId && book.doodles[b.doodleId] ? (
                <button className="blk-doodle-img" onClick={() => nav(`/book/${book.id}/studio/${b.doodleId}`)} title="Edit in Doodle Studio">
                  <DoodleSvg doodle={book.doodles[b.doodleId]} cast={book.characters} />
                  <span className="edit-badge">✎ Edit in Studio</span>
                </button>
              ) : <div className="muted">Missing doodle</div>}
              <input className="caption" placeholder="Caption (optional)" value={b.caption ?? ""} onChange={(e) => updateCh((c) => { c.blocks[i].caption = e.target.value; })} />
              <button className="rm" onClick={() => updateCh((c) => { c.blocks.splice(i, 1); })} title="Remove from chapter (keeps it in the library)">×</button>
            </div>
          )}
          {b.type === "scene" && (
            <div className="blk-scene">
              <span>✦</span>
              <input value={b.text ?? ""} placeholder="Scene title (optional)" data-block={b.id} autoFocus={focusReq?.id === b.id}
                onChange={(e) => updateCh((c) => { c.blocks[i].text = e.target.value; })} />
              <button className="rm" onClick={() => updateCh((c) => { c.blocks.splice(i, 1); })}>×</button>
            </div>
          )}
          {b.type === "note" && (
            <div className="blk-note">
              <AutoText dataBlock={b.id} value={b.text ?? ""} placeholder="A margin note, aside, or easter egg…" autoFocusEnd={focusReq?.id === b.id ? 0 : null}
                onChange={(v) => updateCh((c) => { c.blocks[i].text = v; })} onKeyDown={(e) => onKey(e, b, i)} />
              <button className="rm" onClick={() => updateCh((c) => { c.blocks.splice(i, 1); })}>×</button>
            </div>
          )}
          {b.type === "audio" && (
            <div className="blk-audio">
              <span>♫</span>
              <input value={b.caption ?? ""} placeholder="Label, e.g. Sukoon Vibes" onChange={(e) => updateCh((c) => { c.blocks[i].caption = e.target.value; })} />
              <input value={b.url ?? ""} placeholder="Spotify / YouTube link, or upload →" onChange={(e) => updateCh((c) => { c.blocks[i].url = e.target.value; })} />
              <label className="upload">⤒<input type="file" accept="audio/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { url } = await api.upload(f);
                updateCh((c) => { c.blocks[i].url = url; });
              }} /></label>
              <button className="rm" onClick={() => updateCh((c) => { c.blocks.splice(i, 1); })}>×</button>
            </div>
          )}
        </div>
      ))}
      <Gutter i={ch.blocks.length} />
    </div>
  );
}

function LivePreview({ book, ch }: { book: Book; ch: Chapter }) {
  const opts = useMemo(() => ({ chapterIds: [ch.id], frontMatter: false }), [ch.id]);
  const res = usePagination(book, opts, 500);
  const g = pageGeometry(book.trim);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 24) / g.W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [g.W]);
  return (
    <div className="live-preview" ref={wrap}>
      <div className="lp-head">
        <span>Live pages · {res?.pages.length ?? "…"} pages</span>
        <label className="lp-paper" title="Page colours for the whole book">
          <span className="lp-dot" style={{ background: book.design?.page ?? PAPERS[book.paper]?.color, borderColor: book.design?.accent ?? PAPERS[book.paper]?.accent }} />
          <select value={book.design ? "custom" : book.paper} onChange={(e) => {
            if (e.target.value === "custom") return;
            useStore.getState().update((b) => { b.paper = e.target.value as PaperId; delete b.design; });
          }}>
            {book.design && <option value="custom">✦ Your custom colours</option>}
            {Object.values(PAPERS).map((p) => <option key={p.id} value={p.id}>{p.name} pages</option>)}
          </select>
        </label>
        <Link to={`/book/${book.id}/publish`} className="lp-more">More colours →</Link>
      </div>
      {res?.pages.map((p, i) => (
        <div key={i} className="lp-page" style={{ width: g.W * scale, height: g.H * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            <BookPage page={p} book={book} side={i % 2 ? "left" : "right"} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChapterSettings({ book, ch, updateCh }: { book: Book; ch: Chapter; updateCh: (fn: (c: Chapter) => void) => void }) {
  const update = useStore((s) => s.update);
  const nav = useNavigate();
  const art = ch.artDoodleId ? book.doodles[ch.artDoodleId] : undefined;
  const upload = async (f: File) => {
    const { url } = await api.upload(f);
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => null);
    const w = img.naturalWidth || 1024, h = img.naturalHeight || 600;
    const d = newDoodle(book, { title: `${ch.title} — art`, w, h, elements: [{ id: uid(6), type: "image", src: url, x: 0, y: 0, w, h, rotation: 0, locked: true }] });
    d.background = "none";
    update((b) => { b.doodles[d.id] = d; b.chapters.find((c) => c.id === ch.id)!.artDoodleId = d.id; });
  };
  return (
    <div className="ch-settings">
      <h4>Chapter settings</h4>
      <label>Status
        <select value={ch.status} onChange={(e) => updateCh((c) => { c.status = e.target.value as Chapter["status"]; })}>
          <option value="draft">Draft</option><option value="revising">Revising</option><option value="final">Final</option>
        </select>
      </label>
      <label>Part / act
        <select value={ch.partId} onChange={(e) => updateCh((c) => { c.partId = e.target.value; })}>
          {book.parts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>
      <label>Content note <span className="muted small">(shown on the chapter opener)</span>
        <input value={ch.contentNote ?? ""} onChange={(e) => updateCh((c) => { c.contentNote = e.target.value || undefined; })} placeholder="e.g. mentions of self-harm" />
      </label>
      <div className="lbl">Chapter opener art</div>
      {art ? (
        <div className="ch-art">
          <DoodleSvg doodle={art} cast={book.characters} />
          <div className="btn-row">
            <button onClick={() => nav(`/book/${book.id}/studio/${art.id}`)}>✎ Edit in Studio</button>
            <button onClick={() => updateCh((c) => { c.artDoodleId = undefined; })}>Remove</button>
          </div>
        </div>
      ) : <p className="muted small">No opener art — the chapter title will sit above the first paragraph.</p>}
      <div className="btn-row">
        <label className="button">⤒ Upload image<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} /></label>
        <select value="" onChange={(e) => e.target.value && updateCh((c) => { c.artDoodleId = e.target.value; })}>
          <option value="">Use a doodle…</option>
          {Object.values(book.doodles).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
      </div>
      <hr />
      <button className="danger" onClick={() => {
        if (!confirm(`Delete “${ch.title}”? This can't be undone.`)) return;
        const rest = book.chapters.filter((c) => c.id !== ch.id);
        update((b) => { b.chapters = b.chapters.filter((c) => c.id !== ch.id); });
        nav(`/book/${book.id}/write/${rest[0]?.id ?? ""}`);
      }}>Delete chapter</button>
    </div>
  );
}
