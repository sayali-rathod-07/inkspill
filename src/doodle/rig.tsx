// The character rig: draws any cast member from their saved "visual DNA" in any pose/expression.
// Every figure is pure SVG in a 200 x 300 box (feet on the bottom edge) so it stays identical across scenes.
import type { ReactNode } from "react";
import type { CharacterDNA, Expression, Pose } from "../types.ts";
import { mix, type Theme } from "./theme.ts";

export const RIG_W = 200;
export const RIG_H = 300;
const GROUND = 292;

type Pt = [number, number];
type Limb = [number, number]; // [upper angle, lower angle] in degrees from straight down; + = outward

interface PoseDef {
  armL: Limb; armR: Limb; legL: Limb; legR: Limb;
  tilt?: number; sit?: boolean; fall?: boolean; motion?: boolean;
}

const POSE_DEFS: Record<Pose, PoseDef> = {
  stand: { armL: [12, 4], armR: [12, 4], legL: [5, 2], legR: [5, 2] },
  wave: { armL: [12, 4], armR: [128, 172], legL: [5, 2], legR: [5, 2] },
  armsUp: { armL: [148, 172], armR: [148, 172], legL: [9, 4], legR: [9, 4] },
  point: { armL: [12, 4], armR: [84, 88], legL: [6, 2], legR: [8, 4] },
  run: { armL: [48, 118], armR: [-28, -110], legL: [38, -12], legR: [-6, 34], tilt: 7, motion: true },
  hold: { armL: [22, -108], armR: [22, -108], legL: [7, 3], legR: [7, 3] },
  sit: { armL: [18, -40], armR: [18, -40], legL: [82, -84], legR: [82, -84], sit: true },
  fall: { armL: [125, 160], armR: [105, 60], legL: [28, 50], legR: [-10, 20], fall: true, motion: true },
  shrug: { armL: [32, 112], armR: [32, 112], legL: [5, 2], legR: [5, 2] },
  hug: { armL: [78, 104], armR: [78, 104], legL: [6, 2], legR: [6, 2] },
};

const AGE: Record<CharacterDNA["age"], { s: number; head: number }> = {
  baby: { s: 0.5, head: 1.6 },
  kid: { s: 0.72, head: 1.38 },
  teen: { s: 0.9, head: 1.2 },
  adult: { s: 1, head: 1.14 },
  elder: { s: 0.96, head: 1.14 },
};

const rad = (d: number) => (d * Math.PI) / 180;
const seg = (from: Pt, len: number, ang: number, side: number): Pt => [from[0] + Math.sin(rad(ang)) * len * side, from[1] + Math.cos(rad(ang)) * len];
const pts = (...p: Pt[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");

interface Ctx { t: Theme; ink: string; sw: number; skin: string; hair: string; top: string; bottom: string; s: number }

function Tube({ path, width, color, c }: { path: Pt[]; width: number; color: string; c: Ctx }) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points={pts(...path)} stroke={c.ink} strokeWidth={width + c.sw * 2} />
      <polyline points={pts(...path)} stroke={color} strokeWidth={width} strokeOpacity={c.t.fillOpacity} />
    </g>
  );
}

export interface RigProps {
  dna: CharacterDNA;
  pose: Pose;
  expression: Expression;
  theme: Theme;
  /** Draw only head & shoulders (avatars). */
  portrait?: boolean;
}

