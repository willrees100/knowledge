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

## Post-deploy round 2: while the user was away, found and fixed three more real bugs

Ran checks against the live deployed app without the user present (they'd stepped away before attaching Postgres),
specifically to surface anything broken before they came back rather than just waiting.

1. **File uploads 500'd on the live deploy — for every format, not just PDF.** `curl`ing a plain DOCX upload against
   the live app returned a bare `500` with an empty body, 3/3 times. Traced to `lib/parse/index.ts` statically
   importing all three format parsers (`pdf.ts`, `docx.ts`, `pptx.ts`) at the top of the file — `pdf-parse` pulls in
   `@napi-rs/canvas`, a native-binary dependency, and if that fails to load correctly in Vercel's serverless build
   (a known class of failure for native addons under bundlers), the *whole module* fails to import, which took down
   DOCX and PPTX uploads too, since just importing `lib/parse/index.ts` at all would throw before `extractChunks`
   ever ran. Fixed by making each parser's import lazy (`await import("./pdf")` etc., inside the switch case) so a
   DOCX/PPTX upload never touches the PDF parser's dependency graph — and as a side effect, a PDF-specific native
   module failure is now caught by the per-file try/catch already in the upload route instead of crashing the whole
   request. Also added `@napi-rs/canvas` to `next.config.ts`'s `serverExternalPackages` as a further defensive
   measure. Not fully re-verified against the live PDF upload path specifically (that requires the Postgres step to
   be done first to test reliably, since KB creation and upload need to land on the same instance) — the DOCX/PPTX
   fix is confirmed by the reproduction above and a full local re-test of all three formats.
2. **`/admin` stats showed `null` instead of `0` on an empty database.** SQL's `SUM()` over zero matching rows
   returns `NULL`, not `0` — confirmed live by hitting `/api/stats` against a fresh KB with no feedback yet. The
   Postgres backend already wrapped every `SUM()` in `COALESCE(...,0)` (written that way from the start, following
   the same instinct that led to the `::int` bigint-cast fix above); the original SQLite backend's equivalent query
   did not, which only showed up once a genuinely empty table was actually queried against the live app rather than
   the local dev testing, which always had at least one feedback row by the time stats were checked. Fixed by adding
   the same `COALESCE` wrapping to `lib/db-sqlite.ts`.
3. **`setFeedbackThumbs` would have silently reported "not found" on every successful rating once Postgres was
   live** — caught by reading `@neondatabase/serverless`'s own type declarations rather than assuming: its `sql`
   tag returns only result *rows* by default, and a plain `UPDATE` with no `RETURNING` clause returns none
   regardless of whether it matched anything. Fixed by adding `RETURNING id`. (This one didn't reproduce yet on the
   live site, since Postgres isn't attached — caught by code review before it could bite, not by a live failure.)

All three fixes were re-verified with a full local run (create KB → upload real DOCX/PPTX/PDF fixtures → confirm
all three parse successfully → check `/api/stats` on an empty database returns `0`s, not `null`s) and a clean
`tsc`/`build`/`lint`, then committed and pushed. Confirmed live afterward too: the previously-500ing DOCX upload
against the deployed app now succeeds.

## Post-deploy round 3: a live PDF-parsing gap, and a real local build race

Re-tested the live deploy after round 2 landed. DOCX uploads now succeed against the deployed app — but PDF uploads
still fail there specifically (`"Failed to parse file"`), while working fine locally. This is consistent with the
round-2 theory: `pdf-parse`'s native-binary dependency (`@napi-rs/canvas`) likely isn't loading correctly under
Vercel's serverless runtime even with `serverExternalPackages` set. Because of the round-2 lazy-import fix, this
failure is now contained to PDF files specifically — it no longer takes down the whole upload request — but a
practice-problems folder that's PDF-only (as the spec's own example is) won't work until this is chased further,
likely needing real Vercel function log access (not available from this environment) to see the actual thrown
error rather than guess at it. Improved the upload route's error message to include the real exception text instead
of a generic "Failed to parse file." string, so the next person with dashboard access can see the real cause in one
look instead of needing to reproduce it with better logging first.

**Root cause found and fixed** (thanks to the improved error message above making it visible without dashboard log
access): `ReferenceError: DOMMatrix is not defined`, thrown while `pdf-parse`'s own module was still loading, not
while calling a method on it. `pdfjs-dist` (used internally by `pdf-parse`) references browser DOM globals like
`DOMMatrix` at its own module-load time; `@napi-rs/canvas` (`pdf-parse`'s own dependency) ships Node-compatible
versions of exactly these globals, meant to be used for this. Fixed with an explicit polyfill in `lib/parse/pdf.ts`
that sets `globalThis.DOMMatrix`/`Path2D`/`ImageData` from `@napi-rs/canvas` *before* `pdf-parse` is ever imported —
which required switching `pdf-parse`'s import from a static top-level one to a dynamic `await import(...)` placed
after the polyfill, since a static import always runs before any other code in the module regardless of where it's
written. Two dead ends on the way, both real and both reverted rather than left half-done: removing `pdf-parse`
from `serverExternalPackages` (to see if normal bundling would wire the polyfill correctly on its own) instead broke
local dev worse, with pdfjs-dist's worker file failing to bundle entirely; requiring `@napi-rs/canvas` directly from
a non-externalized file hit a Turbopack build error ("non-ecmascript placeable asset") on its native `.node`
binding. Final state: both `pdf-parse` and `@napi-rs/canvas` stay in `serverExternalPackages` (their native/CJS
internals need to stay unbundled), with the explicit polyfill handling the DOM-global gap that caused the original
failure. Verified with a full local re-test of all three formats.

Verifying the DOMMatrix fix live surfaced a second, different error underneath it once the first one cleared:
`Cannot find module '.../pdfjs-dist/legacy/build/pdf.worker.mjs'`, thrown from `/var/task/node_modules/...` —
Vercel's deployment directory — meaning the file genuinely wasn't shipped in the deployed function. `pdfjs-dist`
loads its worker script via a computed path even for its in-process "fake worker" fallback used outside a browser
(there's no way to skip needing the file entirely, only whether it runs on a real worker thread or in-process), and
Vercel's build-time file tracing doesn't follow that dynamic path to know it needs including. Fixed with
`outputFileTracingIncludes` in `next.config.ts`, explicitly forcing `pdfjs-dist`'s legacy build directory into
every API route's trace. Confirmed locally that this doesn't change local dev behavior (which never needed it) and
build/lint stay clean; the live Vercel behavior itself is still pending confirmation after this push, same as the
DOMMatrix fix was before it was actually verified.

While verifying the DOMMatrix fix, live output also surfaced a related citation-linking gap: the model sometimes echoes the
corpus's own source-header tag (`[Notes]`, `[Slides]`) as part of a citation — e.g. `([Notes] Week3_Notes.docx,
Section: ...)` — instead of just the bare filename the system prompt asks for. `lib/citations.tsx`'s regex expected
a bare filename immediately after `(`, so this variant would silently fail to match any uploaded file and render as
plain, unclickable text instead of a broken assumption being caught. Fixed by making the regex tolerate an optional
leading `[...]` tag before the filename, verified against both citation styles with a standalone regex test.

Separately, a local production build failed transitively with `SqliteError: database is locked` /
`SQLITE_BUSY` while chasing the above — traced to `lib/db-sqlite.ts` opening the database file (and running WAL
setup) as a side effect of the module simply being *imported*, which happens for every route during Next's
"collecting page data" build step, across several parallel workers; two workers opening the same freshly-created
file at once raced. This didn't affect the app's actual runtime correctness (a rebuild immediately after succeeded,
and the local end-to-end flow always worked), but it's a real sharp edge for anyone rebuilding on a fresh checkout —
and, more importantly, the same eager-init pattern could plausibly hit Vercel's own build step too. Fixed by
making the SQLite backend lazily open the database on first actual use (`getDb()`, memoized) instead of at import
time, mirroring the pattern `lib/db-postgres.ts`'s `ensureInit()` already used. Verified with three consecutive
clean `rm -rf .next data && npm run build` runs (previously reproduced on roughly 1-in-2 attempts) plus a full
local end-to-end re-test.

## Post-deploy round 3 wrap-up: everything above confirmed live, not just locally

All three fixes above landed and were individually re-verified against the live deployed app after each push (not
just locally): DOCX upload succeeded post-fix, then PDF upload failed with the DOMMatrix error, then after that fix
failed with the worker-file error, then after that fix succeeded with the correct `chunkCount`. A full local
end-to-end pass afterward — create KB, upload all three formats, ask a grounded question (correct citation), ask an
out-of-scope question (exact fallback), rate an answer, generate a practice test (correctly matching the uploaded
practice problems' format), confirm the no-practice-problems refusal on a second KB, download a file (byte-count
matches), and check `/api/stats` (accurate counts, correct per-KB breakdown) — passed cleanly end to end, with a
clean `tsc`/`build`/`lint`/`npm audit` (zero vulnerabilities) alongside it.

A final live end-to-end pass (create → upload all three → ask → fallback → rate → generate-test → download →
stats, all against the deployed app) confirmed upload and Q&A work correctly live; the remaining steps in that same
pass (stats, download, generate-test) hit "not found" because that particular run's requests landed on different,
fresh serverless instances — the same already-diagnosed missing-Postgres persistence gap from earlier in this log,
not a new defect. That step still needs the user to attach a Postgres database via the Vercel dashboard (browser
login required, unavailable from this environment) — everything else that could be found and fixed without it was.

## Post-launch: added TXT as a supported upload format (user request)

Added `.txt` support to Notes and Practice Problems (left Slides as PDF/PPTX-only — a `.txt` file doesn't
represent "slides" conceptually). `lib/parse/txt.ts` reads the file as UTF-8 and reuses the same fixed-size
word-chunking fallback (`lib/parse/chunk.ts`, factored out of `docx.ts` where it already existed) that a
heading-less DOCX falls back to — TXT has exactly the same "no native structure to cite against" situation DOCX
has when it lacks headings, so it gets the same honest `Section N` labeling rather than a fabricated page number.
Updated the citation regex (`lib/citations.tsx`) and the upload UI's `accept` attributes and hints to match.
Verified end to end locally: uploaded a real `.txt` fixture, asked a question, got a correctly-cited grounded
answer (`RawNotes.txt, Section 1`), downloaded the file back and confirmed it's byte-identical to the original;
confirmed a genuinely unsupported type (`.csv`) is still correctly rejected. `tsc`/`build`/`lint` all clean.

## Post-launch: fixed a raw JSON-parse crash on oversized uploads (user-reported)

User reported `Unexpected token 'R', "Request En"... is not valid JSON` when uploading a PPTX. Reproduced directly
against the live app with an oversized POST body: Vercel's own platform returns a `413` with a plain-text body
(`Request Entity Too Large` / `FUNCTION_PAYLOAD_TOO_LARGE`) before the request ever reaches the app's code, once
the whole request crosses roughly 4.5MB — the upload handler's `await res.json()` then threw on that non-JSON body,
which is exactly the raw error the user saw. Fixed two ways in `KbWorkspace.tsx`'s `FolderUploader`: (1) a
client-side size check (~4MB/file, a conservative margin under the platform limit) that blocks and clearly explains
oversized files *before* attempting the request, while still uploading the rest of a mixed batch; (2) the response
parsing now falls back to a readable message instead of crashing when the server didn't return JSON at all (covers
the case of several individually-fine files still summing past the limit in one batch). Verified: a normal small
file still uploads correctly through the same code path; the size-limit is now also stated up front in each
folder's upload hint instead of only being discoverable by hitting it.

## Post-launch: interactive, gradeable practice tests (user request)

The practice test generator originally returned one prose block with an answer key appended — good for reading,
useless for actually taking. Reworked into a real interactive quiz:

- `generate-test` now asks Gemini for structured JSON (`generationConfig.responseMimeType: "application/json"`,
  added as an opt-in `jsonMode` flag on `lib/llm.ts`'s `generate()`) instead of prose — each question carries its
  type (`multiple_choice` | `short_answer`), prompt, an answer key (`correctIndex` or `referenceAnswer`), a short
  explanation, an optional citation, and a short `topic` tag. Parsed defensively (`sanitizeQuestions` in the route)
  so one malformed question from the model doesn't take down the whole test — it's just dropped rather than
  crashing the response.
- The full generated test (**including its answer key**) is stored server-side in a new `test_json` column on
  `test_generations` (migrated onto the already-live table — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on
  Postgres, a try/catch-wrapped `ALTER TABLE` on SQLite, which has no `IF NOT EXISTS` for columns). The client only
  ever receives the answer-free version (`toPublicQuestion` in `lib/types.ts`) until it submits — grading always
  looks the canonical answer up server-side by `testId` rather than trusting anything the client claims the correct
  answer was.
- Grading (`POST /api/kb/[id]/grade-test`) splits by question type: multiple choice grades instantly and
  deterministically (compare the submitted index to `correctIndex`, no LLM call, no cost, no failure mode) using
  the explanation already written at generation time; short-answer/calculation questions get judged by a single
  batched Gemini call per submission, comparing the student's free text against the stored reference answer and
  writing one short sentence of feedback specific to *that* answer (not just restating the reference answer) —
  the whole point being that "the equilibrium price is 16" and "P* = 16" should both count as correct, which exact
  string matching never could.
- The celebratory feedback the user specifically asked for lives in `lib/praise.ts` — a small pool of messages
  (including the exact ones requested: "You're awesome!", "DANG YOU'RE SMART!!") plus a couple more in the same
  spirit, with one template that fills in the question's `topic` tag ("Wow, you know {topic} super well!") when
  the model provided one. Picked server-side per correct answer so it's genuinely randomized per submission, not a
  single fixed string.
- If the batched grading call itself fails (rate limit, network, bad JSON back), grading degrades to showing the
  reference answer directly rather than crashing the whole submission — exercised for real, not just reasoned
  about: hit the Gemini free tier's request cap mid-testing today, watched it degrade exactly as designed, then
  confirmed (after a short wait) it was a short-window throttle rather than a true 24-hour lock — the retried call
  graded correctly, including catching a wrong short answer with specific, accurate feedback on what was wrong.

Verified end to end against the real running app: generated a 4-question test from the real practice-problems
fixture (2 multiple choice, 2 short-answer/calculation, matching the source material's own mix); confirmed the
question payload sent to the client before submission carries no answer key; submitted a deliberately mixed batch
(one wrong MC, one wrong short answer, one exact-match calculation, one correct MC) and got back correct grading
on all four with accurate, specific feedback, real citations, and praise messages on the two correct answers.
`tsc`/`build`/`lint` all clean.

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
