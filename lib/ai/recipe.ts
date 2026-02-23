import { callJsonModel } from "@/lib/ai/client";
import { buildRecipeUserPrompt, SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_RECIPE } from "@/lib/ai/prompts";
import { computeMissingIngredients } from "@/lib/parser/shopping-diff";
import {
  buildHowToCookContext,
  getHowToCookReferenceByPath,
  retrieveHowToCookReferences,
  type HowToCookReference,
} from "@/lib/rag/howtocook";
import { recipeResponseSchema, type RecipeResponse } from "@/lib/schemas/recipe.schema";
import { getEnv } from "@/lib/utils/env";

type WebReference = {
  title: string;
  url: string;
  snippet: string;
};

const template = `{
  "dishName": "番茄炒蛋",
  "servings": "2人份",
  "requiredIngredients": [{ "name": "西红柿", "amount": "300g" }],
  "missingIngredients": [{ "name": "盐", "amount": "2g" }],
  "steps": [
    { "stepNo": 1, "instruction": "步骤描述", "keyPoint": "关键点", "sourceTag": "howtocook" }
  ],
  "tips": ["技巧1"],
  "sourceType": "howtocook",
  "webReferences": [{ "title": "来源标题", "url": "https://example.com", "snippet": "摘要" }],
  "timing": { "prepMin": 8, "cookMin": 7, "totalMin": 15 }
}`;

export type RecipeWithSources = RecipeResponse & {
  referenceSources: HowToCookReference[];
  fallbackUsed?: boolean;
};

function withStepSourceTag(
  steps: RecipeResponse["steps"],
  sourceTag: "howtocook" | "web" | "llm" | "fallback",
): RecipeResponse["steps"] {
  return steps.map((step) => ({
    ...step,
    sourceTag: step.sourceTag || sourceTag,
  }));
}

function fallbackRecipe(
  dishName: string,
  ownedIngredients: string[],
  references: HowToCookReference[] = [],
  webReferences: WebReference[] = [],
): RecipeWithSources {
  const primary = ownedIngredients[0] || "主食材";
  const secondary = ownedIngredients[1] || "辅料";

  const requiredIngredients = [
    { name: primary, amount: "300g" },
    { name: secondary, amount: "120g" },
    { name: "食用油", amount: "15ml" },
    { name: "盐", amount: "2g" },
    { name: "生抽", amount: "8ml" },
  ];

  return {
    dishName,
    servings: "2人份",
    requiredIngredients,
    missingIngredients: computeMissingIngredients(requiredIngredients, ownedIngredients),
    steps: [
      {
        stepNo: 1,
        instruction: `${primary} 清洗后切成均匀小块，${secondary} 处理备用。`,
        keyPoint: "食材大小尽量一致，后续受热更均匀。",
        sourceTag: "fallback",
      },
      {
        stepNo: 2,
        instruction: "热锅后加入食用油，中火加热至微微起纹。",
        keyPoint: "油温约 150-160°C 下主料，避免粘锅。",
        sourceTag: "fallback",
      },
      {
        stepNo: 3,
        instruction: `先下 ${primary} 快炒，再加入 ${secondary} 翻炒 2-3 分钟。`,
        keyPoint: "保持中火持续翻动，避免局部焦糊。",
        sourceTag: "fallback",
      },
      {
        stepNo: 4,
        instruction: "加入盐和生抽调味，翻炒至断生后出锅。",
        keyPoint: "调味后再炒 30-60 秒，让味道附着。",
        sourceTag: "fallback",
      },
    ],
    tips: ["如口味偏清淡，可将生抽减至 5ml。", "可加 20ml 清水焖 1 分钟提升融合度。"],
    sourceType: "fallback",
    webReferences,
    timing: { prepMin: 8, cookMin: 10, totalMin: 18 },
    referenceSources: references,
    fallbackUsed: true,
  };
}

async function resolveHowToCookReferences(
  dishName: string,
  ownedIngredients: string[],
  opts?: { sourceHintPath?: string; sourceHintType?: "howtocook" | "llm" },
): Promise<HowToCookReference[]> {
  if (opts?.sourceHintType === "howtocook" && opts.sourceHintPath) {
    const byPath = await getHowToCookReferenceByPath(opts.sourceHintPath);
    if (byPath) return [byPath];
  }

  return retrieveHowToCookReferences({
    dishName,
    ownedIngredients,
    limit: 4,
  });
}

export async function generateRecipeDetail(
  dishName: string,
  ownedIngredients: string[],
  opts?: { sourceHintPath?: string; sourceHintType?: "howtocook" | "llm" },
): Promise<RecipeWithSources> {
  const env = getEnv();
  const references = await resolveHowToCookReferences(dishName, ownedIngredients, opts);

  if (references.length) {
    const ragContext = buildHowToCookContext(references);
    try {
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
        steps: withStepSourceTag(parsed.steps, "howtocook"),
        sourceType: "howtocook",
        referenceSources: references,
        fallbackUsed: false,
      };
    } catch {
      return fallbackRecipe(dishName, ownedIngredients, references);
    }
  }

  const webSearchSystemPrompt = `${SYSTEM_PROMPT_BASE}
${SYSTEM_PROMPT_RECIPE}
附加要求：
- 当前未命中本地 HowToCook，请使用联网检索补充权威做法。
- 优先检索中文菜谱站点或高质量内容来源，最多引用 3 条。
- 返回 sourceType="web"，并填写 webReferences（title/url/snippet）。
- 每步 sourceTag 设为 "web"。`;

  try {
    const raw = await callJsonModel<unknown>({
      system: webSearchSystemPrompt,
      user: `${buildRecipeUserPrompt(dishName, ownedIngredients)}\n\n当前未命中本地 HowToCook 数据，请联网检索后再生成菜谱。`,
      responseTemplate: template,
      retries: 1,
      model: env.OPENAI_RECIPE_WEBSEARCH_MODEL || env.OPENAI_RECOMMEND_MODEL || env.OPENAI_MODEL,
      responsesTools: [{ type: "web_search", max_keyword: 3 }],
    });

    const parsed = recipeResponseSchema.parse(raw);
    const correctedMissing = computeMissingIngredients(parsed.requiredIngredients, ownedIngredients);

    return {
      ...parsed,
      missingIngredients: correctedMissing,
      steps: withStepSourceTag(parsed.steps, "web"),
      sourceType: "web",
      webReferences: parsed.webReferences || [],
      referenceSources: [],
      fallbackUsed: false,
    };
  } catch {
    return fallbackRecipe(dishName, ownedIngredients);
  }
}
