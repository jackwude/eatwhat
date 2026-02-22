import { callJsonModel } from "@/lib/ai/client";
import {
  buildRecommendUserPrompt,
  SYSTEM_PROMPT_BASE,
  SYSTEM_PROMPT_RECOMMEND,
} from "@/lib/ai/prompts";
import { buildHowToCookContext, retrieveHowToCookReferences, type HowToCookReference } from "@/lib/rag/howtocook";
import { recommendResponseSchema, type RecommendResponse } from "@/lib/schemas/recommend.schema";

const template = `{
  "recommendations": [
    {
      "id": "dish_1",
      "name": "菜名",
      "reason": "推荐理由",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 15,
      "difficulty": "easy"
    },
    {
      "id": "dish_2",
      "name": "菜名",
      "reason": "推荐理由",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 20,
      "difficulty": "medium"
    },
    {
      "id": "dish_3",
      "name": "菜名",
      "reason": "推荐理由",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 25,
      "difficulty": "hard"
    }
  ]
}`;

export type RecommendWithSources = RecommendResponse & {
  referenceSources: HowToCookReference[];
};

export async function generateRecommendations(inputText: string, ownedIngredients: string[]): Promise<RecommendWithSources> {
  const references = await retrieveHowToCookReferences({
    inputText,
    ownedIngredients,
    limit: 5,
  });

  const ragContext = buildHowToCookContext(references);
  const raw = await callJsonModel<unknown>({
    system: `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_RECOMMEND}`,
    user: `${buildRecommendUserPrompt(inputText, ownedIngredients)}\n\n【HowToCook参考片段】\n${ragContext}`,
    responseTemplate: template,
    retries: 1,
  });

  const parsed = recommendResponseSchema.parse(raw);

  return {
    ...parsed,
    referenceSources: references,
  };
}
