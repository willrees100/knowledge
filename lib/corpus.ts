import type { Chunk, Folder } from "./types";

// No vector DB / no embeddings — deliberate MVP simplification (see
// BUILD_LOG.md). Gemini Flash's context window is large enough to include a
// whole class's extracted text directly in the prompt, tagged by source and
// page/slide/section. This module just formats that text and enforces a
// rough token budget so we degrade gracefully instead of silently failing
// or blowing past the model's context window.
export const TOKEN_BUDGET = 150_000;
const CHARS_PER_TOKEN = 4; // rough English-text estimate, good enough for a soft guard
export const CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN;

export interface FileWithChunks {
  filename: string;
  folder: Folder;
  chunks: Chunk[];
}

function folderLabel(folder: Folder): string {
  switch (folder) {
    case "notes":
      return "Notes";
    case "slides":
      return "Slides";
    case "practice":
      return "Practice Problems";
  }
}

function blocksFor(files: FileWithChunks[]): string[] {
  const blocks: string[] = [];
  for (const file of files) {
    for (const chunk of file.chunks) {
      blocks.push(
        `### [${folderLabel(file.folder)}] ${file.filename} — ${chunk.label}\n${chunk.text}\n`
      );
    }
  }
  return blocks;
}

/**
 * Concatenates chunk blocks up to a character budget. `priorityFiles` are
 * always included first (used by the practice-test generator so the actual
 * practice problems are never the part that gets truncated); `secondaryFiles`
 * fill whatever budget remains.
 */
export function buildCorpus(
  priorityFiles: FileWithChunks[],
  secondaryFiles: FileWithChunks[] = [],
  charBudget: number = CHAR_BUDGET
): { text: string; truncated: boolean } {
  const priorityBlocks = blocksFor(priorityFiles);
  const secondaryBlocks = blocksFor(secondaryFiles);

  let text = "";
  let truncated = false;

  for (const block of priorityBlocks) {
    if (text.length + block.length > charBudget) {
      truncated = true;
      break;
    }
    text += block + "\n";
  }
  for (const block of secondaryBlocks) {
    if (text.length + block.length > charBudget) {
      truncated = true;
      break;
    }
    text += block + "\n";
  }

  return { text: text.trim(), truncated };
}
