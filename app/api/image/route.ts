import { NextResponse } from "next/server";
import { generateDishImage } from "@/lib/ai/image";
import { imageRequestSchema } from "@/lib/schemas/image.schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = imageRequestSchema.parse(body);
    const imageUrl = await generateDishImage(parsed.dishName, parsed.style);
    return NextResponse.json({ imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
