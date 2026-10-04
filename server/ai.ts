import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  ACCESSORIES, AGES, EXPRESSIONS, HAIR_STYLES, OUTFITS, POSES, PRINTS,
  type CharacterDNA, type DoodleAiRequest, type DoodleAiResponse, type DoodleEl, type PolishMode, type PolishResponse,
} from "../src/types.ts";
import { fallbackScene, panelRects } from "./fallback.ts";
import { sanitizeSvg } from "../src/doodle/sanitize.ts";

const CLAUDE_MODEL = "claude-opus-5-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// Tried in order when a model is overloaded (503) or out of free-tier quota (429).
const GEMINI_FALLBACKS = [GEMINI_MODEL, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-lite-latest"].filter((m, i, a) => a.indexOf(m) === i);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let anthropic: Anthropic | null = null;
let gemini: GoogleGenAI | null = null;

export type Provider = "anthropic" | "gemini";

/** Which AI service to use: AI_PROVIDER wins if set, otherwise whichever key is present (Claude first). */
export function aiProvider(): Provider | null {
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const pref = process.env.AI_PROVIDER?.toLowerCase();
  if (pref === "gemini" && hasGemini) return "gemini";
  if (pref === "anthropic" && hasClaude) return "anthropic";
  if (hasClaude) return "anthropic";
  if (hasGemini) return "gemini";
  return null;
}

export function aiEnabled() {
  return aiProvider() !== null;
}

interface AskOpts<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}

async function ask<T extends z.ZodType>(opts: AskOpts<T>): Promise<z.infer<T>> {
  return aiProvider() === "gemini" ? askGemini(opts) : askClaude(opts);
}

async function askClaude<T extends z.ZodType>(opts: AskOpts<T>): Promise<z.infer<T>> {
  anthropic ??= new Anthropic();
  // Streamed so long scenes never hit the SDK's non-streaming timeout guard.
  const stream = anthropic.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    messages: [{ role: "user", content: opts.user }],
  });
  let response;
  try {
    response = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env and restart.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("The AI is busy (rate limited). Wait a moment and try again.");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach the AI service. Check your internet connection.");
    throw e;
  }
  if (response.stop_reason === "refusal") throw new Error("The AI declined this request. Try rewording it.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI ran out of room. Try a simpler scene.");
  if (!response.parsed_output) throw new Error("The AI returned something unreadable. Please try again.");
  return response.parsed_output as z.infer<T>;
}

async function askGemini<T extends z.ZodType>(opts: AskOpts<T>): Promise<z.infer<T>> {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  let text: string | undefined;
  const call = (model: string, strictSchema: boolean) =>
    gemini!.models.generateContent({
      model,
      contents: strictSchema ? opts.user : `${opts.user}\n\nReply with JSON only, matching this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}`,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        ...(strictSchema ? { responseJsonSchema: jsonSchema } : {}),
        maxOutputTokens: opts.maxTokens ?? 16000,
      },
    });
  const busy = (e: unknown) => e instanceof ApiError && (e.status === 503 || e.status === 500 || e.status === 429);
  /** Try each model (with one quick retry when overloaded) until one answers. */
  const callWithFallbacks = async (strictSchema: boolean) => {
    let last: unknown;
    for (const model of GEMINI_FALLBACKS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await call(model, strictSchema);
        } catch (e) {
          last = e;
          if (!busy(e) && !(e instanceof ApiError && e.status === 404)) throw e;
          if (e instanceof ApiError && (e.status === 429 || e.status === 404)) break; // quota/unknown: next model
          await sleep(1500 * (attempt + 1));
        }
      }
    }
    throw last;
  };
  try {
    let res;
    try {
      res = await callWithFallbacks(true);
    } catch (e) {
      // Some Gemini models reject parts of a JSON Schema; fall back to describing it in the prompt.
      if (e instanceof ApiError && e.status === 400 && !/API key/i.test(e.message)) res = await callWithFallbacks(false);
      else throw e;
    }
    const finish = res.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS") throw new Error("The AI ran out of room. Try a simpler scene.");
    if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || res.promptFeedback?.blockReason) {
      throw new Error("Gemini declined this request. Try rewording it.");
    }
    text = res.text;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 400 && /API key/i.test(e.message)) throw new Error("Your Gemini API key was rejected. Check GEMINI_API_KEY in .env and restart.");
      if (e.status === 401 || e.status === 403) throw new Error("Your Gemini API key was rejected. Check GEMINI_API_KEY in .env and restart.");
      if (e.status === 429) throw new Error("Gemini's free-tier limit was reached. Wait a minute (or until tomorrow for the daily limit) and try again.");
      if (e.status === 404) throw new Error(`Gemini model "${GEMINI_MODEL}" wasn't found. Set GEMINI_MODEL in .env to a model your key can use.`);
      if (e.status >= 500) throw new Error("Google's free Gemini models are all overloaded right now. Try again in a minute.");
    }
    throw e;
  }
  let data: unknown;
  try {
    data = JSON.parse(text ?? "");
  } catch {
    throw new Error("The AI returned something unreadable. Please try again.");
  }
  const parsed = opts.schema.safeParse(data);
  if (!parsed.success) throw new Error("The AI's answer didn't match the expected format. Please try again.");
  return parsed.data as z.infer<T>;
}

