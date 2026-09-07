import { NextRequest, NextResponse } from "next/server";
import { getKB, listFiles } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kb = getKB(id);
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
  }
  const files = listFiles(id);
  return NextResponse.json({ kb, files });
}
