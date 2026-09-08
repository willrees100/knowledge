# KNOWLEDGE

A student turns their own class materials into a source-grounded study assistant. Upload your notes, slides, and
practice problems for one class; ask questions that are answered **only** from what you uploaded, with clickable
citations; generate a practice test whose difficulty is anchored to your real practice problems, not guessed.

**Live URL:** https://knowledge-nine-sepia.vercel.app/ — _requires a Postgres database attached, see "Deploying" below_
**Repo:** https://github.com/willrees100/knowledge

## What it does

1. **Create a knowledge base (KB)** for one class — name it, describe what it covers, and note anything you want
   the assistant to focus on. That setup form is folded into the assistant's system prompt; it steers tone and
   scope, it isn't just decorative.
2. **Upload materials** into three folders: Notes (PDF/DOCX/TXT), Slides (PDF/PPTX), Practice Problems
   (PDF/DOCX/PPTX/TXT). Typed text only — no OCR.
3. **Ask questions.** The assistant answers strictly from your uploaded material, with inline citations like
   `(Week3Notes.docx, Section: Elasticity)` or `(Lecture4Slides.pptx, Slide 4)`. Each citation is a clickable link
   that opens the original file so you can find the exact spot yourself. If the material doesn't contain the
   answer, it says so explicitly instead of guessing.
4. **Generate a practice test — and actually take it.** Tell it how many questions, which sections, and what to
   focus on. The test's format and difficulty are anchored to your actual uploaded practice problems (notes/slides
   only add topic coverage, never style or difficulty). It refuses to generate anything if you haven't uploaded
   practice problems. Answer the questions right there in the app and submit — multiple choice grades instantly,
   short-answer/calculation questions get judged by the assistant against the correct answer (not just exact-text
   matching), and every answer gets a short, source-cited explanation plus a real "you're right" celebration for
   correct ones, not just a generic "Correct!".
5. **Every answer gets a thumbs up/down**, and every Q&A + test generation is logged with a timestamp. See
   `/admin` for the running totals — this is the evidence mechanism for `HYPOTHESIS.md`'s decision rule.

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind — single repo, deployable to Vercel's free tier.
- Google Gemini (`gemini-3.6-flash`) via `lib/llm.ts`, a single `generate()` function so swapping providers is a
  one-line change, not a rewrite.
- No vector DB / no embeddings. Gemini Flash's context window is large enough to include a whole class's extracted
  text directly in the prompt, tagged by source and page/slide/section — a deliberate MVP simplification (see
  `BUILD_LOG.md`). A soft ~150K-token budget truncates gracefully and flags it in the UI if a class's material is
  unusually large.
- Storage: `lib/db.ts` dispatches between two backends behind one identical async API. Locally (and on any deploy
  with no Postgres attached) it's SQLite (`better-sqlite3`), one local file storing KB metadata, extracted text,
  **and the original uploaded file bytes** (so citation downloads work without a separate object store), plus the
  feedback and test-generation logs. **On Vercel, a real Postgres database (e.g. Neon) is required** — see
  "Deploying" and "Known limitations" below for why file-based storage doesn't work there at all.
- File parsing: `pdf-parse` v2 (native per-page text), a hand-rolled PPTX extractor over the raw slide XML (native
  per-slide text — no extra dependency needed), `mammoth` for DOCX (heading-based section chunking), and plain TXT
  (fixed-size word chunking, same fallback DOCX uses when it has no headings — TXT has no native structure to cite
  against either).
- No auth. Anyone with a KB's URL can use it — acceptable for this MVP.

## Setup

```bash
cd knowledge
npm install
cp .env.example .env.local   # then paste your Gemini API key into .env.local
npm run dev
```

Get a free Gemini API key at https://aistudio.google.com/apikey (no credit card required).

Visit `http://localhost:3000`, create a knowledge base, and upload some files.

## Deploying

### Push to GitHub

```bash
cd knowledge
gh repo create knowledge --public --source=. --remote=origin --push
# or, without gh:
# git remote add origin https://github.com/<you>/knowledge.git
# git push -u origin main
```

### Deploy to Vercel

```bash
npx vercel login
npx vercel                      # first deploy, follow the prompts
npx vercel env add GEMINI_API_KEY production   # paste your key when prompted
npx vercel --prod
```

Or via the Vercel dashboard: import the GitHub repo, then under Project → Settings → Environment Variables add
`GEMINI_API_KEY`.

### Attach a Postgres database (required for the deployed app to work at all)

