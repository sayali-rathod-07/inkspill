import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import {
  EXPRESSIONS, POSES, type BubbleEl, type BubbleKind, type Character, type Doodle, type DoodleEl, type Expression, type Pose, type ThemeId,
} from "../types.ts";
import { ElementView, InkFilters, backgroundFill } from "../doodle/DoodleSvg.tsx";
import { THEMES, THEME_LIST, tokenColor } from "../doodle/theme.ts";
import { CharacterAvatar } from "../doodle/rig.tsx";
import { STICKERS } from "../doodle/stickers.ts";
import { panelRects } from "../doodle/layout.ts";
import { api } from "../lib/api.ts";
import { clamp, uid } from "../lib/util.ts";
import { download, fontsReady, standaloneSvg, svgToPng } from "../lib/fonts.ts";
import { clearWrapCache } from "../lib/textwrap.ts";
import { AiPanel } from "./AiPanel.tsx";

type Tool = "select" | "pen" | "eraser";
type Drag =
  | { kind: "move"; id: string; start: [number, number]; orig: DoodleEl }
  | { kind: "resize"; id: string; corner: [number, number]; orig: DoodleEl }
  | { kind: "rotate"; id: string; orig: DoodleEl }
  | { kind: "tail"; id: string }
  | { kind: "pen"; points: number[] }
  | { kind: "erase" };

const POSE_LABEL: Record<Pose, string> = { stand: "Stand", wave: "Wave", armsUp: "Arms up", point: "Point", run: "Run", hold: "Carry", sit: "Sit", fall: "Fall", shrug: "Shrug", hug: "Open arms" };
const EXPR_EMOJI: Record<Expression, string> = { neutral: "😐", happy: "🙂", laugh: "😆", sad: "🙁", crying: "😭", angry: "😠", shocked: "😮", scared: "😱", smirk: "😏", sleepy: "😴", love: "😍", determined: "😤" };
const BUBBLES: { kind: BubbleKind; label: string; text: string; w: number; h: number; fs: number }[] = [
  { kind: "speech", label: "Speech", text: "Say something!", w: 240, h: 110, fs: 28 },
  { kind: "thought", label: "Thought", text: "Hmm…", w: 220, h: 140, fs: 28 },
  { kind: "shout", label: "Shout", text: "NO!", w: 200, h: 150, fs: 40 },
  { kind: "whisper", label: "Whisper", text: "psst… don't tell Mummy", w: 260, h: 110, fs: 24 },
  { kind: "caption", label: "Caption box", text: "Meanwhile…", w: 260, h: 54, fs: 24 },
  { kind: "label", label: "Label + arrow", text: "Bhaiya", w: 160, h: 50, fs: 30 },
  { kind: "sfx", label: "Sound effect", text: "CRACK!", w: 260, h: 110, fs: 72 },
];

const rotate = (x: number, y: number, deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
};

