import { useEffect, useState, type ReactNode } from "react";
import {
  ACCESSORIES, AGES, EXPRESSIONS, HAIR_STYLES, OUTFITS, POSES, PRINTS,
  type BubbleKind, type Character, type CharacterDNA, type Doodle, type DoodleEl, type Pose, type ThemeId,
} from "../types.ts";
import { CharacterAvatar } from "../doodle/rig.tsx";
import { THEMES, THEME_LIST, isMonochrome, tokenColor } from "../doodle/theme.ts";
import { COLORS, HAIRS, SKINS } from "../doodle/swatches.ts";

const POSE_LABEL: Record<Pose, string> = { stand: "Stand", wave: "Wave", armsUp: "Arms up", point: "Point", run: "Run", hold: "Carry", sit: "Sit", fall: "Fall", shrug: "Shrug", hug: "Open arms" };
const BUBBLE_KINDS: { kind: BubbleKind; label: string }[] = [
  { kind: "speech", label: "Speech" }, { kind: "thought", label: "Thought" }, { kind: "shout", label: "Shout" }, { kind: "whisper", label: "Whisper" },
  { kind: "caption", label: "Caption box" }, { kind: "label", label: "Label + arrow" }, { kind: "sfx", label: "Sound effect" },
];
const TOKENS = [["INK", "Lines"], ["ACCENT", "Accent"], ["SOFT", "Light fill"], ["PAPER", "White parts"], ["WARM", "Warm fill"]] as const;

/** A row of colour swatches + a custom colour picker (+ optional reset). */
export function ColorField({ label, value, options = COLORS, onPick, onReset, allowNone }: {
  label: string; value?: string; options?: string[]; onPick: (c: string) => void; onReset?: () => void; allowNone?: boolean;
}) {
  const v = value && value.startsWith("#") ? value : "";
  return (
    <div className="color-field">
      <div className="cf-head">
        <span>{label}</span>
        {onReset && value && <button className="link" onClick={onReset} title="Back to default">reset</button>}
      </div>
      <div className="swatches">
        {allowNone && <button className={`none ${!value ? "on" : ""}`} title="None" onClick={() => onReset?.()}>⌀</button>}
        {options.map((c) => <button key={c} className={v.toLowerCase() === c ? "on" : ""} style={{ background: c }} title={c} onClick={() => onPick(c)} />)}
        <label className="custom" title="Pick any colour">
          <input type="color" value={v || "#888888"} onChange={(e) => onPick(e.target.value)} />
          <span>＋</span>
        </label>
      </div>
    </div>
  );
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="insp-sec" open={open}>
      <summary>{title}</summary>
      <div className="insp-body">{children}</div>
    </details>
  );
}

export function MonoHint({ theme, onSwitch }: { theme: ThemeId; onSwitch: () => void }) {
  if (!isMonochrome(theme)) return null;
  return (
    <div className="mono-hint">
      🎨 <b>{THEMES[theme].name}</b> turns colours into {theme === "purple-ink" ? "purple" : "grey"} tints, so picked colours won't show exactly.
      <button onClick={onSwitch}>Use full colour</button>
    </div>
  );
}

