import type { Chunk } from "../types";
import { chunkByWords } from "./chunk";

// Plain text has no page/slide/section structure to cite against — same
// situation as a heading-less DOCX — so it uses the same fixed-size word
// chunking, labeled "Section N", rather than fabricating a page number.
export async function extractTxt(buffer: Buffer): Promise<Chunk[]> {
  const text = buffer.toString("utf-8");
  return chunkByWords(text);
}
