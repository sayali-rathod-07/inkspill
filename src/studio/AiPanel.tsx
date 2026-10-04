import { useEffect, useMemo, useRef, useState } from "react";
import type { AiCharacterBrief, Character, Doodle, DoodleEl } from "../types.ts";
import { api } from "../lib/api.ts";
import { detectCharacters } from "../doodle/layout.ts";
import { CharacterAvatar } from "../doodle/rig.tsx";
import { THEMES } from "../doodle/theme.ts";
import { useStore } from "../store.ts";
import { timeAgo } from "../lib/util.ts";

const QUICK_EDITS = [
  "Make it funnier",
  "Exaggerate everyone's expressions",
  "Add a background that sets the scene",
  "Add sound effects and motion lines",
  "Add sweat drops, anger marks and little reaction details",
  "Shorten the dialogue to punchy lines",
  "Make the last panel the punchline",
];

const WAITING = ["Sharpening pencils…", "Mixing purple ink…", "Blocking out the panels…", "Drawing exaggerated faces…", "Lettering the bubbles…", "Adding the SPLASH…"];

export const toBrief = (c: Character): AiCharacterBrief => ({ id: c.id, name: c.name, aliases: c.aliases, role: c.role, dna: c.dna });

export function AiPanel({ doodle, cast, elements, selectedId, onApply, onChange, sourceHint }: {
  doodle: Doodle;
  cast: Character[];
  elements: DoodleEl[];
  selectedId: string | null;
  onApply: (els: DoodleEl[]) => void;
  onChange: (fn: (d: Doodle) => void) => void;
  sourceHint?: string;
}) {
  const ai = useStore((s) => s.ai);
  const [tab, setTab] = useState<"create" | "edit">(elements.some((e) => e.type !== "image") ? "edit" : "create");
  const [text, setText] = useState(doodle.sourceText || sourceHint || "");
  const [panels, setPanels] = useState(2);
  const [direction, setDirection] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitIdx, setWaitIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const detected = useMemo(() => detectCharacters(text, cast.map(toBrief)), [text, cast]);
  const chosen = picked ?? detected;
  const theme = THEMES[doodle.theme];
  const selected = elements.find((e) => e.id === selectedId);

  useEffect(() => { setText(doodle.sourceText || sourceHint || ""); setPicked(null); setError(null); }, [doodle.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setWaitIdx((i) => (i + 1) % WAITING.length), 2200);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [doodle.history.length]);

  const log = (kind: "create" | "edit", p: string, reply: string) =>
    onChange((d) => { d.history.push({ at: Date.now(), kind, prompt: p, reply }); });

  const create = async () => {
    if (!text.trim() && !direction.trim()) { setError("Paste a passage or describe the scene first."); return; }
    setBusy(true); setError(null);
    try {
      const chars = chosen.length ? cast.filter((c) => chosen.includes(c.id)) : cast;
      const res = await api.doodle({
        mode: "create", text, prompt: direction, panels, theme: doodle.theme, width: doodle.width, height: doodle.height,
        characters: chars.map(toBrief),
      });
      // Keep any uploaded photos/strokes the author already placed; replace the rest.
      const keep = elements.filter((e) => e.type === "image" || e.type === "stroke");
      onApply([...keep, ...res.elements]);
      onChange((d) => { d.sourceText = text; });
      log("create", direction || `Illustrate: “${text.slice(0, 80)}${text.length > 80 ? "…" : ""}”`, res.note);
      setTab("edit");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = async (p = prompt) => {
    if (!p.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await api.doodle({
        mode: "edit", prompt: p, panels: 0, theme: doodle.theme, width: doodle.width, height: doodle.height,
        characters: cast.map(toBrief), current: elements, selectedId: selectedId ?? undefined, text: doodle.sourceText,
      });
      onApply(res.elements);
      log("edit", p, res.note);
      setPrompt("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="ai-panel">
      <div className="ai-tabs">
        <button className={tab === "create" ? "on" : ""} onClick={() => setTab("create")}>✨ Create</button>
        <button className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}>🗣 Prompt edit</button>
      </div>
      {!ai && (
        <div className="ai-note">
          <b>AI is off.</b> Add <code>GEMINI_API_KEY</code> (free) or <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart for AI-drawn scenes and prompt edits. Until then, “Create” lays out your characters automatically and you can edit everything by hand.
        </div>
      )}

      {tab === "create" ? (
        <div className="ai-body">
          <label>Passage to illustrate
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a paragraph — e.g. “A tsunami of boiling white liquid crashed onto the kitchen counter…”" />
          </label>
          <div className="lbl">Panels</div>
          <div className="seg">
            {[1, 2, 3, 4].map((n) => <button key={n} className={panels === n ? "on" : ""} onClick={() => setPanels(n)}>{n === 4 ? "2×2" : n}</button>)}
          </div>
          <div className="lbl">Who's in it {picked === null && detected.length > 0 && <span className="muted small">(auto-detected)</span>}</div>
          <div className="cast-chips">
            {cast.map((c) => {
              const on = chosen.includes(c.id);
              return (
                <button key={c.id} className={on ? "on" : ""} onClick={() => setPicked(on ? chosen.filter((x) => x !== c.id) : [...chosen, c.id])} title={c.role}>
                  <CharacterAvatar dna={c.dna} theme={theme} size={26} />{c.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <label>Direction <span className="muted small">(optional)</span>
            <input value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="e.g. slow-motion feel, Bhaiya overconfident, Maushi in the doorway" />
          </label>
          <button className="primary big" disabled={busy} onClick={() => void create()}>
            {busy ? WAITING[waitIdx] : elements.length ? "✨ Re-draw this doodle" : "✨ Draw it"}
          </button>
          {elements.length > 0 && <p className="muted small">Re-drawing replaces the scene (photos and pen strokes stay). ⌘Z brings the old one back.</p>}
        </div>
      ) : (
        <div className="ai-body chat">
          <div className="ai-log" ref={logRef}>
            {doodle.history.length === 0 && <p className="muted small">Ask for changes in plain words. The AI edits the scene — it doesn't start over — and you can keep tweaking by hand.</p>}
            {doodle.history.map((h, i) => (
              <div key={i} className="ai-turn">
                <div className="you">{h.prompt}</div>
                <div className="bot">{h.reply}<span className="when">{timeAgo(h.at)}</span></div>
              </div>
            ))}
            {busy && <div className="ai-turn"><div className="bot typing">{WAITING[waitIdx]}</div></div>}
          </div>
          {selected && (
            <div className="sel-pill">Editing selection: <b>{selected.type === "character" ? cast.find((c) => c.id === selected.charId)?.name : selected.type === "bubble" ? `“${selected.text.slice(0, 18)}”` : selected.type === "art" ? selected.label : selected.type}</b></div>
          )}
          <div className="quick">
            {QUICK_EDITS.map((q) => <button key={q} disabled={busy} onClick={() => void edit(q)}>{q}</button>)}
          </div>
          <form className="ai-input" onSubmit={(e) => { e.preventDefault(); void edit(); }}>
            <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy}
              placeholder={selected ? "Describe a change to the selected item…" : "e.g. “Make Bhaiya look guiltier and add a cat watching from the window”"}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void edit(); } }} />
            <button className="primary" disabled={busy || !prompt.trim()}>Send</button>
          </form>
        </div>
      )}
      {error && <div className="ai-error">{error}</div>}
    </aside>
  );
}
