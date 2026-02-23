import { NextResponse } from "next/server";
import { createHistoryEntry, findCachedRecipeDetailByHash } from "@/lib/db/queries";
import { generateRecipeDetail } from "@/lib/ai/recipe";
import { recipeRequestSchema } from "@/lib/schemas/recipe.schema";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";
import { readRecipeCache, toRecipeCacheHash, writeRecipeCache } from "@/lib/cache/recipe-cache";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = recipeRequestSchema.parse(body);
    const ownedIngredients = normalizeIngredientList(parsed.ownedIngredients);
    const requestHash = toRecipeCacheHash(parsed.dishName, ownedIngredients, parsed.sourceHintPath, parsed.sourceHintType);

    const memoryCached = readRecipeCache<unknown>(requestHash);
    if (memoryCached) {
      return NextResponse.json({ ...(memoryCached as Record<string, unknown>), cacheSource: "memory" });
    }

    const dbCached = await findCachedRecipeDetailByHash(requestHash);
    if (dbCached && typeof dbCached === "object") {
      writeRecipeCache(requestHash, dbCached);
      return NextResponse.json({ ...(dbCached as Record<string, unknown>), cacheSource: "database" });
    }

    const recipe = await generateRecipeDetail(parsed.dishName, ownedIngredients, {
      sourceHintPath: parsed.sourceHintPath,
      sourceHintType: parsed.sourceHintType,
    });
    writeRecipeCache(requestHash, recipe);

    await createHistoryEntry({
      kind: "recipe",
      requestHash,
      inputText: `查看菜谱: ${parsed.dishName}`,
      ownedIngredients,
      dishName: parsed.dishName,
      recipeDetail: recipe,
    });

    return NextResponse.json({ ...recipe, cacheSource: "llm" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
