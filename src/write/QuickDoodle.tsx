import { useMemo, useState } from "react";
import type { Book, Doodle } from "../types.ts";
import { api } from "../lib/api.ts";
import { DoodleSvg } from "../doodle/DoodleSvg.tsx";
import { detectCharacters } from "../doodle/layout.ts";
import { CharacterAvatar } from "../doodle/rig.tsx";
import { THEMES, THEME_LIST } from "../doodle/theme.ts";
import { toBrief } from "../studio/AiPanel.tsx";
import { newDoodle } from "../studio/StudioPage.tsx";
import { useStore } from "../store.ts";

/** The "highlight a sentence → doodle it" pop-up. */
export function QuickDoodle({ book, text, onClose, onInsert }: {
  book: Book; text: string; onClose: () => void; onInsert: (d: Doodle, openStudio: boolean) => void;
}) {
  const ai = useStore((s) => s.ai);
  const [panels, setPanels] = useState(text.length > 220 ? 3 : text.length > 90 ? 2 : 1);
  const [theme, setTheme] = useState(book.theme);
  const [direction, setDirection] = useState("");
  const detected = useMemo(() => detectCharacters(text, book.characters.map(toBrief)), [text, book.characters]);
  const [picked, setPicked] = useState<string[]>(detected);
  const [result, setResult] = useState<Doodle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const d = newDoodle({ theme }, { title: text.replace(/\s+/g, " ").slice(0, 40).replace(/\s\S*$/, "") + "…", sourceText: text, w: panels === 1 ? 900 : 1200, h: panels === 1 ? 700 : 640 });
      const chars = picked.length ? book.characters.filter((c) => picked.includes(c.id)) : book.characters;
      const res = await api.doodle({ mode: "create", text, prompt: direction, panels, theme, width: d.width, height: d.height, characters: chars.map(toBrief) });
      d.elements = res.elements;
      d.history.push({ at: Date.now(), kind: "create", prompt: direction || "Illustrate the highlighted passage", reply: res.note });
      setResult(d);
      setNote(res.note);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide quick-doodle" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>×</button>
        <h3>🎨 Doodle this</h3>
        <blockquote>{text.length > 300 ? text.slice(0, 300) + "…" : text}</blockquote>
        <div className="qd-grid">
          <div className="qd-opts">
            <div className="lbl">Panels</div>
            <div className="seg">{[1, 2, 3].map((n) => <button key={n} className={panels === n ? "on" : ""} onClick={() => setPanels(n)}>{n}-panel</button>)}</div>
            <div className="lbl">Style</div>
            <div className="seg wrap">{THEME_LIST.map((t) => <button key={t.id} className={theme === t.id ? "on" : ""} onClick={() => setTheme(t.id)} title={t.blurb}>{t.name}</button>)}</div>
            <div className="lbl">Characters</div>
            <div className="cast-chips">
              {book.characters.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button key={c.id} className={on ? "on" : ""} onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])}>
                    <CharacterAvatar dna={c.dna} theme={THEMES[theme]} size={24} />{c.name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
            <label>Direction <span className="muted small">(optional)</span>
              <input value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="e.g. make Mummy's entrance dramatic" />
            </label>
            {!ai && <p className="ai-note">No AI key — this will lay out your characters and dialogue automatically; refine it in the Studio.</p>}
            <button className="primary big" disabled={busy} onClick={() => void generate()}>{busy ? "Drawing… (≈30s)" : result ? "↻ Try again" : "✨ Generate"}</button>
            {error && <div className="ai-error">{error}</div>}
          </div>
          <div className="qd-preview">
            {result ? (
              <>
                <DoodleSvg doodle={result} cast={book.characters} />
                {note && <p className="muted small">{note}</p>}
                <div className="btn-row">
                  <button className="primary" onClick={() => onInsert(result, false)}>Insert into chapter</button>
                  <button onClick={() => onInsert(result, true)}>Insert & edit in Studio →</button>
                </div>
              </>
            ) : (
              <div className="qd-empty">{busy ? <div className="ink-spinner" /> : "Your doodle will appear here."}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
