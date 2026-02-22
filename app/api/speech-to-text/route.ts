import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "Speech input is temporarily disabled" }, { status: 503 });
}
