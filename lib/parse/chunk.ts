import type { Chunk } from "../types";

// Shared fallback chunker for formats with no native page/section structure
// to cite against (plain text, and DOCX files with no headings). Splits into
// fixed-size word chunks labeled "Section N" — never fabricates a page number
// the format doesn't actually have.
export function chunkByWords(text: string, wordsPerChunk = 500): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: Chunk[] = [];
  for (let i = 0, n = 1; i < words.length; i += wordsPerChunk, n++) {
    const slice = words.slice(i, i + wordsPerChunk).join(" ");
    if (slice.trim()) chunks.push({ label: `Section ${n}`, text: slice });
  }
  return chunks;
}
