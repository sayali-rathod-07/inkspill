import { nanoid } from "nanoid";
import type { DoodleAiRequest, DoodleEl, Expression, Pose } from "../src/types.ts";
import { detectCharacters, panelRects } from "../src/doodle/layout.ts";

export { panelRects };

const MOODS: [RegExp, Expression][] = [
  [/\b(cr(y|ied|ying)|sob|tears|scream)/i, "crying"],
  [/\b(angry|wrath|furious|scold|yell)/i, "angry"],
  [/\b(terrif|panic|scared|afraid|fear|kill us)/i, "scared"],
  [/\b(shock|horror|stopped|slipped|fell)/i, "shocked"],
  [/\b(laugh|giggl|funny)/i, "laugh"],
  [/\b(smirk|confident|got this)/i, "smirk"],
  [/\b(happy|thrilled|ecstatic|love|hug)/i, "happy"],
  [/\b(sad|lonely|alone|hopeless)/i, "sad"],
];
const POSES: [RegExp, Pose][] = [
  [/\b(ran|run|running|chase)/i, "run"], [/\b(fell|fall|tipped)/i, "fall"], [/\b(point)/i, "point"],
  [/\b(hug|embrace)/i, "hug"], [/\b(lift|carry|holding|vessel)/i, "hold"], [/\b(sat|sitting|sit)\b/i, "sit"],
];

const pick = <T,>(text: string, table: [RegExp, T][], dflt: T) => table.find(([re]) => re.test(text))?.[1] ?? dflt;

/** Simple non-AI layout: detected characters, quotes as bubbles, ALL-CAPS words as sound effects. */
export function fallbackScene(req: DoodleAiRequest): DoodleEl[] {
  const text = req.text ?? req.prompt ?? "";
  const rects = panelRects(req.panels, req.width, req.height);
  const ids = detectCharacters(text, req.characters);
  const cast = ids.length ? ids : req.characters.slice(0, 1).map((c) => c.id);
  const quotes = [...text.matchAll(/["“]([^"”]{2,90})["”]/g)].map((m) => m[1]);
  const sfx = [...text.matchAll(/\b([A-Z]{3,}[!.]?)/g)].map((m) => m[1].replace(/\.$/, "!")).filter((w) => !/^(JEE|KG|ABC)/.test(w));
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const els: DoodleEl[] = [];

  rects.forEach((r, i) => {
    els.push({ id: nanoid(6), type: "panel", ...r, rotation: 0 });
    const chunk = sentences.slice(Math.floor((i * sentences.length) / rects.length), Math.floor(((i + 1) * sentences.length) / rects.length)).join(" ") || text;
    const here = cast.slice(0, 3).length > 1 && rects.length > 1 ? cast.slice(i % cast.length).concat(cast).slice(0, 2) : cast.slice(0, 3);
    here.forEach((charId, k) => {
      const brief = req.characters.find((c) => c.id === charId);
      const kid = brief && ["kid", "baby", "teen"].includes(brief.dna.age);
      const w = Math.min(r.w / (here.length + 0.6), (r.h * 0.62) / 1.5) * (kid ? 0.78 : 1);
      const x = r.x + ((k + 0.5) * r.w) / here.length - w / 2;
      const y = r.y + r.h - 18 - w * 1.5;
      els.push({
        id: nanoid(6), type: "character", charId, x, y, w, h: w * 1.5, rotation: 0,
        pose: k === 0 ? pick(chunk, POSES, "stand") : "stand",
        expression: pick(chunk, MOODS, "neutral"),
        facing: k < here.length / 2 ? "right" : "left",
      });
    });
    const q = quotes[i];
    if (q) {
      const speaker = els.filter((e) => e.type === "character").at(-here.length) ?? null;
      const fs = 26, w = Math.min(r.w - 40, Math.max(160, Math.min(q.length, 26) * fs * 0.5 + 40));
      const lines = Math.ceil((q.length * fs * 0.5) / (w - 30));
      els.push({
        id: nanoid(6), type: "bubble", kind: q.endsWith("!") ? "shout" : "speech", text: q, x: r.x + 20, y: r.y + 20, w,
        h: Math.max(80, lines * fs * 1.25 + 40), fontSize: fs,
        tailX: speaker ? speaker.x + speaker.w / 2 : r.x + r.w / 2, tailY: speaker ? speaker.y + speaker.h * 0.1 : r.y + r.h / 2, rotation: 0,
      });
    }
    if (sfx[i]) {
      els.push({ id: nanoid(6), type: "bubble", kind: "sfx", text: sfx[i], x: r.x + r.w - 260, y: r.y + 30, w: 240, h: 100, fontSize: 70, tailX: 0, tailY: 0, rotation: -8, noTail: true });
    } else if (!q && chunk) {
      const cap = chunk.length > 70 ? chunk.slice(0, 67).replace(/\s\S*$/, "") + "…" : chunk;
      els.push({ id: nanoid(6), type: "bubble", kind: "caption", text: cap, x: r.x + 16, y: r.y + 16, w: r.w - 32, h: 70, fontSize: 22, tailX: 0, tailY: 0, rotation: 0, noTail: true });
    }
  });
  return els;
}