/** Returns SVG content in a 200x300 coordinate box. */
export function CharacterRig({ dna, pose, expression, theme: t, portrait }: RigProps) {
  const P = POSE_DEFS[portrait ? "stand" : pose] ?? POSE_DEFS.stand;
  const age = AGE[dna.age] ?? AGE.adult;
  const s = age.s;
  const c: Ctx = {
    t, s, ink: t.ink, sw: Math.max(2, Math.min(3.3, 3.4 * s)),
    skin: t.fill(dna.skin), hair: t.fill(dna.hairColor), top: t.fill(dna.outfitColor), bottom: t.fill(dna.bottomColor),
  };
  const build = dna.build ?? "average";
  const sitDrop = P.sit ? 74 : 0;
  // Map adult-space coordinates to this character's scale (anchored at the ground).
  const M = (x: number, y: number): Pt => [100 + (x - 100) * s, GROUND + (y + sitDrop - GROUND) * s];

  const shW = (build === "round" ? 34 : build === "slim" ? 26 : 30);
  const hipW = (build === "round" ? 33 : build === "slim" ? 21 : 25);
  const shoulderY = 108, hipY = 192;
  const limbW = 14 * s * (build === "round" ? 1.15 : 1);
  const armLen = [44 * s, 42 * s], legLen = [50 * s, 48 * s];
  const R = 30 * s * age.head;
  const neckTop = M(100, 100);
  const head: Pt = [neckTop[0], neckTop[1] - R * 0.86];

  const shoulderL = M(100 - shW + 6, shoulderY + 6), shoulderR = M(100 + shW - 6, shoulderY + 6);
  const hipL = M(100 - hipW + 9, hipY - 4), hipR = M(100 + hipW - 9, hipY - 4);

  const arm = (from: Pt, a: Limb, side: number) => {
    const elbow = seg(from, armLen[0], a[0], side);
    return [from, elbow, seg(elbow, armLen[1], a[1], side)] as Pt[];
  };
  const leg = (from: Pt, a: Limb, side: number) => {
    const knee = seg(from, legLen[0], a[0], side);
    return [from, knee, seg(knee, legLen[1], a[1], side)] as Pt[];
  };
  const aL = arm(shoulderL, P.armL, -1), aR = arm(shoulderR, P.armR, 1);
  const lL = leg(hipL, P.legL, -1), lR = leg(hipR, P.legR, 1);

  const longSleeve = ["shirt", "kurta", "hoodie", "uniform", "salwar"].includes(dna.outfit);
  const sleeveFrac = longSleeve ? 1 : dna.outfit === "saree" ? 0.35 : 0.55;
  const sleeve = (a: Pt[]): Pt[] => {
    if (sleeveFrac >= 1) return [a[0], a[1], lerp(a[1], a[2], 0.82)];
    return [a[0], lerp(a[0], a[1], sleeveFrac * 1.4 > 1 ? 1 : sleeveFrac * 1.4)];
  };

  const skirtLong = dna.outfit === "saree";
  const legsVisible = !skirtLong;
  const legColor = dna.outfit === "dress" ? c.skin : c.bottom;

  // ---- torso shape ----
  const [tlx, tly] = M(100 - shW, shoulderY);
  const [trx] = M(100 + shW, shoulderY);
  const [blx, bly] = M(100 - hipW - 2, hipY);
  const [brx] = M(100 + hipW + 2, hipY);
  const bulge = build === "round" ? 9 * s : 3 * s;
  const torso = `M${tlx},${tly + 6 * s} Q${tlx},${tly} ${tlx + 8 * s},${tly} L${trx - 8 * s},${tly} Q${trx},${tly} ${trx},${tly + 6 * s} Q${brx + bulge},${(tly + bly) / 2} ${brx},${bly} L${blx},${bly} Q${blx - bulge},${(tly + bly) / 2} ${tlx},${tly + 6 * s} Z`;

  const extraBelow = (() => {
    if (dna.outfit === "kurta" || dna.outfit === "salwar") {
      const [, y2] = M(0, hipY + 34);
      return `M${blx},${bly - 1} L${blx - 6 * s},${y2} L${brx + 6 * s},${y2} L${brx},${bly - 1} Z`;
    }
    if (dna.outfit === "dress") {
      const [, y2] = M(0, hipY + 46);
      return `M${blx + 2},${bly - 8 * s} L${blx - 18 * s},${y2} Q100,${y2 + 8 * s} ${brx + 18 * s},${y2} L${brx - 2},${bly - 8 * s} Z`;
    }
    if (dna.outfit === "saree") {
      const yTop = bly - 14 * s;
      const yBot = P.sit ? M(0, hipY + 40)[1] : GROUND - 4;
      return `M${blx},${yTop} L${blx - 14 * s},${yBot} Q100,${yBot + 6 * s} ${brx + 14 * s},${yBot} L${brx},${yTop} Z`;
    }
    return "";
  })();

  const look = 3.5 * s;
  const fallRot = P.fall ? -72 : P.tilt ?? 0;
  const pivot = P.fall ? M(100, 240) : M(100, GROUND);

  const body = (
    <>
      {/* motion lines */}
      {P.motion && !portrait && (
        <g stroke={t.accent} strokeWidth={3} strokeLinecap="round" opacity={0.75}>
          <line x1={20} y1={150} x2={52} y2={150} />
          <line x1={12} y1={175} x2={48} y2={175} />
          <line x1={24} y1={200} x2={50} y2={200} />
        </g>
      )}
      {/* backpack (behind) */}
      {dna.accessories.includes("backpack") && (
        <rect x={M(100 - shW - 8, 0)[0]} y={M(0, shoulderY + 10)[1]} width={(shW * 2 + 16) * s} height={70 * s} rx={14 * s} fill={mix(c.top, t.ink, 0.25)} stroke={c.ink} strokeWidth={c.sw} />
      )}
      <HairBack dna={dna} head={head} R={R} c={c} />
      {/* legs */}
      {!portrait && legsVisible && (
        <>
          <Tube path={lL} width={limbW * 1.08} color={legColor} c={c} />
          <Tube path={lR} width={limbW * 1.08} color={legColor} c={c} />
        </>
      )}
      {!portrait && <Shoe at={lL[2]} c={c} side={-1} />}
      {!portrait && <Shoe at={lR[2]} c={c} side={1} />}
      {/* skirt / kurta hem */}
      {!portrait && extraBelow && <path d={extraBelow} fill={c.top} fillOpacity={t.fillOpacity} stroke={c.ink} strokeWidth={c.sw} strokeLinejoin="round" />}
      {!portrait && dna.outfit === "saree" && (
        <g stroke={c.ink} strokeWidth={c.sw * 0.6} strokeLinecap="round" opacity={0.6}>
          <line x1={100 - 4 * s} y1={bly} x2={100 - 10 * s} y2={GROUND - 10} />
          <line x1={100 + 4 * s} y1={bly} x2={100 + 4 * s} y2={GROUND - 10} />
          <line x1={100 + 12 * s} y1={bly} x2={100 + 18 * s} y2={GROUND - 10} />
        </g>
      )}
      {/* neck */}
      <rect x={neckTop[0] - 7 * s} y={neckTop[1] - 6 * s} width={14 * s} height={16 * s} fill={c.skin} stroke={c.ink} strokeWidth={c.sw} />
      {/* torso */}
      <path d={torso} fill={c.top} fillOpacity={t.fillOpacity} stroke={c.ink} strokeWidth={c.sw} strokeLinejoin="round" />
      <OutfitDetails dna={dna} c={c} M={M} shW={shW} shoulderY={shoulderY} hipY={hipY} />
      {/* arms: skin tube, then sleeve over it, then hands */}
      {!portrait && (
        <>
          <Tube path={aL} width={limbW} color={c.skin} c={c} />
          <Tube path={sleeve(aL)} width={limbW + 4 * s} color={c.top} c={c} />
          <Hand at={aL[2]} r={limbW * 0.62} c={c} />
          <Tube path={aR} width={limbW} color={c.skin} c={c} />
          <Tube path={sleeve(aR)} width={limbW + 4 * s} color={c.top} c={c} />
          <Hand at={aR[2]} r={limbW * 0.62} c={c} />
          {dna.accessories.includes("watch") && <rect x={lerp(aL[1], aL[2], 0.8)[0] - 5 * s} y={lerp(aL[1], aL[2], 0.8)[1] - 4 * s} width={10 * s} height={8 * s} rx={2} fill={t.accent} stroke={c.ink} strokeWidth={c.sw * 0.7} />}
        </>
      )}
      {dna.accessories.includes("dupatta") && (
        <path d={`M${tlx + 4 * s},${tly + 2} Q100,${tly + 40 * s} ${trx - 4 * s},${tly + 2} L${trx + 6 * s},${tly + 60 * s} L${trx - 6 * s},${tly + 64 * s}`} fill="none" stroke={mix(c.top, t.paper, 0.4)} strokeWidth={10 * s} strokeLinecap="round" />
      )}
      {/* head */}
      <circle cx={head[0] - R * 0.98} cy={head[1] + R * 0.08} r={R * 0.2} fill={c.skin} stroke={c.ink} strokeWidth={c.sw} />
      <circle cx={head[0] + R * 0.98} cy={head[1] + R * 0.08} r={R * 0.2} fill={c.skin} stroke={c.ink} strokeWidth={c.sw} />
      {dna.accessories.includes("earrings") && (
        <g fill={t.accent} stroke={c.ink} strokeWidth={c.sw * 0.5}>
          <circle cx={head[0] - R * 0.98} cy={head[1] + R * 0.4} r={R * 0.1} />
          <circle cx={head[0] + R * 0.98} cy={head[1] + R * 0.4} r={R * 0.1} />
        </g>
      )}
      <ellipse cx={head[0]} cy={head[1]} rx={R} ry={R * 1.02} fill={c.skin} stroke={c.ink} strokeWidth={c.sw} />
      <Face expr={expression} head={head} R={R} look={look} c={c} dna={dna} />
      <HairFront dna={dna} head={head} R={R} c={c} />
      <HeadAccessories dna={dna} head={head} R={R} c={c} />
      <ExpressionExtras expr={expression} head={head} R={R} c={c} />
    </>
  );

  return <g transform={fallRot ? `rotate(${fallRot} ${pivot[0]} ${pivot[1]})` : undefined}>{body}</g>;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function Hand({ at, r, c }: { at: Pt; r: number; c: Ctx }) {
  return <circle cx={at[0]} cy={at[1]} r={r} fill={c.skin} stroke={c.ink} strokeWidth={c.sw} />;
}

function Shoe({ at, c, side }: { at: Pt; c: Ctx; side: number }) {
  const w = 13 * c.s, h = 6.5 * c.s;
  return <ellipse cx={at[0] + side * 4 * c.s} cy={at[1] + 1} rx={w} ry={h} fill={mix(c.t.ink, c.t.paper, 0.15)} stroke={c.ink} strokeWidth={c.sw * 0.8} />;
}

function OutfitDetails({ dna, c, M, shW, shoulderY, hipY }: { dna: CharacterDNA; c: Ctx; M: (x: number, y: number) => Pt; shW: number; shoulderY: number; hipY: number }) {
  const s = c.s;
  const [cx, cy] = M(100, shoulderY);
  const chest = M(100, shoulderY + 40);
  const parts: ReactNode[] = [];
  const sw = c.sw * 0.75;
  if (["shirt", "uniform", "kurta", "salwar"].includes(dna.outfit)) {
    parts.push(<path key="col" d={`M${cx - 12 * s},${cy} L${cx},${cy + 14 * s} L${cx + 12 * s},${cy}`} fill="none" stroke={c.ink} strokeWidth={sw} strokeLinejoin="round" />);
    const end = M(100, dna.outfit === "kurta" || dna.outfit === "salwar" ? shoulderY + 44 : hipY - 4);
    parts.push(<line key="pl" x1={cx} y1={cy + 14 * s} x2={end[0]} y2={end[1]} stroke={c.ink} strokeWidth={sw} />);
    if (dna.outfit === "shirt" || dna.outfit === "uniform")
      for (let i = 0; i < 3; i++) parts.push(<circle key={"b" + i} cx={cx + 3 * s} cy={cy + (28 + i * 18) * s} r={1.8 * s} fill={c.ink} />);
  }
  if (dna.outfit === "uniform" || dna.accessories.includes("tie")) {
    parts.push(<path key="tie" d={`M${cx - 4 * s},${cy + 12 * s} L${cx + 4 * s},${cy + 12 * s} L${cx + 6 * s},${cy + 50 * s} L${cx},${cy + 58 * s} L${cx - 6 * s},${cy + 50 * s} Z`} fill={c.t.accent} stroke={c.ink} strokeWidth={sw} />);
  }
  if (dna.outfit === "hoodie") {
    parts.push(<path key="hood" d={`M${cx - 20 * s},${cy} Q${cx},${cy + 18 * s} ${cx + 20 * s},${cy}`} fill="none" stroke={c.ink} strokeWidth={sw} />);
    parts.push(<path key="pocket" d={`M${cx - 18 * s},${chest[1] + 22 * s} L${cx + 18 * s},${chest[1] + 22 * s} L${cx + 22 * s},${chest[1] + 40 * s} L${cx - 22 * s},${chest[1] + 40 * s} Z`} fill="none" stroke={c.ink} strokeWidth={sw} />);
    parts.push(<line key="s1" x1={cx - 5 * s} y1={cy + 8 * s} x2={cx - 6 * s} y2={cy + 28 * s} stroke={c.ink} strokeWidth={sw} />);
    parts.push(<line key="s2" x1={cx + 5 * s} y1={cy + 8 * s} x2={cx + 6 * s} y2={cy + 28 * s} stroke={c.ink} strokeWidth={sw} />);
  }
  if (dna.outfit === "saree") {
    const [lx, ly] = M(100 - shW + 2, shoulderY + 2);
    const [rx, ry] = M(100 + shW - 4, hipY + 6);
    parts.push(<path key="pallu" d={`M${lx},${ly} L${lx + 16 * s},${ly - 2} L${rx + 4 * s},${ry - 10 * s} L${rx - 12 * s},${ry}  Z`} fill={mix(c.top, c.t.ink, 0.18)} fillOpacity={c.t.fillOpacity} stroke={c.ink} strokeWidth={sw} strokeLinejoin="round" />);
    parts.push(<path key="border" d={`M${lx + 4 * s},${ly + 4 * s} L${rx - 6 * s},${ry - 4 * s}`} stroke={c.t.accent} strokeWidth={2.4 * s} strokeDasharray={`${3 * s} ${3 * s}`} />);
  }
  if (dna.accessories.includes("necklace")) {
    parts.push(<path key="neck" d={`M${cx - 10 * s},${cy - 1} Q${cx},${cy + 16 * s} ${cx + 10 * s},${cy - 1}`} fill="none" stroke={c.ink} strokeWidth={1.6 * s} strokeDasharray={`${1.5 * s} ${2.5 * s}`} />);
  }
  if (["tshirt", "dress"].includes(dna.outfit) && dna.print !== "none") {
    const [px, py] = [chest[0], chest[1] - 2 * s];
    const k = s;
    if (dna.print === "star") parts.push(<path key="pr" d={star(px, py, 12 * k, 5 * k)} fill={c.t.accent} stroke={c.ink} strokeWidth={sw * 0.8} />);
    if (dna.print === "heart") parts.push(<path key="pr" d={heart(px, py, 11 * k)} fill={c.t.accent} stroke={c.ink} strokeWidth={sw * 0.8} />);
    if (dna.print === "stripes") for (let i = -1; i <= 1; i++) parts.push(<line key={"st" + i} x1={px - 22 * k} x2={px + 22 * k} y1={py + i * 14 * k} y2={py + i * 14 * k} stroke={c.t.accent} strokeWidth={4 * k} />);
    if (dna.print === "fairy") {
      const neon = c.t.id === "sunday-strip" || c.t.id === "watercolor" ? "#7CFC5A" : c.t.accent;
      parts.push(
        <g key="pr" stroke={c.ink} strokeWidth={sw * 0.6}>
          <ellipse cx={px - 8 * k} cy={py - 2 * k} rx={7 * k} ry={10 * k} fill={neon} fillOpacity={0.55} transform={`rotate(-25 ${px - 8 * k} ${py - 2 * k})`} />
          <ellipse cx={px + 8 * k} cy={py - 2 * k} rx={7 * k} ry={10 * k} fill={neon} fillOpacity={0.55} transform={`rotate(25 ${px + 8 * k} ${py - 2 * k})`} />
          <path d={`M${px},${py - 4 * k} L${px - 6 * k},${py + 12 * k} L${px + 6 * k},${py + 12 * k} Z`} fill={neon} />
          <circle cx={px} cy={py - 8 * k} r={4 * k} fill={c.skin} />
        </g>,
      );
    }
  }
  return <>{parts}</>;
}

function star(cx: number, cy: number, r1: number, r2: number) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1, a = (Math.PI / 5) * i - Math.PI / 2;
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return d + "Z";
}
function heart(cx: number, cy: number, r: number) {
  return `M${cx},${cy + r} C${cx - r * 1.6},${cy - r * 0.2} ${cx - r * 0.7},${cy - r * 1.4} ${cx},${cy - r * 0.45} C${cx + r * 0.7},${cy - r * 1.4} ${cx + r * 1.6},${cy - r * 0.2} ${cx},${cy + r} Z`;
}

