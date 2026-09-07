import { NextRequest, NextResponse } from "next/server";
import { getFileContent } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const file = getFileContent(fileId);
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const body = new Uint8Array(file.content);
  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mimetype,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
    },
  });
}
