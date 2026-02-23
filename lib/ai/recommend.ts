import { callJsonModel } from "@/lib/ai/client";
import {
  buildRecommendUserPrompt,
  SYSTEM_PROMPT_BASE,
  SYSTEM_PROMPT_RECOMMEND,
} from "@/lib/ai/prompts";
import { getEnv } from "@/lib/utils/env";
import { buildHowToCookContext, retrieveHowToCookReferences, type HowToCookReference } from "@/lib/rag/howtocook";
import { recommendResponseSchema, type RecommendResponse } from "@/lib/schemas/recommend.schema";

const template = `{
  "recommendations": [
    {
      "id": "dish_easy_1",
      "name": "快手菜名",
      "reason": "推荐理由（简单级）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 15,
      "difficulty": "easy"
    },
    {
      "id": "dish_easy_2",
      "name": "快手菜名2",
      "reason": "推荐理由（简单级）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 18,
      "difficulty": "easy"
    },
    {
      "id": "dish_medium_1",
      "name": "家常菜名",
      "reason": "推荐理由（中等级）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 20,
      "difficulty": "medium"
    },
    {
      "id": "dish_hard_1",
      "name": "进阶菜名",
      "reason": "推荐理由（进阶级）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "estimatedTimeMin": 25,
      "difficulty": "hard"
    }
  ]
}`;

export type RecommendWithSources = RecommendResponse & {
  referenceSources: HowToCookReference[];
  fallbackUsed?: boolean;
};

function attachRecipeSource(
  recommendations: RecommendResponse["recommendations"],
  refs: HowToCookReference[],
): RecommendResponse["recommendations"] {
  return recommendations.map((item) => {
    const dishNorm = item.name.replace(/\s+/g, "").toLowerCase();
    const hit = refs.find((ref) => {
      const titleNorm = ref.title.replace(/\s+/g, "").toLowerCase();
      return titleNorm.includes(dishNorm) || dishNorm.includes(titleNorm);
    });
    if (!hit) {
      return {
        ...item,
        sourceType: "llm" as const,
      };
    }
    return {
      ...item,
      sourceType: "howtocook" as const,
      sourcePath: hit.path,
      sourceTitle: hit.title,
    };
  });
}

function fallbackRecommendations(ownedIngredients: string[]): RecommendWithSources {
  const hasEgg = ownedIngredients.some((i) => i.includes("蛋"));
  const hasTofu = ownedIngredients.some((i) => i.includes("豆腐"));
  const hasTomato = ownedIngredients.some((i) => i.includes("西红柿") || i.includes("番茄"));
  const base = [
    {
      id: "dish_easy_1",
      name: hasTomato && hasEgg ? "番茄炒蛋" : hasTofu ? "家常烧豆腐" : "清炒时蔬",
      reason: "基于现有主食材快速完成",
      requiredIngredients: [
        { name: ownedIngredients[0] || "主食材", amount: "300g" },
        { name: "食用油", amount: "15ml" },
      ],
      estimatedTimeMin: 15,
      difficulty: "easy" as const,
      sourceType: "llm" as const,
    },
    {
      id: "dish_easy_2",
      name: hasTofu && hasEgg ? "鸡蛋豆腐煲" : "葱香煎蛋",
      reason: "调味简单，成功率高",
      requiredIngredients: [
        { name: hasEgg ? "鸡蛋" : ownedIngredients[0] || "主食材", amount: hasEgg ? "3个" : "300g" },
        { name: "小葱", amount: "20g" },
      ],
      estimatedTimeMin: 20,
      difficulty: "easy" as const,
      sourceType: "llm" as const,
    },
    {
      id: "dish_medium_1",
      name: "快手汤羹",
      reason: "补充汤水，搭配均衡",
      requiredIngredients: [
        { name: hasTofu ? "豆腐" : ownedIngredients[1] || "辅料", amount: "200g" },
        { name: "盐", amount: "2g" },
      ],
      estimatedTimeMin: 18,
      difficulty: "medium" as const,
      sourceType: "llm" as const,
    },
    {
      id: "dish_medium_2",
      name: hasTofu ? "红烧豆腐" : "小炒肉片",
      reason: "中等火候，风味更足",
      requiredIngredients: [
        { name: hasTofu ? "豆腐" : "猪里脊", amount: "250g" },
        { name: "生抽", amount: "10ml" },
      ],
      estimatedTimeMin: 28,
      difficulty: "medium" as const,
      sourceType: "llm" as const,
    },
    {
      id: "dish_hard_1",
      name: "宫保风味小炒",
      reason: "调味层次更丰富",
      requiredIngredients: [
        { name: ownedIngredients[0] || "主食材", amount: "300g" },
        { name: "花椒", amount: "2g" },
      ],
      estimatedTimeMin: 35,
      difficulty: "hard" as const,
      sourceType: "llm" as const,
    },
  ];

  return {
    recommendations: base,
    referenceSources: [],
    fallbackUsed: true,
  };
}

function limitByDifficulty(input: RecommendResponse["recommendations"]): RecommendResponse["recommendations"] {
  const buckets = {
    easy: [] as RecommendResponse["recommendations"],
    medium: [] as RecommendResponse["recommendations"],
    hard: [] as RecommendResponse["recommendations"],
  };

  for (const item of input) {
    if (buckets[item.difficulty].length < 3) {
      buckets[item.difficulty].push(item);
    }
  }

  return [...buckets.easy, ...buckets.medium, ...buckets.hard];
}

export async function generateRecommendations(inputText: string, ownedIngredients: string[]): Promise<RecommendWithSources> {
  const env = getEnv();
  const references = await retrieveHowToCookReferences({
    inputText,
    ownedIngredients,
    limit: 3,
  });

  const ragContext = buildHowToCookContext(references);

  try {
    const raw = await callJsonModel<unknown>({
      system: `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_RECOMMEND}`,
      user: `${buildRecommendUserPrompt(inputText, ownedIngredients)}\n\n【HowToCook参考片段】\n${ragContext}`,
      responseTemplate: template,
      retries: 1,
      model: env.OPENAI_RECOMMEND_MODEL || env.OPENAI_MODEL,
    });

    const parsed = recommendResponseSchema.parse(raw);
    const normalized = limitByDifficulty(parsed.recommendations);
    const withSource = attachRecipeSource(normalized, references);

    return {
      recommendations: withSource,
      referenceSources: references,
      fallbackUsed: false,
    };
  } catch {
    return fallbackRecommendations(ownedIngredients);
  }
}