// ---------------- Doodles ----------------

const SceneSchema = z.object({
  note: z.string().describe("One or two friendly sentences to the author about what you drew or changed."),
  panels: z.array(z.object({ id: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })),
  characters: z.array(z.object({
    id: z.string(),
    charId: z.string(),
    x: z.number(), y: z.number(), w: z.number(),
    rotation: z.number(),
    pose: z.enum(POSES),
    expression: z.enum(EXPRESSIONS),
    facing: z.enum(["left", "right"]),
  })),
  bubbles: z.array(z.object({
    id: z.string(),
    kind: z.enum(["speech", "thought", "shout", "whisper", "caption", "label", "sfx"]),
    text: z.string(),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    fontSize: z.number(),
    tailX: z.number(), tailY: z.number(),
    rotation: z.number(),
  })),
  art: z.array(z.object({
    id: z.string(),
    label: z.string(),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    rotation: z.number(),
    svg: z.string().describe('Inner SVG markup drawn in local coords 0..w by 0..h, or exactly "KEEP" to keep the existing drawing.'),
  })),
  order: z.array(z.string()).describe("Every element id, bottom layer first."),
});

const DOODLE_SYSTEM = `You are the illustrator inside InkSpill, a writing studio for an illustrated memoir told in comic/doodle strips (think Diary of a Wimpy Kid meets an Indian family sitcom). You compose doodle scenes as structured data. The app renders them; you never output raster images.

How a scene is built:
- The canvas is W x H pixels (given). y grows downward.
- panels: comic frames (rectangles). Keep content of each beat inside its panel.
- characters: drawn by the app from each person's saved visual DNA, so they always look identical across the book. You only choose placement (x, y = top-left of the figure box, w = width; height is always 1.5 x w and the feet touch the bottom of the box), pose, expression and facing. Kids should be ~70% of adult width. Use only charIds from the cast list. Don't put the same charId twice in one panel.
- bubbles: kind is speech | thought | shout | whisper | caption | label | sfx. Keep text short and punchy (comic-sized: under ~12 words; prefer the author's actual lines in quotes). tailX/tailY is where the tail points — aim it at the speaker's head (top ~15% of their box). caption = narration box; label = a handwritten name tag/annotation (tail = what the arrow points at); sfx = a big sound effect like SPLASH! or CRACK! (no tail). fontSize: 22–32 for speech, 60–90 for sfx. Make w/h large enough for the text (≈ 0.55 x fontSize px per character per line).
- Props must be recognisable at a glance: include each object's defining parts (a motorbike needs two wheels with spokes, a frame, seat, handlebars and headlight; a stove needs burners and knobs; a room needs a floor line and a wall feature like a window or door). Draw the ground/floor line in every panel and stand characters on it near the bottom of the panel.
- art: props, furniture, backgrounds, effects (steam, motion lines, splashes, stars). Draw them as inline SVG markup using only <path>, <circle>, <ellipse>, <rect>, <line>, <polyline>, <polygon>, <g>. Coordinates are LOCAL: 0..w horizontally, 0..h vertically. Doodle style: confident ink outlines (stroke-width 3–6, round caps/joins), simple shapes, a few hatching/motion lines, no gradients, no text, no images. Colours must be ONLY these tokens: INK (outlines), ACCENT (highlights, effects), SOFT (light fills), PAPER (white-ish fills), WARM (a secondary fill), or none. Example: <path d="M10 10 L90 10" stroke="INK" stroke-width="4" fill="none"/>. Keep each art piece under ~40 shapes. Put large background art (rooms, roads, bus windows) early in the order so characters sit on top.
- order: every id, back to front.

Storytelling: pick the funniest, most visual beat(s) from the text. One panel = one beat. Exaggerate expressions — this is comedy. Place characters on a believable ground line in each panel, leave room for bubbles at the top. Use sound effects and small effect marks (sweat drops, anger marks, motion lines) generously but tastefully.

When editing an existing scene: change only what the author asked; keep every other element's id, position and properties exactly as given, and use svg "KEEP" for art you aren't redrawing. Elements listed under "locked" (photos, freehand strokes) are not yours to change — work around them. If the author selected an element, focus the change on it.`;

