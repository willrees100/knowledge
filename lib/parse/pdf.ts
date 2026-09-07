import { PDFParse } from "pdf-parse";
import type { Chunk } from "../types";

// pdf-parse v2's PDFParse class gives per-page text natively via getText(),
// which is what makes the "(Slides, slide 12)"-style citation reliable for
// PDFs — no layout guessing needed.
export async function extractPdf(buffer: Buffer): Promise<Chunk[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages
      .map((p) => ({ label: `Page ${p.num}`, text: p.text.trim() }))
      .filter((c) => c.text.length > 0);
  } finally {
    await parser.destroy();
  }
}