export function Inspector({ el, doodle, cast, textRef, onPatch, onRemove, onDuplicate, onOrder, onDoodle, onSaveLook }: {
  el: DoodleEl;
  doodle: Doodle;
  cast: Character[];
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  onPatch: (fn: (e: DoodleEl) => DoodleEl) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onOrder: (d: -1 | 1 | "top" | "bottom") => void;
  onDoodle: (fn: (d: Doodle) => void) => void;
  onSaveLook: (charId: string, dna: CharacterDNA) => void;
}) {
  const t = THEMES[doodle.theme] ?? THEMES.storybook;
  const toFull = () => onDoodle((d) => { d.theme = "storybook"; });
  // Local text state so typing doesn't create one undo step per keystroke.
  const [text, setText] = useState(el.type === "bubble" ? el.text : "");
  useEffect(() => { if (el.type === "bubble") setText(el.text); }, [el.id, el.type === "bubble" ? el.text : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  const common = (
    <Section title="Arrange">
      <label className="row">See-through
        <input type="range" min={10} max={100} value={Math.round((el.opacity ?? 1) * 100)} onChange={(e) => onPatch((x) => ({ ...x, opacity: +e.target.value / 100 }))} />
        <span className="small">{Math.round((el.opacity ?? 1) * 100)}%</span>
      </label>
      {el.type !== "panel" && (
        <label className="row">Rotate
          <input type="range" min={-180} max={180} value={el.rotation} onChange={(e) => onPatch((x) => ({ ...x, rotation: +e.target.value }))} />
          <span className="small">{el.rotation}°</span>
        </label>
      )}
      <div className="btn-row">
        <button onClick={() => onOrder("top")} title="Bring to front">⤒ Front</button>
        <button onClick={() => onOrder(1)} title="Forward ( ] )">↑</button>
        <button onClick={() => onOrder(-1)} title="Backward ( [ )">↓</button>
        <button onClick={() => onOrder("bottom")} title="Send to back">⤓ Back</button>
      </div>
      <div className="btn-row">
        <button onClick={onDuplicate} title="Duplicate (⌘D)">⧉ Duplicate</button>
        <button className="danger" onClick={onRemove} title="Delete">🗑 Delete</button>
      </div>
    </Section>
  );

  if (el.type === "character") {
    const base = cast.find((c) => c.id === el.charId);
    const look: CharacterDNA | null = base ? { ...base.dna, ...(el.look ?? {}) } : null;
    const setLook = <K extends keyof CharacterDNA>(k: K, v: CharacterDNA[K]) =>
      onPatch((x) => (x.type === "character" ? { ...x, look: { ...(x.look ?? {}), [k]: v } } : x));
    const changed = el.look && Object.keys(el.look).length > 0;
    return (
      <div className="insp">
        <div className="insp-title">
          {look && <CharacterAvatar dna={look} theme={t} size={40} />}
          <div>
            <h4>{base?.name ?? "Character"}</h4>
            <select value={el.charId} onChange={(e) => onPatch((x) => ({ ...x, charId: e.target.value }))} aria-label="Swap character">
              {cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <Section title="Pose & face">
          <div className="chips">
            {POSES.map((p) => <button key={p} className={el.pose === p ? "on" : ""} onClick={() => onPatch((x) => ({ ...x, pose: p }))}>{POSE_LABEL[p]}</button>)}
          </div>
          <div className="lbl">Expression</div>
          <div className="chips emoji">
            {EXPRESSIONS.map((x) => (
              <button key={x} className={el.expression === x ? "on" : ""} title={x} onClick={() => onPatch((e) => ({ ...e, expression: x }))}>
                {look ? <CharacterAvatar dna={look} theme={t} size={34} expression={x} /> : x}
              </button>
            ))}
          </div>
          <button onClick={() => onPatch((x) => ({ ...x, facing: (x as { facing: string }).facing === "left" ? "right" : "left" }) as DoodleEl)}>⇋ Flip direction</button>
        </Section>
        {look && (
          <Section title={`Look in this doodle${changed ? " • changed" : ""}`}>
            <MonoHint theme={doodle.theme} onSwitch={toFull} />
            <div className="row3">
              <label>Age<select value={look.age} onChange={(e) => setLook("age", e.target.value as CharacterDNA["age"])}>{AGES.map((a) => <option key={a}>{a}</option>)}</select></label>
              <label>Build<select value={look.build} onChange={(e) => setLook("build", e.target.value as CharacterDNA["build"])}><option>slim</option><option>average</option><option>round</option></select></label>
              <label>Hair<select value={look.hair} onChange={(e) => setLook("hair", e.target.value as CharacterDNA["hair"])}>{HAIR_STYLES.map((a) => <option key={a}>{a}</option>)}</select></label>
            </div>
            <ColorField label="Skin tone" value={look.skin} options={SKINS} onPick={(c) => setLook("skin", c)} />
            <ColorField label="Hair colour" value={look.hairColor} options={HAIRS} onPick={(c) => setLook("hairColor", c)} />
            <div className="row2">
              <label>Outfit<select value={look.outfit} onChange={(e) => setLook("outfit", e.target.value as CharacterDNA["outfit"])}>{OUTFITS.map((a) => <option key={a}>{a}</option>)}</select></label>
              <label>T-shirt print<select value={look.print} onChange={(e) => setLook("print", e.target.value as CharacterDNA["print"])}>{PRINTS.map((a) => <option key={a}>{a}</option>)}</select></label>
            </div>
            <ColorField label="Outfit colour" value={look.outfitColor} onPick={(c) => setLook("outfitColor", c)} />
            <ColorField label="Trousers / skirt colour" value={look.bottomColor} onPick={(c) => setLook("bottomColor", c)} />
            <div className="lbl">Extras</div>
            <div className="chips small">
              {ACCESSORIES.map((a) => {
                const on = look.accessories.includes(a);
                return <button key={a} className={on ? "on" : ""} onClick={() => setLook("accessories", on ? look.accessories.filter((y) => y !== a) : [...look.accessories, a])}>{a}</button>;
              })}
            </div>
            {changed && (
              <div className="btn-row">
                <button onClick={() => onPatch((x) => (x.type === "character" ? { ...x, look: undefined } : x))}>↺ Reset to their usual look</button>
                <button className="primary" onClick={() => { onSaveLook(el.charId, look); onPatch((x) => (x.type === "character" ? { ...x, look: undefined } : x)); }}>★ Make this their look everywhere</button>
              </div>
            )}
            <p className="muted small">Changes here only affect this doodle — unless you click “Make this their look everywhere”.</p>
          </Section>
        )}
        {common}
      </div>
    );
  }

  if (el.type === "bubble") {
    const p = (k: "fill" | "textColor" | "stroke", v?: string) => onPatch((x) => (x.type === "bubble" ? { ...x, [k]: v } : x));
    return (
      <div className="insp">
        <h4>{el.kind === "sfx" ? "Sound effect" : "Bubble"}</h4>
        <Section title="Words">
          <select value={el.kind} onChange={(e) => onPatch((x) => ({ ...x, kind: e.target.value as BubbleKind }))}>
            {BUBBLE_KINDS.map((b) => <option key={b.kind} value={b.kind}>{b.label}</option>)}
          </select>
          <textarea ref={textRef} rows={3} value={text} onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== el.text && onPatch((x) => ({ ...x, text }))}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur(); }} />
          <label className="row">Text size
            <input type="range" min={12} max={120} value={el.fontSize} onChange={(e) => onPatch((x) => ({ ...x, fontSize: +e.target.value }))} />
            <span className="small">{el.fontSize}</span>
          </label>
          {!["caption", "sfx"].includes(el.kind) && (
            <label className="row"><input type="checkbox" checked={!el.noTail} onChange={(e) => onPatch((x) => ({ ...x, noTail: !e.target.checked }))} /> Show tail / arrow</label>
          )}
        </Section>
        <Section title="Colours">
          {el.kind !== "sfx" && el.kind !== "label" && <ColorField label="Bubble fill" value={el.fill} onPick={(c) => p("fill", c)} onReset={() => p("fill")} />}
          <ColorField label={el.kind === "sfx" ? "Letters" : "Text"} value={el.textColor} onPick={(c) => p("textColor", c)} onReset={() => p("textColor")} />
          <ColorField label={el.kind === "sfx" ? "Letter outline" : "Outline"} value={el.stroke} onPick={(c) => p("stroke", c)} onReset={() => p("stroke")} />
        </Section>
        {common}
      </div>
    );
  }

  if (el.type === "art") {
    return (
      <div className="insp">
        <h4>Drawing</h4>
        <Section title="Details">
          <label>Name<input value={el.label} onChange={(e) => onPatch((x) => ({ ...x, label: e.target.value }))} /></label>
          <p className="muted small">Want it drawn differently? Keep it selected and describe the change in the AI box, e.g. “make this a pressure cooker”.</p>
        </Section>
        <Section title="Colours">
          {TOKENS.map(([tok, name]) => (
            <ColorField key={tok} label={name} value={el.palette?.[tok] ?? tokenColor(t, tok)}
              onPick={(c) => onPatch((x) => (x.type === "art" ? { ...x, palette: { ...(x.palette ?? {}), [tok]: c } } : x))}
              onReset={el.palette?.[tok] ? () => onPatch((x) => { if (x.type !== "art") return x; const pal = { ...(x.palette ?? {}) }; delete pal[tok]; return { ...x, palette: pal }; }) : undefined} />
          ))}
        </Section>
        {common}
      </div>
    );
  }

  if (el.type === "panel") {
    return (
      <div className="insp">
        <h4>Panel frame</h4>
        <Section title="Colours">
          <ColorField label="Border" value={el.stroke} onPick={(c) => onPatch((x) => ({ ...x, stroke: c }))} onReset={() => onPatch((x) => ({ ...x, stroke: undefined }))} />
          <ColorField label="Background" value={el.fill} allowNone onPick={(c) => onPatch((x) => ({ ...x, fill: c }))} onReset={() => onPatch((x) => ({ ...x, fill: undefined }))} />
        </Section>
        {common}
      </div>
    );
  }

  if (el.type === "stroke") {
    return (
      <div className="insp">
        <h4>Pen stroke</h4>
        <Section title="Style">
          <ColorField label="Colour" value={el.color.startsWith("#") ? el.color : tokenColor(t, el.color.toUpperCase())} onPick={(c) => onPatch((x) => ({ ...x, color: c }))} />
          <label className="row">Thickness
            <input type="range" min={1} max={40} value={el.width} onChange={(e) => onPatch((x) => ({ ...x, width: +e.target.value }))} />
            <span className="small">{el.width}</span>
          </label>
        </Section>
        {common}
      </div>
    );
  }

  return (
    <div className="insp">
      <h4>Image</h4>
      {common}
    </div>
  );
}

