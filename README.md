# InkSpill

Write, doodle and publish an illustrated memoir in one place. It comes pre-loaded with **My Chaotic Chronicles**: all 7 chapters, the chapter illustrations, the cast, and the family map.

## Run it

```bash
npm install
cp .env.example .env      # then paste a GEMINI_API_KEY (free) or ANTHROPIC_API_KEY into .env
npm run dev               # opens on http://localhost:5173 (or the next free port)
```

Open the site and **sign up first**. The first account becomes the owner of *My Chaotic Chronicles* (or set `INKSPILL_OWNER=<username>` to choose who). After that:
- Anyone, even without an account, can read public books in the library and leave comments.
- Only a book's author can edit it. Anyone who signs up can write their own books.
- AI requests are limited per person per day (`AI_DAILY_LIMIT`, default 25), because they use your key. The owner is unlimited.

Without an API key everything still works except the AI features. "Draw it" then lays out your characters, dialogue and sound effects automatically, and you edit by hand.

## What's where

| Tab | What it does |
|---|---|
| ✍️ **Write** | Outliner with drag-to-reorder chapters, parts, scenes, word counts and character tags. Paragraph editor with a live page preview. Highlight text, then **🎨 Doodle this** or **✨ Polish** (punchlines, comic timing, pacing, dialogue, metaphors, tighten). The `+` between paragraphs inserts doodles, scene breaks, side notes or audio/playlist links. |
| 🎨 **Doodle Studio** | **Create**: illustrate a passage as 1–4 panels. **Prompt edit**: "make Bhaiya look guiltier", "add a cat in the window" (select an item first to target it). **By hand**: drag, resize, rotate, poses, expressions, speech/thought/shout/whisper bubbles, captions, labels with arrows, SFX, stickers, freehand pen and eraser, image upload, layers, undo/redo, palette lock, PNG/SVG export. |
| 🧍 **Cast** | Each character's "visual DNA" (age, hair, outfit, colours, signature traits like horns, halo, band-aid or bald spot). Every doodle is drawn from this, so characters look the same in every scene. Also the relationship map that becomes the "Meet the Cast" front-matter page. |
| 📖 **Read** | Two-page spreads with a 3D page flip, paper textures, rustle sound, running heads, drop caps and a clickable contents page. On phones it switches to a webtoon-style scroll. Click any doodle to see it full screen. |
| 🚀 **Publish** | Print-ready PDF (trim sizes, 0.125" bleed, spine-width calculator, 300 DPI image check). Fixed-layout EPUB 3. Password-protected chapter-by-chapter reading link, with reader comments. |

## Notes
- Everything saves automatically to `data/` (books as JSON, uploads as files). Back that folder up.
- Doodles are vector SVG, so they print sharp at any size.
- The PDF is RGB. KDP and IngramSpark convert it to CMYK themselves.
- AI runs through the server, so your key never reaches the browser. It uses **Gemini** (free tier, `gemini-flash-latest`; get a key at https://aistudio.google.com/apikey) or **Claude** (`claude-opus-5-5`, paid). If both keys are set, Claude is used unless you set `AI_PROVIDER=gemini`.
- `npm run build && npm start` serves a production build on port 8787.

## Deploying
The included `Dockerfile` runs on any container host (Railway, Render, Fly.io…). The host needs:
- a **persistent volume mounted at `/data`**, where books, accounts and uploads live;
- environment variables `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`), `INKSPILL_OWNER` (your username) and optionally `AI_DAILY_LIMIT`.
