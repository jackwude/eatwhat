import { callJsonModel } from "@/lib/ai/client";
import { buildRecipeUserPrompt, SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_RECIPE } from "@/lib/ai/prompts";
import { computeMissingIngredients } from "@/lib/parser/shopping-diff";
import { buildHowToCookContext, retrieveHowToCookReferences, type HowToCookReference } from "@/lib/rag/howtocook";
import { recipeResponseSchema, type RecipeResponse } from "@/lib/schemas/recipe.schema";

const template = `{
  "dishName": "番茄炒蛋",
  "servings": "2人份",
  "requiredIngredients": [{ "name": "西红柿", "amount": "300g" }],
  "missingIngredients": [{ "name": "盐", "amount": "2g" }],
  "steps": [
    { "stepNo": 1, "instruction": "步骤描述", "keyPoint": "关键点" }
  ],
  "tips": ["技巧1"],
  "timing": { "prepMin": 8, "cookMin": 7, "totalMin": 15 }
}`;

export type RecipeWithSources = RecipeResponse & {
  referenceSources: HowToCookReference[];
};

export async function generateRecipeDetail(dishName: string, ownedIngredients: string[]): Promise<RecipeWithSources> {
  const references = await retrieveHowToCookReferences({
    dishName,
    ownedIngredients,
    limit: 5,
  });

  const ragContext = buildHowToCookContext(references);
  const raw = await callJsonModel<unknown>({
    system: `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_RECIPE}`,
    user: `${buildRecipeUserPrompt(dishName, ownedIngredients)}\n\n【HowToCook参考片段】\n${ragContext}`,
    responseTemplate: template,
    retries: 1,
  });

  const parsed = recipeResponseSchema.parse(raw);
  const correctedMissing = computeMissingIngredients(parsed.requiredIngredients, ownedIngredients);

  return {
    ...parsed,
    missingIngredients: correctedMissing,
    referenceSources: references,
  };
}
