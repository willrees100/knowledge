import mammoth from "mammoth";
import type { Chunk } from "../types";
import { chunkByWords } from "./chunk";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// DOCX has no reliable native "page number" (pagination depends on the
// reader's rendering, not the file format) — see README's known-limitations
// section. Instead we chunk by heading (h1-h3), which mammoth derives from
// Word's built-in "Heading N" styles, and cite as "Section: <heading text>".
// If the document has no headings at all, we fall back to fixed-size word
// chunks labeled "Section N" rather than fabricating a page number.
export async function extractDocx(buffer: Buffer): Promise<Chunk[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });

  const parts = html.split(/(<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>)/gi);
  const sections: Chunk[] = [];
  let currentLabel = "Section 1";
  let currentHtml = "";
  let sawHeading = false;

  for (const part of parts) {
    const headingMatch = part.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    if (headingMatch) {
      if (currentHtml.trim()) {
        const text = stripHtml(currentHtml);
        if (text) sections.push({ label: currentLabel, text });
      }
      sawHeading = true;
      currentLabel = `Section: ${stripHtml(headingMatch[1])}`;
      currentHtml = "";
    } else {
      currentHtml += part;
    }
  }
  if (currentHtml.trim()) {
    const text = stripHtml(currentHtml);
    if (text) sections.push({ label: currentLabel, text });
  }

  if (!sawHeading) {
    const { value: rawText } = await mammoth.extractRawText({ buffer });
    return chunkByWords(rawText);
  }

  return sections;
}