function HairBack({ dna, head: [hx, hy], R, c }: { dna: CharacterDNA; head: Pt; R: number; c: Ctx }) {
  const f = { fill: c.hair, stroke: c.ink, strokeWidth: c.sw, strokeLinejoin: "round" as const };
  switch (dna.hair) {
    case "long":
      return <path {...f} d={`M${hx - R * 1.05},${hy - R * 0.1} Q${hx - R * 1.25},${hy + R * 1.2} ${hx - R * 1.05},${hy + R * 1.75} L${hx + R * 1.05},${hy + R * 1.75} Q${hx + R * 1.25},${hy + R * 1.2} ${hx + R * 1.05},${hy - R * 0.1} Z`} />;
    case "braid":
      return (
        <g>
          <path {...f} d={`M${hx - R * 1.04},${hy} Q${hx - R * 1.15},${hy + R * 0.9} ${hx - R * 0.8},${hy + R * 1.05} L${hx + R * 0.8},${hy + R * 1.05} Q${hx + R * 1.15},${hy + R * 0.9} ${hx + R * 1.04},${hy} Z`} />
          {[0, 1, 2, 3].map((i) => <ellipse key={i} {...f} cx={hx + R * 0.95} cy={hy + R * (0.9 + i * 0.42)} rx={R * 0.22} ry={R * 0.26} />)}
        </g>
      );
    case "bob":
      return <path {...f} d={`M${hx - R * 1.1},${hy - R * 0.2} Q${hx - R * 1.2},${hy + R * 0.75} ${hx - R * 0.9},${hy + R * 0.9} L${hx + R * 0.9},${hy + R * 0.9} Q${hx + R * 1.2},${hy + R * 0.75} ${hx + R * 1.1},${hy - R * 0.2} Z`} />;
    case "ponytail":
      return <path {...f} d={`M${hx + R * 0.7},${hy - R * 0.85} Q${hx + R * 1.9},${hy - R * 0.9} ${hx + R * 1.6},${hy + R * 0.6} Q${hx + R * 1.5},${hy + R * 1.2} ${hx + R * 1.8},${hy + R * 1.5} Q${hx + R * 1.05},${hy + R * 1.35} ${hx + R * 1.15},${hy + R * 0.4} Q${hx + R * 1.2},${hy - R * 0.2} ${hx + R * 0.7},${hy - R * 0.45} Z`} />;
    case "bun":
      return <circle {...f} cx={hx + R * 0.15} cy={hy - R * 1.08} r={R * 0.42} />;
    case "afro":
      return <g>{Array.from({ length: 13 }, (_, i) => {
        const a = (i / 13) * Math.PI * 2;
        return <circle key={i} {...f} cx={hx + Math.cos(a) * R * 1.12} cy={hy - R * 0.32 + Math.sin(a) * R * 1.05} r={R * 0.42} />;
      })}<ellipse cx={hx} cy={hy - R * 0.32} rx={R * 1.2} ry={R * 1.12} fill={c.hair} /></g>;
    case "manbun":
      return <circle {...f} cx={hx + R * 0.55} cy={hy - R * 1.02} r={R * 0.34} />;
    case "curly":
      return <g>{Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI + (i / 8) * Math.PI;
        return <circle key={i} {...f} cx={hx + Math.cos(a) * R * 1.02} cy={hy - R * 0.1 + Math.sin(a) * R * 1.0} r={R * 0.34} />;
      })}</g>;
    default:
      return null;
  }
}

