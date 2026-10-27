# InkSpill

**Write, doodle and publish an illustrated book in one place.**

🔗 **Live app:** https://inkspill.onrender.com
(Free Render plan: the first load after a quiet period can take ~50 seconds while the server wakes up.)

---

## Problem Statement

Writers who want an *illustrated* book, like a memoir, comic-style story or picture book, have to juggle many tools. They write in a word processor, draw in a separate app, keep a document of what each character looks like, rebuild the layout for print, and use yet another service to share drafts with readers. Characters drift in appearance between scenes, illustrations go out of sync with the text, and turning it all into a print-ready PDF or EPUB is a job on its own.

## Target Users

- **Hobby and indie authors** writing illustrated memoirs, short stories or webcomic-style books.
- **Writers who can't draw (much)** but want consistent, expressive doodles alongside their text.
- **Their readers:** friends, family or beta readers who need an easy link to read chapters and leave feedback.

## Solution

InkSpill puts the whole pipeline (**write → illustrate → read → publish → get feedback**) in one web app built around a single book model:

- The manuscript, cast, doodles and layout settings all live in one book, so changing a character's "visual DNA" changes how they are drawn everywhere.
- Doodles are **vector SVG scenes built from structured data** (panels, characters, poses, bubbles), not flat images. They can be generated from a passage, edited by prompt or by hand, and still print sharp at any size.
- The same book renders as a page-flip reader, a print-ready PDF, a fixed-layout EPUB and a password-protected share link with reader comments and reader stats.

The pre-loaded book, *My Chaotic Chronicles* (7 chapters, illustrations, cast and family map), is the author's own writing and is included as demo content.

## Key Features (core workflows)

