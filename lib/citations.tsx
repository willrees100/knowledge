"use client";

import type { ReactNode } from "react";
import type { FileRow } from "./types";

// Matches the "(exact-filename.ext, Label)" format the ask/generate-test
// system prompts require the model to use. We only linkify a citation when
// its filename matches a real uploaded file for this KB — anything else (the
// model slipping out of format) is left as plain text rather than a broken
// link. The optional leading `[Notes]`/`[Slides]`/`[Practice Problems]` group
// tolerates the model echoing the corpus's own "### [Notes] filename.ext —
// Label" source header verbatim instead of just the filename, which it does
// often enough in practice to be worth handling rather than losing the link.
const CITATION_RE = /\((?:\[[^[\]]*\]\s*)?([^,()]+\.(?:pdf|docx|pptx)),\s*([^()]+)\)/gi;

export function linkifyCitations(text: string, files: Pick<FileRow, "id" | "filename">[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  const re = new RegExp(CITATION_RE);

  while ((match = re.exec(text)) !== null) {
    const [full, filename] = match;
    const file = files.find((f) => f.filename.toLowerCase() === filename.trim().toLowerCase());
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    if (file) {
      parts.push(
        <a
          key={key++}
          href={`/api/files/${file.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted hover:decoration-solid text-blue-700 dark:text-blue-400"
          title={`Open ${file.filename}`}
        >
          {full}
        </a>
      );
    } else {
      parts.push(full);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