function HairFront({ dna, head: [hx, hy], R, c }: { dna: CharacterDNA; head: Pt; R: number; c: Ctx }) {
  const f = { fill: c.hair, stroke: c.ink, strokeWidth: c.sw, strokeLinejoin: "round" as const };
  // Control height chosen so the crown always reaches just above the top of the head.
  const capBase = (fringeY: number, sideY = 0.1) => {
    const top = (-1.06 - 0.25 * sideY) / 0.75;
    return `M${hx - R * 1.03},${hy + R * sideY} C${hx - R * 1.15},${hy + R * top} ${hx + R * 1.15},${hy + R * top} ${hx + R * 1.03},${hy + R * sideY} ` +
    `Q${hx + R * 0.85},${hy - R * 0.25} ${hx + R * 0.45},${hy - R * fringeY} Q${hx + R * 0.1},${hy - R * (fringeY - 0.12)} ${hx - R * 0.15},${hy - R * fringeY} ` +
    `Q${hx - R * 0.6},${hy - R * (fringeY - 0.18)} ${hx - R * 1.03},${hy + R * sideY} Z`;
  };
  switch (dna.hair) {
    case "bald":
      return <path d={`M${hx - R * 0.4},${hy - R * 0.75} q${R * 0.2},${-R * 0.12} ${R * 0.4},${-R * 0.08}`} stroke={c.t.paper} strokeWidth={c.sw} fill="none" opacity={0.8} strokeLinecap="round" />;
    case "balding":
      return (
        <g>
          <path {...f} d={`M${hx - R * 1.03},${hy + R * 0.15} Q${hx - R * 1.1},${hy - R * 0.55} ${hx - R * 0.72},${hy - R * 0.62} Q${hx - R * 0.78},${hy - R * 0.15} ${hx - R * 0.86},${hy + R * 0.15} Z`} />
          <path {...f} d={`M${hx + R * 1.03},${hy + R * 0.15} Q${hx + R * 1.1},${hy - R * 0.55} ${hx + R * 0.72},${hy - R * 0.62} Q${hx + R * 0.78},${hy - R * 0.15} ${hx + R * 0.86},${hy + R * 0.15} Z`} />
          <path d={`M${hx - R * 0.3},${hy - R * 0.78} q${R * 0.2},${-R * 0.1} ${R * 0.4},${-R * 0.05}`} stroke={c.t.paper} strokeWidth={c.sw} fill="none" strokeLinecap="round" />
        </g>
      );
    case "spiky": {
      let d = `M${hx - R * 1.03},${hy + R * 0.05}`;
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI + (i / n) * Math.PI;
        const r = i % 2 ? R * 1.45 : R * 1.02;
        d += ` L${hx + Math.cos(a) * r},${hy - R * 0.05 + Math.sin(a) * r}`;
      }
      d += ` L${hx + R * 1.03},${hy + R * 0.05} Q${hx + R * 0.4},${hy - R * 0.6} ${hx - R * 0.2},${hy - R * 0.45} Q${hx - R * 0.7},${hy - R * 0.3} ${hx - R * 1.03},${hy + R * 0.05} Z`;
      return <path {...f} d={d} />;
    }
    case "curly":
      return <path {...f} d={capBase(0.5, 0)} />;
    case "crew": {
      // Close buzz cut that follows the skull.
      const d = `M${hx - R * 1.02},${hy - R * 0.02} C${hx - R * 1.1},${hy - R * 1.44} ${hx + R * 1.1},${hy - R * 1.44} ${hx + R * 1.02},${hy - R * 0.02} L${hx + R * 0.88},${hy - R * 0.38} Q${hx},${hy - R * 0.62} ${hx - R * 0.88},${hy - R * 0.38} Z`;
      return <path {...f} d={d} fillOpacity={0.9} />;
    }
    case "sidepart":
      return (
        <g>
          <path {...f} d={`M${hx - R * 1.03},${hy + R * 0.05} C${hx - R * 1.12},${hy - R * 1.46} ${hx + R * 1.16},${hy - R * 1.48} ${hx + R * 1.05},${hy + R * 0.05} Q${hx + R * 0.98},${hy - R * 0.3} ${hx + R * 0.6},${hy - R * 0.36} Q${hx},${hy - R * 0.42} ${hx - R * 0.42},${hy - R * 0.86} L${hx - R * 0.55},${hy - R * 0.58} Q${hx - R * 0.88},${hy - R * 0.5} ${hx - R * 1.03},${hy + R * 0.05} Z`} />
          <path d={`M${hx - R * 0.42},${hy - R * 0.86} Q${hx - R * 0.44},${hy - R * 1.0} ${hx - R * 0.38},${hy - R * 1.08}`} stroke={c.ink} strokeWidth={c.sw * 0.6} fill="none" strokeLinecap="round" />
        </g>
      );
    case "quiff":
      return (
        <g>
          <path {...f} d={capBase(0.62, -0.05)} />
          <path {...f} d={`M${hx - R * 0.62},${hy - R * 0.62} Q${hx - R * 0.45},${hy - R * 1.6} ${hx + R * 0.55},${hy - R * 1.42} Q${hx + R * 0.95},${hy - R * 1.32} ${hx + R * 0.72},${hy - R * 1.02} Q${hx + R * 0.35},${hy - R * 1.15} ${hx + R * 0.35},${hy - R * 0.72} Z`} />
        </g>
      );
    case "undercut":
      return (
        <g>
          <path d={capBase(0.3, 0.05)} fill={c.hair} fillOpacity={0.35} stroke="none" />
          <path {...f} d={`M${hx - R * 0.78},${hy - R * 0.5} Q${hx - R * 0.9},${hy - R * 1.25} ${hx},${hy - R * 1.3} Q${hx + R * 1.0},${hy - R * 1.3} ${hx + R * 1.12},${hy - R * 0.62} Q${hx + R * 0.5},${hy - R * 0.85} ${hx + R * 0.1},${hy - R * 0.6} Q${hx - R * 0.35},${hy - R * 0.72} ${hx - R * 0.78},${hy - R * 0.5} Z`} />
        </g>
      );
    case "messy": {
      let d = `M${hx - R * 1.04},${hy + R * 0.08} C${hx - R * 1.15},${hy - R * 1.3} ${hx + R * 1.15},${hy - R * 1.3} ${hx + R * 1.04},${hy + R * 0.08}`;
      const tips = [0.95, 0.62, 0.3, -0.02, -0.35, -0.68, -0.98];
      tips.forEach((x, i) => { d += ` L${hx + R * x},${hy - R * (i % 2 ? 0.28 : 0.5)}`; });
      d += " Z";
      return (
        <g>
          <path {...f} d={d} />
          <path d={`M${hx - R * 0.2},${hy - R * 1.05} q${R * 0.15},${-R * 0.35} ${R * 0.35},${-R * 0.25} M${hx + R * 0.35},${hy - R * 1.0} q${R * 0.2},${-R * 0.25} ${R * 0.4},${-R * 0.1}`} {...f} fill="none" />
        </g>
      );
    }
    case "curtains":
      return (
        <g>
          <path {...f} d={`M${hx - R * 1.05},${hy + R * 0.2} C${hx - R * 1.15},${hy - R * 1.52} ${hx + R * 1.15},${hy - R * 1.52} ${hx + R * 1.05},${hy + R * 0.2} Q${hx + R * 0.75},${hy - R * 0.2} ${hx + R * 0.08},${hy - R * 0.78} L${hx - R * 0.08},${hy - R * 0.78} Q${hx - R * 0.75},${hy - R * 0.2} ${hx - R * 1.05},${hy + R * 0.2} Z`} />
          <path d={`M${hx},${hy - R * 0.8} L${hx},${hy - R * 1.08}`} stroke={c.ink} strokeWidth={c.sw * 0.6} strokeLinecap="round" />
        </g>
      );
    case "mohawk": {
      let d = `M${hx - R * 0.28},${hy - R * 0.85}`;
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, x = hx - R * 0.28 + R * 0.56 * t;
        d += ` L${x - R * 0.04},${hy - R * (1.5 + 0.1 * Math.sin(t * 3.14))} L${x + R * 0.06},${hy - R * 1.02}`;
      }
      d += ` L${hx + R * 0.28},${hy - R * 0.85} Z`;
      return (
        <g>
          <path d={capBase(0.4, 0)} fill={c.hair} fillOpacity={0.28} stroke="none" />
          <path {...f} d={d} />
        </g>
      );
    }
    case "wavy":
      return (
        <g>
          <path {...f} d={`M${hx - R * 1.08},${hy + R * 0.45} C${hx - R * 1.2},${hy - R * 1.6} ${hx + R * 1.2},${hy - R * 1.6} ${hx + R * 1.08},${hy + R * 0.45} q${-R * 0.12},${-R * 0.2} ${-R * 0.05},${-R * 0.42} q${-R * 0.15},${-R * 0.12} ${-R * 0.1},${-R * 0.35} Q${hx + R * 0.4},${hy - R * 0.52} ${hx},${hy - R * 0.62} Q${hx - R * 0.45},${hy - R * 0.45} ${hx - R * 0.78},${hy - R * 0.32} q${R * 0.05},${R * 0.23} ${-R * 0.1},${R * 0.35} q${R * 0.07},${R * 0.22} ${-R * 0.2},${R * 0.42} Z`} />
          <path d={`M${hx - R * 0.5},${hy - R * 0.95} q${R * 0.2},${-R * 0.15} ${R * 0.4},0 t${R * 0.4},0`} stroke={c.ink} strokeWidth={c.sw * 0.6} fill="none" strokeLinecap="round" />
        </g>
      );
    case "afro":
      return <path {...f} d={`M${hx - R * 1.0},${hy - R * 0.1} C${hx - R * 1.05},${hy - R * 1.45} ${hx + R * 1.05},${hy - R * 1.45} ${hx + R * 1.0},${hy - R * 0.1} Q${hx + R * 0.7},${hy - R * 0.5} ${hx + R * 0.35},${hy - R * 0.52} Q${hx},${hy - R * 0.62} ${hx - R * 0.35},${hy - R * 0.52} Q${hx - R * 0.7},${hy - R * 0.5} ${hx - R * 1.0},${hy - R * 0.1} Z`} />;
    case "manbun":
      return <path {...f} d={capBase(0.55, 0.05)} />;
    case "receding":
      return (
        <path {...f} d={`M${hx - R * 1.03},${hy + R * 0.05} C${hx - R * 1.1},${hy - R * 1.45} ${hx + R * 1.1},${hy - R * 1.45} ${hx + R * 1.03},${hy + R * 0.05} Q${hx + R * 0.95},${hy - R * 0.5} ${hx + R * 0.62},${hy - R * 0.62} Q${hx + R * 0.45},${hy - R * 0.92} ${hx + R * 0.15},${hy - R * 0.82} L${hx},${hy - R * 0.68} L${hx - R * 0.15},${hy - R * 0.82} Q${hx - R * 0.45},${hy - R * 0.92} ${hx - R * 0.62},${hy - R * 0.62} Q${hx - R * 0.95},${hy - R * 0.5} ${hx - R * 1.03},${hy + R * 0.05} Z`} />
      );
    case "long":
    case "braid":
    case "bob":
      return <path {...f} d={capBase(0.38, 0.55)} />;
    case "ponytail":
    case "bun":
      return <path {...f} d={capBase(0.45, 0.15)} />;
    default:
      return <path {...f} d={capBase(0.5, 0.05)} />;
  }
}

