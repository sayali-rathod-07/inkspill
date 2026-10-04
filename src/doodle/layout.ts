import type { AiCharacterBrief } from "../types.ts";

export interface Rect { x: number; y: number; w: number; h: number }

/** Comic panel rectangles for a 1–4 panel strip. */
export function panelRects(n: number, W: number, H: number, margin = 24, gap = 20): Rect[] {
  const count = Math.max(1, Math.min(4, Math.round(n)));
  if (count === 4) {
    const w = (W - margin * 2 - gap) / 2, h = (H - margin * 2 - gap) / 2;
    return [0, 1, 2, 3].map((i) => ({ x: margin + (i % 2) * (w + gap), y: margin + Math.floor(i / 2) * (h + gap), w, h }));
  }
  const w = (W - margin * 2 - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: margin + i * (w + gap), y: margin, w, h: H - margin * 2 }));
}

/** Find which cast members a passage mentions, in order of first appearance. */
export function detectCharacters(text: string, cast: AiCharacterBrief[]): string[] {
  const hits: { id: string; at: number }[] = [];
  for (const c of cast) {
    const names = [c.name, c.name.split(" ")[0], ...c.aliases].filter((n) => n && n.length > 1);
    let best = -1;
    for (const n of names) {
      const m = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").exec(text);
      if (m && (best < 0 || m.index < best)) best = m.index;
    }
    if (best >= 0) hits.push({ id: c.id, at: best });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id);
}
