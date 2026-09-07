import type { Chunk } from "../types";

// pdf-parse's CJS entrypoint has a top-level debug block guarded by
// `require.main === module`, so it's safe to require() from within a route.
// We use its `pagerender` hook to capture text per physical page, which is
// what makes the "(Slides, slide 12)"-style citation reliable for PDFs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export async function extractPdf(buffer: Buffer): Promise<Chunk[]> {
  const pages: string[] = [];

  await pdfParse(buffer, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item) => item.str).join(" ");
      pages.push(text);
      return text;
    },
  });

  return pages.map((text, i) => ({ label: `Page ${i + 1}`, text: text.trim() })).filter((c) => c.text.length > 0);
}
