import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";

export async function GET() {
  return NextResponse.json(await getStats());
}
