import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getKB, insertFile } from "@/lib/db";
import { extractChunks, extForFilename, UnsupportedFileError } from "@/lib/parse";
import type { Folder } from "@/lib/types";

const ALLOWED_FOLDERS: Folder[] = ["notes", "slides", "practice"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: kbId } = await params;
  const kb = getKB(kbId);
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
  }

  const formData = await req.formData();
  const folder = formData.get("folder");
  if (typeof folder !== "string" || !ALLOWED_FOLDERS.includes(folder as Folder)) {
    return NextResponse.json({ error: "Invalid folder." }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const results: Array<{ filename: string; ok: boolean; error?: string; chunkCount?: number }> = [];

  for (const file of files) {
    try {
      const ext = extForFilename(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const chunks = await extractChunks(file.name, buffer);

      if (chunks.length === 0) {
        results.push({
          filename: file.name,
          ok: false,
          error: "No extractable text found (scanned/image-only documents aren't supported — typed text only).",
        });
        continue;
      }

      insertFile({
        id: randomUUID(),
        kb_id: kbId,
        folder: folder as Folder,
        filename: file.name,
        mimetype: file.type || "application/octet-stream",
        ext,
        content: buffer,
        chunks,
      });

      results.push({ filename: file.name, ok: true, chunkCount: chunks.length });
    } catch (err) {
      results.push({
        filename: file.name,
        ok: false,
        error: err instanceof UnsupportedFileError ? err.message : "Failed to parse file.",
      });
    }
  }

  return NextResponse.json({ results });
}
