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

export type IngredientExtractReason = "llm_success" | "breaker_open" | "llm_failed_fallback" | "cache_reuse";

const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 1000 * 60 * 10;
const breakerState = {
  mode: "closed" as "closed" | "open" | "half_open",
  consecutiveFailures: 0,
  openUntil: 0,
};

const template = `{
  "ingredients": ["土豆", "牛肉", "西红柿"]
}`;

function splitCandidates(inputText: string, ownedIngredientsDraft: string[]): string[] {
  const cleanedInput = inputText
    .replace(/我刚在超市买了|我在超市买了|刚在超市买了|在超市买了/g, " ")
    .replace(/我刚买了|我买了|我现在有|我有|家里有|冰箱里有/g, " ")
    .replace(/今晚吃啥|今天吃什么|怎么吃|怎么做|能做什么|如何做|咋做|可以做啥|做什么/g, " ");

  const fromText = cleanedInput
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
  return (await extractOwnedIngredientsWithReason(inputText, ownedIngredientsDraft)).result;
}

function now() {
  return Date.now();
}

function nextBreakerMode() {
  if (breakerState.mode === "open" && now() >= breakerState.openUntil) {
    breakerState.mode = "half_open";
  }
}

function markSuccess() {
  breakerState.mode = "closed";
  breakerState.consecutiveFailures = 0;
  breakerState.openUntil = 0;
}

function markFailure(error: unknown) {
  breakerState.consecutiveFailures += 1;
  const shouldOpen = breakerState.mode === "half_open" || breakerState.consecutiveFailures >= BREAKER_THRESHOLD;
  if (shouldOpen) {
    breakerState.mode = "open";
    breakerState.openUntil = now() + BREAKER_COOLDOWN_MS;
  }
  console.warn("[extract] llm failure", {
    extractBreakerState: breakerState.mode,
    extractFailureReason: error instanceof Error ? error.message : "unknown",
    consecutiveFailures: breakerState.consecutiveFailures,
  });
}

export async function extractOwnedIngredientsWithReason(
  inputText: string,
  ownedIngredientsDraft: string[],
): Promise<{ result: IngredientExtractResult; reason: IngredientExtractReason }> {
  const rawCandidates = splitCandidates(inputText, ownedIngredientsDraft);
  nextBreakerMode();

  if (breakerState.mode === "open") {
    return {
      result: {
        ingredients: normalizeUnique(rawCandidates),
        source: "fallback_rule",
        rawCandidates,
      },
      reason: "breaker_open",
    };
  }

  try {
    const raw = await callJsonModel<unknown>({
      system: `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_INGREDIENT_EXTRACT}`,
      user: buildIngredientExtractPrompt(inputText, rawCandidates),
      responseTemplate: template,
      retries: 0,
      model: "deepseek-v3-2-251201",
    });

    const parsed = extractResponseSchema.parse(raw);
    const ingredients = normalizeUnique(parsed.ingredients);

    if (ingredients.length) {
      markSuccess();
      return {
        result: {
          ingredients,
          source: "llm",
          rawCandidates,
        },
        reason: "llm_success",
      };
    }
    markFailure("empty_ingredients");
  } catch (error) {
    markFailure(error);
  }

  return {
    result: {
      ingredients: normalizeUnique(rawCandidates),
      source: "fallback_rule",
      rawCandidates,
    },
    reason: "llm_failed_fallback",
  };
}