export function DoodleEditor({ doodle, cast, onChange, sourceHint }: {
  doodle: Doodle;
  cast: Character[];
  onChange: (fn: (d: Doodle) => void) => void;
  sourceHint?: string;
}) {
  const [els, setEls] = useState<DoodleEl[]>(doodle.elements);
  const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState<"ink" | "accent" | "soft" | "warm" | "paper">("ink");
  const [penWidth, setPenWidth] = useState(5);
  const [menu, setMenu] = useState<null | "char" | "bubble" | "sticker" | "panels" | "export">(null);
  const [past, setPast] = useState<DoodleEl[][]>([]);
  const [future, setFuture] = useState<DoodleEl[][]>([]);
  const [, setFontTick] = useState(0);
  const drag = useRef<Drag | null>(null);
  const [penPreview, setPenPreview] = useState<number[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fid = "e" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const theme = THEMES[doodle.theme] ?? THEMES["purple-ink"];
  const castMap = useMemo(() => new Map(cast.map((c) => [c.id, c])), [cast]);
  const selected = els.find((e) => e.id === sel) ?? null;
  const elsRef = useRef(els);
  elsRef.current = els;

  // Reset local state when switching doodles.
  useEffect(() => {
    setEls(doodle.elements);
    setPast([]);
    setFuture([]);
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doodle.id]);

  useEffect(() => {
    fontsReady().then(() => { clearWrapCache(); setFontTick((n) => n + 1); });
  }, []);

  const persist = useCallback((next: DoodleEl[]) => onChange((d) => { d.elements = next; d.updatedAt = Date.now(); }), [onChange]);

  /** Commit a discrete change with undo support. */
  const commit = useCallback((next: DoodleEl[]) => {
    setPast((p) => [...p.slice(-80), els]);
    setFuture([]);
    setEls(next);
    persist(next);
  }, [els, persist]);

  const patch = (id: string, fn: (e: DoodleEl) => DoodleEl) => commit(els.map((e) => (e.id === id ? fn(e) : e)));

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [els, ...f]);
    setPast((p) => p.slice(0, -1));
    setEls(prev);
    persist(prev);
  }, [past, els, persist]);
  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setPast((p) => [...p, els]);
    setFuture((f) => f.slice(1));
    setEls(next);
    persist(next);
  }, [future, els, persist]);

  const toCanvas = (e: { clientX: number; clientY: number }): [number, number] => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  };

  const add = (el: DoodleEl) => { commit([...els, el]); setSel(el.id); setTool("select"); setMenu(null); };
  const center = (w: number, h: number) => ({ x: doodle.width / 2 - w / 2 + (Math.random() - 0.5) * 60, y: doodle.height / 2 - h / 2 + (Math.random() - 0.5) * 40 });

  const addCharacter = (charId: string) => {
    const ch = castMap.get(charId);
    const kid = ch && ["kid", "baby", "teen"].includes(ch.dna.age);
    const w = Math.min(doodle.height * 0.55, 240) / 1.5 * 1.5 * (kid ? 0.85 : 1);
    add({ id: uid(6), type: "character", charId, ...center(w, w * 1.5), w, h: w * 1.5, rotation: 0, pose: "stand", expression: "happy", facing: "right" });
  };
  const addBubble = (b: (typeof BUBBLES)[number]) => {
    const pos = center(b.w, b.h);
    const target = selected?.type === "character" ? selected : null;
    add({
      id: uid(6), type: "bubble", kind: b.kind, text: b.text, ...pos, w: b.w, h: b.h, fontSize: b.fs, rotation: b.kind === "sfx" ? -8 : 0,
      tailX: target ? target.x + target.w / 2 : pos.x + b.w / 2 + 40, tailY: target ? target.y + target.h * 0.12 : pos.y + b.h + 80,
      noTail: b.kind === "sfx" || b.kind === "caption",
    });
  };
  const addSticker = (s: (typeof STICKERS)[number]) => {
    const w = 110 * (s.vbW / s.vbH > 1.4 ? 1.6 : 1), h = (w * s.vbH) / s.vbW;
    add({ id: uid(6), type: "art", label: s.label, svg: s.svg, vbW: s.vbW, vbH: s.vbH, ...center(w, h), w, h, rotation: 0 });
  };
  const setPanels = (n: number) => {
    const rects = panelRects(n, doodle.width, doodle.height);
    const others = els.filter((e) => e.type !== "panel");
    commit([...rects.map((r) => ({ id: uid(6), type: "panel" as const, ...r, rotation: 0 })), ...others]);
    setMenu(null);
  };
  const onUpload = async (file: File) => {
    const { url } = await api.upload(file);
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => null);
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 0.6;
    const w = Math.min(doodle.width * 0.6, 520), h = w * ratio;
    add({ id: uid(6), type: "image", src: url, ...center(w, h), w, h, rotation: 0 });
  };

  const remove = (id: string) => { commit(els.filter((e) => e.id !== id)); setSel(null); };
  const duplicate = (id: string) => {
    const e = els.find((x) => x.id === id);
    if (!e) return;
    const copy = { ...structuredClone(e), id: uid(6), x: e.x + 24, y: e.y + 24 } as DoodleEl;
    if (copy.type === "bubble") { copy.tailX += 24; copy.tailY += 24; }
    commit([...els, copy]);
    setSel(copy.id);
  };
  const reorder = (id: string, dir: -1 | 1 | "top" | "bottom") => {
    const i = els.findIndex((e) => e.id === id);
    if (i < 0) return;
    const next = [...els];
    const [it] = next.splice(i, 1);
    const j = dir === "top" ? next.length : dir === "bottom" ? 0 : clamp(i + dir, 0, next.length);
    next.splice(j, 0, it);
    commit(next);
  };

  // ---------- pointer handling ----------
  const onElementDown = (e: RPointerEvent, el: DoodleEl) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSel(el.id);
    setMenu(null);
    if (el.locked) return;
    setPast((p) => [...p.slice(-80), els]);
    setFuture([]);
    drag.current = { kind: "move", id: el.id, start: toCanvas(e), orig: structuredClone(el) };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onCanvasDown = (e: RPointerEvent) => {
    setMenu(null);
    const p = toCanvas(e);
    if (tool === "pen") {
      drag.current = { kind: "pen", points: [p[0], p[1]] };
      setPenPreview([p[0], p[1]]);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } else if (tool === "eraser") {
      setPast((pp) => [...pp.slice(-80), els]);
      setFuture([]);
      drag.current = { kind: "erase" };
      eraseAt(p);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } else {
      setSel(null);
    }
  };

  const eraseAt = (p: [number, number]) => {
    const r = 14;
    setEls((cur) => cur.filter((el) => {
      if (el.type !== "stroke" || el.locked) return true;
      const sx = el.w0 ? el.w / el.w0 : 1, sy = el.h0 ? el.h / el.h0 : 1;
      for (let i = 0; i < el.points.length; i += 2) {
        if (Math.hypot(el.x + el.points[i] * sx - p[0], el.y + el.points[i + 1] * sy - p[1]) < r + el.width / 2) return false;
      }
      return true;
    }));
  };

  const startHandle = (e: RPointerEvent, d: Drag) => {
    e.stopPropagation();
    setPast((p) => [...p.slice(-80), els]);
    setFuture([]);
    drag.current = d;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvas(e);
    if (d.kind === "pen") {
      const pts = d.points;
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
      if (Math.hypot(p[0] - lx, p[1] - ly) > 2.5) { pts.push(p[0], p[1]); setPenPreview([...pts]); }
      return;
    }
    if (d.kind === "erase") { eraseAt(p); return; }
    setEls((cur) => cur.map((el) => {
      if (el.id !== d.id) return el;
      if (d.kind === "move") {
        const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
        const o = d.orig;
        const moved = { ...el, x: o.x + dx, y: o.y + dy } as DoodleEl;
        if (moved.type === "bubble" && o.type === "bubble" && moved.kind === "label" && e.altKey) { moved.tailX = o.tailX + dx; moved.tailY = o.tailY + dy; }
        return moved;
      }
      if (d.kind === "tail" && el.type === "bubble") return { ...el, tailX: p[0], tailY: p[1], noTail: false };
      if (d.kind === "rotate") {
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
        let ang = (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90;
        if (e.shiftKey) ang = Math.round(ang / 15) * 15;
        ang = ((ang + 540) % 360) - 180;
        return { ...el, rotation: Math.round(ang) };
      }
      if (d.kind === "resize") {
        const o = d.orig;
        const [sx, sy] = d.corner;
        const oc = [o.x + o.w / 2, o.y + o.h / 2];
        const fixedLocal: [number, number] = [(1 - sx) * o.w - o.w / 2, (1 - sy) * o.h - o.h / 2];
        const fr = rotate(fixedLocal[0], fixedLocal[1], o.rotation);
        const F = [oc[0] + fr[0], oc[1] + fr[1]];
        const dl = rotate(p[0] - F[0], p[1] - F[1], -o.rotation);
        let w = Math.max(24, sx ? dl[0] : -dl[0]);
        let h = Math.max(24, sy ? dl[1] : -dl[1]);
        const keepAspect = o.type === "character" || o.type === "image" ? !e.shiftKey : o.type === "art" || o.type === "stroke" ? e.shiftKey : false;
        if (keepAspect) {
          const k = Math.max(w / o.w, h / o.h);
          w = o.w * k; h = o.h * k;
        }
        const half = rotate((sx ? 1 : -1) * (w / 2), (sy ? 1 : -1) * (h / 2), o.rotation);
        const c = [F[0] + half[0], F[1] + half[1]];
        const next = { ...el, x: c[0] - w / 2, y: c[1] - h / 2, w, h } as DoodleEl;
        if (next.type === "bubble" && o.type === "bubble" && o.kind === "sfx") next.fontSize = Math.max(16, Math.round(o.fontSize * (h / o.h)));
        return next;
      }
      return el;
    }));
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "pen") {
      setPenPreview(null);
      const pts = d.points;
      if (pts.length < 4) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
      const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
      const local = pts.map((v, i) => (i % 2 ? v - minY : v - minX));
      commit([...els, { id: uid(6), type: "stroke", points: local, x: minX, y: minY, w, h, w0: w, h0: h, rotation: 0, color: penColor, width: penWidth }]);
      return;
    }
    persist(elsRef.current);
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) { redo(); } else { undo(); } return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "d" && sel) { e.preventDefault(); duplicate(sel); return; }
      if (!mod && e.key === "v") setTool("select");
      if (!mod && e.key === "p") setTool("pen");
      if (!mod && e.key === "e") setTool("eraser");
      if (e.key === "Escape") { setSel(null); setMenu(null); }
      if (!sel) return;
      const el = els.find((x) => x.id === sel);
      if (!el) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(sel); }
      if (e.key === "[") reorder(sel, -1);
      if (e.key === "]") reorder(sel, 1);
      if (e.key === "Enter" && el.type === "bubble") { e.preventDefault(); textRef.current?.focus(); textRef.current?.select(); }
      const step = e.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (nudge[e.key] && !el.locked) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        patch(sel, (x) => ({ ...x, x: x.x + dx, y: x.y + dy }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- AI ----------
  const applyAi = (next: DoodleEl[]) => { commit(next); setSel(null); };

  const exportAs = async (kind: "png" | "svg") => {
    setSel(null);
    setMenu(null);
    await new Promise((r) => setTimeout(r, 50));
    const text = await standaloneSvg(svgRef.current!);
    const name = (doodle.title || "doodle").replace(/[^\w-]+/g, "-").toLowerCase();
    if (kind === "svg") download(new Blob([text], { type: "image/svg+xml" }), `${name}.svg`);
    else download(await svgToPng(text, doodle.width, doodle.height, 2), `${name}.png`);
  };

  // ---------- selection chrome ----------
  const chrome = selected && tool === "select" && !selected.hidden ? (() => {
    const s = selected;
    const hs = Math.max(10, doodle.width / 90);
    const corners: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    return (
      <g data-editor-only>
        <g transform={`translate(${s.x} ${s.y}) rotate(${s.rotation} ${s.w / 2} ${s.h / 2})`}>
          <rect x={0} y={0} width={s.w} height={s.h} fill="none" stroke="#7c4dcc" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {!s.locked && (
            <>
              {corners.map(([cx, cy]) => (
                <rect key={`${cx}${cy}`} x={cx * s.w - hs / 2} y={cy * s.h - hs / 2} width={hs} height={hs} rx={3} fill="#fff" stroke="#7c4dcc" strokeWidth={2}
                  style={{ cursor: (cx === cy ? "nwse-resize" : "nesw-resize") }}
                  onPointerDown={(e) => startHandle(e, { kind: "resize", id: s.id, corner: [cx, cy], orig: structuredClone(s) })} />
              ))}
              {s.type !== "panel" && (
                <>
                  <line x1={s.w / 2} y1={0} x2={s.w / 2} y2={-hs * 2.6} stroke="#7c4dcc" strokeWidth={2} pointerEvents="none" />
                  <circle cx={s.w / 2} cy={-hs * 2.8} r={hs * 0.7} fill="#7c4dcc" stroke="#fff" strokeWidth={2} style={{ cursor: "grab" }}
                    onPointerDown={(e) => startHandle(e, { kind: "rotate", id: s.id, orig: structuredClone(s) })} />
                </>
              )}
            </>
          )}
        </g>
        {s.type === "bubble" && !["caption", "sfx"].includes(s.kind) && !s.locked && (
          <circle cx={s.tailX} cy={s.tailY} r={hs * 0.8} fill="#ffcf3f" stroke="#3a2763" strokeWidth={2} style={{ cursor: "crosshair" }}
            onPointerDown={(e) => startHandle(e, { kind: "tail", id: s.id })}>
            <title>Drag to point the tail</title>
          </circle>
        )}
      </g>
    );
  })() : null;

  const cursor = tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : "default";

  return (
    <div className="studio-editor">
      <AiPanel doodle={doodle} cast={cast} elements={els} selectedId={sel} onApply={applyAi} onChange={onChange} sourceHint={sourceHint} />

      <div className="studio-center">
        <div className="studio-toolbar">
          <div className="tb-group">
            <button className={tool === "select" ? "on" : ""} onClick={() => setTool("select")} title="Select & move (V)">↖ Select</button>
            <button className={tool === "pen" ? "on" : ""} onClick={() => setTool("pen")} title="Freehand pen (P)">✎ Pen</button>
            <button className={tool === "eraser" ? "on" : ""} onClick={() => setTool("eraser")} title="Erase pen strokes (E)">⌫ Eraser</button>
          </div>
          {tool !== "select" && (
            <div className="tb-group">
              {(["ink", "accent", "soft", "warm", "paper"] as const).map((c) => (
                <button key={c} className={`swatch ${penColor === c ? "on" : ""}`} style={{ background: tokenColor(theme, c.toUpperCase()) }} onClick={() => setPenColor(c)} title={c} />
              ))}
              <input type="range" min={2} max={24} value={penWidth} onChange={(e) => setPenWidth(+e.target.value)} title="Pen size" />
            </div>
          )}
          <div className="tb-group">
            <div className="menu-wrap">
              <button onClick={() => setMenu(menu === "char" ? null : "char")}>🧍 Character ▾</button>
              {menu === "char" && (
                <div className="menu grid">
                  {cast.length === 0 && <p className="muted">Add characters in the Cast tab first.</p>}
                  {cast.map((c) => (
                    <button key={c.id} className="menu-char" onClick={() => addCharacter(c.id)}>
                      <CharacterAvatar dna={c.dna} theme={theme} size={40} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="menu-wrap">
              <button onClick={() => setMenu(menu === "bubble" ? null : "bubble")}>💬 Bubble ▾</button>
              {menu === "bubble" && (
                <div className="menu">
                  {BUBBLES.map((b) => <button key={b.kind} onClick={() => addBubble(b)}>{b.label}</button>)}
                  <p className="muted small">Tip: select a character first and the tail points at them.</p>
                </div>
              )}
            </div>
            <div className="menu-wrap">
              <button onClick={() => setMenu(menu === "sticker" ? null : "sticker")}>✦ Sticker ▾</button>
              {menu === "sticker" && (
                <div className="menu grid stickers">
                  {STICKERS.map((s) => (
                    <button key={s.id} onClick={() => addSticker(s)} title={s.label}>
                      <svg viewBox={`0 0 ${s.vbW} ${s.vbH}`} width={40} height={40} dangerouslySetInnerHTML={{ __html: s.svg.replace(/"(INK|ACCENT|SOFT|PAPER|WARM)"/g, (_m, t) => `"${tokenColor(theme, t)}"`) }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => fileRef.current?.click()} title="Upload a photo or your own drawing">🖼 Image</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ""; }} />
            <div className="menu-wrap">
              <button onClick={() => setMenu(menu === "panels" ? null : "panels")}>▦ Panels ▾</button>
              {menu === "panels" && (
                <div className="menu">
                  {[1, 2, 3, 4].map((n) => <button key={n} onClick={() => setPanels(n)}>{n === 4 ? "2 × 2 grid" : `${n} panel${n > 1 ? "s" : ""}`}</button>)}
                  <button onClick={() => { commit(els.filter((e) => e.type !== "panel")); setMenu(null); }}>No frames</button>
                </div>
              )}
            </div>
          </div>
          <div className="tb-group">
            <button onClick={undo} disabled={!past.length} title="Undo (⌘Z)">↶</button>
            <button onClick={redo} disabled={!future.length} title="Redo (⇧⌘Z)">↷</button>
          </div>
          <div className="tb-group">
            <select value={doodle.theme} onChange={(e) => onChange((d) => { d.theme = e.target.value as ThemeId; })} title="Palette lock">
              {THEME_LIST.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={doodle.background} onChange={(e) => onChange((d) => { d.background = e.target.value as Doodle["background"]; })} title="Background">
              <option value="paper">Paper</option><option value="white">White</option><option value="soft">Tinted</option><option value="none">Transparent</option>
            </select>
            <div className="menu-wrap">
              <button onClick={() => setMenu(menu === "export" ? null : "export")}>⤓ ▾</button>
              {menu === "export" && (
                <div className="menu right">
                  <button onClick={() => void exportAs("png")}>Download PNG (2×)</button>
                  <button onClick={() => void exportAs("svg")}>Download SVG (vector)</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="studio-canvas-wrap">
          <svg
            ref={svgRef}
            className="studio-canvas"
            viewBox={`0 0 ${doodle.width} ${doodle.height}`}
            style={{ cursor, aspectRatio: `${doodle.width} / ${doodle.height}` }}
            onPointerDown={onCanvasDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            xmlns="http://www.w3.org/2000/svg"
          >
            <InkFilters id={fid} theme={theme} />
            <rect width={doodle.width} height={doodle.height} fill={doodle.background === "none" ? "url(#checker)" : backgroundFill(doodle, theme)} />
            <defs>
              <pattern id="checker" width="24" height="24" patternUnits="userSpaceOnUse" data-editor-only>
                <rect width="24" height="24" fill="#fff" /><rect width="12" height="12" fill="#eee" /><rect x="12" y="12" width="12" height="12" fill="#eee" />
              </pattern>
            </defs>
            {els.map((el) => (
              <g key={el.id} onPointerDown={(e) => onElementDown(e, el)} onDoubleClick={() => el.type === "bubble" && (textRef.current?.focus(), textRef.current?.select())}
                style={{ cursor: tool === "select" ? (el.locked ? "default" : "move") : undefined }} pointerEvents={tool === "select" ? (el.type === "panel" ? "stroke" : "visiblePainted") : "none"}>
                <ElementView el={el} theme={theme} cast={castMap} filterId={fid} />
              </g>
            ))}
            {penPreview && (
              <polyline data-editor-only points={penPreview.join(" ")} fill="none" stroke={tokenColor(theme, penColor.toUpperCase())} strokeWidth={penWidth} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {chrome}
          </svg>
          <p className="canvas-hint">
            {tool === "select" ? "Click to select · drag to move · corners resize · purple dot rotates · yellow dot aims a bubble's tail · ⌘Z undo · ⌘D duplicate · [ ] layer order" : tool === "pen" ? "Draw freehand. Strokes are vector — select them later to move or resize." : "Drag over pen strokes to erase them."}
          </p>
        </div>
      </div>

      <aside className="studio-inspector">
        {selected ? (
          <Inspector el={selected} cast={cast} theme={doodle.theme} textRef={textRef}
            onPatch={(fn) => patch(selected.id, fn)} onRemove={() => remove(selected.id)} onDuplicate={() => duplicate(selected.id)} onOrder={(d) => reorder(selected.id, d)} />
        ) : (
          <div className="insp-empty">
            <h4>Doodle</h4>
            <label>Title<input value={doodle.title} onChange={(e) => onChange((d) => { d.title = e.target.value; })} /></label>
            <p className="muted small">Select anything on the canvas to edit it — poses, expressions, bubble text, colours. Or ask the AI on the left.</p>
          </div>
        )}
        <Layers els={els} sel={sel} cast={castMap} onSelect={(id) => { setSel(id); setTool("select"); }}
          onToggle={(id, key) => patch(id, (e) => ({ ...e, [key]: !e[key] }))} />
      </aside>
    </div>
  );
}

function elName(e: DoodleEl, cast: Map<string, Character>) {
  switch (e.type) {
    case "character": return `🧍 ${cast.get(e.charId)?.name ?? "?"}`;
    case "bubble": return `💬 ${e.text.slice(0, 22) || e.kind}`;
    case "art": return `✦ ${e.label || "drawing"}`;
    case "image": return "🖼 image";
    case "stroke": return "✎ pen stroke";
    case "panel": return "▭ panel";
  }
}

function Layers({ els, sel, cast, onSelect, onToggle }: {
  els: DoodleEl[]; sel: string | null; cast: Map<string, Character>; onSelect: (id: string) => void; onToggle: (id: string, k: "hidden" | "locked") => void;
}) {
  return (
    <div className="layers">
      <h4>Layers <span className="muted small">top first</span></h4>
      <ul>
        {[...els].reverse().map((e) => (
          <li key={e.id} className={e.id === sel ? "on" : ""} onClick={() => onSelect(e.id)}>
            <span className="ln">{elName(e, cast)}</span>
            <button title={e.hidden ? "Show" : "Hide"} onClick={(ev) => { ev.stopPropagation(); onToggle(e.id, "hidden"); }}>{e.hidden ? "◌" : "◉"}</button>
            <button title={e.locked ? "Unlock" : "Lock"} onClick={(ev) => { ev.stopPropagation(); onToggle(e.id, "locked"); }}>{e.locked ? "🔒" : "🔓"}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Inspector({ el, cast, theme, textRef, onPatch, onRemove, onDuplicate, onOrder }: {
  el: DoodleEl; cast: Character[]; theme: ThemeId; textRef: React.RefObject<HTMLTextAreaElement | null>;
  onPatch: (fn: (e: DoodleEl) => DoodleEl) => void; onRemove: () => void; onDuplicate: () => void; onOrder: (d: -1 | 1 | "top" | "bottom") => void;
}) {
  const t = THEMES[theme];
  // Local text state so typing doesn't create one undo step per keystroke.
  const [text, setText] = useState(el.type === "bubble" ? el.text : "");
  useEffect(() => { if (el.type === "bubble") setText(el.text); }, [el.id, el.type === "bubble" ? el.text : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="insp">
      {el.type === "character" && (
        <>
          <h4>Character</h4>
          <select value={el.charId} onChange={(e) => onPatch((x) => ({ ...x, charId: e.target.value }))}>
            {cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="lbl">Pose</div>
          <div className="chips">
            {POSES.map((p) => <button key={p} className={el.pose === p ? "on" : ""} onClick={() => onPatch((x) => ({ ...x, pose: p }))}>{POSE_LABEL[p]}</button>)}
          </div>
          <div className="lbl">Expression</div>
          <div className="chips emoji">
            {EXPRESSIONS.map((x) => {
              const dna = cast.find((c) => c.id === el.charId)?.dna;
              return (
                <button key={x} className={el.expression === x ? "on" : ""} title={x} onClick={() => onPatch((e) => ({ ...e, expression: x }))}>
                  {dna ? <CharacterAvatar dna={dna} theme={t} size={34} expression={x} /> : EXPR_EMOJI[x]}
                </button>
              );
            })}
          </div>
          <button onClick={() => onPatch((x) => ({ ...x, facing: (x as { facing: string }).facing === "left" ? "right" : "left" }) as DoodleEl)}>⇋ Flip direction</button>
        </>
      )}
      {el.type === "bubble" && (
        <>
          <h4>Bubble</h4>
          <select value={el.kind} onChange={(e) => onPatch((x) => ({ ...x, kind: e.target.value as BubbleKind }))}>
            {BUBBLES.map((b) => <option key={b.kind} value={b.kind}>{b.label}</option>)}
          </select>
          <textarea ref={textRef} rows={3} value={text} onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== el.text && onPatch((x) => ({ ...x, text }))}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur(); }} />
          <label className="row">Size
            <input type="range" min={12} max={120} value={el.fontSize} onChange={(e) => onPatch((x) => ({ ...x, fontSize: +e.target.value }))} />
            <span className="small">{el.fontSize}</span>
          </label>
          {!["caption", "sfx"].includes(el.kind) && (
            <label className="row"><input type="checkbox" checked={!el.noTail} onChange={(e) => onPatch((x) => ({ ...x, noTail: !e.target.checked }))} /> Show tail / arrow</label>
          )}
        </>
      )}
      {el.type === "art" && (
        <>
          <h4>Drawing</h4>
          <label>Name<input value={el.label} onChange={(e) => onPatch((x) => ({ ...x, label: e.target.value }))} /></label>
          <p className="muted small">Want it different? Keep it selected and describe the change in the AI box — e.g. “make this a pressure cooker”.</p>
        </>
      )}
      {el.type === "image" && <h4>Image</h4>}
      {el.type === "stroke" && <h4>Pen stroke</h4>}
      {el.type === "panel" && <h4>Panel frame</h4>}

      {el.type !== "panel" && (
        <label className="row">Rotate
          <input type="range" min={-180} max={180} value={el.rotation} onChange={(e) => onPatch((x) => ({ ...x, rotation: +e.target.value }))} />
          <span className="small">{el.rotation}°</span>
        </label>
      )}
      <div className="btn-row">
        <button onClick={() => onOrder("top")} title="Bring to front">⤒</button>
        <button onClick={() => onOrder(1)} title="Forward ( ] )">↑</button>
        <button onClick={() => onOrder(-1)} title="Backward ( [ )">↓</button>
        <button onClick={() => onOrder("bottom")} title="Send to back">⤓</button>
        <button onClick={onDuplicate} title="Duplicate (⌘D)">⧉</button>
        <button className="danger" onClick={onRemove} title="Delete">🗑</button>
      </div>
    </div>
  );
}
