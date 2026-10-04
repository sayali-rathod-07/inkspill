import { useEffect, useState } from "react";
import type { PolishMode, PolishSuggestion } from "../types.ts";
import { api } from "../lib/api.ts";
import { useStore } from "../store.ts";

const MODES: { id: PolishMode; label: string; hint: string }[] = [
  { id: "punchline", label: "🥁 Punchlines", hint: "land the jokes harder" },
  { id: "timing", label: "⏱ Comic timing", hint: "beats, pauses, reveals" },
  { id: "pacing", label: "🏃 Pacing", hint: "tighten or slow down" },
  { id: "dialogue", label: "💬 Dialogue", hint: "snappier, in character" },
  { id: "metaphor", label: "🌶 Metaphors", hint: "vivid scene-setting" },
  { id: "tighten", label: "✂️ Tighten", hint: "trim the filler" },
];

export function PolishPanel({ target, context, onApply, currentText }: {
  target: { blockId: string; text: string } | null;
  context: string;
  onApply: (blockId: string, excerpt: string, replacement: string) => void;
  currentText: (blockId: string) => string;
}) {
  const ai = useStore((s) => s.ai);
  const [mode, setMode] = useState<PolishMode>("punchline");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<(PolishSuggestion & { state?: "applied" | "dismissed" })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forBlock, setForBlock] = useState<string | null>(null);

  useEffect(() => { setItems([]); setNote(""); setError(null); }, [target?.blockId, target?.text]);

  const run = async () => {
    if (!target?.text.trim()) return;
    setBusy(true); setError(null); setItems([]); setNote("");
    try {
      const r = await api.polish(mode, target.text, context);
      setNote(r.note);
      setItems(r.suggestions);
      setForBlock(target.blockId);
      if (!r.suggestions.length) setNote((n) => n || "This one already works — no changes suggested.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="polish">
      <h4>Humor & dialogue polish</h4>
      <p className="muted small">Suggestions only — your voice stays yours. Select text in a paragraph (or click ✨ on one) and pick what to work on.</p>
      {!ai && <div className="ai-note">Needs <code>GEMINI_API_KEY</code> (free) or <code>ANTHROPIC_API_KEY</code> in <code>.env</code>.</div>}
      <div className="polish-modes">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>{m.label}<em>{m.hint}</em></button>
        ))}
      </div>
      <blockquote className="polish-target">{target?.text ? (target.text.length > 400 ? target.text.slice(0, 400) + "…" : target.text) : <span className="muted">Nothing selected yet.</span>}</blockquote>
      <button className="primary big" disabled={busy || !target?.text.trim() || !ai} onClick={() => void run()}>{busy ? "Reading it out loud…" : "✨ Suggest improvements"}</button>
      {error && <div className="ai-error">{error}</div>}
      {note && <p className="polish-note">{note}</p>}
      <ul className="suggestions">
        {items.map((s, i) => {
          const stillThere = forBlock ? currentText(forBlock).includes(s.excerpt) : false;
          return (
            <li key={i} className={s.state}>
              <div className="diff"><del>{s.excerpt}</del><ins>{s.replacement}</ins></div>
              <p className="why">{s.why}</p>
              {!s.state && (
                <div className="btn-row">
                  <button className="primary" disabled={!stillThere} onClick={() => { onApply(forBlock!, s.excerpt, s.replacement); setItems((xs) => xs.map((x, j) => (j === i ? { ...x, state: "applied" } : x))); }}>
                    {stillThere ? "Apply" : "Text changed"}
                  </button>
                  <button onClick={() => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, state: "dismissed" } : x)))}>Dismiss</button>
                </div>
              )}
              {s.state === "applied" && <span className="small">✓ applied</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
