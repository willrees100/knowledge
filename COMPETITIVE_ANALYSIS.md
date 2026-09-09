# Competitive Analysis

Researched live (web search, September 2026) rather than from memory — company names, positioning, and features
below are current as of this writing, not guessed. This is a brief scan for a pitch, not exhaustive diligence: take
every competitor claim below as "what their own marketing says," not independently verified.

## The landscape

**Direct competitors — grounded Q&A over your own uploaded material, with citations:**

| Company | What it does | How KNOWLEDGE differs |
|---|---|---|
| **Google NotebookLM** | Free, grounds answers in uploaded sources (PDFs, docs, slides, video) with inline citations. Audio Overviews (podcast-style summaries), Mind Maps. Available to Google Workspace for Education, any age. | General-purpose research tool, not class-specific. No practice-test generation anchored to real problem difficulty. No per-class shareable link a whole section uses together — it's a personal notebook, not a course artifact. Google's own distribution is the real threat here, not a feature gap. |
| **StudyPDF** | Cites every generated quiz/exam question back to the exact page/source. Explicit "for professors"/"for teachers" pages. Free tier via a weekly credit pool. | Closest direct competitor found. Doesn't appear to enforce "practice-problem style is the only difficulty anchor" as a hard, named constraint — that's ours specifically. |
| **Ace Quiz** | Generates full exam-style tests from lecture notes; used at Cornell, Berkeley, Wharton (200+ institutions claimed). | Real institutional traction signal worth taking seriously. Positioned as a study tool, not built around a hard "never use outside knowledge" refusal as the core value prop. |
| **Mindgrasp** | Timed/scored practice tests; **integrates directly with Canvas, Blackboard, and Google Docs.** | Already has the LMS integration we're considering (see CANVAS_STRATEGY.md) — a real, existing competitor for that specific wedge. |
| **Quizgecko, Apex Vision, Taskade Exam Generator, Jungle AI** | Generic AI quiz/flashcard generators from uploaded PDFs/text. | Broader, less strict about outside-knowledge refusal; more "study tool" than "grounded assistant." |

**Canvas-ecosystem AI tools (already installed at some schools today):**
- **Gemini LTI** — Instructure's own official integration, built with Google.
- **Khanmigo** — Khan Academy's AI tutor, licensed into Canvas for K-12 and Higher Ed.
- **LearnWise** — AI tutoring + grading + 24/7 chat, via LTI 1.3.
- **ibl.ai** — AI agents for Canvas via LTI, REST API, or full-course authoring.

## What actually makes us different

Nobody found in this search combines all of these as *hard, named constraints* the way KNOWLEDGE does:

1. **Practice-test difficulty/style is anchored to your real uploaded practice problems, by rule — not a vibe.** Notes and slides are explicitly barred from setting question style, only topic coverage. This is stated as an architectural constraint in our own system prompt, not just marketing copy.
2. **The refusal is absolute, not a suggestion.** "I don't have that in your source material" is a fixed, hard-coded string the model must reproduce exactly when it can't ground an answer — not a soft instruction it can talk itself out of under a clever prompt.
3. **Interactive, source-cited grading with genuine personality** (`lib/praise.ts`) — most competitors' quiz features are answer-key-and-done. Ours grades short answers semantically against a reference answer (not exact-text match), cites its reasoning, and reacts like a person, not a scoring engine.
4. **Zero-friction, single-class setup** — a student sets up their own class's KB in under a minute via a short source-prompt form that actually steers the system prompt. Most competitors are personal knowledge tools (NotebookLM) or teacher-facing platforms (StudyPDF's "for professors"), not this specific "I'm a student, this is my one class" persona.
5. **A working feedback-logging/`/admin` evidence mechanism** was table stakes for our own hypothesis-testing methodology — not something we found any competitor marketing as a feature, since it's inward-facing (venture validation), not user-facing.

The honest risk: #1–#4 are all things a well-funded competitor (especially Google, who owns both NotebookLM and the model we're built on) could ship in a product update, not deep moats. The real defensibility, if any, is being first and cheapest into the specific "one class, one link, dead simple" wedge before a bigger player bothers.

## Features added this session in response to this research

Picked for being both competitively-relevant gaps and buildable same-day:

- **Flashcards** (`app/api/kb/[id]/generate-flashcards`) — direct competitive-parity feature; Quizgecko, StudyPDF, Ace Quiz, and Mindgrasp all offer some form of this and its absence was a real, obvious gap. Built to inherit the same grounded/cited hard constraint as everything else in the app (see BUILD_LOG.md for implementation details).
- (Already present going into this session, but directly addresses the "ask the material without leaving the test" gap versus quiz-only competitors: the embedded search box inside the Practice Test tab.)

Deliberately not built this session (noted for a future pass, not because they're bad ideas): Audio-Overview-style summaries (NotebookLM's signature feature — meaningful new infrastructure, a TTS pipeline, not a same-night add), Mind Maps, spaced-repetition scheduling across a whole class's flashcard history.
