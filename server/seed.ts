import { readFileSync } from "node:fs";
import { nanoid } from "nanoid";
import type { Block, Book, Chapter, Character, CharacterDNA, Doodle, DoodleEl } from "../src/types.ts";

const here = new URL(".", import.meta.url);

const dna = (d: Partial<CharacterDNA>): CharacterDNA => ({
  age: "adult", build: "average", skin: "#e6b98f", hair: "short", hairColor: "#2b2118",
  outfit: "tshirt", outfitColor: "#8f7bd8", bottomColor: "#3d3a5c", print: "none", accessories: [], signature: "",
  ...d,
});

const C = (id: string, name: string, role: string, color: string, aliases: string[], d: Partial<CharacterDNA>): Character => ({
  id, name, role, color, aliases, dna: dna(d),
});

export const seedCharacters: Character[] = [
  C("sayali", "Sayali", "Narrator · the middle child", "#a77df2", ["I", "me", "Sayali"], {
    age: "kid", build: "slim", skin: "#e9bf96", hair: "ponytail", hairColor: "#1f1712", outfit: "tshirt",
    outfitColor: "#ffffff", bottomColor: "#6d5bd0", print: "fairy", accessories: ["bandaid", "baldspot", "blush"],
    signature: "Big expressive eyes. White tee with a neon-green fairy. A band-aid on the forehead and a tiny bald spot — the 'permanent part'.",
  }),
  C("satish", "Satish", "Bhaiya · eldest, two modes", "#5b8def", ["Bhaiya", "Satish"], {
    age: "kid", skin: "#d9a77b", hair: "spiky", hairColor: "#1b1410", outfit: "tshirt", outfitColor: "#6fa3ff",
    bottomColor: "#3b3355", accessories: ["halo", "horns"],
    signature: "Split personality: angel halo in front of parents, devil horns when they leave. Smug smirk. Two years older than Sayali.",
  }),
  C("suraj", "Suraj", "The Extra · youngest", "#f2a65a", ["Suraj"], {
    age: "kid", build: "round", skin: "#e2b088", hair: "short", hairColor: "#251a14", outfit: "tshirt",
    outfitColor: "#ffc46b", bottomColor: "#5c4b8a", accessories: [],
    signature: "Four years younger than Sayali; usually crying at the door, snotty nose, wants to tag along.",
  }),
  C("mummy", "Mummy", "The Warden · Mrs. Rathod", "#e05a8a", ["Mummy", "Mrs. Rathod", "Mother"], {
    age: "adult", build: "average", skin: "#d8a47c", hair: "bun", hairColor: "#16100c", outfit: "saree",
    outfitColor: "#c2477a", bottomColor: "#c2477a", accessories: ["bindi", "necklace", "earrings"],
    signature: "Supreme Court Judge of the house. Hands on hips, raised eyebrow, 'Rathod Wrath'. Holds a chappal when angry.",
  }),
  C("pappa", "Pappa", "The Ghost · Pandit Tikaram Rathod", "#4aa58a", ["Pappa", "father", "Dad"], {
    age: "adult", build: "average", skin: "#c99167", hair: "balding", hairColor: "#1d1712", outfit: "shirt",
    outfitColor: "#e8e2d0", bottomColor: "#4a4a5e", accessories: ["mustache", "watch"],
    signature: "Strict, quiet, 'emotionally on mute'. Thick mustache. Brings jalebi on his bike.",
  }),
  C("maushi", "Maushi", "The maid · double agent", "#9c7a5b", ["Maushi"], {
    age: "elder", skin: "#c48c62", hair: "bun", hairColor: "#55504a", outfit: "saree", outfitColor: "#7a9a6b",
    bottomColor: "#7a9a6b", accessories: ["bindi"], signature: "Pointing finger, gossip face. Betrays the sacred pact.",
  }),
  C("gauri", "Gauri", "Best friend · Dhole family", "#53b3c9", ["Gauri"], {
    age: "kid", skin: "#e5b68d", hair: "bob", hairColor: "#20160f", outfit: "dress", outfitColor: "#6cc4d6",
    bottomColor: "#40406a", accessories: ["earrings"], signature: "Sayali's best friend; easily swayed; fifty excuses ready.",
  }),
  C("arpita", "Arpita", "The Devil", "#d9534f", ["Arpita"], {
    age: "teen", skin: "#e0ae84", hair: "long", hairColor: "#1a1210", outfit: "tshirt", outfitColor: "#d65a5a",
    bottomColor: "#2e2b45", accessories: ["horns"], signature: "Always on her phone video-calling boys. Little devil horns.",
  }),
  C("anandi", "Anandi", "Friend · lo-fi bus buddy", "#7bbf6a", ["Anandi"], {
    age: "teen", skin: "#d9a57a", hair: "braid", hairColor: "#1c140f", outfit: "kurta", outfitColor: "#8ccf7e",
    bottomColor: "#f2efe6", accessories: [], signature: "Calm; earphones in; Sukoon Vibes playlist.",
  }),
  C("saurav", "Saurav Dhole", "Boy squad", "#6f8bd6", ["Saurav"], {
    age: "kid", skin: "#e0b089", hair: "short", hairColor: "#1e1610", outfit: "shirt", outfitColor: "#9db4ff", bottomColor: "#3a3a52",
  }),
  C("shivam", "Shivam Kumbhakarna", "Boy squad", "#c98b4a", ["Shivam"], {
    age: "kid", skin: "#cf9a6c", hair: "curly", hairColor: "#1c1510", outfit: "tshirt", outfitColor: "#f0a35a", bottomColor: "#463d5a",
  }),
  C("pragati", "Pragati Kumbhakarna", "Girl gang", "#e58fc6", ["Pragati"], {
    age: "kid", skin: "#e3b48c", hair: "long", hairColor: "#1e1510", outfit: "dress", outfitColor: "#f2a0d3", bottomColor: "#40406a",
  }),
  C("govind", "Govind Uncle", "Dhole family · medical store", "#4f7fb0", ["Govind Uncle", "Govind"], {
    age: "adult", skin: "#d39c72", hair: "short", hairColor: "#221a14", outfit: "shirt", outfitColor: "#cfe3f5",
    bottomColor: "#3d3d50", accessories: ["glasses", "mustache"],
  }),
  C("anita", "Anita Aunty", "Dhole family", "#b05f9b", ["Anita Aunty", "Anita"], {
    age: "adult", skin: "#dcac80", hair: "long", hairColor: "#1b130e", outfit: "saree", outfitColor: "#d07fb9", bottomColor: "#d07fb9",
    accessories: ["bindi"],
  }),
  C("shivaji", "Shivaji Uncle", "Kumbhakarna family · painter to manager", "#a0703c", ["Shivaji Uncle", "Shivaji"], {
    age: "adult", skin: "#c58e62", hair: "short", hairColor: "#201812", outfit: "shirt", outfitColor: "#f3d9a4",
    bottomColor: "#45405a", accessories: ["mustache"],
  }),
  C("sharadha", "Sharadha Aunty", "Kumbhakarna family", "#c0567a", ["Sharadha Aunty", "Sharadha"], {
    age: "adult", skin: "#d6a175", hair: "bun", hairColor: "#18110c", outfit: "saree", outfitColor: "#e48a6b", bottomColor: "#e48a6b",
    accessories: ["bindi", "earrings"],
  }),
  C("sanskruti", "Sanskruti", "Kota hostel-mate", "#8a7ad9", ["Sanskruti"], {
    age: "teen", skin: "#e4b58a", hair: "ponytail", hairColor: "#1d1510", outfit: "hoodie", outfitColor: "#a596e8", bottomColor: "#34324a",
  }),
];

