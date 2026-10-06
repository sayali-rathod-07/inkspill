import type { PaperId, ThemeId } from "../types.ts";

export interface Theme {
  id: ThemeId;
  name: string;
  blurb: string;
  ink: string;
  accent: string;
  soft: string;
  paper: string;
  warm: string;
  /** How a character's own colour is rendered in this theme. */
  fill: (hex: string) => string;
  fillOpacity: number;
  wobble: number;
  watercolor?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [200, 200, 200];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
export const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};

export const THEMES: Record<ThemeId, Theme> = {
  storybook: {
    id: "storybook", name: "Storybook Colour", blurb: "Full colour with soft ink lines — every colour shows",
    ink: "#2b2433", accent: "#ff5a3c", soft: "#fde7c8", paper: "#fffdf8", warm: "#ffc83d",
    fill: (hex) => mix(hex, "#fffdf8", 0.06), fillOpacity: 1, wobble: 1.3,
  },
  "purple-ink": {
    id: "purple-ink", name: "Purple Ink", blurb: "Everything in shades of purple (colours become purple tints)",
    ink: "#3a2763", accent: "#7c4dcc", soft: "#ddd0f3", paper: "#fbf8ff", warm: "#c7b2ee",
    // Monochrome purple: keep each colour's lightness, swap its hue for lavender.
    fill: (hex) => mix("#5a3d9e", "#fbf8ff", Math.min(1, 0.18 + lum(hex) * 0.9)),
    fillOpacity: 1, wobble: 1.6,
  },
  "sunday-strip": {
    id: "sunday-strip", name: "Sunday Strip", blurb: "Bold black lines, bright newspaper colour",
    ink: "#1b1b1f", accent: "#e63946", soft: "#ffe9a8", paper: "#fffdf6", warm: "#ffb35c",
    fill: (hex) => hex, fillOpacity: 1, wobble: 0.6,
  },
  "line-sketch": {
    id: "line-sketch", name: "Line Sketch", blurb: "Pencil on white (colours become greys)",
    ink: "#34343a", accent: "#6b6b75", soft: "#ececf0", paper: "#ffffff", warm: "#dcdce2",
    fill: (hex) => mix("#8a8a94", "#ffffff", Math.min(1, 0.45 + lum(hex) * 0.6)),
    fillOpacity: 1, wobble: 2.2,
  },
  watercolor: {
    id: "watercolor", name: "Watercolour", blurb: "Soft washes, brown ink",
    ink: "#4b3a2e", accent: "#d0675a", soft: "#f4dfc6", paper: "#fffaf0", warm: "#e8b98a",
    fill: (hex) => mix(hex, "#fffaf0", 0.25), fillOpacity: 0.78, wobble: 1.4, watercolor: true,
  },
};

export const THEME_LIST = Object.values(THEMES);

/** Styles that replace real colours with tints (so picked colours won't show as-is). */
export const isMonochrome = (id: ThemeId) => id === "purple-ink" || id === "line-sketch";

/** A theme with some palette tokens swapped (for per-element recolouring). */
export function withPalette(t: Theme, p?: Partial<Record<"INK" | "ACCENT" | "SOFT" | "PAPER" | "WARM", string>>): Theme {
  if (!p || !Object.keys(p).length) return t;
  return { ...t, ink: p.INK ?? t.ink, accent: p.ACCENT ?? t.accent, soft: p.SOFT ?? t.soft, paper: p.PAPER ?? t.paper, warm: p.WARM ?? t.warm };
}

export const tokenColor = (t: Theme, token: string): string => {
  switch (token.toUpperCase()) {
    case "INK": return t.ink;
    case "ACCENT": return t.accent;
    case "SOFT": return t.soft;
    case "PAPER": return t.paper;
    case "WARM": return t.warm;
    default: return token;
  }
};

/** Swap colour tokens (and stray hex colours) in AI/sticker art for the active palette. */
export function themeArt(svg: string, t: Theme): string {
  return svg.replace(/(fill|stroke)="([^"]*)"/g, (_m, attr: string, val: string) => {
    const v = val.trim();
    if (!v || v === "none" || v === "transparent" || v === "currentColor") return `${attr}="${v || "none"}"`;
    if (/^(INK|ACCENT|SOFT|PAPER|WARM)$/i.test(v)) return `${attr}="${tokenColor(t, v)}"`;
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return `${attr}="${attr === "stroke" && lum(v) < 0.35 ? t.ink : t.fill(v)}"`;
    if (/^(black)$/i.test(v)) return `${attr}="${t.ink}"`;
    if (/^(white)$/i.test(v)) return `${attr}="${t.paper}"`;
    return `${attr}="${attr === "stroke" ? t.ink : t.soft}"`;
  });
}

export interface Paper { id: PaperId; name: string; color: string; ink: string; grain: number; fiber: string }
export const PAPERS: Record<PaperId, Paper> = {
  lavender: { id: "lavender", name: "Lavender", color: "#f1ebf9", ink: "#2b2140", grain: 0.07, fiber: "#b9a6dc" },
  cream: { id: "cream", name: "Cream eggshell", color: "#f8f1e1", ink: "#2c241b", grain: 0.06, fiber: "#d8c8a6" },
  newsprint: { id: "newsprint", name: "Newsprint", color: "#ecebe6", ink: "#232323", grain: 0.11, fiber: "#b9b8b0" },
  parchment: { id: "parchment", name: "Vintage parchment", color: "#f0e2c2", ink: "#3a2c1a", grain: 0.13, fiber: "#c9ad78" },
};
