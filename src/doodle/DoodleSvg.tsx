import { memo, useId, useMemo, type ReactNode } from "react";
import type { ArtEl, BubbleEl, Character, Doodle, DoodleEl, StrokeEl } from "../types.ts";
import { CharacterRig, RIG_H, RIG_W } from "./rig.tsx";
import { THEMES, mix, themeArt, tokenColor, type Theme } from "./theme.ts";
import { wrapText } from "../lib/textwrap.ts";
import { safeImage, sanitizeSvg } from "./sanitize.ts";

export const BUBBLE_FONTS: Record<BubbleEl["kind"], { family: string; weight: number }> = {
  speech: { family: "Patrick Hand", weight: 400 },
  thought: { family: "Patrick Hand", weight: 400 },
  whisper: { family: "Patrick Hand", weight: 400 },
  shout: { family: "Patrick Hand", weight: 400 },
  caption: { family: "Baloo 2", weight: 600 },
  label: { family: "Caveat", weight: 700 },
  sfx: { family: "Bangers", weight: 400 },
};

/** Wobbly hand-drawn line filter. */
export function InkFilters({ id, theme }: { id: string; theme: Theme }) {
  return (
    <defs>
      <filter id={`${id}-wob`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale={theme.wobble} />
      </filter>
    </defs>
  );
}

function tailBase(cx: number, cy: number, rx: number, ry: number, tx: number, ty: number, half: number) {
  const ang = Math.atan2((ty - cy) / ry, (tx - cx) / rx);
  const ex = cx + Math.cos(ang) * rx * 0.86, ey = cy + Math.sin(ang) * ry * 0.86;
  const px = -Math.sin(ang), py = Math.cos(ang);
  return { b1: [ex + px * half, ey + py * half], b2: [ex - px * half, ey - py * half], ang };
}

function BubbleText({ el, theme, color, maxW, maxH, cx, cy }: { el: BubbleEl; theme: Theme; color: string; maxW: number; maxH: number; cx: number; cy: number }) {
  const f = BUBBLE_FONTS[el.kind];
  const lhK = el.kind === "caption" ? 1.12 : 1.06;
  // Shrink the lettering until it fits inside the bubble.
  let fs = el.fontSize;
  let lines = wrapText(el.text || " ", `${f.weight} ${fs}px "${f.family}"`, Math.max(20, maxW));
  while (fs > 10 && lines.length * fs * lhK > maxH) {
    fs = Math.max(10, fs - 1.5);
    lines = wrapText(el.text || " ", `${f.weight} ${fs}px "${f.family}"`, Math.max(20, maxW));
  }
  const lh = fs * lhK;
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  if (el.kind === "sfx") {
    return (
      <text x={cx} y={y0} textAnchor="middle" dominantBaseline="central" fontFamily={f.family} fontSize={fs} letterSpacing={fs * 0.04}
        fill={theme.accent} stroke={theme.ink} strokeWidth={Math.max(3, fs * 0.09)} paintOrder="stroke" strokeLinejoin="round">
        {lines.map((ln, i) => <tspan key={i} x={cx} y={y0 + i * lh}>{ln}</tspan>)}
      </text>
    );
  }
  return (
    <text x={cx} textAnchor="middle" dominantBaseline="central" fontFamily={f.family} fontWeight={f.weight} fontSize={fs} fill={color}>
      {lines.map((ln, i) => <tspan key={i} x={cx} y={y0 + i * lh}>{ln}</tspan>)}
    </text>
  );
}

export function BubbleView({ el, theme }: { el: BubbleEl; theme: Theme }) {
  const { w, h } = el;
  const ink = theme.ink, paper = theme.paper;
  const sw = 3.2;
  const tx = el.tailX - el.x, ty = el.tailY - el.y;
  const cx = w / 2, cy = h / 2;
  const showTail = !el.noTail && !["caption", "sfx"].includes(el.kind) && (Math.abs(tx - cx) > w / 2 || Math.abs(ty - cy) > h / 2);
  const parts: ReactNode[] = [];

  if (el.kind === "speech" || el.kind === "whisper") {
    const dash = el.kind === "whisper" ? "7 6" : undefined;
    const r = Math.min(w, h) * 0.46;
    const { b1, b2 } = tailBase(cx, cy, w / 2, h / 2, tx, ty, Math.min(w, h) * 0.12);
    if (showTail) parts.push(<path key="t" d={`M${b1[0]},${b1[1]} Q${(b1[0] + tx) / 2},${(b1[1] + ty) / 2 - 4} ${tx},${ty} L${b2[0]},${b2[1]} Z`} fill={paper} stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeDasharray={dash} />);
    parts.push(<rect key="b" x={0} y={0} width={w} height={h} rx={r} ry={r} fill={paper} stroke={ink} strokeWidth={sw} strokeDasharray={dash} />);
    if (showTail) {
      const k = 0.18; // shrink the seam patch toward the tail's interior
      const m = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2];
      const s1 = [b1[0] + (m[0] - b1[0]) * k, b1[1] + (m[1] - b1[1]) * k], s2 = [b2[0] + (m[0] - b2[0]) * k, b2[1] + (m[1] - b2[1]) * k];
      const tip = [m[0] + (tx - m[0]) * 0.25, m[1] + (ty - m[1]) * 0.25];
      parts.push(<path key="seam" d={`M${s1[0]},${s1[1]} L${tip[0]},${tip[1]} L${s2[0]},${s2[1]} Z`} fill={paper} />);
    }
    parts.push(<BubbleText key="txt" el={el} theme={theme} color={ink} maxW={w - r * 0.7 - 12} maxH={h - 14} cx={cx} cy={cy} />);
  } else if (el.kind === "thought") {
    const n = Math.max(8, Math.round((Math.PI * (w + h)) / 2 / (Math.min(w, h) * 0.32)));
    let d = "";
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * (w / 2 - 8), y = cy + Math.sin(a) * (h / 2 - 8);
      if (i === 0) d += `M${x},${y}`;
      else {
        const pa = ((i - 1) / n) * Math.PI * 2;
        const px = cx + Math.cos(pa) * (w / 2 - 8), py = cy + Math.sin(pa) * (h / 2 - 8);
        const rr = Math.hypot(x - px, y - py) * 0.62;
        d += ` A${rr},${rr} 0 0 1 ${x},${y}`;
      }
    }
    if (showTail) {
      const { b1, b2 } = tailBase(cx, cy, w / 2, h / 2, tx, ty, 0);
      void b2;
      [0.25, 0.55, 0.82].forEach((t, i) => {
        const x = b1[0] + (tx - b1[0]) * t, y = b1[1] + (ty - b1[1]) * t;
        parts.push(<circle key={"c" + i} cx={x} cy={y} r={Math.min(w, h) * (0.09 - i * 0.025)} fill={paper} stroke={ink} strokeWidth={sw * 0.8} />);
      });
    }
    parts.push(<path key="b" d={d + "Z"} fill={paper} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />);
    parts.push(<BubbleText key="txt" el={el} theme={theme} color={ink} maxW={w * 0.72} maxH={h * 0.7} cx={cx} cy={cy} />);
  } else if (el.kind === "shout") {
    const n = 22;
    let d = "";
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const k = i % 2 ? 0.8 : 1;
      d += `${i ? "L" : "M"}${cx + Math.cos(a) * (w / 2) * k},${cy + Math.sin(a) * (h / 2) * k}`;
    }
    if (showTail) {
      const { b1, b2 } = tailBase(cx, cy, w / 2, h / 2, tx, ty, Math.min(w, h) * 0.1);
      parts.push(<path key="t" d={`M${b1[0]},${b1[1]} L${tx},${ty} L${b2[0]},${b2[1]} Z`} fill={paper} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />);
    }
    parts.push(<path key="b" d={d + "Z"} fill={paper} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />);
    parts.push(<BubbleText key="txt" el={el} theme={theme} color={ink} maxW={w * 0.66} maxH={h * 0.62} cx={cx} cy={cy} />);
  } else if (el.kind === "caption") {
    parts.push(<rect key="b" x={0} y={0} width={w} height={h} fill={mix(theme.soft, theme.paper, 0.2)} stroke={ink} strokeWidth={sw} />);
    parts.push(<BubbleText key="txt" el={el} theme={theme} color={ink} maxW={w - 20} maxH={h - 8} cx={cx} cy={cy} />);
  } else if (el.kind === "label") {
    if (!el.noTail) {
      const sx = tx < 0 ? 0 : tx > w ? w : cx;
      const sy = ty < 0 ? 0 : ty > h ? h : cy + h * 0.35;
      const mxp = (sx + tx) / 2 + (ty - sy) * 0.2, myp = (sy + ty) / 2 - (tx - sx) * 0.2;
      const ang = Math.atan2(ty - myp, tx - mxp);
      const ah = 12;
      parts.push(
        <g key="arrow" stroke={ink} strokeWidth={2.6} fill="none" strokeLinecap="round">
          <path d={`M${sx},${sy} Q${mxp},${myp} ${tx},${ty}`} />
          <path d={`M${tx - Math.cos(ang - 0.45) * ah},${ty - Math.sin(ang - 0.45) * ah} L${tx},${ty} L${tx - Math.cos(ang + 0.45) * ah},${ty - Math.sin(ang + 0.45) * ah}`} />
        </g>,
      );
    }
    parts.push(<BubbleText key="txt" el={el} theme={theme} color={ink} maxW={w} maxH={h * 1.2} cx={cx} cy={cy} />);
  } else {
    parts.push(<BubbleText key="txt" el={el} theme={theme} color={ink} maxW={w} maxH={h * 1.2} cx={cx} cy={cy} />);
  }
  return <>{parts}</>;
}

