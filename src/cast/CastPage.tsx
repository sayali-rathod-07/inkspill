import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ACCESSORIES, AGES, EXPRESSIONS, HAIR_STYLES, OUTFITS, POSES, PRINTS, type Book, type Character, type Expression, type Pose } from "../types.ts";
import { useStore } from "../store.ts";
import { CharacterAvatar, CharacterRig, RIG_H, RIG_W } from "../doodle/rig.tsx";
import { THEMES, THEME_LIST, isMonochrome } from "../doodle/theme.ts";
import { CastMapSvg, MAP_H, MAP_W } from "./CastMapSvg.tsx";
import { api } from "../lib/api.ts";
import { setBookTheme, uid } from "../lib/util.ts";

import { COLORS, HAIRS, SKINS } from "../doodle/swatches.ts";

export function CastPage() {
  const book = useStore((s) => s.book)!;
  const [tab, setTab] = useState<"characters" | "map">("characters");
  return (
    <div className="cast-page">
      <div className="cast-tabs">
        <button className={tab === "characters" ? "on" : ""} onClick={() => setTab("characters")}>🧍 Characters ({book.characters.length})</button>
        <button className={tab === "map" ? "on" : ""} onClick={() => setTab("map")}>🕸 Relationship map</button>
      </div>
      {tab === "characters" ? <Characters book={book} /> : <MapEditor book={book} />}
    </div>
  );
}

function Swatches({ value, options, onPick }: { value: string; options: string[]; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {options.map((c) => <button key={c} className={value.toLowerCase() === c ? "on" : ""} style={{ background: c }} onClick={() => onPick(c)} />)}
      <input type="color" value={value} onChange={(e) => onPick(e.target.value)} title="Custom colour" />
    </div>
  );
}