Vercel's deployed serverless functions run on separate, short-lived instances with no shared writable disk — a
file (SQLite included) written by one request is often invisible to the very next request. Confirmed live: creating
a knowledge base succeeded, but loading its page immediately after 404'd, because the two requests landed on
different instances. `lib/db.ts` already supports Postgres (`lib/db-postgres.ts`, via `@neondatabase/serverless`)
and switches to it automatically once a connection string is present — you just need to attach one:

1. In the Vercel dashboard, open the project → **Storage** tab → **Create Database** → choose **Neon** (Postgres,
   free tier) → follow the prompts to create and connect it to this project.
2. Vercel automatically sets `DATABASE_URL` (or `POSTGRES_URL`) as an environment variable — no copying a
   connection string by hand.
3. Redeploy (Vercel does this automatically on the next push, or trigger one from the dashboard). The app will
   create its tables on first request against the new database.

Until this is done, the deployed app will error or silently lose data between requests — this step isn't optional.

## Known limitations (read before grading/demoing)

- **Gemini's free API tier has a real, fairly low request cap.** Confirmed directly from a live error while
  testing, not a guess: `gemini-3.6-flash`'s free tier is limited to 20 requests/day per project. A single class
  demo session (uploads don't count, but every question, practice-test generation, and practice-test *grading*
  call does) can burn through that fast — one classroom of students trying it live could hit it well within a
  class period. What was actually observed: a request that got rate-limited returned a proper `429`, which the app
  already handles gracefully everywhere (a clear error for Q&A/test generation, a "couldn't auto-grade — here's the
  reference answer" fallback for test grading — never a raw crash), and a retry after under a minute succeeded, so
  in practice it may behave more like a rolling/burst limit than a strict once-a-day cutoff — but that's an
  observation from one retry, not a characterized guarantee. If this matters for tomorrow, the fix is enabling
  billing on the Google AI Studio project ahead of time (moves to the paid tier — cost is genuinely small, see
  `VENTURE_ECONOMICS.md`) rather than hoping the free tier holds up under real classroom load.
- **DOCX has no reliable native page number.** Word/DOCX pagination depends entirely on the reader rendering it —
  the file format itself doesn't store page breaks the way PDF does. Rather than fabricate a page number, DOCX
  files are chunked by heading (`Heading 1`–`3` styles) and cited as `Section: <heading text>`; a document with no
  headings falls back to fixed-size ~500-word chunks cited as `Section N`. This is a real, intentional constraint,
  not a bug.
- **Context-window ceiling.** All of a KB's extracted text is included directly in every prompt (no RAG/embedding
  pipeline — see `BUILD_LOG.md` for why). Past a rough ~150K-token budget, material is truncated and the UI shows
  a note on that answer/test. For a single class's worth of notes/slides/practice sets this budget is generous,
  but a KB with an unusually large amount of material could hit it.
- **Vercel's serverless filesystem is not shared across instances — file-based storage does not work there at
  all.** This was caught live, not just reasoned about: creating a knowledge base against the deployed app
  succeeded, but loading its page immediately after returned a 404, because the two requests ran on different
  instances with no shared disk. The fix (already shipped): `lib/db.ts` uses a real Postgres database on Vercel
  instead of SQLite, switching automatically once one is attached — see "Attach a Postgres database" above. This
  is not optional for the deployed app; local dev (`npm run dev`) is unaffected and keeps using SQLite.
- **No auth, single class per KB, no OCR for scanned documents, no user accounts.** All explicitly out of scope
  for this MVP by design — see the original build spec.
- **Vercel's serverless request-body limit (~4.5MB)** can reject very large slide decks with embedded
  images/video — confirmed live: an oversized upload gets a `413` straight from Vercel's platform, before it ever
  reaches the app. The upload UI now warns and blocks per-file uploads over ~4MB client-side (with a clear reason)
  instead of the request silently failing with a raw, unhelpful error; a file just under that per-file cap combined
  with several others in the same batch can still hit the platform limit, which now surfaces as a readable message
  too rather than crashing on an unparseable response. If a slide deck is too big regardless, split it or compress
  its images before uploading, or upgrade the Vercel plan.

## Deliverables

- `HYPOTHESIS.md` — the precommitted hypothesis and decision rule.
- `VENTURE_ECONOMICS.md` — pricing, per-question cost, and market-size sketch.
- `BUILD_LOG.md` — what was built, key decisions, and tradeoffs, written as it happened.
- `REVISION_RECEIPT.md` — slot for real usage findings and what changed as a result.
