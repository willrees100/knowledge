import type { Chunk } from "../types";

// pdfjs-dist (used internally by pdf-parse) references browser DOM globals
// like DOMMatrix while ITS OWN module is being loaded, not just when a method
// is later called — reproduced live on Vercel as "ReferenceError: DOMMatrix
// is not defined", thrown while pdf-parse's module was still being loaded.
// @napi-rs/canvas (pdf-parse's own dependency, meant for exactly this) ships
// Node-compatible implementations of these globals, so we set them on
// globalThis before pdf-parse is ever imported. That "before" matters: a
// static top-level `import { PDFParse } from "pdf-parse"` would run before
// any other code in this module regardless of where it's written in the
// file, which is why the import below is a dynamic `await import(...)`
// placed after the polyfill instead of a normal static import.
function ensureDomPolyfills() {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.DOMMatrix || !g.Path2D || !g.ImageData) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvas = require("@napi-rs/canvas");
    g.DOMMatrix = g.DOMMatrix ?? canvas.DOMMatrix;
    g.Path2D = g.Path2D ?? canvas.Path2D;
    g.ImageData = g.ImageData ?? canvas.ImageData;
  }
}

// pdf-parse v2's PDFParse class gives per-page text natively via getText(),
// which is what makes the "(Slides, slide 12)"-style citation reliable for
// PDFs — no layout guessing needed.
export async function extractPdf(buffer: Buffer): Promise<Chunk[]> {
  ensureDomPolyfills();
  const { PDFParse } = await import("pdf-parse");
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