function castBlock(req: DoodleAiRequest) {
  return req.characters
    .map((c) => `- charId "${c.id}": ${c.name}${c.aliases.length ? ` (also called ${c.aliases.join(", ")})` : ""} — ${c.role}. ${c.dna.age}, ${c.dna.outfit}, ${c.dna.hair} hair${c.dna.accessories.length ? `, ${c.dna.accessories.join(", ")}` : ""}. ${c.dna.signature}`)
    .join("\n");
}

function toElements(scene: z.infer<typeof SceneSchema>, prev: DoodleEl[]): DoodleEl[] {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  const out = new Map<string, DoodleEl>();
  const uid = (id: string) => (id && !out.has(id) ? id : nanoid(6));
  for (const p of scene.panels) {
    const id = uid(p.id);
    out.set(id, { id, type: "panel", x: p.x, y: p.y, w: p.w, h: p.h, rotation: 0 });
  }
  for (const c of scene.characters) {
    const id = uid(c.id);
    out.set(id, { id, type: "character", charId: c.charId, x: c.x, y: c.y, w: c.w, h: c.w * 1.5, rotation: c.rotation, pose: c.pose, expression: c.expression, facing: c.facing });
  }
  for (const b of scene.bubbles) {
    const id = uid(b.id);
    out.set(id, { id, type: "bubble", kind: b.kind, text: b.text, x: b.x, y: b.y, w: b.w, h: b.h, fontSize: b.fontSize, tailX: b.tailX, tailY: b.tailY, rotation: b.rotation, noTail: b.kind === "sfx" || b.kind === "caption" });
  }
  for (const a of scene.art) {
    const id = uid(a.id);
    const old = prevById.get(a.id);
    if (a.svg.trim() === "KEEP" && old?.type === "art") {
      out.set(id, { ...old, id, x: a.x, y: a.y, w: a.w, h: a.h, rotation: a.rotation, label: a.label });
    } else {
      out.set(id, { id, type: "art", label: a.label, x: a.x, y: a.y, w: a.w, h: a.h, rotation: a.rotation, svg: sanitizeSvg(a.svg), vbW: a.w, vbH: a.h });
    }
  }
  enforceCharacterScale([...out.values()]);
  const ordered: DoodleEl[] = [];
  for (const id of scene.order) {
    const el = out.get(id);
    if (el) { ordered.push(el); out.delete(id); }
  }
  return [...ordered, ...out.values()];
}

/** Keep figures readable: a character shouldn't be a speck inside its panel. Grows small ones from their feet. */
function enforceCharacterScale(els: DoodleEl[]) {
  const panels = els.filter((e) => e.type === "panel");
  for (const c of els) {
    if (c.type !== "character") continue;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const panel = panels.find((p) => cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) ?? panels[0];
    const refH = panel ? panel.h : 640;
    const minH = refH * 0.42; // the rig already draws kids shorter inside the same box
    if (c.h >= minH) continue;
    const k = minH / c.h;
    const footX = c.x + c.w / 2, footY = c.y + c.h;
    c.w *= k; c.h *= k;
    c.x = footX - c.w / 2;
    c.y = footY - c.h;
    if (panel) {
      c.x = Math.max(panel.x, Math.min(c.x, panel.x + panel.w - c.w));
      c.y = Math.max(panel.y, Math.min(c.y, panel.y + panel.h - c.h));
    }
  }
}

