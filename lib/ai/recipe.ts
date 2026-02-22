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
  fallbackUsed?: boolean;
};

function fallbackRecipe(dishName: string, ownedIngredients: string[]): RecipeWithSources {
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
      { stepNo: 1, instruction: `${primary} 清洗后切成均匀小块，${secondary} 处理备用。`, keyPoint: "食材大小尽量一致，后续受热更均匀。" },
      { stepNo: 2, instruction: "热锅后加入食用油，中火加热至微微起纹。", keyPoint: "油温约 150-160°C 下主料，避免粘锅。" },
      { stepNo: 3, instruction: `先下 ${primary} 快炒，再加入 ${secondary} 翻炒 2-3 分钟。`, keyPoint: "保持中火持续翻动，避免局部焦糊。" },
      { stepNo: 4, instruction: "加入盐和生抽调味，翻炒至断生后出锅。", keyPoint: "调味后再炒 30-60 秒，让味道附着。" },
    ],
    tips: ["如口味偏清淡，可将生抽减至 5ml。", "可加 20ml 清水焖 1 分钟提升融合度。"],
    timing: { prepMin: 8, cookMin: 10, totalMin: 18 },
    referenceSources: [],
    fallbackUsed: true,
  };
}

export async function generateRecipeDetail(dishName: string, ownedIngredients: string[]): Promise<RecipeWithSources> {
  const references = await retrieveHowToCookReferences({
    dishName,
    ownedIngredients,
    limit: 4,
  });

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
      referenceSources: references,
      fallbackUsed: false,
    };
  } catch {
    return fallbackRecipe(dishName, ownedIngredients);
  }
}
