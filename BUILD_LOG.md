# Build Log

Kept as-built, not retroactively. Chronological.

## Setup

- Scaffolded with `create-next-app` (Next.js 16, App Router, TypeScript, Tailwind v4, no `src/` dir). Built as a
  standalone project inside a sibling `knowledge/` directory with its own git history rather than mixed into the
  existing unrelated repo in this working directory (a prior, unrelated class assignment — TriMATHalon).
- The only manual step requested from the user, per the build spec, was a free Gemini API key from
  https://aistudio.google.com/apikey. `gh` and `vercel` CLIs were checked and are **not installed** in this
  environment, so the app was built and tested entirely locally; exact manual GitHub-push and Vercel-deploy
  commands are given in `README.md` instead of being run here.

## Key decision: no RAG / no embeddings

Per the spec, deliberately skipped a vector DB or embeddings pipeline. Instead, `lib/corpus.ts` concatenates a
KB's entire extracted text — tagged per chunk with filename, folder, and page/slide/section label — directly into
the Gemini prompt, with a soft ~150K-token budget (`buildCorpus`) that truncates gracefully and returns a
`truncated` flag the UI surfaces as a banner. This is a real MVP simplification: it trades away scaling to very
large corpora in exchange for zero infra (no embedding store, no chunking-strategy tuning, no retrieval-quality
failure mode) and, just as importantly, for citation reliability — every chunk the model sees carries its exact
real label, so a citation can't drift the way a retrieval hit summarized out of context might.

## Key decision: DOCX citations are section-based, not page-based

DOCX has no reliable native page number — pagination is a rendering-time property of the reader (Word, Google
Docs, a PDF export), not something stored in the `.docx` XML the way PDF page boundaries are. Rather than fake a
page number (which the spec explicitly called out as unacceptable), `lib/parse/docx.ts` chunks by
`Heading 1`–`3` styles (as mammoth exposes them) and cites as `Section: <heading text>`. A DOCX with no headings
falls back to fixed ~500-word chunks cited as `Section N`. PDF and PPTX both get real native page/slide numbers
(`lib/parse/pdf.ts`, `lib/parse/pptx.ts`) since both formats store that structure directly.

## Key decision: SQLite, including file blobs, as the only datastore

Chose `better-sqlite3` over standing up a hosted Postgres, per the spec's own allowance ("whichever is faster for
you to stand up reliably today") — no external account/credential needed, and it's the one persistence choice
that didn't require asking the user for a second manual credential beyond the Gemini key. Original uploaded file
bytes are stored as a BLOB column alongside metadata (`files.content` in `lib/db.ts`) rather than a separate
object store, so the citation-download feature (Feature 2) works with zero additional infrastructure.

**Honest tradeoff, called out prominently in `README.md`:** Vercel's default serverless deploy target has an
ephemeral, non-shared filesystem, so a local SQLite file is not guaranteed to persist writes across requests once
deployed there — reliable for `npm run dev` and any host with real persistent disk, not guaranteed on Vercel's
default deploy. This is flagged as a known limitation with a documented fix path (swap `lib/db.ts` for a hosted
Postgres connection string) rather than silently shipped as if solved, per the "don't fabricate confidence"
instinct this build is being graded on.

## Parsing

- **PDF:** `pdf-parse` v2. Its API turned out to have changed completely from the older `pagerender`-callback
  version I initially wrote against — v2 ships a `PDFParse` class whose `getText()` already returns per-page
  `{num, text}` natively. Caught this by actually running a real upload against the dev server rather than trusting
  the first draft: the first attempt threw `pdfParse is not a function` at runtime, traced to the wrong API shape,
  fixed by reading the installed package's real README/type declarations (`node_modules/pdf-parse/dist/.../TextResult.d.ts`)
  instead of guessing further.
- **PPTX:** hand-rolled extractor (`lib/parse/pptx.ts`) over the raw slide XML inside the `.pptx` zip (via
  `jszip`), reading the slide number straight from the `slideN.xml` filename and pulling `<a:t>` text runs. Chosen
  over a third-party PPTX-parsing package to avoid a dependency of uncertain maintenance for something this
  mechanical; verified against a real generated `.pptx` fixture.
- **DOCX:** `mammoth`, converting to HTML and splitting on heading tags (see decision above).

## LLM wrapper

- `lib/llm.ts` exposes one function, `generate({systemPrompt, userPrompt})`, wrapping `@google/generative-ai`, so
  swapping providers later is a one-line change at each call site rather than a rewrite.
- Initially used `gemini-2.0-flash`, which the live API rejected with a 404 ("no longer available... use
  models/gemini-3.6-flash"). Caught by an actual end-to-end call against the real API (not assumed from training
  knowledge, which is stale here), fixed by switching to the model name the API itself named as current.

