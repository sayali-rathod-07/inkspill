import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store.ts";
import type { Doodle, DoodleEl } from "../types.ts";
import { DoodleSvg } from "../doodle/DoodleSvg.tsx";
import { DoodleEditor } from "./DoodleEditor.tsx";
import { panelRects } from "../doodle/layout.ts";
import { setBookTheme, uid } from "../lib/util.ts";

const SIZES = [
  { id: "strip", label: "Comic strip", w: 1200, h: 640 },
  { id: "wide", label: "Wide banner", w: 1400, h: 520 },
  { id: "square", label: "Square", w: 900, h: 900 },
  { id: "page", label: "Full page", w: 800, h: 1100 },
];

export function newDoodle(book: { theme: Doodle["theme"] }, opts: { title?: string; w?: number; h?: number; panels?: number; sourceText?: string; elements?: DoodleEl[] } = {}): Doodle {
  const w = opts.w ?? 1200, h = opts.h ?? 640;
  const panels = opts.panels ?? 0;
  return {
    id: "d-" + uid(8),
    title: opts.title ?? "Untitled doodle",
    theme: book.theme,
    width: w,
    height: h,
    background: "paper",
    elements: opts.elements ?? (panels ? panelRects(panels, w, h).map((r) => ({ id: uid(6), type: "panel" as const, ...r, rotation: 0 })) : []),
    sourceText: opts.sourceText,
    history: [],
    updatedAt: Date.now(),
  };
}

export function StudioPage() {
  const { doodleId } = useParams();
  const nav = useNavigate();
  const book = useStore((s) => s.book)!;
  const update = useStore((s) => s.update);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  const list = useMemo(
    () => Object.values(book.doodles).sort((a, b) => b.updatedAt - a.updatedAt).filter((d) => d.title.toLowerCase().includes(filter.toLowerCase())),
    [book.doodles, filter],
  );
  const current = doodleId ? book.doodles[doodleId] : undefined;
  const usage = useMemo(() => {
    const m = new Map<string, string>();
    book.chapters.forEach((c, i) => {
      if (c.artDoodleId) m.set(c.artDoodleId, `Ch ${i + 1} art`);
      c.blocks.forEach((b) => b.doodleId && m.set(b.doodleId, `Ch ${i + 1}`));
    });
    return m;
  }, [book.chapters]);

  const onChange = useCallback((fn: (d: Doodle) => void) => {
    if (!doodleId) return;
    update((b) => { const d = b.doodles[doodleId]; if (d) fn(d); });
  }, [doodleId, update]);

  const create = (w: number, h: number, panels: number) => {
    const d = newDoodle(book, { w, h, panels });
    update((b) => { b.doodles[d.id] = d; });
    setCreating(false);
    nav(`/book/${book.id}/studio/${d.id}`);
  };

  const del = (id: string) => {
    if (usage.has(id) && !confirm(`This doodle is used in ${usage.get(id)}. Delete it anyway?`)) return;
    update((b) => {
      delete b.doodles[id];
      b.chapters.forEach((c) => {
        if (c.artDoodleId === id) c.artDoodleId = undefined;
        c.blocks = c.blocks.filter((bl) => bl.doodleId !== id);
      });
    });
    if (id === doodleId) nav(`/book/${book.id}/studio`);
  };

  return (
    <div className="studio">
      <nav className="studio-lib">
        <div className="lib-head">
          <h3>Doodles</h3>
          <button className="primary" onClick={() => setCreating(true)}>+ New</button>
        </div>
        <input className="lib-search" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul>
          {list.map((d) => (
            <li key={d.id} className={d.id === doodleId ? "on" : ""} onClick={() => nav(`/book/${book.id}/studio/${d.id}`)}>
              <DoodleSvg doodle={d} cast={book.characters} className="lib-thumb" />
              <div className="lib-meta">
                <span>{d.title}</span>
                {usage.has(d.id) ? <em>{usage.get(d.id)}</em> : <em className="muted">not placed</em>}
              </div>
              <button className="x" title="Delete" onClick={(e) => { e.stopPropagation(); del(d.id); }}>×</button>
            </li>
          ))}
        </ul>
      </nav>

      {current ? (
        <DoodleEditor key={current.id} doodle={current} cast={book.characters} bookTheme={book.theme} onChange={onChange}
          onBookTheme={(t) => update((b) => setBookTheme(b, t))}
          onSaveLook={(charId, dna) => update((b) => { const c = b.characters.find((x) => x.id === charId); if (c) c.dna = dna; })} />
      ) : (
        <div className="studio-empty">
          <h2>Doodle Studio</h2>
          <p>Every doodle is drawn from your characters' saved looks, so Bhaiya always has his horns and Sayali her band-aid. Generate from a passage, refine with prompts, then fine-tune by hand.</p>
          <button className="primary big" onClick={() => setCreating(true)}>+ Start a new doodle</button>
          <p className="muted small">Or pick one from the library on the left.</p>
        </div>
      )}

      {creating && (
        <div className="modal-back" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New doodle</h3>
            <div className="size-grid">
              {SIZES.map((s) => (
                <div key={s.id} className="size-card">
                  <div className="size-shape" style={{ aspectRatio: `${s.w}/${s.h}` }} />
                  <b>{s.label}</b>
                  <span className="muted small">{s.w}×{s.h}</span>
                  <div className="seg small">
                    {[0, 1, 2, 3].map((n) => <button key={n} onClick={() => create(s.w, s.h, n)}>{n ? `${n}▦` : "blank"}</button>)}
                  </div>
                </div>
              ))}
            </div>
            <p className="muted small">Pick a shape and how many panels to start with — you can change panels any time.</p>
          </div>
        </div>
      )}
    </div>
  );
}
