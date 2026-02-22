import { NextResponse } from "next/server";
import { createHistoryEntry } from "@/lib/db/queries";
import { generateRecommendations } from "@/lib/ai/recommend";
import { recommendRequestSchema } from "@/lib/schemas/recommend.schema";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = recommendRequestSchema.parse(body);
    const ownedIngredients = normalizeIngredientList(parsed.ownedIngredients);

    const response = await generateRecommendations(parsed.inputText, ownedIngredients);

    await createHistoryEntry({
      inputText: parsed.inputText,
      ownedIngredients,
      recommendations: response.recommendations,
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