// ---- Hand-drawn props for the demo doodle (theme tokens, not hex colours) ----
const VESSEL_SVG = `
<path d="M30 70 Q30 150 70 160 L170 160 Q210 150 210 70 Z" fill="SOFT" stroke="INK" stroke-width="5" stroke-linejoin="round"/>
<ellipse cx="120" cy="70" rx="92" ry="18" fill="PAPER" stroke="INK" stroke-width="5"/>
<path d="M28 82 Q8 82 10 100 M212 82 Q232 82 230 100" fill="none" stroke="INK" stroke-width="5" stroke-linecap="round"/>
<path d="M80 40 q-10 -15 0 -28 q10 -13 0 -26 M120 40 q-10 -15 0 -28 q10 -13 0 -26 M160 40 q-10 -15 0 -28 q10 -13 0 -26" fill="none" stroke="ACCENT" stroke-width="4" stroke-linecap="round" opacity="0.8"/>`;

const SPLASH_SVG = `
<path d="M10 120 Q60 60 120 95 Q170 40 230 90 Q280 50 330 110 Q300 135 250 128 Q200 150 150 132 Q90 150 40 135 Z" fill="PAPER" stroke="INK" stroke-width="5" stroke-linejoin="round"/>
<circle cx="70" cy="40" r="10" fill="PAPER" stroke="INK" stroke-width="4"/>
<circle cx="190" cy="22" r="13" fill="PAPER" stroke="INK" stroke-width="4"/>
<circle cx="290" cy="38" r="9" fill="PAPER" stroke="INK" stroke-width="4"/>
<path d="M120 95 q10 -30 25 -5 M230 90 q8 -25 22 -4" fill="none" stroke="INK" stroke-width="4" stroke-linecap="round"/>`;

