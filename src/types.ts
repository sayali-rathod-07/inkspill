// Shared data model — imported by both the web app and the server.

export type ThemeId = "storybook" | "purple-ink" | "sunday-strip" | "line-sketch" | "watercolor";
export type PaperId = "lavender" | "cream" | "white" | "mint" | "sky" | "blush" | "newsprint" | "parchment" | "night";

export const POSES = ["stand", "wave", "armsUp", "point", "run", "hold", "sit", "fall", "shrug", "hug"] as const;
export type Pose = (typeof POSES)[number];

export const EXPRESSIONS = [
  "neutral", "happy", "laugh", "sad", "crying", "angry", "shocked", "scared", "smirk", "sleepy", "love", "determined",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const HAIR_STYLES = [
  "short", "crew", "sidepart", "quiff", "undercut", "messy", "curtains", "spiky", "mohawk", "wavy", "afro", "manbun", "receding",
  "long", "ponytail", "bun", "braid", "bob", "curly", "bald", "balding",
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const OUTFITS = ["tshirt", "shirt", "kurta", "saree", "dress", "hoodie", "uniform", "salwar"] as const;
export type Outfit = (typeof OUTFITS)[number];

export const AGES = ["baby", "kid", "teen", "adult", "elder"] as const;
export type Age = (typeof AGES)[number];

export const ACCESSORIES = [
  "glasses", "mustache", "beard", "bindi", "bandaid", "halo", "horns", "earrings", "cap", "tie",
  "backpack", "baldspot", "scar", "blush", "freckles", "necklace", "watch", "dupatta", "stubble", "goatee",
] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export const PRINTS = ["none", "star", "heart", "fairy", "stripes"] as const;
export type ShirtPrint = (typeof PRINTS)[number];

export interface CharacterDNA {
  age: Age;
  build: "slim" | "average" | "round";
  skin: string;
  hair: HairStyle;
  hairColor: string;
  outfit: Outfit;
  outfitColor: string;
  bottomColor: string;
  print: ShirtPrint;
  accessories: Accessory[];
  /** Free-text "visual DNA" notes the AI reads (e.g. "smirks; half-devil half-angel"). */
  signature: string;
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  role: string;
  color: string;
  dna: CharacterDNA;
}

export type BubbleKind = "speech" | "thought" | "shout" | "whisper" | "caption" | "label" | "sfx";

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  locked?: boolean;
  hidden?: boolean;
  /** 0–1, default 1. */
  opacity?: number;
}

export interface PanelEl extends Box { type: "panel"; stroke?: string; fill?: string }
export interface CharacterEl extends Box {
  type: "character";
  charId: string;
  pose: Pose;
  expression: Expression;
  facing: "left" | "right";
  /** Changes to this character's look in this doodle only (on top of their saved Cast look). */
  look?: Partial<CharacterDNA>;
}
export interface BubbleEl extends Box {
  type: "bubble";
  kind: BubbleKind;
  text: string;
  fontSize: number;
  tailX: number;
  tailY: number;
  noTail?: boolean;
  fill?: string;
  textColor?: string;
  stroke?: string;
}
/** Hand-drawn vector art (AI-drawn props, stickers). Colours use theme tokens: INK, ACCENT, SOFT, PAPER, WARM. */
export interface ArtEl extends Box {
  type: "art";
  label: string;
  svg: string;
  vbW: number;
  vbH: number;
  /** Recolour the drawing's palette tokens for this element only. */
  palette?: Partial<Record<"INK" | "ACCENT" | "SOFT" | "PAPER" | "WARM", string>>;
}
export interface ImageEl extends Box { type: "image"; src: string }
export interface StrokeEl extends Box {
  type: "stroke";
  points: number[]; // local coords, flat [x0,y0,x1,y1,...]
  w0: number;
  h0: number;
  /** A palette token (ink, accent, soft, paper, warm) or any #hex colour. */
  color: string;
  width: number;
}

export type DoodleEl = PanelEl | CharacterEl | BubbleEl | ArtEl | ImageEl | StrokeEl;

export interface DoodleHistoryEntry {
  at: number;
  kind: "create" | "edit" | "note";
  prompt: string;
  reply: string;
}

export interface Doodle {
  id: string;
  title: string;
  theme: ThemeId;
  width: number;
  height: number;
  /** "paper" | "white" | "soft" | "none" or any #hex colour. */
  background: string;
  elements: DoodleEl[];
  sourceText?: string;
  history: DoodleHistoryEntry[];
  updatedAt: number;
}

export type BlockType = "text" | "doodle" | "scene" | "note" | "audio";
export interface Block {
  id: string;
  type: BlockType;
  text?: string;
  doodleId?: string;
  caption?: string;
  url?: string;
}

export interface Chapter {
  id: string;
  partId: string;
  title: string;
  status: "draft" | "revising" | "final";
  artDoodleId?: string;
  contentNote?: string;
  blocks: Block[];
}

export interface Part { id: string; title: string }

export interface CastMap {
  inFrontMatter: boolean;
  nodes: { charId: string; x: number; y: number }[];
  edges: { id: string; from: string; to: string; label: string }[];
  groups: { id: string; label: string; charIds: string[]; color: string }[];
}

export type TrimId = "5x8" | "5.5x8.5" | "6x9" | "7x10" | "8.5x8.5";

export interface BookDesign {
  page?: string;
  text?: string;
  accent?: string;
  cover?: string;
  coverText?: string;
}

export interface PublicUser { id: string; username: string; displayName: string }

export interface Book {
  id: string;
  /** Account that can edit this book. */
  ownerId?: string;
  /** "public" books appear in the library and anyone can read them. */
  visibility?: "public" | "private";
  title: string;
  subtitle: string;
  author: string;
  dedication: string;
  theme: ThemeId;
  paper: PaperId;
  trim: TrimId;
  characters: Character[];
  parts: Part[];
  chapters: Chapter[];
  doodles: Record<string, Doodle>;
  cast: CastMap;
  coverDoodleId?: string;
  /** Author's own page & cover colours (on top of the paper preset). */
  design?: BookDesign;
  /** Optional soundtrack (Spotify or YouTube link) readers can play while reading. */
  music?: { url: string; title: string };
  updatedAt: number;
}

export interface BookSummary {
  id: string; title: string; subtitle: string; author: string; updatedAt: number; chapters: number; words: number; coverSrc?: string;
  ownerName: string; ownerUsername: string; visibility: "public" | "private"; mine: boolean;
  readers: number;
}

export interface ReadStats {
  readers: number;
  opens: number;
  last7Days: number;
  finished: number;
  chapters: { id: string; title: string; readers: number }[];
  recent: { day: string; readers: number }[];
}

export interface ShareInfo { slug: string; chapterIds: string[]; hasPassword: boolean; publishedAt: number }

export interface ReaderComment { id: string; chapterId: string; name: string; text: string; quote?: string; at: number }

// ---- AI payloads ----
export interface AiCharacterBrief { id: string; name: string; aliases: string[]; role: string; dna: CharacterDNA }

export interface DoodleAiRequest {
  mode: "create" | "edit";
  text?: string;
  prompt?: string;
  panels: number;
  theme: ThemeId;
  width: number;
  height: number;
  characters: AiCharacterBrief[];
  current?: DoodleEl[];
  selectedId?: string;
}

export interface DoodleAiResponse { elements: DoodleEl[]; note: string; usedAi: boolean }

export type PolishMode = "punchline" | "timing" | "pacing" | "metaphor" | "dialogue" | "tighten";
export interface PolishSuggestion { excerpt: string; replacement: string; why: string }
export interface PolishResponse { note: string; suggestions: PolishSuggestion[] }
