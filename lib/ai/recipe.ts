import { callJsonModel } from "@/lib/ai/client";
import { buildRecipeUserPrompt, SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_RECIPE } from "@/lib/ai/prompts";
import { computeMissingIngredients } from "@/lib/parser/shopping-diff";
import {
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

function inferKeyPoint(instruction: string): string | undefined {
  const keyMatch = instruction.match(/((?:大火|中火|中小火|小火|微火)[^，。；]{0,18}|[0-9]+(?:-[0-9]+)?\s*(?:秒|分钟|min|S|s)|(?:变色|断生|收汁|微黄|金黄|沸腾)[^，。；]{0,12})/);
  if (!keyMatch) return undefined;
  return `关键控制：${keyMatch[1]}`;
}

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

  const fallbackSteps = [
    {
      stepNo: 1,
      instruction: `${primary} 清洗后切成均匀小块，${secondary} 处理备用。`,
      sourceTag: "fallback" as const,
    },
    {
      stepNo: 2,
      instruction: "热锅后加入食用油，中火加热至微微起纹。",
      sourceTag: "fallback" as const,
    },
    {
      stepNo: 3,
      instruction: `先下 ${primary} 快炒，再加入 ${secondary} 翻炒 2-3 分钟。`,
      sourceTag: "fallback" as const,
    },
    {
      stepNo: 4,
      instruction: "加入盐和生抽调味，翻炒至断生后出锅。",
      sourceTag: "fallback" as const,
    },
  ].map((step) => {
    const keyPoint = inferKeyPoint(step.instruction);
    return {
      ...step,
      ...(keyPoint ? { keyPoint } : {}),
    };
  });

  return {
    dishName,
    servings: "2人份",
    requiredIngredients,
    missingIngredients: computeMissingIngredients(requiredIngredients, ownedIngredients),
    steps: fallbackSteps,
    tips: ["如口味偏清淡，可将生抽减至 5ml。", "可加 20ml 清水焖 1 分钟提升融合度。"],
    sourceType: "fallback",
    webReferences,
    timing: { prepMin: 8, cookMin: 10, totalMin: 18 },
    referenceSources: references,
    fallbackUsed: true,
  };
}

function normalizeHeadingLine(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s*/u, "")
    .replace(/\u3000/g, " ")
    .trim();
}

function parseSection(content: string, header: string, nextHeaders: string[]): string[] {
  const lines = content.split("\n");
  const normalizedHeader = header.trim();
  const normalizedNext = new Set(nextHeaders.map((item) => item.trim()));

  const startIndex = lines.findIndex((line) => normalizeHeadingLine(line) === normalizedHeader);
  if (startIndex < 0) return [];

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const normalized = normalizeHeadingLine(lines[i]);
    if (normalizedNext.has(normalized)) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex + 1, endIndex);
}

function parseHowToCookIngredients(doc: HowToCookDoc): RecipeResponse["requiredIngredients"] {
  const section = parseSection(doc.content, "必备原料和工具", ["计算", "操作", "附加内容"]);
  const named = section
    .map((line) => line.trim().replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, ""))
    .filter((line) => Boolean(line) && !line.includes("WARNING"))
    .map((name) => ({ name, amount: "适量" }));
  if (named.length) return named;

  // HowToCook 原文偶发缺失原料段时，使用最小可用食材兜底，不注入用户已有食材。
  return [
    { name: "主料", amount: "适量" },
    { name: "食用油", amount: "适量" },
    { name: "盐", amount: "适量" },
  ];
}

function parseHowToCookSteps(doc: HowToCookDoc): RecipeResponse["steps"] {
  const section = parseSection(doc.content, "操作", ["附加内容"]);
  const lines = section
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.endsWith("步骤"))
    .map((line) => line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  const steps = lines.map((instruction, idx) => {
    const keyPoint = inferKeyPoint(instruction);
    return {
      stepNo: idx + 1,
      instruction,
      ...(keyPoint ? { keyPoint } : {}),
      sourceTag: "howtocook" as const,
    };
  });

  if (steps.length) return steps;
  return [
    {
      stepNo: 1,
      instruction: "按 HowToCook 原文完成备菜、烹饪与调味流程。",
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

  const requiredIngredients = parseHowToCookIngredients(doc);
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
  // Follow recommendation source strictly: when hint is llm, do not auto-upgrade to HowToCook.
  if (opts?.sourceHintType === "llm") {
    return [];
  }

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
    const fromHowToCook = await buildRecipeFromHowToCookDoc(dishName, ownedIngredients, references);
    if (fromHowToCook) {
      return fromHowToCook;
    }
    return fallbackRecipe(dishName, ownedIngredients, references);
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