const ArtView = memo(function ArtView({ el, theme }: { el: ArtEl; theme: Theme }) {
  const html = useMemo(() => themeArt(sanitizeSvg(el.svg), theme), [el.svg, theme]);
  return <svg x={0} y={0} width={el.w} height={el.h} viewBox={`0 0 ${el.vbW} ${el.vbH}`} preserveAspectRatio="none" overflow="visible" dangerouslySetInnerHTML={{ __html: html }} />;
});

function StrokeView({ el, theme }: { el: StrokeEl; theme: Theme }) {
  const sx = el.w0 ? el.w / el.w0 : 1, sy = el.h0 ? el.h / el.h0 : 1;
  const p: string[] = [];
  for (let i = 0; i < el.points.length; i += 2) p.push(`${el.points[i] * sx},${el.points[i + 1] * sy}`);
  return <polyline points={p.join(" ")} fill="none" stroke={tokenColor(theme, el.color.toUpperCase())} strokeWidth={el.width} strokeLinecap="round" strokeLinejoin="round" />;
}

export function ElementView({ el, theme, cast, filterId }: { el: DoodleEl; theme: Theme; cast: Map<string, Character>; filterId: string }) {
  if (el.hidden) return null;
  const rot = el.rotation ? `rotate(${el.rotation} ${el.w / 2} ${el.h / 2})` : "";
  const tf = `translate(${el.x} ${el.y}) ${rot}`;
  switch (el.type) {
    case "panel":
      return <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke={theme.ink} strokeWidth={5} strokeLinejoin="round" filter={`url(#${filterId}-wob)`} />;
    case "character": {
      const ch = cast.get(el.charId);
      if (!ch) return <g transform={tf}><rect width={el.w} height={el.h} fill="none" stroke={theme.accent} strokeDasharray="6 6" /><text x={el.w / 2} y={el.h / 2} textAnchor="middle" fill={theme.accent} fontFamily="Patrick Hand">missing character</text></g>;
      const flip = el.facing === "left";
      return (
        <g transform={tf}>
          <g transform={`scale(${(flip ? -1 : 1) * (el.w / RIG_W)} ${el.h / RIG_H}) ${flip ? `translate(${-RIG_W} 0)` : ""}`} filter={`url(#${filterId}-wob)`}>
            <CharacterRig dna={ch.dna} pose={el.pose} expression={el.expression} theme={theme} />
          </g>
        </g>
      );
    }
    case "bubble": {
      // Tail coordinates are absolute; bubble rotation applies only to the body.
      return <g transform={`translate(${el.x} ${el.y})`}><g transform={rot}><BubbleView el={{ ...el, tailX: el.tailX, tailY: el.tailY }} theme={theme} /></g></g>;
    }
    case "art":
      return <g transform={tf} filter={`url(#${filterId}-wob)`}><ArtView el={el} theme={theme} /></g>;
    case "image":
      return <g transform={tf}><image href={safeImage(el.src)} width={el.w} height={el.h} preserveAspectRatio="xMidYMid slice" /></g>;
    case "stroke":
      return <g transform={tf}><StrokeView el={el} theme={theme} /></g>;
  }
}

export function backgroundFill(d: Doodle, theme: Theme) {
  return d.background === "white" ? "#ffffff" : d.background === "soft" ? mix(theme.soft, theme.paper, 0.5) : d.background === "paper" ? theme.paper : "none";
}

/** Static, print-quality rendering of a doodle. */
export const DoodleSvg = memo(function DoodleSvg({ doodle, cast, className, style, themeOverride }: {
  doodle: Doodle; cast: Character[]; className?: string; style?: React.CSSProperties; themeOverride?: Theme;
}) {
  const fid = "f" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const theme = themeOverride ?? THEMES[doodle.theme] ?? THEMES["purple-ink"];
  const map = useMemo(() => new Map(cast.map((c) => [c.id, c])), [cast]);
  return (
    <svg className={className} style={style} viewBox={`0 0 ${doodle.width} ${doodle.height}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={doodle.title}>
      <InkFilters id={fid} theme={theme} />
      {doodle.background !== "none" && <rect width={doodle.width} height={doodle.height} fill={backgroundFill(doodle, theme)} />}
      {doodle.elements.map((el) => <ElementView key={el.id} el={el} theme={theme} cast={map} filterId={fid} />)}
    </svg>
  );
});