export async function doodleScene(req: DoodleAiRequest): Promise<DoodleAiResponse> {
  if (!aiEnabled()) {
    if (req.mode === "edit") {
      throw new Error("Prompt editing needs an AI key. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to the .env file and restart — or edit by hand with the tools.");
    }
    return { elements: fallbackScene(req), note: "Laid out automatically from your text (no AI key set). Drag things around, or add an API key for fully AI-drawn scenes.", usedAi: false };
  }

  const W = req.width, H = req.height;
  const cast = castBlock(req);
  let user: string;
  const prev = req.current ?? [];

  if (req.mode === "create") {
    const rects = panelRects(req.panels, W, H);
    user = `Canvas: ${W} x ${H}. Theme: ${req.theme}.
Use exactly ${req.panels} panel(s) at these rects: ${JSON.stringify(rects)}.

Cast you may draw:
${cast}

The passage to illustrate:
"""
${req.text ?? ""}
"""
${req.prompt ? `\nAuthor's direction: ${req.prompt}` : ""}
Compose the doodle strip.`;
  } else {
    const editable = prev.filter((e) => e.type !== "image" && e.type !== "stroke");
    const locked = prev
      .filter((e) => e.type === "image" || e.type === "stroke")
      .map((e) => ({ id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) }));
    const compact = editable.map((e) => {
      const { locked: _l, hidden: _h, ...rest } = e as DoodleEl & { locked?: boolean; hidden?: boolean };
      if (rest.type === "art") return { ...rest, svg: rest.svg.length > 1800 ? "(existing drawing — reply KEEP to keep it)" : rest.svg };
      return rest;
    });
    user = `Canvas: ${W} x ${H}. Theme: ${req.theme}.

Cast you may draw:
${cast}

Current scene (editable elements, back to front):
${JSON.stringify(compact)}

Locked (do not include in your reply; avoid covering them): ${JSON.stringify(locked)}
${req.selectedId ? `\nThe author has selected element "${req.selectedId}" — apply the change to it unless the request clearly means something else.` : ""}
${req.text ? `\nThe passage this doodle illustrates:\n"""\n${req.text}\n"""` : ""}

Author's request: ${req.prompt}

Return the full updated scene.`;
  }

  const scene = await ask({ system: DOODLE_SYSTEM, user, schema: SceneSchema, effort: "medium", maxTokens: 32000 });
  let elements = toElements(scene, prev);
  if (req.mode === "edit") {
    // Re-insert locked elements (photos, freehand strokes) at their original layer positions.
    const lockedEls = prev.filter((e) => e.type === "image" || e.type === "stroke");
    for (const el of lockedEls) {
      const idx = prev.indexOf(el);
      elements.splice(Math.min(idx, elements.length), 0, el);
    }
  }
  return { elements, note: scene.note, usedAi: true };
}

// ---------------- Writing polish ----------------

const PolishSchema = z.object({
  note: z.string().describe("One short, encouraging sentence on the passage overall."),
  suggestions: z.array(z.object({
    excerpt: z.string().describe("An exact, verbatim substring of the passage to change."),
    replacement: z.string(),
    why: z.string().describe("Under 20 words."),
  })),
});

const POLISH_GOALS: Record<PolishMode, string> = {
  punchline: "Sharpen punchlines: find the jokes and make the landing hit harder (word order, ending on the funny word, cutting throat-clearing).",
  timing: "Improve comic timing: beats, pauses, short sentences before reveals, rule-of-three, callbacks.",
  pacing: "Improve pacing: tighten slow stretches, add a breath before big moments, vary sentence length.",
  metaphor: "Offer vivid, culturally specific scene-setting metaphors and similes that fit this voice (Indian middle-class household, school, hostel life).",
  dialogue: "Make dialogue snappier and more in-character; keep Hinglish flavour where it exists.",
  tighten: "Trim redundancy and filler without losing personality.",
};

export async function polish(mode: PolishMode, text: string, context: string): Promise<PolishResponse> {
  if (!aiEnabled()) throw new Error("The polish copilot needs an AI key. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to .env and restart.");
  const system = `You are a gentle comedy editor for a first-time memoir author writing a funny, heartfelt illustrated memoir in Indian English. Your job is to suggest small, surgical improvements — never rewrite the passage, never flatten the author's natural voice, slang, or quirks, and never add events that didn't happen. Offer at most 5 suggestions; fewer is fine if the passage already works. Each excerpt must be copied verbatim from the passage so the app can find and replace it.`;
  const user = `Goal: ${POLISH_GOALS[mode]}

${context ? `Surrounding context (for reference only):\n"""\n${context}\n"""\n\n` : ""}Passage to improve:
"""
${text}
"""`;
  const out = await ask({ system, user, schema: PolishSchema, effort: "medium" });
  return { note: out.note, suggestions: out.suggestions.filter((s) => text.includes(s.excerpt) && s.excerpt !== s.replacement) };
}

// ---------------- Character DNA from a description ----------------

const DnaSchema = z.object({
  age: z.enum(AGES),
  build: z.enum(["slim", "average", "round"]),
  skin: z.string().describe("hex colour"),
  hair: z.enum(HAIR_STYLES),
  hairColor: z.string().describe("hex colour"),
  outfit: z.enum(OUTFITS),
  outfitColor: z.string().describe("hex colour"),
  bottomColor: z.string().describe("hex colour"),
  print: z.enum(PRINTS),
  accessories: z.array(z.enum(ACCESSORIES)),
  signature: z.string().describe("One or two sentences of distinctive visual traits and attitude for future illustrations."),
});

export async function characterDna(name: string, description: string): Promise<CharacterDNA> {
  if (!aiEnabled()) throw new Error("Needs an AI key in .env (GEMINI_API_KEY or ANTHROPIC_API_KEY).");
  return ask({
    system: "You design consistent doodle characters for an illustrated memoir. Map the description onto the app's fixed character options as faithfully as possible.",
    user: `Character: ${name}\nDescription: ${description}`,
    schema: DnaSchema,
    effort: "low",
    maxTokens: 4000,
  });
}