/** Shown when nothing is selected: doodle-wide settings. */
export function DoodleSettings({ doodle, onDoodle }: { doodle: Doodle; onDoodle: (fn: (d: Doodle) => void) => void }) {
  const bgPreset = ["paper", "white", "soft", "none"];
  return (
    <div className="insp">
      <h4>Doodle</h4>
      <label>Title<input value={doodle.title} onChange={(e) => onDoodle((d) => { d.title = e.target.value; })} /></label>
      <div className="lbl">Drawing style</div>
      <div className="style-grid">
        {THEME_LIST.map((th) => (
          <button key={th.id} className={`style-card ${doodle.theme === th.id ? "on" : ""}`} onClick={() => onDoodle((d) => { d.theme = th.id; })} title={th.blurb}>
            <span className="dots">{[th.ink, th.accent, th.warm, th.soft].map((c) => <i key={c} style={{ background: c }} />)}</span>
            <b>{th.name}</b>
          </button>
        ))}
      </div>
      <p className="muted small">{THEMES[doodle.theme]?.blurb}</p>
      <div className="lbl">Background</div>
      <div className="seg wrap">
        {bgPreset.map((b) => <button key={b} className={doodle.background === b ? "on" : ""} onClick={() => onDoodle((d) => { d.background = b; })}>{b === "none" ? "Transparent" : b[0].toUpperCase() + b.slice(1)}</button>)}
      </div>
      <ColorField label="Custom background colour" value={doodle.background.startsWith("#") ? doodle.background : undefined}
        options={["#fffdf8", "#fff4d6", "#e8f6ff", "#e9fbef", "#ffe9e3", "#f3edfa", "#1f2340"]} onPick={(c) => onDoodle((d) => { d.background = c; })} />
      <p className="muted small">Select anything on the canvas to edit it: poses, faces, skin, hair, clothes, bubble colours… Or ask the AI on the left.</p>
    </div>
  );
}