const CHAPPAL_SVG = `
<path d="M20 60 Q20 20 60 18 L150 22 Q185 26 182 50 Q178 78 140 80 L55 84 Q20 86 20 60 Z" fill="WARM" stroke="INK" stroke-width="5"/>
<path d="M70 30 Q95 55 120 30" fill="none" stroke="INK" stroke-width="6" stroke-linecap="round"/>
<path d="M195 20 l20 -12 M198 40 l26 -2 M195 60 l22 10" stroke="ACCENT" stroke-width="4" stroke-linecap="round"/>`;

function demoDoodle(): Doodle {
  const els: DoodleEl[] = [
    { id: "p1", type: "panel", x: 24, y: 24, w: 566, h: 592, rotation: 0 },
    { id: "p2", type: "panel", x: 610, y: 24, w: 566, h: 592, rotation: 0 },
    { id: "vessel", type: "art", label: "boiling milk vessel", x: 250, y: 150, w: 240, h: 170, vbW: 240, vbH: 170, rotation: -28, svg: VESSEL_SVG },
    { id: "splash", type: "art", label: "milk tsunami", x: 60, y: 470, w: 340, h: 150, vbW: 340, vbH: 150, rotation: 0, svg: SPLASH_SVG },
    { id: "c-satish", type: "character", charId: "satish", x: 330, y: 230, w: 220, h: 330, rotation: 0, pose: "hold", expression: "shocked", facing: "left" },
    { id: "c-sayali", type: "character", charId: "sayali", x: 70, y: 250, w: 200, h: 300, rotation: 0, pose: "armsUp", expression: "scared", facing: "right" },
    { id: "b1", type: "bubble", kind: "speech", text: "I got this.", x: 380, y: 60, w: 190, h: 90, fontSize: 30, tailX: 450, tailY: 230, rotation: 0 },
    { id: "sfx1", type: "bubble", kind: "sfx", text: "SPLASH!", x: 50, y: 70, w: 260, h: 110, fontSize: 72, tailX: 0, tailY: 0, rotation: -10, noTail: true },
    { id: "cap1", type: "bubble", kind: "caption", text: "Famous last words.", x: 44, y: 560, w: 250, h: 44, fontSize: 24, tailX: 0, tailY: 0, rotation: 0, noTail: true },
    { id: "c-maushi", type: "character", charId: "maushi", x: 640, y: 230, w: 240, h: 360, rotation: 0, pose: "point", expression: "smirk", facing: "right" },
    { id: "c-mummy", type: "character", charId: "mummy", x: 900, y: 210, w: 250, h: 375, rotation: 0, pose: "stand", expression: "angry", facing: "left" },
    { id: "b2", type: "bubble", kind: "speech", text: "And you won't believe what these two did today…", x: 630, y: 54, w: 300, h: 130, fontSize: 26, tailX: 740, tailY: 250, rotation: 0 },
    { id: "chappal", type: "art", label: "chappal", x: 1040, y: 120, w: 120, h: 60, vbW: 240, vbH: 100, rotation: 18, svg: CHAPPAL_SVG },
    { id: "lbl", type: "bubble", kind: "label", text: "Rathod Wrath", x: 960, y: 560, w: 200, h: 44, fontSize: 26, tailX: 1010, tailY: 470, rotation: -4 },
  ];
  return {
    id: "d-milk", title: "The Milk Tsunami", theme: "purple-ink", width: 1200, height: 640, background: "paper",
    elements: els, sourceText: "A tsunami of boiling white liquid crashed onto the kitchen counter…",
    history: [{ at: Date.now(), kind: "note", prompt: "Starter doodle", reply: "Hand-built example so you can see how characters, bubbles and props are editable." }],
    updatedAt: Date.now(),
  };
}

function imageDoodle(id: string, title: string, src: string, [w, h]: [number, number]): Doodle {
  return {
    id, title, theme: "purple-ink", width: w, height: h, background: "none",
    elements: [{ id: "img", type: "image", src, x: 0, y: 0, w, h, rotation: 0, locked: true }],
    history: [{ at: Date.now(), kind: "note", prompt: "Imported", reply: "Imported from your PDF. Add bubbles, stickers or characters on top." }],
    updatedAt: Date.now(),
  };
}

