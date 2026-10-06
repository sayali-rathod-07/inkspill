import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import type { Book, Chapter } from "../types.ts";
import { useStore } from "../store.ts";
import { chapterCast, chapterWords, uid } from "../lib/util.ts";
import { CharacterAvatar } from "../doodle/rig.tsx";
import { THEMES } from "../doodle/theme.ts";

const STATUS: Record<Chapter["status"], string> = { draft: "Draft", revising: "Revising", final: "Final" };

function Row({ ch, n, book, active, onOpen, onScene }: { ch: Chapter; n: number; book: Book; active: boolean; onOpen: () => void; onScene: (blockId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id });
  const cast = useMemo(() => chapterCast(book, ch), [book, ch]);
  const theme = THEMES[book.theme];
  const scenes = ch.blocks.filter((b) => b.type === "scene");
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }} className={`ol-ch ${active ? "on" : ""}`}>
      <div className="ol-row" onClick={onOpen}>
        <span className="grip" {...attributes} {...listeners} title="Drag to reorder" onClick={(e) => e.stopPropagation()}>⋮⋮</span>
        <span className="num">{n}</span>
        <span className="title">{ch.title || "Untitled"}</span>
        <span className={`dot ${ch.status}`} title={STATUS[ch.status]} />
      </div>
      <div className="ol-meta" onClick={onOpen}>
        <span>{chapterWords(ch).toLocaleString()} words</span>
        <span className="tags">
          {cast.slice(0, 5).map((id) => {
            const c = book.characters.find((x) => x.id === id)!;
            return <span key={id} title={c.name}><CharacterAvatar dna={c.dna} theme={theme} size={20} /></span>;
          })}
          {cast.length > 5 && <em>+{cast.length - 5}</em>}
        </span>
      </div>
      {active && scenes.length > 0 && (
        <ul className="ol-scenes">
          {scenes.map((s) => <li key={s.id} onClick={() => onScene(s.id)}>↳ {s.text || "Scene"}</li>)}
        </ul>
      )}
    </li>
  );
}

export function Outliner({ book, activeId, onOpen, onScene }: { book: Book; activeId: string; onOpen: (id: string) => void; onScene: (blockId: string) => void }) {
  const update = useStore((s) => s.update);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [editingPart, setEditingPart] = useState<string | null>(null);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    update((b) => {
      const from = b.chapters.findIndex((c) => c.id === e.active.id);
      const to = b.chapters.findIndex((c) => c.id === e.over!.id);
      b.chapters = arrayMove(b.chapters, from, to);
      // A moved chapter joins the part of its new neighbour.
      const moved = b.chapters[to];
      const neighbour = b.chapters[to - 1] ?? b.chapters[to + 1];
      if (neighbour && from < to) moved.partId = b.chapters[to - 1]?.partId ?? moved.partId;
      else if (neighbour) moved.partId = b.chapters[to + 1]?.partId ?? moved.partId;
    });
  };

  const addChapter = (partId: string) => {
    const id = uid(8);
    update((b) => {
      const lastIdx = b.chapters.map((c) => c.partId).lastIndexOf(partId);
      b.chapters.splice(lastIdx + 1, 0, { id, partId, title: "New chapter", status: "draft", blocks: [{ id: uid(8), type: "text", text: "" }] });
    });
    onOpen(id);
  };
  const addPart = () => {
    const id = uid(6);
    update((b) => { b.parts.push({ id, title: `Part ${b.parts.length + 1}` }); });
    setEditingPart(id); // ask for a name straight away
  };
  const renamePart = (id: string, v: string) => update((b) => { const p = b.parts.find((x) => x.id === id); if (p) p.title = v.trim() || p.title; });
  const deletePart = (id: string) => update((b) => {
    if (b.parts.length <= 1 || b.chapters.some((c) => c.partId === id)) return;
    b.parts = b.parts.filter((x) => x.id !== id);
  });

  return (
    <nav className="outliner">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={book.chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {book.parts.map((p) => {
            const chs = book.chapters.filter((c) => c.partId === p.id);
            return (
              <section key={p.id} className="ol-part">
                {editingPart === p.id ? (
                  <div className="ol-part-edit">
                    <input autoFocus className="ol-part-title" defaultValue={p.title} placeholder="Name this part, e.g. Part Three · College Days"
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => { renamePart(p.id, e.target.value); setEditingPart(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingPart(null); }} />
                    <span className="hint">Press Enter to save</span>
                  </div>
                ) : (
                  <div className="ol-part-head">
                    <h5 onClick={() => setEditingPart(p.id)} title="Click to rename">{p.title}</h5>
                    <button className="icon" onClick={() => setEditingPart(p.id)} title="Rename part" aria-label={`Rename ${p.title}`}>✎</button>
                    {chs.length === 0 && book.parts.length > 1 && (
                      <button className="icon" onClick={() => deletePart(p.id)} title="Remove this empty part" aria-label={`Remove ${p.title}`}>×</button>
                    )}
                  </div>
                )}
                <ul>
                  {chs.map((ch) => (
                    <Row key={ch.id} ch={ch} n={book.chapters.indexOf(ch) + 1} book={book} active={ch.id === activeId} onOpen={() => onOpen(ch.id)} onScene={onScene} />
                  ))}
                </ul>
                <button className="ol-add" onClick={() => addChapter(p.id)}>+ Chapter</button>
              </section>
            );
          })}
        </SortableContext>
      </DndContext>
      <button className="ol-add part" onClick={addPart}>+ Part / Act</button>
    </nav>
  );
}