1. **Write a book:** sign up, create a book, and organise it into parts, chapters and scenes with a drag-to-reorder outliner, word counts and character tags. The paragraph editor has a live page preview. Highlight text to **✨ Polish** it (punchlines, comic timing, pacing, dialogue, tighten) or **🎨 Doodle this**.
2. **Illustrate it (Doodle Studio):** turn a passage into a 1–4 panel doodle, then refine it by prompt ("make Bhaiya look guiltier") or by hand: drag, resize, rotate, poses, expressions, speech/thought/shout bubbles, captions, SFX, stickers, freehand pen, image upload, layers, undo/redo, PNG/SVG export.
3. **Keep characters consistent (Cast):** each character has a visual DNA (age, hair, outfit, colours, signature traits) that every doodle is drawn from, plus a relationship map that becomes the "Meet the Cast" page.
4. **Read it:** two-page spreads with a 3D page flip, paper textures, page sounds, drop caps and a clickable contents page. On phones it switches to a webtoon-style scroll. There's also an optional Spotify/YouTube soundtrack.
5. **Publish and get feedback:** print-ready PDF (trim sizes, 0.125" bleed, spine-width calculator, 300 DPI check), fixed-layout EPUB 3, and a password-protected chapter-by-chapter share link. Readers comment, and the author sees reader counts, per-chapter reach and a daily readers chart.

**Accounts and permissions:** anyone (even logged out) can read public books and comment; only a book's author can edit, share or delete it; anyone who signs up can write their own books.

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, React Router | Component-heavy editor UI, fast dev server |
| State | Zustand | Simple global store for the open book, autosave |
| Drag & drop | dnd-kit | Reordering parts, chapters and scenes |
| Backend | Node.js, Express 5, TypeScript (tsx) | One small API server that also serves the built frontend |
| Storage | Local JSON files **or** PostgreSQL (`pg`) | Files for zero-setup local use; Postgres for hosts with wiped disks |
| AI | Google Gemini (`@google/genai`) or Anthropic Claude (`@anthropic-ai/sdk`) | Structured scene generation and writing polish; provider is switchable |
| Validation | Zod | AI output is validated against a scene schema before use |
| Export | JSZip (EPUB), browser print pipeline (PDF) | No server-side rendering service needed |
| Deployment | Docker on Render (free), Neon Postgres (free) | Defined in `Dockerfile` and `render.yaml` |

## Architecture

```
Browser (React SPA)
  ├─ Write / Studio / Cast / Read / Publish pages
  ├─ Zustand store ── autosaves the book ──┐
  ├─ SVG doodle renderer + editor          │  fetch /api/*  (session cookie)
  └─ PDF/EPUB export (client-side)         ▼
Express server (server/index.ts)
  ├─ auth.ts     sign up / log in / sessions (scrypt-hashed passwords, HttpOnly cookie), AI daily limits
  ├─ index.ts    books, comments, uploads, share links; ownership checks on every write
  ├─ ai.ts       prompt building → Gemini or Claude → Zod-validated scene JSON
  ├─ fallback.ts deterministic auto-layout used when no AI key is set
  ├─ stats.ts    reader counts and per-chapter reach (writes serialised per book)
  ├─ seed.ts     loads the demo book on first run
  └─ storage.ts  Store interface ─┬─ FileStore     (data/*.json + data/uploads)
                                  └─ PostgresStore (when DATABASE_URL is set)
```

Key decisions:

- **Doodles as data, not images.** The AI returns a structured scene (panels, characters, positions, poses, bubbles) that is validated and then rendered by our own SVG engine (`src/doodle/`). That is what makes prompt edits, hand edits, consistent characters and sharp printing possible.
- **AI only on the server.** API keys never reach the browser. Each user has a daily AI quota (`AI_DAILY_LIMIT`), AI responses are validated against a schema, failures are shown as errors, and without a key the app uses an automatic layout instead.
- **Pluggable storage.** One `Store` interface with file and Postgres implementations, so the app runs locally with no database and in production on a free host.
- **Security.** Passwords and share-link passwords are hashed with scrypt and compared in constant time. Authorization is checked on the server for every edit, delete, share and stats request. Uploaded files are served with a restrictive Content-Security-Policy and `nosniff`. Embedded SVG and user-supplied links are sanitised before rendering.
- **Error handling.** The API returns clear 400/401/403/404/409/415/429 responses (bad input, not logged in, not your book, missing book or share, duplicate username, unsupported upload type, AI limit reached). The UI shows loading, empty, saved and error states, and the AI features degrade gracefully when no key is set.

## Local Setup

Requirements: **Node.js 24+** and npm.

```bash
git clone https://github.com/sayali-rathod-07/inkspill.git
cd inkspill
npm install
cp .env.example .env      # optional: add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY
npm run dev               # web on http://localhost:5173, API on http://localhost:8787
```

Open the site and **sign up first**. The first account becomes the owner of *My Chaotic Chronicles* (or set `INKSPILL_OWNER=<username>`).

Without an API key everything works except the AI features; "Draw it" then lays out characters, dialogue and sound effects automatically and you edit by hand.

Production build: `npm run build && npm start` (serves everything on port 8787). Type check: `npm run typecheck`.

## Environment Variables

All are optional for local use. See `.env.example`. Never commit your real `.env`.

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Enables AI using Google Gemini (free tier) | – |
| `GEMINI_MODEL` | Gemini model name | `gemini-flash-latest` |
| `ANTHROPIC_API_KEY` | Enables AI using Claude | – |
| `AI_PROVIDER` | `gemini` or `anthropic` when both keys are set | `anthropic` |
| `AI_DAILY_LIMIT` | AI requests per user per day (owner unlimited) | `25` |
| `INKSPILL_OWNER` | Username that owns the pre-loaded book | first sign-up |
| `DATABASE_URL` | Postgres connection string; if set, data is stored in Postgres instead of files | – |
| `PG_POOL_MAX` | Postgres connection pool size | – |
| `DATA_DIR` | Folder for file storage | `./data` |
| `UPLOAD_LIMIT_MB` | Max upload size | `30` (files) / `8` (Postgres) |
| `PORT` | Server port | `8787` |

## Deployment

- **Live:** https://inkspill.onrender.com
- Runs as a Docker web service on **Render** (free plan) using `render.yaml`, with data in a free **Neon** Postgres database via `DATABASE_URL`.
- To deploy your own: fork the repo, create a Render Blueprint from `render.yaml`, and set `DATABASE_URL`, `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) and `INKSPILL_OWNER`. Any other container host (Railway, Fly.io…) works with the `Dockerfile`. Without `DATABASE_URL`, mount a persistent volume at `/data`.
- Health check: `GET /api/status`.

## Known Limitations

- The per-user AI counter is kept in memory, so it resets if the server restarts.
- The free Render instance sleeps when idle (slow first load).
- The PDF is RGB; KDP and IngramSpark convert to CMYK themselves.

## AI Usage

AI coding assistants were used during development for code generation, debugging and documentation, as allowed by the project guidelines. In the app itself, AI (Gemini/Claude) generates structured doodle scenes and writing-polish suggestions.

Demo Video link - https://drive.google.com/file/d/1exXECnJXWRV-YRPlZSNx3iQS7ysrUQC8/view?usp=sharing
