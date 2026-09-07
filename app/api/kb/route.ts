import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createKB, listKBs } from "@/lib/db";

export async function GET() {
  const kbs = await listKBs();
  return NextResponse.json({ kbs });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();
  const focus = (body.focus ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Class name is required." }, { status: 400 });
  }

  const id = randomUUID();
  await createKB({ id, name, description, focus });
  return NextResponse.json({ id });
}
