export type Folder = "notes" | "slides" | "practice";

export interface Chunk {
  label: string;
  text: string;
}

export interface KB {
  id: string;
  name: string;
  description: string;
  focus: string;
  created_at: string;
}

export interface FileRow {
  id: string;
  kb_id: string;
  folder: Folder;
  filename: string;
  mimetype: string;
  ext: string;
  chunk_count: number;
  char_count: number;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  kb_id: string;
  timestamp: string;
  question: string;
  answer_source: "source" | "fallback";
  thumbs: "up" | "down" | null;
}

export interface TestGenerationRow {
  id: string;
  kb_id: string;
  timestamp: string;
  config_json: string;
  question_count: number;
}

export const FALLBACK_ANSWER =
  "I don't have that in your source material for this class — you may want to check with your instructor or look elsewhere.";

// A stable, distinctive fragment of FALLBACK_ANSWER used to detect a fallback
// response even if the model doesn't reproduce the string byte-for-byte
// (an added trailing space or punctuation tweak, say) — an exact-equality
// check would silently miscount that as a "source" answer in the feedback
// log despite the constraint working correctly in substance.
export function isFallbackAnswer(answer: string): boolean {
  return answer.includes("I don't have that in your source material for this class");
}
