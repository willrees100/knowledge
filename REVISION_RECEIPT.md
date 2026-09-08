# Revision Receipt

Filled in from a real testing session against the live deployed app (not written preemptively by the build
process — see the git history for the difference between what was found/fixed during building versus what came
from actually using it).

## What broke or felt wrong

- **The practice test wasn't answerable on-site — it was a wall of text with the answer key sitting right below
  it.** Reported as feeling weird, and it was — reading a test with the answers already visible isn't actually
  taking a test. **Fixed:** the generator now produces structured, gradeable questions instead of prose; the
  practice test tab is a real quiz — multiple choice and short-answer/calculation questions the student answers
  in-app, submits, and gets graded (instantly for multiple choice, AI-judged against the reference answer for
  short answer), with a short source-cited explanation per question and celebratory feedback on correct ones. See
  `BUILD_LOG.md`'s "interactive, gradeable practice tests" entry for the full build.
- **Small upload file-size limit, requiring compressed files.** Confirmed real and unavoidable at MVP scope —
  Vercel's serverless functions cap request bodies around 4.5MB, which is a platform limit, not a choice made in
  this app's code. Documented in `README.md`'s known limitations, with the app now warning about it upfront and
  failing clearly instead of crashing (see `BUILD_LOG.md`'s "raw JSON-parse crash on oversized uploads" entry).
  Explicitly called out as something to revisit (e.g. direct-to-storage uploads bypassing the function body limit
  entirely) if the product gets real traction past MVP — not needed for this submission.
- **Both loading screens were broken at one point earlier in testing — confirmed now fixed.** Lines up with two
  issues already found and fixed during the build (both documented in `BUILD_LOG.md`): a knowledge base's page
  404ing right after creation (the SQLite-on-Vercel persistence bug, fixed by moving to a real Postgres database),
  and file uploads 500ing before a parser lazy-import fix. Confirmed working correctly now.
- **Switching tabs mid-upload or mid-generation loses all progress.** Real, reproducible, not yet fixed: the
  Materials/Ask/Practice Test tabs in `KbWorkspace.tsx` are conditionally rendered (`{tab === "x" && <Panel />}`),
  which unmounts a tab's component — and all its in-progress state — the moment you switch away, even if an
  upload or test generation is still running. Switching back gets a fresh, empty panel instead of the result.
  **Not fixed yet** — flagged as "would be cool to fix," not a submission blocker. The fix is straightforward
  (keep all three panels mounted always, toggle visibility with CSS instead of conditional rendering, so their
  state survives a tab switch) and is a good candidate for the next work session.

## What worked well

- **The practice test matching the real uploaded problems' style** — called out as the most impressive part.
  Confirms the practice-problems-as-anchor design (Feature 3's core constraint) is landing as intended, not just
  technically correct but actually felt right in use.
- **Grounded Q&A + practice test together, explicitly**: having the practice test alongside an AI-powered search
  is extremely useful for explaining answers. Feature request that follows directly from this: a question box
  embedded in the practice-test view itself, so a student can ask about a question without leaving the test. Not
  built yet — a strong candidate for the next iteration, not required for this submission.

## Hypothesis check-in

Answer to "would you use this over manually searching your notes?": **"Absolutely."** That's one real, positive
data point toward `HYPOTHESIS.md`'s decision rule — genuine directional evidence, not yet the sample size the
70%-threshold rule was written for. `/admin` keeps accumulating real usage automatically as more people (a full
class) actually use it; the rule should be evaluated against that larger sample, not this one session alone.

## Ship decision

**"For an MVP I think it's great thus far."** Nothing here blocks submission — the one confirmed open item
(tab-switch state loss) and the two feature ideas (search-in-test-panel, and eventually loosening the upload size
limit) are explicitly follow-up work, not fixes required for this submission.