function Characters({ book }: { book: Book }) {
  const update = useStore((s) => s.update);
  const [selId, setSelId] = useState<string | null>(book.characters[0]?.id ?? null);
  const [pose, setPose] = useState<Pose>("wave");
  const [expr, setExpr] = useState<Expression>("happy");
  // The book's drawing style — saved, so it stays the same everywhere.
  const themeId = book.theme;
  const setThemeId = (t: typeof book.theme) => update((b) => setBookTheme(b, t));
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ai = useStore((s) => s.ai);
  const c = book.characters.find((x) => x.id === selId) ?? null;
  const theme = THEMES[themeId];

  const set = (fn: (c: Character) => void) => update((b) => { const x = b.characters.find((y) => y.id === selId); if (x) fn(x); });
  const add = () => {
    const id = uid(6);
    update((b) => {
      b.characters.push({
        id, name: "New character", aliases: [], role: "", color: "#ff5a3c",
        dna: { age: "adult", build: "average", skin: "#e2b088", hair: "short", hairColor: "#2b2118", outfit: "tshirt", outfitColor: "#8f7bd8", bottomColor: "#3d3a5c", print: "none", accessories: [], signature: "" },
      });
    });
    setSelId(id);
  };
  const autoFill = async () => {
    if (!c || !desc.trim()) return;
    setBusy(true); setErr(null);
    try {
      const dna = await api.characterDna(c.name, desc);
      set((x) => { x.dna = dna; });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="chars">
      <ul className="char-list">
        {book.characters.map((x) => (
          <li key={x.id} className={x.id === selId ? "on" : ""} onClick={() => setSelId(x.id)}>
            <CharacterAvatar dna={x.dna} theme={theme} size={40} />
            <div><b>{x.name}</b><span>{x.role}</span></div>
          </li>
        ))}
        <li className="add" onClick={add}>+ Add character</li>
      </ul>

      {c ? (
        <>
          <div className="char-stage">
            <svg viewBox={`0 0 ${RIG_W} ${RIG_H}`} className="char-big">
              <rect width={RIG_W} height={RIG_H} rx={14} fill={theme.paper} />
              <CharacterRig dna={c.dna} pose={pose} expression={expr} theme={theme} />
            </svg>
            <div className="lbl">Book drawing style <span className="muted small">(saved for all doodles)</span></div>
            <div className="seg wrap">{THEME_LIST.map((t) => <button key={t.id} className={themeId === t.id ? "on" : ""} onClick={() => setThemeId(t.id)} title={t.blurb}>{t.name}</button>)}</div>
            {isMonochrome(themeId) && (
              <div className="mono-hint">
                🎨 <b>{THEMES[themeId].name}</b> shows every colour as a {themeId === "purple-ink" ? "purple" : "grey"} tint, so colour changes look subtle here.
                <button onClick={() => setThemeId("storybook")}>Switch the book to full colour</button>
              </div>
            )}
            <div className="lbl">Try a pose</div>
            <div className="chips small">{POSES.map((p) => <button key={p} className={pose === p ? "on" : ""} onClick={() => setPose(p)}>{p}</button>)}</div>
            <div className="lbl">Try an expression</div>
            <div className="chips small">{EXPRESSIONS.map((p) => <button key={p} className={expr === p ? "on" : ""} onClick={() => setExpr(p)}>{p}</button>)}</div>
            <p className="muted small">This saved “visual DNA” is how {c.name.split(" ")[0]} is drawn in every doodle — change it once, every scene updates.</p>
          </div>

          <div className="char-form">
            <div className="row2">
              <label>Name<input value={c.name} onChange={(e) => set((x) => { x.name = e.target.value; })} /></label>
              <label>Role<input value={c.role} onChange={(e) => set((x) => { x.role = e.target.value; })} placeholder="e.g. Bhaiya · eldest" /></label>
            </div>
            <label>Also called <span className="muted small">(comma separated — used to detect them in your text)</span>
              <input value={c.aliases.join(", ")} onChange={(e) => set((x) => { x.aliases = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} />
            </label>

            <div className="ai-fill">
              <label>Describe them and let AI fill the look
                <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. strict dad, thick mustache, balding, always in a cream shirt" />
              </label>
              <button disabled={!ai || busy || !desc.trim()} onClick={() => void autoFill()}>{busy ? "Designing…" : "✨ Auto-fill DNA"}</button>
              {err && <div className="ai-error">{err}</div>}
            </div>

            <div className="row3">
              <label>Age<select value={c.dna.age} onChange={(e) => set((x) => { x.dna.age = e.target.value as typeof x.dna.age; })}>{AGES.map((a) => <option key={a}>{a}</option>)}</select></label>
              <label>Build<select value={c.dna.build} onChange={(e) => set((x) => { x.dna.build = e.target.value as typeof x.dna.build; })}><option>slim</option><option>average</option><option>round</option></select></label>
              <label>Hair<select value={c.dna.hair} onChange={(e) => set((x) => { x.dna.hair = e.target.value as typeof x.dna.hair; })}>{HAIR_STYLES.map((a) => <option key={a}>{a}</option>)}</select></label>
            </div>
            <div className="lbl">Skin</div>
            <Swatches value={c.dna.skin} options={SKINS} onPick={(v) => set((x) => { x.dna.skin = v; })} />
            <div className="lbl">Hair colour</div>
            <Swatches value={c.dna.hairColor} options={HAIRS} onPick={(v) => set((x) => { x.dna.hairColor = v; })} />
            <div className="row3">
              <label>Outfit<select value={c.dna.outfit} onChange={(e) => set((x) => { x.dna.outfit = e.target.value as typeof x.dna.outfit; })}>{OUTFITS.map((a) => <option key={a}>{a}</option>)}</select></label>
              <label>T-shirt print<select value={c.dna.print} onChange={(e) => set((x) => { x.dna.print = e.target.value as typeof x.dna.print; })}>{PRINTS.map((a) => <option key={a}>{a}</option>)}</select></label>
              <span />
            </div>
            <div className="lbl">Outfit colour</div>
            <Swatches value={c.dna.outfitColor} options={COLORS} onPick={(v) => set((x) => { x.dna.outfitColor = v; })} />
            <div className="lbl">Bottoms colour</div>
            <Swatches value={c.dna.bottomColor} options={COLORS} onPick={(v) => set((x) => { x.dna.bottomColor = v; })} />
            <div className="lbl">Signature traits</div>
            <div className="chips small">
              {ACCESSORIES.map((a) => {
                const on = c.dna.accessories.includes(a);
                return <button key={a} className={on ? "on" : ""} onClick={() => set((x) => { x.dna.accessories = on ? x.dna.accessories.filter((y) => y !== a) : [...x.dna.accessories, a]; })}>{a}</button>;
              })}
            </div>
            <label>Visual notes for the AI
              <textarea rows={3} value={c.dna.signature} onChange={(e) => set((x) => { x.dna.signature = e.target.value; })} placeholder="Attitude, habits, recurring props…" />
            </label>
            <button className="danger" onClick={() => {
              if (!confirm(`Remove ${c.name}? Doodles that use them will show a placeholder.`)) return;
              update((b) => {
                b.characters = b.characters.filter((x) => x.id !== c.id);
                b.cast.nodes = b.cast.nodes.filter((n) => n.charId !== c.id);
                b.cast.edges = b.cast.edges.filter((e) => e.from !== c.id && e.to !== c.id);
                b.cast.groups.forEach((g) => { g.charIds = g.charIds.filter((id) => id !== c.id); });
              });
              setSelId(book.characters.find((x) => x.id !== c.id)?.id ?? null);
            }}>Remove character</button>
          </div>
        </>
      ) : <div className="empty-state"><p>Add your first character.</p></div>}
    </div>
  );
}

function MapEditor({ book }: { book: Book }) {
  const update = useStore((s) => s.update);
  const svgWrap = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [edgeSel, setEdgeSel] = useState<string | null>(null);
  const drag = useRef<{ id: string } | null>(null);
  const theme = THEMES[book.theme];
  const onMap = new Set(book.cast.nodes.map((n) => n.charId));

  const toMap = (e: { clientX: number; clientY: number }) => {
    const svg = svgWrap.current!.querySelector("svg")!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return [Math.max(50, Math.min(MAP_W - 50, p.x)), Math.max(60, Math.min(MAP_H - 70, p.y))];
  };
  const onNodeDown = (e: RPointerEvent, id: string) => {
    if (linkFrom) return;
    drag.current = { id };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current) return;
    const [x, y] = toMap(e);
    update((b) => { const n = b.cast.nodes.find((n) => n.charId === drag.current!.id); if (n) { n.x = Math.round(x); n.y = Math.round(y); } });
  };
  const onNodeClick = (id: string) => {
    if (linkFrom && linkFrom !== id) {
      const eid = uid(6);
      update((b) => { b.cast.edges.push({ id: eid, from: linkFrom, to: id, label: "friends" }); });
      setLinkFrom(null);
      setSel(null);
      setEdgeSel(eid);
      return;
    }
    setSel(id);
    setEdgeSel(null);
  };
  const edge = book.cast.edges.find((e) => e.id === edgeSel);

  return (
    <div className="map-editor">
      <div className="map-tools">
        <label className="row"><input type="checkbox" checked={book.cast.inFrontMatter} onChange={(e) => update((b) => { b.cast.inFrontMatter = e.target.checked; })} /> Put “Meet the Cast” in the book's front matter</label>
        <div className="lbl">Add to map</div>
        <div className="chips small">
          {book.characters.filter((c) => !onMap.has(c.id)).map((c) => (
            <button key={c.id} onClick={() => update((b) => { b.cast.nodes.push({ charId: c.id, x: 120 + Math.random() * 800, y: 120 + Math.random() * 220 }); })}>
              <CharacterAvatar dna={c.dna} theme={theme} size={20} /> {c.name.split(" ")[0]}
            </button>
          ))}
          {book.characters.every((c) => onMap.has(c.id)) && <span className="muted small">Everyone's on the map.</span>}
        </div>
        {sel && (
          <div className="map-sel">
            <b>{book.characters.find((c) => c.id === sel)?.name}</b>
            <div className="btn-row">
              <button className={linkFrom ? "on" : ""} onClick={() => setLinkFrom(linkFrom ? null : sel)}>{linkFrom ? "Click another person…" : "↔ Connect to…"}</button>
              <button onClick={() => { update((b) => { b.cast.nodes = b.cast.nodes.filter((n) => n.charId !== sel); b.cast.edges = b.cast.edges.filter((e) => e.from !== sel && e.to !== sel); }); setSel(null); }}>Remove from map</button>
            </div>
            <div className="lbl">Groups</div>
            <div className="chips small">
              {book.cast.groups.map((g) => {
                const on = g.charIds.includes(sel);
                return <button key={g.id} className={on ? "on" : ""} onClick={() => update((b) => { const x = b.cast.groups.find((y) => y.id === g.id)!; x.charIds = on ? x.charIds.filter((i) => i !== sel) : [...x.charIds, sel]; })}>{g.label}</button>;
              })}
            </div>
          </div>
        )}
        {edge && (
          <div className="map-sel">
            <label>Connection label<input value={edge.label} onChange={(e) => update((b) => { b.cast.edges.find((x) => x.id === edge.id)!.label = e.target.value; })} /></label>
            <button onClick={() => { update((b) => { b.cast.edges = b.cast.edges.filter((x) => x.id !== edge.id); }); setEdgeSel(null); }}>Delete connection</button>
          </div>
        )}
        <div className="lbl">Groups (families, squads…)</div>
        {book.cast.groups.map((g) => (
          <div key={g.id} className="group-row">
            <input type="color" value={g.color} onChange={(e) => update((b) => { b.cast.groups.find((x) => x.id === g.id)!.color = e.target.value; })} />
            <input value={g.label} onChange={(e) => update((b) => { b.cast.groups.find((x) => x.id === g.id)!.label = e.target.value; })} />
            <button onClick={() => update((b) => { b.cast.groups = b.cast.groups.filter((x) => x.id !== g.id); })}>×</button>
          </div>
        ))}
        <button onClick={() => update((b) => { b.cast.groups.push({ id: uid(6), label: "New group", charIds: sel ? [sel] : [], color: "#a77df2" }); })}>+ Group</button>
        <p className="muted small">Drag people to arrange. Click a person, then “Connect to…” and click someone else. Click a connection to rename it.</p>
      </div>
      <div className="map-canvas" ref={svgWrap} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}>
        <CastMapSvg book={book} selected={sel} linkFrom={linkFrom} onNodeDown={onNodeDown} onNodeClick={onNodeClick} onEdgeClick={(id) => { setEdgeSel(id); setSel(null); }} />
      </div>
    </div>
  );
}
