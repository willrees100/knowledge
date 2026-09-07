# Hypothesis

> If students get answers restricted strictly to their own class materials with clickable citations, they will
> trust and reuse it over manually searching notes.

## Precommitted decision rule

- If **≥70%** of test-session answers are rated accurate by the user **AND** **≥70%** of testers say they'd use it
  again → hypothesis supported, keep Q&A as the core feature.
- If either falls below 70% → pivot to positioning the practice-test generator as the primary product instead.

## How this gets measured

Every Q&A answer in the app carries a thumbs up/down (Feature 4). Each rating, the question asked, and whether the
answer came from source material or hit the no-info fallback are persisted with a timestamp to the `feedback`
table (`lib/db.ts`). `/admin` (`app/admin/page.tsx`, backed by `/api/stats`) surfaces the running totals — including
the accuracy rate implied by thumbs-up ÷ (thumbs-up + thumbs-down) — so the 70% threshold above has a real,
queryable denominator rather than an anecdote. "Would use it again" isn't captured by the app itself; that half of
the decision rule needs a short post-session question to testers (e.g. a one-line follow-up after they've used it),
tracked separately by whoever runs the test session.

## Status

Not yet evaluated — this file states the precommitted rule only. Fill in the actual test-session results and the
resulting decision once real usage data exists in `/admin`.
