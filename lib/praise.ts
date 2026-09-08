// Celebratory messages shown for a correct answer. `{topic}` gets filled in
// with the question's short topic tag when one is available (falls back to a
// topic-free variant otherwise) — per the user's explicit request for
// specific, enthusiastic feedback rather than a generic "Correct!".
const PRAISE_WITH_TOPIC = [
  "Wow, you know {topic} super well!",
  "You clearly get {topic} — nice work!",
  "{topic}? You've got it down cold.",
];

const PRAISE_GENERIC = [
  "You're awesome!",
  "DANG YOU'RE SMART!!",
  "Nailed it!",
  "That's exactly right — nice work.",
  "Look at you go!",
  "Instructor-level understanding right there.",
  "You clearly did the reading.",
];

export function pickPraise(topic?: string): string {
  const pool = topic && topic.trim() ? PRAISE_WITH_TOPIC : [];
  const all = [...pool, ...PRAISE_GENERIC];
  const template = all[Math.floor(Math.random() * all.length)];
  return topic ? template.replace("{topic}", topic.trim()) : template;
}