function HeadAccessories({ dna, head: [hx, hy], R, c }: { dna: CharacterDNA; head: Pt; R: number; c: Ctx }) {
  const a = new Set(dna.accessories);
  const sw = c.sw;
  return (
    <g>
      {a.has("baldspot") && <ellipse cx={hx - R * 0.35} cy={hy - R * 0.82} rx={R * 0.16} ry={R * 0.1} fill={c.skin} stroke={c.ink} strokeWidth={sw * 0.6} strokeDasharray="2 2" />}
      {a.has("bindi") && <circle cx={hx + R * 0.05} cy={hy - R * 0.2} r={R * 0.07} fill={c.t.id === "line-sketch" ? c.ink : c.t.accent} />}
      {a.has("bandaid") && (
        <g transform={`rotate(-25 ${hx - R * 0.48} ${hy - R * 0.28})`}>
          <rect x={hx - R * 0.78} y={hy - R * 0.38} width={R * 0.6} height={R * 0.2} rx={R * 0.08} fill={mix(c.t.paper, c.t.warm, 0.6)} stroke={c.ink} strokeWidth={sw * 0.6} />
          <circle cx={hx - R * 0.53} cy={hy - R * 0.28} r={R * 0.025} fill={c.ink} />
          <circle cx={hx - R * 0.43} cy={hy - R * 0.28} r={R * 0.025} fill={c.ink} />
        </g>
      )}
      {a.has("scar") && <path d={`M${hx + R * 0.35},${hy - R * 0.5} l${R * 0.1},${R * 0.08} l-${R * 0.1},${R * 0.08} l${R * 0.1},${R * 0.08}`} fill="none" stroke={c.ink} strokeWidth={sw * 0.6} />}
      {a.has("glasses") && (
        <g fill="none" stroke={c.ink} strokeWidth={sw * 0.8}>
          <circle cx={hx - R * 0.36} cy={hy + R * 0.02} r={R * 0.24} />
          <circle cx={hx + R * 0.42} cy={hy + R * 0.02} r={R * 0.24} />
          <line x1={hx - R * 0.12} y1={hy} x2={hx + R * 0.18} y2={hy} />
        </g>
      )}
      {a.has("mustache") && <path d={`M${hx - R * 0.32},${hy + R * 0.42} Q${hx - R * 0.1},${hy + R * 0.22} ${hx + R * 0.06},${hy + R * 0.34} Q${hx + R * 0.22},${hy + R * 0.22} ${hx + R * 0.44},${hy + R * 0.42} Q${hx + R * 0.06},${hy + R * 0.48} ${hx - R * 0.32},${hy + R * 0.42} Z`} fill={c.hair} stroke={c.ink} strokeWidth={sw * 0.6} />}
      {a.has("stubble") && (
        <g fill={c.hair} opacity={0.55}>
          {Array.from({ length: 26 }, (_, i) => {
            const t = i / 25, ang = Math.PI * (0.12 + 0.76 * t);
            const rr = R * (0.78 + (i % 3) * 0.06);
            return <circle key={i} cx={hx + Math.cos(ang) * rr} cy={hy + R * 0.1 + Math.sin(ang) * rr * 0.92} r={R * 0.03} />;
          })}
        </g>
      )}
      {a.has("goatee") && <path d={`M${hx - R * 0.18},${hy + R * 0.66} Q${hx},${hy + R * 0.6} ${hx + R * 0.18},${hy + R * 0.66} Q${hx + R * 0.14},${hy + R * 1.0} ${hx},${hy + R * 1.05} Q${hx - R * 0.14},${hy + R * 1.0} ${hx - R * 0.18},${hy + R * 0.66} Z`} fill={c.hair} stroke={c.ink} strokeWidth={c.sw * 0.6} />}
      {a.has("beard") && <path d={`M${hx - R * 0.9},${hy + R * 0.3} Q${hx},${hy + R * 1.55} ${hx + R * 0.9},${hy + R * 0.3} Q${hx + R * 0.5},${hy + R * 0.95} ${hx},${hy + R * 0.98} Q${hx - R * 0.5},${hy + R * 0.95} ${hx - R * 0.9},${hy + R * 0.3} Z`} fill={c.hair} stroke={c.ink} strokeWidth={sw * 0.7} />}
      {a.has("blush") && (
        <g fill={c.t.id === "line-sketch" ? "#d9a0a0" : c.t.accent} opacity={0.3}>
          <ellipse cx={hx - R * 0.55} cy={hy + R * 0.3} rx={R * 0.17} ry={R * 0.1} />
          <ellipse cx={hx + R * 0.62} cy={hy + R * 0.3} rx={R * 0.17} ry={R * 0.1} />
        </g>
      )}
      {a.has("freckles") && <g fill={c.ink} opacity={0.6}>{[-0.6, -0.48, -0.54, 0.55, 0.67, 0.61].map((x, i) => <circle key={i} cx={hx + R * x} cy={hy + R * (0.22 + (i % 3) * 0.07)} r={R * 0.025} />)}</g>}
      {a.has("cap") && (
        <g fill={c.t.accent} stroke={c.ink} strokeWidth={sw}>
          <path d={`M${hx - R * 1.02},${hy - R * 0.25} C${hx - R * 1.05},${hy - R * 1.3} ${hx + R * 1.05},${hy - R * 1.3} ${hx + R * 1.02},${hy - R * 0.25} Z`} />
          <path d={`M${hx + R * 0.3},${hy - R * 0.3} L${hx + R * 1.6},${hy - R * 0.22} Q${hx + R * 1.4},${hy - R * 0.05} ${hx + R * 0.4},${hy - R * 0.12} Z`} />
        </g>
      )}
      {a.has("halo") && <ellipse cx={hx - R * 0.15} cy={hy - R * 1.45} rx={R * 0.7} ry={R * 0.18} fill="none" stroke={c.t.id === "sunday-strip" ? "#f5c518" : c.t.accent} strokeWidth={sw * 1.3} />}
      {a.has("horns") && (
        <g fill={c.t.id === "sunday-strip" ? "#e63946" : mix(c.t.accent, c.t.ink, 0.15)} stroke={c.ink} strokeWidth={sw * 0.8} strokeLinejoin="round">
          <path d={`M${hx - R * 0.62},${hy - R * 0.72} Q${hx - R * 0.95},${hy - R * 1.25} ${hx - R * 0.72},${hy - R * 1.48} Q${hx - R * 0.6},${hy - R * 1.1} ${hx - R * 0.32},${hy - R * 0.88} Z`} />
          <path d={`M${hx + R * 0.62},${hy - R * 0.72} Q${hx + R * 0.95},${hy - R * 1.25} ${hx + R * 0.72},${hy - R * 1.48} Q${hx + R * 0.6},${hy - R * 1.1} ${hx + R * 0.32},${hy - R * 0.88} Z`} />
        </g>
      )}
    </g>
  );
}

