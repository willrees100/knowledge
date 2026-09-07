import type { Chunk } from "../types";
import { extractPdf } from "./pdf";
import { extractDocx } from "./docx";
import { extractPptx } from "./pptx";

export class UnsupportedFileError extends Error {}

export function extForFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export async function extractChunks(filename: string, buffer: Buffer): Promise<Chunk[]> {
  const ext = extForFilename(filename);
  switch (ext) {
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "pptx":
      return extractPptx(buffer);
    default:
      throw new UnsupportedFileError(
        `Unsupported file type ".${ext}". Supported: PDF, DOCX, PPTX (typed text only, no OCR).`
      );
  }
}

export function mimeForExt(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}
