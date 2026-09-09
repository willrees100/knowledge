# Becoming a Canvas Extension: Research Notes

Researched live (web search, September 2026). This is a scan of the realistic paths, not a commitment to build
any of them — flagging the material facts that should shape the decision.

## The material fact that changes the pitch: Instructure isn't who it used to be

Instructure (Canvas's parent company) was **acquired by KKR in an all-cash, ~$4.8B take-private deal.** It's no
longer a public company. This matters for two reasons:
1. **"Sell to Canvas" now means pitching PE-backed corporate development, not a product team with acquisition
   budget of its own** — a fundamentally different, slower, more financially-driven conversation than pitching a
   founder-led or public edtech company looking to shore up a product roadmap.
2. Instructure already has AI-tutoring covered via **existing partnerships**, not gaps waiting to be filled:
   - **Gemini LTI** — an official, Instructure-built integration with Google's own Gemini.
   - **Khanmigo** — Khan Academy's AI tutor, licensed in for K-12 and Higher Ed.
   
   An acquisition pitch premised on "Canvas has no AI tutor" is factually wrong and would be caught immediately.

## The realistic near-term path: become an LTI app, not an acquisition target

Canvas doesn't require Instructure's permission to reach instructors — **LTI (Learning Tools Interoperability)**
is an open standard. Any tool built as an LTI 1.3 provider can be installed by an individual instructor or
department without Instructure's involvement at all. Concretely:

- Canvas has a **Certified LTI Apps program** (an Instructure-run certification launching around September 2026,
  per the search results) that lets institutions see which AI tools meet the LTI standard — certification isn't
  required to be installable, but it's the trust/discoverability signal that makes an unknown small tool credible
  to a university IT department.
- There's a public **EdTech Collective Marketplace** and a **Canvas Apps** hub where LTI-integrated tools get
  listed and discovered by grade level/subject.
- Technically: register a **Developer Key** with a JSON config (or a URL hosting one), build against **LTI 1.3 /
  LTI Advantage**, and any Canvas admin can install it directly.
- **A real, already-live competitor is already here**: Mindgrasp (practice tests from notes) already integrates
  with Canvas, Blackboard, and Google Docs. This path is proven to work for something extremely close to what we
  built — it's not speculative.

## What this would actually take (not attempted this session — genuinely new infrastructure)

- An LTI 1.3 provider implementation (OAuth/OIDC launch flow, not just our current no-auth shareable-link model —
  this is the single biggest architecture change, since "no auth, anyone with the link" was a deliberate MVP
  choice that doesn't survive contact with an LMS integration, where Canvas needs to authenticate *which*
  student/instructor/course is launching the tool).
- Pulling a course's roster/roles from Canvas's API (so "one KB per class" can map onto an actual Canvas course
  automatically instead of manual setup).
- Probably a per-institution or per-seat pricing model instead of the current single-KB-free/multi-KB-paid
  sketch in VENTURE_ECONOMICS.md, since an LTI sale is normally to an institution or department, not an
  individual student.

## Recommendation

Don't chase the acquisition pitch — it's premised on a gap (Instructure has no AI tutor) that doesn't exist, and
KKR ownership makes that conversation slower and less likely regardless. The **LTI marketplace listing** path is
concrete, technically proven by a direct competitor already doing it, and doesn't require Instructure's
permission to start — an instructor or department could install it on their own. It is, however, a real
build project (weeks, not a night), not a feature to bolt on alongside tonight's other additions.
