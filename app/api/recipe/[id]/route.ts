import { NextResponse } from "next/server";
import { createHistoryEntry } from "@/lib/db/queries";
import { generateRecipeDetail } from "@/lib/ai/recipe";
import { recipeRequestSchema } from "@/lib/schemas/recipe.schema";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = recipeRequestSchema.parse(body);
    const ownedIngredients = normalizeIngredientList(parsed.ownedIngredients);

    const recipe = await generateRecipeDetail(parsed.dishName, ownedIngredients);

    await createHistoryEntry({
      inputText: `查看菜谱: ${parsed.dishName}`,
      ownedIngredients,
      dishName: parsed.dishName,
      recipeDetail: recipe,
    });

    return NextResponse.json(recipe);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