const SCENE_SPLITS = [/^(Phase 1: The Boys \(The "S" Squad\))\s+/, /^(Phase 2: The Girl Gang)\s+/, /^(Phase 3: The "Extra")\s+/];

export function buildSeedBook(): Book {
  const raw: { n: number; title: string; paras: string[] }[] = JSON.parse(
    readFileSync(new URL("seed/chapters.json", here), "utf8"),
  );
  const partA = { id: "part-1", title: "Part One · The Rathod Chronicles" };
  const partB = { id: "part-2", title: "Part Two · Kota & After" };
  const doodles: Record<string, Doodle> = {};
  const artSize: Record<string, [number, number]> = JSON.parse(readFileSync(new URL("seed/art.json", here), "utf8"));
  const chapters: Chapter[] = raw.map((c) => {
    const blocks: Block[] = [];
    for (const p of c.paras) {
      let text = p;
      for (const re of SCENE_SPLITS) {
        const m = text.match(re);
        if (m) {
          blocks.push({ id: nanoid(8), type: "scene", text: m[1] });
          text = text.slice(m[0].length);
        }
      }
      blocks.push({ id: nanoid(8), type: "text", text });
      if (c.n === 5 && text.includes('It’s called "Sukoon Vibes."')) {
        blocks.push({ id: nanoid(8), type: "audio", caption: "Sukoon Vibes — the actual bus-ride playlist", url: "" });
      }
      if (c.n === 2 && text.includes("She flipped.")) {
        doodles["d-milk"] = demoDoodle();
        blocks.push({ id: nanoid(8), type: "doodle", doodleId: "d-milk", caption: "The Milk Tsunami, and the Great Betrayal" });
      }
    }
    const artId = `d-ch${c.n}`;
    doodles[artId] = imageDoodle(artId, `Chapter ${c.n} illustration`, `/uploads/seed-ch${c.n}.jpg`, artSize[`ch${c.n}`]);
    return {
      id: `ch${c.n}`,
      partId: c.n <= 5 ? partA.id : partB.id,
      title: c.title,
      status: "draft",
      artDoodleId: artId,
      contentNote: c.n === 7 ? "This chapter talks about self-harm." : undefined,
      blocks,
    };
  });

  return {
    id: "chaotic-chronicles",
    title: "My Chaotic Chronicles",
    subtitle: "The Jalebi, The Scar, & The Triple S",
    author: "Sayali Rathod",
    dedication: "",
    theme: "purple-ink",
    paper: "lavender",
    trim: "6x9",
    characters: seedCharacters,
    parts: [partA, partB],
    chapters,
    doodles,
    coverDoodleId: "d-ch1",
    cast: {
      inFrontMatter: true,
      nodes: [
        { charId: "pappa", x: 150, y: 110 }, { charId: "mummy", x: 290, y: 110 },
        { charId: "satish", x: 100, y: 300 }, { charId: "sayali", x: 220, y: 300 }, { charId: "suraj", x: 340, y: 300 },
        { charId: "govind", x: 520, y: 110 }, { charId: "anita", x: 640, y: 110 },
        { charId: "saurav", x: 520, y: 300 }, { charId: "gauri", x: 640, y: 300 },
        { charId: "shivaji", x: 820, y: 110 }, { charId: "sharadha", x: 940, y: 110 },
        { charId: "shivam", x: 820, y: 300 }, { charId: "pragati", x: 940, y: 300 },
      ],
      edges: [
        { id: "e1", from: "pappa", to: "mummy", label: "jalebi = love" },
        { id: "e2", from: "satish", to: "saurav", label: "boy squad" },
        { id: "e3", from: "saurav", to: "shivam", label: "boy squad" },
        { id: "e4", from: "sayali", to: "gauri", label: "best friends" },
        { id: "e5", from: "gauri", to: "pragati", label: "girl gang" },
        { id: "e6", from: "suraj", to: "sayali", label: "the tax" },
      ],
      groups: [
        { id: "g1", label: "The Rathods", charIds: ["pappa", "mummy", "satish", "sayali", "suraj"], color: "#a77df2" },
        { id: "g2", label: "The Dholes", charIds: ["govind", "anita", "saurav", "gauri"], color: "#53b3c9" },
        { id: "g3", label: "The Kumbhakarnas", charIds: ["shivaji", "sharadha", "shivam", "pragati"], color: "#e48a6b" },
      ],
    },
    updatedAt: Date.now(),
  };
}
