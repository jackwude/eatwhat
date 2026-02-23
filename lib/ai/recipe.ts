import { callJsonModel } from "@/lib/ai/client";
import { buildRecipeUserPrompt, SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_RECIPE } from "@/lib/ai/prompts";
import { computeMissingIngredients } from "@/lib/parser/shopping-diff";
import {
  buildHowToCookContext,
  getHowToCookDocByPath,
  getHowToCookReferenceByPath,
  retrieveHowToCookReferences,
  type HowToCookDoc,
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

function parseSection(content: string, header: string, nextHeaders: string[]): string[] {
  const lines = content.split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === header);
  if (startIndex < 0) return [];
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (nextHeaders.includes(trimmed)) {
      endIndex = i;
      break;
    }
  }
  return lines.slice(startIndex + 1, endIndex);
}

function parseHowToCookIngredients(doc: HowToCookDoc, ownedIngredients: string[]): RecipeResponse["requiredIngredients"] {
  const section = parseSection(doc.content, "必备原料和工具", ["计算", "操作", "附加内容"]);
  const named = section
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => Boolean(line) && !line.includes("WARNING"))
    .slice(0, 8)
    .map((name) => ({ name, amount: "适量" }));

  const owned = ownedIngredients.slice(0, 6).map((name) => ({ name, amount: "按现有库存" }));
  const merged = [...owned];
  for (const item of named) {
    if (!merged.find((x) => x.name === item.name)) {
      merged.push(item);
    }
  }

  return merged.length ? merged : owned;
}

function parseHowToCookSteps(doc: HowToCookDoc): RecipeResponse["steps"] {
  const section = parseSection(doc.content, "操作", ["附加内容"]);
  const lines = section
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => Boolean(line) && !line.endsWith("步骤"));

  const steps = lines.slice(0, 8).map((instruction, idx) => {
    const keyMatch = instruction.match(/((?:大火|中火|中小火|小火)[^，。；]{0,16}|[0-9]+(?:-[0-9]+)?\s*(?:秒|分钟|min|S|s))/);
    return {
      stepNo: idx + 1,
      instruction,
      keyPoint: keyMatch ? `关键控制：${keyMatch[1]}` : "关键控制：按原文节奏执行，注意火候与时间。",
      sourceTag: "howtocook" as const,
    };
  });

  if (steps.length) return steps;
  return [
    {
      stepNo: 1,
      instruction: "按 HowToCook 原文完成备菜、烹饪与调味流程。",
      keyPoint: "关键控制：先备齐原料，再按火候与时长执行。",
      sourceTag: "howtocook",
    },
  ];
}

function parseHowToCookTips(doc: HowToCookDoc): string[] {
  const section = parseSection(doc.content, "附加内容", []);
  const tips = section
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => Boolean(line) && !line.includes("Issue") && !line.includes("Pull request"))
    .slice(0, 3);
  return tips.length ? tips : ["优先按 HowToCook 原文火候与时长执行。"];
}

async function buildRecipeFromHowToCookDoc(
  dishName: string,
  ownedIngredients: string[],
  references: HowToCookReference[],
): Promise<RecipeWithSources | null> {
  const primary = references[0];
  if (!primary) return null;
  const doc = await getHowToCookDocByPath(primary.path);
  if (!doc) return null;

  const requiredIngredients = parseHowToCookIngredients(doc, ownedIngredients);
  const missingIngredients = computeMissingIngredients(requiredIngredients, ownedIngredients);
  const steps = parseHowToCookSteps(doc);
  const tips = parseHowToCookTips(doc);

  return {
    dishName,
    servings: "2人份",
    requiredIngredients,
    missingIngredients,
    steps,
    tips,
    sourceType: "howtocook",
    webReferences: [],
    timing: { prepMin: 10, cookMin: 15, totalMin: 25 },
    referenceSources: references,
    fallbackUsed: false,
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
      const fromHowToCook = await buildRecipeFromHowToCookDoc(dishName, ownedIngredients, references);
      if (fromHowToCook) {
        return fromHowToCook;
      }
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
