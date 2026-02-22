import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { createHistoryEntry, listHistoryEntries } from "@/lib/db/queries";
import { z } from "zod";

export const runtime = "nodejs";

const postSchema = z.object({
  inputText: z.string().min(1),
  ownedIngredients: z.array(z.string()).default([]),
  dishName: z.string().optional(),
  recommendations: z.any().optional(),
  recipeDetail: z.any().optional(),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || "20");
    const history = await listHistoryEntries(Number.isFinite(limit) ? limit : 20);
    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = postSchema.parse(body);

    const created = await createHistoryEntry({
      inputText: parsed.inputText,
      ownedIngredients: parsed.ownedIngredients,
      dishName: parsed.dishName,
      recommendations: parsed.recommendations as Prisma.InputJsonValue | undefined,
      recipeDetail: parsed.recipeDetail as Prisma.InputJsonValue | undefined,
    });

    return NextResponse.json({ id: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
