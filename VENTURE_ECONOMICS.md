# Venture Economics Snapshot

All figures below are back-of-envelope assumptions, explicitly labeled, meant as a starting point for you to
sanity-check and adjust — not researched pricing quotes.

## Pricing model (assumption)

- **Free tier:** 1 knowledge base (one class) per user, unlimited questions, no card required. This is the
  onboarding hook — a student tries it for one class before committing money.
- **Paid tier — "Semester Pass," ~$6–9/semester:** unlimited knowledge bases (every class a student is taking at
  once), priority generation (no queueing behind free-tier usage if a shared quota model is used), and practice
  tests with unlimited regenerations.
- **Campus license (assumption, longer-term):** a flat per-semester fee to a university or a specific department
  (e.g. a large gen-ed course with many sections) for unlimited student seats — likely the more durable revenue
  path once there's usage evidence, since it removes per-student payment friction entirely.

_Assumption to verify: willingness to pay $6–9/semester is unvalidated; the free/paid split point (1 KB) is a
guess at what's generous enough to prove value but scarce enough to convert on a multi-class semester._

## Rough API cost per question

**Assumption:** costs below use placeholder per-token rates for a Gemini Flash-tier model, since exact current
pricing for `gemini-3.6-flash` should be checked directly at https://ai.google.dev/pricing before trusting these
numbers — Flash-tier pricing bands have historically sat in this rough neighborhood but do move over time.

Using an illustrative $0.15 / 1M input tokens and $0.60 / 1M output tokens:

| Class material size | Input tokens/question (full corpus + prompt) | Output tokens (typical answer) | Cost/question |
|---|---|---|---|
| Small (~10K tokens of notes/slides) | ~10,200 | ~300 | ~$0.0018 |
| Typical (~50K tokens) | ~50,200 | ~300 | ~$0.0077 |
| At the 150K-token truncation ceiling | ~150,200 | ~300 | ~$0.023 |

**Free tier:** Gemini's free API tier (rate-limited, not a per-token bill) comfortably absorbs a single class's
worth of testing and even a small pilot cohort's usage at zero marginal cost — but it caps requests-per-minute and
requests-per-day (check current limits at the link above), so a real multi-class, multi-student rollout will need
to move to the paid API tier, at which point the per-question costs above apply.

**Rough unit economics at scale (paid API tier):** a student asking ~15 questions/week across a 15-week semester
is ~225 questions/semester. At the "typical" cost band (~$0.008/question) that's **~$1.80/semester in API cost per
active student** — against the assumed $6–9/semester price point, that's a healthy gross margin if usage stays in
the "typical" band, but a student loading multiple large classes into KBs near the truncation ceiling could push
API cost meaningfully higher per user, which argues for metering or a soft per-semester question cap on the paid
tier rather than treating it as literally unlimited.

## Market size — one university (assumption-labeled back-of-envelope)

Using Ohio State's Columbus campus as the reference point (assumption: ~60,000 enrolled students):

- Assume each student takes ~4 courses/semester, and a knowledge base is worth building for a course only if it's
  reading/lecture-heavy (assumption: ~60% of courses qualify) → ~2.4 "KB-worthy" courses/student/semester.
- Assume a conservative first-semester adoption rate of 5% of students try the free tier for at least one class →
  ~3,000 students.
- Assume a 15% free-to-paid conversion rate among students taking 2+ qualifying courses (the point where the
  1-KB free cap actually binds) → ~450 paying students/semester.
- At an assumed $7.50/semester price point → **~$3,375/semester in revenue from one university**, before any
  campus-license deal.

This is a small number deliberately — it's meant to show the shape of a single-campus pilot's economics, not a
venture-scale outcome. The real leverage is (a) a campus license replacing per-student conversion friction
entirely, and (b) multi-campus expansion once one campus's usage data (from `/admin` and `HYPOTHESIS.md`'s
decision rule) proves the retention story. Both are unvalidated and worth stress-testing against your own
assumptions about adoption and willingness to pay.
