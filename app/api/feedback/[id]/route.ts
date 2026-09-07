import { NextRequest, NextResponse } from "next/server";
import { setFeedbackThumbs } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const thumbs = body.thumbs;
  if (thumbs !== "up" && thumbs !== "down") {
    return NextResponse.json({ error: "thumbs must be 'up' or 'down'." }, { status: 400 });
  }
  const ok = setFeedbackThumbs(id, thumbs);
  if (!ok) {
    return NextResponse.json({ error: "Feedback entry not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
