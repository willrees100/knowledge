import JSZip from "jszip";
import type { Chunk } from "../types";

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// PPTX is a zip of per-slide XML (ppt/slides/slideN.xml). We read the slide
// number straight from the filename, which is a reliable native citation —
// no OCR or layout guessing needed since PPTX text is stored as real text runs.
export async function extractPptx(buffer: Buffer): Promise<Chunk[]> {
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .map((name) => {
      const match = name.match(/^ppt\/slides\/slide(\d+)\.xml$/);
      return match ? { name, num: parseInt(match[1], 10) } : null;
    })
    .filter((x): x is { name: string; num: number } => x !== null)
    .sort((a, b) => a.num - b.num);

  const slides: Chunk[] = [];
  for (const { name, num } of slideFiles) {
    const xml = await zip.files[name].async("text");
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const text = texts.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 0) {
      slides.push({ label: `Slide ${num}`, text });
    }
  }
  return slides;
}
