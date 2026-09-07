import type { Chunk } from "../types";

export class UnsupportedFileError extends Error {}

export function extForFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

// Each format's parser is imported lazily, on demand, rather than statically
// at the top of this file. pdf-parse pulls in a native-binary dependency
// (@napi-rs/canvas) that a serverless bundler can fail to package correctly —
// a static import of all three would mean that one package's load failure
// takes down DOCX and PPTX uploads too, since importing this module at all
// would throw before extractChunks ever runs. Lazy imports mean a DOCX/PPTX
// upload never touches the PDF parser's dependency graph.
export async function extractChunks(filename: string, buffer: Buffer): Promise<Chunk[]> {
  const ext = extForFilename(filename);
  switch (ext) {
    case "pdf": {
      const { extractPdf } = await import("./pdf");
      return extractPdf(buffer);
    }
    case "docx": {
      const { extractDocx } = await import("./docx");
      return extractDocx(buffer);
    }
    case "pptx": {
      const { extractPptx } = await import("./pptx");
      return extractPptx(buffer);
    }
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
