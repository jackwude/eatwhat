import { callJsonModel } from "@/lib/ai/client";
import {
  buildRecommendUserPrompt,
  SYSTEM_PROMPT_BASE,
  SYSTEM_PROMPT_RECOMMEND,
} from "@/lib/ai/prompts";
import { getEnv } from "@/lib/utils/env";
import { buildHowToCookContext, getHowToCookDocByPath, retrieveHowToCookReferences, type HowToCookReference } from "@/lib/rag/howtocook";
import { recommendResponseSchema, type RecommendResponse } from "@/lib/schemas/recommend.schema";

const NO_MATCH_MESSAGE = "当前没有匹配到菜谱";
const MATCH_THRESHOLD = 0.72;

const template = `{
  "recommendations": [
    {
      "id": "dish_easy_1",
      "name": "家常菜名",
      "reason": "推荐理由（30字内）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 20,
      "difficulty": "easy",
      "recipePreview": {
        "servings": "2人份",
        "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
        "steps": [{ "stepNo": 1, "instruction": "处理食材后开火烹饪" }],
        "tips": ["关键火候以断生为准"],
        "timing": { "prepMin": 8, "cookMin": 12, "totalMin": 20 },
        "sourceType": "llm"
      }
    },
    {
      "id": "dish_medium_1",
      "name": "家常菜名2",
      "reason": "推荐理由（30字内）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 35,
      "difficulty": "medium"
    },
    {
      "id": "dish_hard_1",
      "name": "进阶菜名",
      "reason": "推荐理由（30字内）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 50,
      "difficulty": "hard"
    }
  ]
}`;

const liteTemplate = `{
  "recommendations": [
    {
      "id": "dish_easy_1",
      "name": "家常菜名",
      "reason": "推荐理由（30字内）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 20,
      "difficulty": "easy"
    }
  ]
}`;

export type RecommendWithSources = RecommendResponse & {
  referenceSources: HowToCookReference[];
  noMatch?: boolean;
  noMatchMessage?: string;
  recipePreviewByDishId?: Record<string, NonNullable<RecommendResponse["recommendations"][number]["recipePreview"]>>;
  transientFailure?: boolean;
};

function normalizeDishText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s\t\r\n]+/g, "")
    .replace(/[，,。；;：:()（）【】\[\]"'“”‘’·]/g, "")
    .replace(/番茄/g, "西红柿")
    .replace(/猪肉丝/g, "肉丝")
    .replace(/牛肉丝/g, "肉丝")
    .replace(/^(家常|快手|经典|私房|简易|简化版|风味|改良版)/, "")
    .replace(/(做法|家常版|简化版|风味版)$/g, "");
}

function toBigrams(value: string): Set<string> {
  if (value.length <= 2) return new Set([value]);
  const grams = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) {
    grams.add(value.slice(i, i + 2));
  }
  return grams;
}

function jaccardSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftSet = toBigrams(left);
  const rightSet = toBigrams(right);
  let intersection = 0;
  for (const gram of leftSet) {
    if (rightSet.has(gram)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function scoreTitleMatch(dishName: string, refTitle: string): number {
  const dish = normalizeDishText(dishName);
  const title = normalizeDishText(refTitle);
  if (!dish || !title) return 0;
  if (dish === title) return 1;
  if (title.includes(dish) || dish.includes(title)) return 0.88;
  return jaccardSimilarity(dish, title);
}

async function matchHowToCookReference(
  dishName: string,
  inputText: string,
  ownedIngredients: string[],
): Promise<HowToCookReference | null> {
  const candidates = await retrieveHowToCookReferences({
    dishName,
    inputText,
    ownedIngredients,
    limit: 8,
  });

  if (!candidates.length) return null;

  let best: { ref: HowToCookReference; score: number } | null = null;
  for (const ref of candidates) {
    const score = scoreTitleMatch(dishName, ref.title);
    if (!best || score > best.score) {
      best = { ref, score };
    }
  }

  if (!best || best.score < MATCH_THRESHOLD) return null;

  return {
    ...best.ref,
    score: Math.max(best.ref.score, Math.round(best.score * 100)),
  };
}

function normalizeRecommendationSet(input: RecommendResponse["recommendations"]): RecommendResponse["recommendations"] {
  const seen = new Set<string>();
  const deduped: RecommendResponse["recommendations"] = [];

  for (const item of input) {
    const key = normalizeDishText(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= 3) break;
  }

  return deduped;
}

function buildRecipePreviewMap(recommendations: RecommendResponse["recommendations"]) {
  const map: Record<string, NonNullable<RecommendResponse["recommendations"][number]["recipePreview"]>> = {};
  for (const item of recommendations) {
    if (item.recipePreview) {
      map[item.id] = item.recipePreview;
    }
  }
  return Object.keys(map).length ? map : undefined;
}

async function buildHowToCookSafeFallback(
  references: HowToCookReference[],
): Promise<Pick<RecommendWithSources, "recommendations" | "referenceSources" | "recipePreviewByDishId"> | null> {
  const topRefs = references.slice(0, 3);
  if (!topRefs.length) return null;

  const difficulties: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];
  const recommendations: RecommendResponse["recommendations"] = [];
  for (let i = 0; i < topRefs.length; i += 1) {
    const ref = topRefs[i];
    const doc = await getHowToCookDocByPath(ref.path);
    if (!doc) continue;
    const requiredIngredients = doc.ingredients.slice(0, 6).map((name) => ({ name, amount: "适量" }));
    const steps = doc.operations.slice(0, 6).map((instruction, idx) => ({
      stepNo: idx + 1,
      instruction,
    }));
    recommendations.push({
      id: `dish_${difficulties[Math.min(i, 2)]}_${i + 1}`,
      name: ref.title,
      reason: "命中 HowToCook 典籍，可稳定复现。",
      requiredIngredients: requiredIngredients.length ? requiredIngredients : [{ name: ref.title, amount: "适量" }],
      estimatedTimeMin: 20 + i * 8,
      difficulty: difficulties[Math.min(i, 2)],
      sourceType: "howtocook",
      sourcePath: ref.path,
      sourceTitle: ref.title,
      recipePreview: {
        servings: "2人份",
        requiredIngredients: requiredIngredients.length ? requiredIngredients : [{ name: ref.title, amount: "适量" }],
        steps,
        tips: ["优先按 HowToCook 原文火候与节奏执行。"],
        timing: { prepMin: 8, cookMin: 12, totalMin: 20 + i * 8 },
        sourceType: "howtocook",
        sourcePath: ref.path,
        sourceTitle: ref.title,
      },
    });
  }

  if (!recommendations.length) return null;
  return {
    recommendations,
    referenceSources: topRefs,
    recipePreviewByDishId: buildRecipePreviewMap(recommendations),
  };
}

export async function generateRecommendations(inputText: string, ownedIngredients: string[]): Promise<RecommendWithSources> {
  const env = getEnv();
  const referencesForPrompt = await retrieveHowToCookReferences({
    inputText,
    ownedIngredients,
    limit: 3,
  });
  const ragContext = buildHowToCookContext(referencesForPrompt);

  async function runRecommendCall(usePreviewTemplate: boolean): Promise<RecommendResponse> {
    const raw = await callJsonModel<unknown>({
      system: `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_RECOMMEND}`,
      user: `${buildRecommendUserPrompt(inputText, ownedIngredients)}\n\n【HowToCook参考片段】\n${ragContext}`,
      responseTemplate: usePreviewTemplate ? template : liteTemplate,
      retries: 1,
      model: env.OPENAI_RECOMMEND_MODEL || env.OPENAI_MODEL,
      maxOutputTokens: usePreviewTemplate ? 1800 : 1000,
      timeoutMs: usePreviewTemplate ? 22000 : 14000,
    });
    return recommendResponseSchema.parse(raw);
  }

  try {
    let parsed: RecommendResponse;
    try {
      parsed = await runRecommendCall(true);
    } catch (firstError) {
      console.warn("[recommend] preview-rich response failed, fallback to lite response", firstError);
      parsed = await runRecommendCall(false);
    }

    const recommendations = normalizeRecommendationSet(parsed.recommendations);

    if (!recommendations.length) {
      return {
        recommendations: [],
        referenceSources: [],
        noMatch: true,
        noMatchMessage: NO_MATCH_MESSAGE,
        recipePreviewByDishId: undefined,
      };
    }

    const matched = await Promise.all(
      recommendations.map(async (item) => {
        const hit = await matchHowToCookReference(item.name, inputText, ownedIngredients);
        if (!hit) {
          return {
            recommendation: {
              ...item,
              recipePreview: item.recipePreview
                ? {
                    ...item.recipePreview,
                    sourceType: "llm" as const,
                  }
                : item.recipePreview,
              sourceType: "llm" as const,
            },
            reference: null,
          };
        }

        return {
          recommendation: {
              ...item,
              recipePreview: item.recipePreview
                ? {
                  ...item.recipePreview,
                  sourceType: "howtocook" as const,
                  sourcePath: hit.path,
                  sourceTitle: hit.title,
                }
              : item.recipePreview,
            sourceType: "howtocook" as const,
            sourcePath: hit.path,
            sourceTitle: hit.title,
          },
          reference: hit,
        };
      }),
    );

    const referenceMap = new Map<string, HowToCookReference>();
    for (const item of matched) {
      if (item.reference) {
        referenceMap.set(item.reference.path, item.reference);
      }
    }

    const normalizedRecommendations = matched.map((item) => item.recommendation);

    return {
      recommendations: normalizedRecommendations,
      referenceSources: Array.from(referenceMap.values()),
      noMatch: false,
      recipePreviewByDishId: buildRecipePreviewMap(normalizedRecommendations),
    };
  } catch (error) {
    console.error("[recommend] generateRecommendations failed", error);
    const safeFallback = await buildHowToCookSafeFallback(referencesForPrompt);
    if (safeFallback) {
      return {
        ...safeFallback,
        noMatch: false,
      };
    }
    return {
      recommendations: [],
      referenceSources: [],
      noMatch: true,
      noMatchMessage: "推荐服务暂时不可用，请重试",
      recipePreviewByDishId: undefined,
      transientFailure: true,
    };
  }
}
