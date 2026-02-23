import { z } from "zod";
import { callJsonModel } from "@/lib/ai/client";
import { buildIngredientExtractPrompt, SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_INGREDIENT_EXTRACT } from "@/lib/ai/prompts";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";

const extractResponseSchema = z.object({
  ingredients: z.array(z.string().min(1)).max(20),
});

export type IngredientExtractResult = {
  ingredients: string[];
  source: "llm" | "fallback_rule";
  rawCandidates: string[];
};

const template = `{
  "ingredients": ["土豆", "牛肉", "西红柿"]
}`;

function splitCandidates(inputText: string, ownedIngredientsDraft: string[]): string[] {
  const fromText = inputText
    .split(/[，,、；;。\n\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

  return [...fromText, ...ownedIngredientsDraft].filter(Boolean);
}

function normalizeUnique(items: string[]): string[] {
  const normalized = normalizeIngredientList(items);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const item of normalized) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    deduped.push(item);
  }
  return deduped;
}

export async function extractOwnedIngredients(inputText: string, ownedIngredientsDraft: string[]): Promise<IngredientExtractResult> {
  const rawCandidates = splitCandidates(inputText, ownedIngredientsDraft);

  try {
    const raw = await callJsonModel<unknown>({
      system: `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_INGREDIENT_EXTRACT}`,
      user: buildIngredientExtractPrompt(inputText, rawCandidates),
      responseTemplate: template,
      retries: 1,
      model: "deepseek-v3-2-251201",
    });

    const parsed = extractResponseSchema.parse(raw);
    const ingredients = normalizeUnique(parsed.ingredients);

    if (ingredients.length) {
      return {
        ingredients,
        source: "llm",
        rawCandidates,
      };
    }
  } catch {
    // Swallow and fallback to deterministic parsing.
  }

  return {
    ingredients: normalizeUnique(rawCandidates),
    source: "fallback_rule",
    rawCandidates,
  };
}
