import { NextRequest, NextResponse } from "next/server";
import { getKB, listFiles, deleteKB } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kb = await getKB(id);
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
  }
  const files = await listFiles(id);
  return NextResponse.json({ kb, files });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteKB(id);
  if (!ok) {
    return NextResponse.json({ error: "Knowledge base not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
