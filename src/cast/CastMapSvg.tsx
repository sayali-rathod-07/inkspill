import type { PointerEvent as RPointerEvent } from "react";
import type { Book } from "../types.ts";
import { CharacterRig, headFrame } from "../doodle/rig.tsx";
import { THEMES, mix } from "../doodle/theme.ts";

export const MAP_W = 1040;
export const MAP_H = 440;
const NODE_R = 44;

/** The cast & relationship map (front-matter page and editor share this). */
export function CastMapSvg({ book, selected, linkFrom, onNodeDown, onNodeClick, onEdgeClick, className }: {
  book: Book;
  selected?: string | null;
  linkFrom?: string | null;
  onNodeDown?: (e: RPointerEvent, charId: string) => void;
  onNodeClick?: (charId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  className?: string;
}) {
  const t = THEMES[book.theme];
  const pos = new Map(book.cast.nodes.map((n) => [n.charId, n]));
  const chars = new Map(book.characters.map((c) => [c.id, c]));

  return (
    <svg className={className} viewBox={`0 0 ${MAP_W} ${MAP_H}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="cm-wob"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="2.5" /></filter>
      </defs>
      {book.cast.groups.map((g) => {
        const ps = g.charIds.map((id) => pos.get(id)).filter(Boolean) as { x: number; y: number }[];
        if (!ps.length) return null;
        const x0 = Math.min(...ps.map((p) => p.x)) - NODE_R - 18, x1 = Math.max(...ps.map((p) => p.x)) + NODE_R + 18;
        const y0 = Math.min(...ps.map((p) => p.y)) - NODE_R - 30, y1 = Math.max(...ps.map((p) => p.y)) + NODE_R + 34;
        return (
          <g key={g.id}>
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={28} fill={mix(g.color, t.paper, 0.82)} stroke={g.color} strokeWidth={3} strokeDasharray="10 7" filter="url(#cm-wob)" />
            <text x={(x0 + x1) / 2} y={y0 - 8} textAnchor="middle" fontFamily="Baloo 2" fontWeight={800} fontSize={22} fill={t.ink}>{g.label}</text>
          </g>
        );
      })}
      {book.cast.edges.map((e) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - (Math.abs(a.x - b.x) > Math.abs(a.y - b.y) ? 26 : 0);
        return (
          <g key={e.id} onClick={() => onEdgeClick?.(e.id)} style={{ cursor: onEdgeClick ? "pointer" : undefined }}>
            <path d={`M${a.x},${a.y} Q${mx},${my - 20} ${b.x},${b.y}`} fill="none" stroke={t.ink} strokeWidth={10} strokeOpacity={0} />
            <path d={`M${a.x},${a.y} Q${mx},${my - 20} ${b.x},${b.y}`} fill="none" stroke={t.accent} strokeWidth={3} strokeLinecap="round" />
            {e.label && (
              <g>
                <rect x={mx - e.label.length * 4.6 - 8} y={my - 30} width={e.label.length * 9.2 + 16} height={24} rx={12} fill={t.paper} stroke={t.accent} strokeWidth={2} />
                <text x={mx} y={my - 13} textAnchor="middle" fontFamily="Patrick Hand" fontSize={17} fill={t.ink}>{e.label}</text>
              </g>
            )}
          </g>
        );
      })}
      {book.cast.nodes.map((n) => {
        const c = chars.get(n.charId);
        if (!c) return null;
        const on = selected === n.charId || linkFrom === n.charId;
        const hf = headFrame(c.dna);
        const k = (NODE_R * 0.5) / hf.R;
        return (
          <g key={n.charId} transform={`translate(${n.x} ${n.y})`} onPointerDown={(e) => onNodeDown?.(e, n.charId)} onClick={() => onNodeClick?.(n.charId)}
            style={{ cursor: onNodeDown ? "grab" : undefined }}>
            <circle r={NODE_R} fill={t.paper} stroke={on ? t.accent : t.ink} strokeWidth={on ? 5 : 3} />
            <clipPath id={`cm-clip-${n.charId}`}><circle r={NODE_R - 2} /></clipPath>
            <g clipPath={`url(#cm-clip-${n.charId})`}>
              <g transform={`scale(${k}) translate(${-hf.cx} ${-hf.cy - hf.R * 0.25})`}>
                <CharacterRig dna={c.dna} pose="stand" expression="happy" theme={t} portrait />
              </g>
            </g>
            <text y={NODE_R + 20} textAnchor="middle" fontFamily="Patrick Hand" fontSize={19} fill={t.ink}>{c.name.split(" ")[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}