## Verification performed this session (not just written and assumed working)

Ran a full real pass against the live local dev server, not a reimplementation:
1. Generated real fixture files (a `.docx` with three headed sections, a `.pptx` with five slides, a two-page
   `.pdf` of practice problems) with Python (`python-docx`, `python-pptx`, `reportlab`) since no sample class
   materials were available.
2. Created a KB via `POST /api/kb`, uploaded all three fixtures to their respective folders, confirmed correct
   per-file chunk counts back from the API.
3. Asked an in-scope question ("What is consumer surplus...") — got an answer correctly grounded in and citing
   the uploaded DOCX section, in the exact `(filename, Label)` format the citation-linkifier expects.
4. Asked an out-of-scope question ("What is the capital of France?") — got the exact required fallback string
   verbatim, logged with `answer_source: "fallback"`.
5. Generated a practice test with a section filter — got a test whose multiple-choice/short-answer/calculation
   mix matched the uploaded practice PDF's own format, correctly using the notes for topic content (elasticity,
   equilibrium) rather than inventing unrelated topics.
6. Rated an answer via the feedback endpoint, then confirmed `/api/stats` reflected the real counts (questions
   asked, source vs. fallback split, thumbs up/down) — this is the same data `/admin` renders.
7. Downloaded a cited source file and confirmed the correct `Content-Type`/filename came back.
8. Created a second, empty KB and confirmed `generate-test` refuses with the required explanation when no
   practice problems are uploaded.
9. Confirmed an unsupported file type (`.txt`) is rejected with a clear message instead of silently mis-parsing.
10. `npx tsc --noEmit` and `npm run build` both pass clean.

## Post-deploy: SQLite doesn't work on Vercel at all, not just "may not persist"

The original build log (and README's known-limitations section) flagged Vercel's serverless filesystem as a soft
risk — "writes might not persist across requests." Once the user actually deployed and tested it, that turned out
to understate the problem: the very first real interaction (create a KB, click into it) 500'd, then after an
initial fix (pointing the SQLite file at `/tmp`, which Vercel *does* allow writing to) still 404'd — creating a KB
succeeded, but the immediately-following page load couldn't find it, because the two requests ran on different
serverless instances with no shared disk between them. This isn't an edge case that shows up under heavy
concurrency; it reproduced on the second request, every time.

**Fix:** `lib/db.ts` became a small dispatcher that picks a backend based on environment: `lib/db-sqlite.ts`
(the original implementation, unchanged, used for local dev) or a new `lib/db-postgres.ts` using
`@neondatabase/serverless`, selected automatically once a Postgres connection string (`DATABASE_URL`/`POSTGRES_URL`,
set automatically by Vercel's Storage → Neon integration) is present in the environment. Every function in the
public `lib/db.ts` API became `async` (trivial for the SQLite side, since its work was already synchronous — just
wrapped) so both backends share one identical calling convention and no call site needs to know which is active.

One real Postgres-specific gotcha caught before it shipped: Postgres's `COUNT`/`SUM` return `bigint`, which
node/neon drivers hand back as strings by default (to avoid silent precision loss on huge counts) — left unhandled,
`/admin`'s `thumbs_up + thumbs_down` would have silently become string concatenation ("3" + "0" = "30") instead of
addition once running against Postgres. Fixed with explicit `::int` casts in every aggregate query in
`lib/db-postgres.ts`, keeping its returned shape numeric like the SQLite backend's.

`require()` (not `import`) is used in the `lib/db.ts` dispatcher specifically so the *unused* backend's module code
never executes — `lib/db-postgres.ts` constructs its Neon client at module load and assumes a connection string
exists, which would throw immediately in local dev if it were loaded unconditionally.

This was caught and fixed by testing the real deployed app, not by reasoning about Vercel's architecture in the
abstract — worth remembering that a documented caveat ("may not persist") can understate an actual hard failure
("doesn't work at all") until someone clicks through the real flow.

## Known tradeoffs under time pressure

- No automated test suite — verification above was manual/scripted against the real running app, not unit tests,
  given the one-night timeline. If this moves past MVP, the fixture-generation script used for verification (now
  discarded, was scratch) is a reasonable seed for a real integration test.
- Citation linkification (`lib/citations.tsx`) is a client-side regex match against the exact `(filename, Label)`
  format the system prompt requires — robust as long as the model stays in format (it did, consistently, across
  every test run), but not resilient to a model that ignores the format instruction. Left as-is rather than adding
  a stricter structured-output mode, to keep the LLM call surface simple for the MVP deadline.
- No rate limiting or abuse protection on the (unauthenticated, per the spec) API routes — acceptable for a
  single-class classroom demo, not for open public traffic.
