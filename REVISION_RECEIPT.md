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
- **Switching tabs mid-upload or mid-generation loses all progress.** Real, reproducible. **Fixed**: the
  Materials/Ask/Practice Test tabs in `KbWorkspace.tsx` were conditionally rendered (`{tab === "x" && <Panel />}`),
  which unmounted a tab's component — and all its in-progress state — the moment you switched away, even if an
  upload or test generation was still running. Now all three panels stay mounted at all times, with only
  visibility toggled (`hidden` attribute) — see `BUILD_LOG.md`'s pre-presentation entry.

## What worked well

- **The practice test matching the real uploaded problems' style** — called out as the most impressive part.
  Confirms the practice-problems-as-anchor design (Feature 3's core constraint) is landing as intended, not just
  technically correct but actually felt right in use.
- **Grounded Q&A + practice test together, explicitly**: having the practice test alongside an AI-powered search
  is extremely useful for explaining answers. Feature request that followed directly from this — a question box
  embedded in the practice-test view itself, so a student can ask about a question without leaving the test —
  is now **built**: a collapsible "💬 Ask about this material" section inside the Practice Test tab, sharing the
  same grounded-answer logic as the main Ask tab. See `BUILD_LOG.md`'s pre-presentation entry.

## Additional changes made ahead of presentation (not from testing feedback)

Given full discretion to prepare for the presentation, two more items were added: multiple-choice questions now
reveal which choice was actually correct after grading (previously a wrong answer only said *that* you were
wrong, not which option was right), and a copy-link button next to the shareable link on the KB page. Both are
low-risk, zero/low-cost additions — full detail in `BUILD_LOG.md`.

## Hypothesis check-in

Answer to "would you use this over manually searching your notes?": **"Absolutely."** That's one real, positive
data point toward `HYPOTHESIS.md`'s decision rule — genuine directional evidence, not yet the sample size the
70%-threshold rule was written for. `/admin` keeps accumulating real usage automatically as more people (a full
class) actually use it; the rule should be evaluated against that larger sample, not this one session alone.

## Ship decision

**"For an MVP I think it's great thus far."** Everything flagged as broken or wanted has since been addressed:
the tab-switch state-loss bug is fixed, and the search-in-test-panel feature is built. The only remaining
open item is the upload size limit, which was explicitly called out as an unavoidable MVP tradeoff, not something
to fix before this submission.