function Face({ expr, head: [hx, hy], R, look, c }: { expr: Expression; head: Pt; R: number; look: number; c: Ctx; dna: CharacterDNA }) {
  const ink = c.ink, sw = c.sw;
  const ex = (side: number) => hx + side * R * 0.38 + look;
  const ey = hy + R * 0.02;
  const er = R * 0.12;
  const my = hy + R * 0.52, mx = hx + look * 0.6;
  const dot = (side: number, big = 1) => (
    <g key={side}>
      <ellipse cx={ex(side)} cy={ey} rx={er * big} ry={er * 1.15 * big} fill={ink} />
      <circle cx={ex(side) + er * 0.35} cy={ey - er * 0.4} r={er * 0.32} fill={c.t.paper} />
    </g>
  );
  const arcEye = (side: number, up: boolean) => (
    <path key={side} d={`M${ex(side) - er * 1.4},${ey} Q${ex(side)},${ey + (up ? -er * 1.8 : er * 1.6)} ${ex(side) + er * 1.4},${ey}`} fill="none" stroke={ink} strokeWidth={sw} strokeLinecap="round" />
  );
  const brow = (side: number, tilt: number, lift = 0) => (
    <line key={"b" + side} x1={ex(side) - er * 1.6} y1={ey - er * 2.6 - lift + side * tilt} x2={ex(side) + er * 1.6} y2={ey - er * 2.6 - lift - side * tilt} stroke={ink} strokeWidth={sw} strokeLinecap="round" />
  );
  const nose = <path d={`M${hx + look * 0.9},${hy + R * 0.16} q${R * 0.08},${R * 0.1} ${-R * 0.02},${R * 0.16}`} fill="none" stroke={ink} strokeWidth={sw * 0.7} strokeLinecap="round" />;
  const mouth = (d: string, fill = "none") => <path d={d} fill={fill} stroke={ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
  const w = R * 0.3;

  let eyes: ReactNode, brows: ReactNode = null, m: ReactNode;
  switch (expr) {
    case "happy":
      eyes = [dot(-1), dot(1)];
      m = mouth(`M${mx - w},${my - 3} Q${mx},${my + w * 0.9} ${mx + w},${my - 3}`);
      break;
    case "laugh":
      eyes = [arcEye(-1, true), arcEye(1, true)];
      m = mouth(`M${mx - w * 1.1},${my - 4} Q${mx},${my + w * 1.5} ${mx + w * 1.1},${my - 4} Z`, mix(c.t.accent, c.t.paper, 0.4));
      break;
    case "sad":
      eyes = [dot(-1, 0.9), dot(1, 0.9)];
      brows = [brow(-1, -er * 0.8), brow(1, -er * 0.8)];
      m = mouth(`M${mx - w * 0.8},${my + 4} Q${mx},${my - w * 0.6} ${mx + w * 0.8},${my + 4}`);
      break;
    case "crying":
      eyes = [arcEye(-1, false), arcEye(1, false)];
      brows = [brow(-1, -er * 1.1), brow(1, -er * 1.1)];
      m = mouth(`M${mx - w},${my + 6} Q${mx - w * 0.5},${my - w * 0.6} ${mx},${my} Q${mx + w * 0.5},${my - w * 0.6} ${mx + w},${my + 6} Q${mx},${my + w * 0.5} ${mx - w},${my + 6} Z`, mix(c.t.accent, c.t.paper, 0.45));
      break;
    case "angry":
      eyes = [dot(-1, 0.85), dot(1, 0.85)];
      brows = [brow(-1, er * 1.3, -er * 0.3), brow(1, er * 1.3, -er * 0.3)];
      m = mouth(`M${mx - w},${my + 2} L${mx + w},${my + 2} L${mx + w * 0.8},${my + w * 0.55} L${mx - w * 0.8},${my + w * 0.55} Z`, c.t.paper);
      break;
    case "shocked":
      eyes = [-1, 1].map((sd) => (
        <g key={sd}>
          <circle cx={ex(sd)} cy={ey} r={er * 2} fill={c.t.paper} stroke={ink} strokeWidth={sw * 0.8} />
          <circle cx={ex(sd)} cy={ey} r={er * 0.8} fill={ink} />
        </g>
      ));
      brows = [brow(-1, -er * 0.4, er * 1.4), brow(1, -er * 0.4, er * 1.4)];
      m = <ellipse cx={mx} cy={my + 4} rx={w * 0.55} ry={w * 0.75} fill={mix(c.t.ink, c.t.paper, 0.2)} stroke={ink} strokeWidth={sw} />;
      break;
    case "scared":
      eyes = [-1, 1].map((sd) => (
        <g key={sd}>
          <circle cx={ex(sd)} cy={ey} r={er * 1.8} fill={c.t.paper} stroke={ink} strokeWidth={sw * 0.8} />
          <circle cx={ex(sd)} cy={ey} r={er * 0.45} fill={ink} />
        </g>
      ));
      brows = [brow(-1, -er * 1.1, er), brow(1, -er * 1.1, er)];
      m = mouth(`M${mx - w},${my + 2} q${w * 0.33},${-w * 0.35} ${w * 0.66},0 q${w * 0.33},${w * 0.35} ${w * 0.66},0 q${w * 0.33},${-w * 0.35} ${w * 0.66},0`);
      break;
    case "smirk":
      eyes = [-1, 1].map((sd) => (
        <g key={sd}>
          {dot(sd, 0.9)}
          <line x1={ex(sd) - er * 1.4} y1={ey - er * 0.5} x2={ex(sd) + er * 1.4} y2={ey - er * 0.5} stroke={ink} strokeWidth={sw} strokeLinecap="round" />
        </g>
      ));
      brows = [brow(-1, 0, -er * 0.2), brow(1, -er * 0.8, er * 0.8)];
      m = mouth(`M${mx - w * 0.6},${my + 2} Q${mx + w * 0.3},${my + w * 0.45} ${mx + w},${my - w * 0.35}`);
      break;
    case "sleepy":
      eyes = [-1, 1].map((sd) => <line key={sd} x1={ex(sd) - er * 1.4} y1={ey + 2} x2={ex(sd) + er * 1.4} y2={ey + 2} stroke={ink} strokeWidth={sw} strokeLinecap="round" />);
      m = <ellipse cx={mx} cy={my + 3} rx={w * 0.25} ry={w * 0.3} fill="none" stroke={ink} strokeWidth={sw} />;
      break;
    case "love":
      eyes = [-1, 1].map((sd) => <path key={sd} d={heart(ex(sd), ey, er * 1.6)} fill={c.t.id === "line-sketch" ? ink : c.t.accent} stroke={ink} strokeWidth={sw * 0.5} />);
      m = mouth(`M${mx - w},${my - 3} Q${mx},${my + w * 0.9} ${mx + w},${my - 3}`);
      break;
    case "determined":
      eyes = [dot(-1, 0.9), dot(1, 0.9)];
      brows = [brow(-1, er * 0.6, -er * 0.5), brow(1, er * 0.6, -er * 0.5)];
      m = mouth(`M${mx - w * 0.7},${my + 3} L${mx + w * 0.7},${my + 1}`);
      break;
    default:
      eyes = [dot(-1), dot(1)];
      m = mouth(`M${mx - w * 0.5},${my + 2} Q${mx},${my + w * 0.25} ${mx + w * 0.5},${my + 2}`);
  }
  return <g>{brows}{eyes}{nose}{m}</g>;
}

function ExpressionExtras({ expr, head: [hx, hy], R, c }: { expr: Expression; head: Pt; R: number; c: Ctx }) {
  const tear = c.t.id === "sunday-strip" ? "#7cc4ff" : c.t.id === "watercolor" ? "#8cc3e8" : mix(c.t.accent, c.t.paper, 0.35);
  switch (expr) {
    case "crying":
      return (
        <g fill={tear} stroke={c.ink} strokeWidth={c.sw * 0.5}>
          <path d={`M${hx - R * 0.42},${hy + R * 0.15} q${-R * 0.12},${R * 0.5} ${-R * 0.05},${R * 0.85} q${R * 0.1},${R * 0.1} ${R * 0.14},0 q${-R * 0.02},${-R * 0.4} ${-R * 0.02},${-R * 0.85} Z`} />
          <path d={`M${hx + R * 0.42},${hy + R * 0.15} q${R * 0.12},${R * 0.5} ${R * 0.05},${R * 0.85} q${-R * 0.1},${R * 0.1} ${-R * 0.14},0 q${R * 0.02},${-R * 0.4} ${R * 0.02},${-R * 0.85} Z`} />
        </g>
      );
    case "scared":
      return <path d={`M${hx + R * 1.08},${hy - R * 0.55} q${R * 0.2},${R * 0.3} 0,${R * 0.42} q${-R * 0.2},${-R * 0.12} 0,${-R * 0.42} Z`} fill={tear} stroke={c.ink} strokeWidth={c.sw * 0.6} />;
    case "angry":
      return (
        <g stroke={c.t.id === "line-sketch" ? c.ink : c.t.accent} strokeWidth={c.sw * 1.1} strokeLinecap="round" fill="none">
          <path d={`M${hx + R * 0.75},${hy - R * 1.05} q${R * 0.1},${R * 0.18} ${R * 0.28},${R * 0.12}`} />
          <path d={`M${hx + R * 0.95},${hy - R * 1.25} q${R * 0.18},${R * 0.1} ${R * 0.12},${R * 0.28}`} />
          <path d={`M${hx + R * 1.2},${hy - R * 0.92} q${-R * 0.18},${-R * 0.1} ${-R * 0.12},${-R * 0.28}`} />
        </g>
      );
    case "sleepy":
      return <text x={hx + R * 1.0} y={hy - R * 0.9} fontFamily="Patrick Hand, cursive" fontSize={R * 0.7} fill={c.t.accent}>z<tspan dy={-R * 0.3} fontSize={R * 0.5}>z</tspan></text>;
    case "love":
      return <path d={heart(hx + R * 1.15, hy - R * 1.0, R * 0.22)} fill={c.t.accent} stroke={c.ink} strokeWidth={c.sw * 0.5} />;
    default:
      return null;
  }
}

/** Where the head sits in the 200x300 box for this character (for portrait framing). */
export function headFrame(dna: CharacterDNA) {
  const age = AGE[dna.age] ?? AGE.adult;
  const R = 30 * age.s * age.head;
  const neckY = GROUND + (100 - GROUND) * age.s;
  return { cx: 100, cy: neckY - R * 0.86, R };
}

/** Small round avatar used in lists and the cast map. */
export function CharacterAvatar({ dna, theme, size = 48, expression = "happy" }: { dna: CharacterDNA; theme: Theme; size?: number; expression?: Expression }) {
  // Frame the head: compute where the head sits for this age.
  const age = AGE[dna.age] ?? AGE.adult;
  const R = 30 * age.s * age.head;
  const neckY = GROUND + (100 - GROUND) * age.s;
  const cy = neckY - R * 0.86;
  const box = R * 3.4;
  return (
    <svg width={size} height={size} viewBox={`${100 - box / 2} ${cy - box * 0.52} ${box} ${box}`} style={{ display: "block" }}>
      <CharacterRig dna={dna} pose="stand" expression={expression} theme={theme} portrait />
    </svg>
  );
}
