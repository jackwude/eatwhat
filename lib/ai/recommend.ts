import { callJsonModel } from "@/lib/ai/client";
import { z } from "zod";
import {
  buildRecommendUserPrompt,
  SYSTEM_PROMPT_RECOMMEND,
} from "@/lib/ai/prompts";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";
import { getEnv } from "@/lib/utils/env";
import { ingredientItemSchema, recommendResponseSchema, type RecommendResponse } from "@/lib/schemas/recommend.schema";

const NO_MATCH_MESSAGE = "当前没有匹配到菜谱";
const CANDIDATE_MAX_OUTPUT_TOKENS = 4096;
// const CANDIDATE_TIMEOUT_MS = 60000; // temporarily disabled by request

const candidateTemplate = `{
  "recommendations": [
    {
      "name": "家常菜名",
      "reason": "推荐理由（30字内）",
      "requiredIngredients": [{ "name": "食材", "amount": "100g" }],
      "steps": [
        { "stepNo": 1, "instruction": "处理食材" },
        { "stepNo": 2, "instruction": "热锅下油翻炒主食材" },
        { "stepNo": 3, "instruction": "加入配菜和调味" },
        { "stepNo": 4, "instruction": "收汁或出锅" }
      ],
      "estimatedTimeMin": 20,
      "difficulty": "easy"
    }
  ]
}`;

export type RecommendWithSources = RecommendResponse & {
  referenceSources: Array<{ title: string; path: string; score: number; excerpt: string }>;
  noMatch?: boolean;
  noMatchMessage?: string;
  recipePreviewByDishId?: Record<string, NonNullable<RecommendResponse["recommendations"][number]["recipePreview"]>>;
  transientFailure?: boolean;
  llmRawOutput?: string;
  llmDebugTrace?: string[];
};

const candidateRecipePreviewSchema = z.object({
  servings: z.string().min(1).optional(),
  requiredIngredients: z.array(ingredientItemSchema).min(1).optional(),
  steps: z
    .array(
      z.object({
        stepNo: z.number().int().positive(),
        instruction: z.string().min(1),
        keyPoint: z.string().min(1).optional(),
      }),
    )
    .optional(),
  tips: z.array(z.string().min(1)).optional(),
  timing: z
    .object({
      prepMin: z.number().int().nonnegative(),
      cookMin: z.number().int().nonnegative(),
      totalMin: z.number().int().positive(),
    })
    .optional(),
  sourceType: z.enum(["howtocook", "llm", "web", "fallback"]).optional(),
  sourcePath: z.string().min(1).optional(),
  sourceTitle: z.string().min(1).optional(),
});

const candidateItemSchema = z.object({
  name: z.string().min(1),
  reason: z.string().min(1),
  requiredIngredients: z.array(ingredientItemSchema).optional(),
  steps: z
    .array(
      z.object({
        stepNo: z.number().int().positive(),
        instruction: z.string().min(1),
      }),
    )
    .optional(),
  estimatedTimeMin: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  recipePreview: candidateRecipePreviewSchema.optional(),
});

const candidateResponseSchema = z.object({
  recommendations: z.array(candidateItemSchema).min(0).max(12),
});

type CandidateRecommendation = z.infer<typeof candidateItemSchema>;
type CandidateRanked = {
  candidate: CandidateRecommendation;
  cookability: {
    missingCount: number;
    ownedCoverage: number;
    hitCount: number;
    requiredCount: number;
    sparsePenalty: number;
  };
  nameConfidence: number;
};

type CandidateResponse = z.infer<typeof candidateResponseSchema>;

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

function normalizeIngredientToken(input: string): string {
  const normalized = normalizeIngredientList([input])[0] || input;
  return normalized
    .toLowerCase()
    .replace(/[\s\t\r\n]+/g, "")
    .replace(/[，,。；;：:()（）【】\[\]"'“”‘’·]/g, "");
}

function ingredientsLikelyMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function normalizeCandidateSet(input: CandidateRecommendation[]): CandidateRecommendation[] {
  const deduped: CandidateRecommendation[] = [];

  for (const item of input) {
    const key = normalizeDishText(item.name);
    if (!key) continue;

    const existingIndex = deduped.findIndex((current) => scoreTitleMatch(current.name, item.name) >= 0.86);
    if (existingIndex < 0) {
      deduped.push(item);
      continue;
    }

    const existing = deduped[existingIndex];
    const existingQuality =
      (existing.requiredIngredients?.length || 0) +
      (existing.recipePreview?.requiredIngredients?.length || 0) +
      (existing.recipePreview?.steps?.length || 0);
    const nextQuality =
      (item.requiredIngredients?.length || 0) + (item.recipePreview?.requiredIngredients?.length || 0) + (item.recipePreview?.steps?.length || 0);

    if (nextQuality > existingQuality) {
      deduped[existingIndex] = item;
    }
  }

  return deduped;
}

function normalizeCandidateIngredients(item: CandidateRecommendation): CandidateRecommendation {
  const merged = item.requiredIngredients?.length ? item.requiredIngredients : item.recipePreview?.requiredIngredients;
  const base = merged?.length ? merged : [{ name: item.name, amount: "适量" }];
  return {
    ...item,
    requiredIngredients: base.slice(0, 6),
    recipePreview: item.recipePreview
      ? {
        ...item.recipePreview,
        requiredIngredients: (item.recipePreview.requiredIngredients?.length ? item.recipePreview.requiredIngredients : base).slice(0, 6),
      }
      : item.recipePreview,
  };
}

function buildFallbackSteps(item: CandidateRecommendation, ingredients: Array<{ name: string; amount: string }>) {
  const main = ingredients[0]?.name || item.name;
  const second = ingredients[1]?.name || "配菜";
  return [
    { stepNo: 1, instruction: `将${main}和${second}处理成易熟大小备用。` },
    { stepNo: 2, instruction: "热锅下油，先将主食材翻炒至变色出香。", },
    { stepNo: 3, instruction: "加入其余食材继续翻炒，补少量清水防止糊锅。", },
    { stepNo: 4, instruction: "加入生抽、蚝油等基础调味，翻匀至入味。", },
    { stepNo: 5, instruction: "根据锅内状态收汁或略焖，确保食材熟透。", },
  ];
}

function normalizeCandidateSteps(item: CandidateRecommendation): CandidateRecommendation {
  const rawSteps = Array.isArray(item.steps)
    ? item.steps
    : Array.isArray(item.recipePreview?.steps)
      ? item.recipePreview.steps.map((step) => ({ stepNo: step.stepNo, instruction: step.instruction }))
      : [];
  const deduped = rawSteps
    .map((step) => ({ stepNo: step.stepNo, instruction: step.instruction.trim() }))
    .filter((step) => step.instruction);
  const normalized =
    deduped.length >= 4
      ? deduped.slice(0, 6).map((step, idx) => ({ stepNo: idx + 1, instruction: step.instruction }))
      : buildFallbackSteps(item, item.requiredIngredients || []).slice(0, 6).map((step, idx) => ({ ...step, stepNo: idx + 1 }));
  return {
    ...item,
    steps: normalized,
    recipePreview: item.recipePreview
      ? {
        ...item.recipePreview,
        steps: normalized.map((step) => ({
          stepNo: step.stepNo,
          instruction: step.instruction,
        })),
      }
      : {
        requiredIngredients: item.requiredIngredients,
        steps: normalized.map((step) => ({
          stepNo: step.stepNo,
          instruction: step.instruction,
        })),
      },
  };
}

function deriveOwnedIngredientsFromInputText(inputText: string): string[] {
  return normalizeIngredientList(inputText.split(/[，,、；;。\n\s]+/g)).slice(0, 12);
}

function scoreCookability(requiredIngredients: Array<{ name: string; amount: string }>, ownedIngredients: string[]) {
  const requiredNormalized = Array.from(new Set(requiredIngredients.map((item) => normalizeIngredientToken(item.name)).filter(Boolean)));
  const ownedNormalized = Array.from(new Set(ownedIngredients.map((item) => normalizeIngredientToken(item)).filter(Boolean)));
  if (!requiredNormalized.length) {
    return { missingCount: 0, ownedCoverage: 0, hitCount: 0, requiredCount: 0, sparsePenalty: 1.4 };
  }

  let hitCount = 0;
  for (const required of requiredNormalized) {
    if (ownedNormalized.some((owned) => ingredientsLikelyMatch(required, owned))) {
      hitCount += 1;
    }
  }

  const requiredCount = requiredNormalized.length;
  const sparsePenalty = requiredCount >= 3 ? 0 : requiredCount === 2 ? 0.4 : 1;
  return {
    hitCount,
    requiredCount,
    missingCount: Math.max(requiredCount - hitCount, 0),
    ownedCoverage: requiredCount ? hitCount / requiredCount : 0,
    sparsePenalty,
  };
}

function compareByCookability(left: CandidateRanked, right: CandidateRanked): number {
  const leftAdjustedMissing = left.cookability.missingCount + left.cookability.sparsePenalty;
  const rightAdjustedMissing = right.cookability.missingCount + right.cookability.sparsePenalty;
  if (leftAdjustedMissing !== rightAdjustedMissing) {
    return leftAdjustedMissing - rightAdjustedMissing;
  }
  if (left.cookability.ownedCoverage !== right.cookability.ownedCoverage) {
    return right.cookability.ownedCoverage - left.cookability.ownedCoverage;
  }

  if (left.nameConfidence !== right.nameConfidence) {
    return right.nameConfidence - left.nameConfidence;
  }

  const leftTimeDelta = Math.abs(left.candidate.estimatedTimeMin - 30);
  const rightTimeDelta = Math.abs(right.candidate.estimatedTimeMin - 30);
  if (leftTimeDelta !== rightTimeDelta) {
    return leftTimeDelta - rightTimeDelta;
  }

  return left.candidate.name.localeCompare(right.candidate.name, "zh-CN");
}

function finalizeRecommendations(matched: CandidateRanked[]): RecommendResponse["recommendations"] {
  const rankedAll = matched.slice().sort((left, right) => compareByCookability(left, right));
  const difficulties: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];
  const buckets: Record<"easy" | "medium" | "hard", CandidateRanked[]> = {
    easy: [],
    medium: [],
    hard: [],
  };

  for (const item of rankedAll) {
    buckets[item.candidate.difficulty].push(item);
  }

  // NOTE: 每个难度桶取 Top 1，由排序算法从候选中精选最优菜品
  const results: RecommendResponse["recommendations"] = [];
  for (const difficulty of difficulties) {
    const top = buckets[difficulty][0];
    if (!top) continue;

    const entry = top;
    const sourceType = "llm" as const;
    const preview = entry.candidate.recipePreview
      ? {
        ...entry.candidate.recipePreview,
        sourceType,
      }
      : entry.candidate.recipePreview;

    results.push({
      id: `dish_${difficulty}_1`,
      name: entry.candidate.name,
      reason: entry.candidate.reason,
      requiredIngredients: entry.candidate.requiredIngredients || [{ name: entry.candidate.name, amount: "适量" }],
      steps: entry.candidate.steps?.slice(0, 6),
      estimatedTimeMin: entry.candidate.estimatedTimeMin,
      difficulty,
      sourceType,
      ...(preview ? { recipePreview: preview } : {}),
    });
  }

  return results;
}

export const __recommendTestUtils = {
  finalizeRecommendations,
};

function buildRecipePreviewMap(recommendations: RecommendResponse["recommendations"]) {
  const map: Record<string, NonNullable<RecommendResponse["recommendations"][number]["recipePreview"]>> = {};
  for (const item of recommendations) {
    if (item.recipePreview) {
      map[item.id] = item.recipePreview;
    }
  }
  return Object.keys(map).length ? map : undefined;
}

function buildLocalFallbackRecommendations(ownedIngredients: string[]): RecommendResponse["recommendations"] {
  const primary = ownedIngredients[0] || "主食材";
  const secondary = ownedIngredients[1] || "辅料";
  const tertiary = ownedIngredients[2] || "配菜";
  return [
    {
      id: "dish_easy_1",
      name: `${primary}快炒`,
      reason: "食材现成，步骤简单，适合快速开做。",
      requiredIngredients: [
        { name: primary, amount: "200g" },
        { name: secondary, amount: "100g" },
      ],
      estimatedTimeMin: 18,
      difficulty: "easy",
      steps: [
        { stepNo: 1, instruction: `将${primary}和${secondary}处理成小块备用。` },
        { stepNo: 2, instruction: `热锅下油，先炒${primary}至变色。` },
        { stepNo: 3, instruction: `加入${secondary}翻炒并调味。` },
        { stepNo: 4, instruction: "收汁后即可出锅。" },
      ],
      sourceType: "fallback",
    },
    {
      id: "dish_medium_1",
      name: `${primary}${secondary}家常炖`,
      reason: "口味稳妥，食材利用率高，家常好上手。",
      requiredIngredients: [
        { name: primary, amount: "300g" },
        { name: secondary, amount: "150g" },
        { name: tertiary, amount: "100g" },
      ],
      estimatedTimeMin: 32,
      difficulty: "medium",
      steps: [
        { stepNo: 1, instruction: `将${primary}焯水或煸炒去腥。` },
        { stepNo: 2, instruction: `加入${secondary}和${tertiary}翻炒。` },
        { stepNo: 3, instruction: "加入基础调味和热水，小火炖煮。", },
        { stepNo: 4, instruction: "炖至软烂后收汁出锅。", },
      ],
      sourceType: "fallback",
    },
    {
      id: "dish_hard_1",
      name: `${primary}进阶风味做法`,
      reason: "在现有食材上提升层次，适合进阶尝试。",
      requiredIngredients: [
        { name: primary, amount: "300g" },
        { name: secondary, amount: "120g" },
        { name: tertiary, amount: "80g" },
      ],
      estimatedTimeMin: 45,
      difficulty: "hard",
      steps: [
        { stepNo: 1, instruction: `将${primary}腌制 10 分钟提升风味。` },
        { stepNo: 2, instruction: `先煎或煸炒${primary}至表面微焦。` },
        { stepNo: 3, instruction: `加入${secondary}与${tertiary}继续炒香。` },
        { stepNo: 4, instruction: "加调味和少量水焖煮至入味。", },
        { stepNo: 5, instruction: "最后大火收汁，检查成熟度后出锅。", },
      ],
      sourceType: "fallback",
    },
  ];
}

function isWebSearchToolError(error: unknown): boolean {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return message.includes("toolnotopen") || message.includes("web_search") || (message.includes("tool") && message.includes("failed"));
}

function isSearchFallbackRecoverableError(error: unknown): boolean {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return (
    isWebSearchToolError(error) ||
    message.includes("unable to parse target json object") ||
    message.includes("llm json parse failed") ||
    message.includes("request timeout") ||
    message.includes("incomplete")
  );
}

function formatRawPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export async function generateRecommendations(
  inputText: string,
  ownedIngredientsDraft: string[] = [],
  thinkingEnabled = false,
): Promise<RecommendWithSources> {
  const env = getEnv();
  const normalizedOwnedDraft = normalizeIngredientList(ownedIngredientsDraft);
  const ownedIngredients = normalizedOwnedDraft.length ? normalizedOwnedDraft : deriveOwnedIngredientsFromInputText(inputText);
  const debugRawOutputEnabled = env.RECOMMEND_DEBUG_RAW_OUTPUT;
  const thinkingType = thinkingEnabled ? "enabled" : "disabled";
  const responsesThinking = thinkingEnabled ? ({ type: "enabled" } as const) : undefined;
  const useWebSearchByDefault = env.RECOMMEND_WEB_SEARCH_DEFAULT;
  const webSearchTool = { type: "web_search", max_keyword: env.RECOMMEND_WEB_SEARCH_MAX_KEYWORD } as const;
  let lastRawOutput = "";
  const debugTrace: string[] = [];

  async function runCandidateCall(useWebSearch: boolean, phase: string): Promise<CandidateResponse> {
    const raw = await callJsonModel<unknown>({
      system: SYSTEM_PROMPT_RECOMMEND,
      user: buildRecommendUserPrompt(inputText, ownedIngredientsDraft),
      responseTemplate: candidateTemplate,
      retries: 0,
      model: env.OPENAI_RECOMMEND_MODEL || env.OPENAI_MODEL,
      responsesTools: useWebSearch ? [webSearchTool] : undefined,
      responsesThinking,
      onRawPayload: (payload) => {
        const formatted = formatRawPayload(payload);
        lastRawOutput = formatted;
        debugTrace.push(`[${phase}] success useWebSearch=${useWebSearch}`);
      },
      maxOutputTokens: CANDIDATE_MAX_OUTPUT_TOKENS,
    });
    return candidateResponseSchema.parse(raw);
  }

  try {
    let llmPayload: CandidateResponse;
    let toolRetryCount = 0;
    let toolFallbackNoSearch = false;

    if (useWebSearchByDefault) {
      try {
        llmPayload = await runCandidateCall(true, "tool_primary");
      } catch (firstError) {
        if (!isSearchFallbackRecoverableError(firstError)) throw firstError;
        debugTrace.push(`[tool_primary] failed: ${String((firstError as Error)?.message || firstError)}`);
        toolRetryCount = 1;
        try {
          llmPayload = await runCandidateCall(true, "tool_retry");
        } catch (secondError) {
          if (!isSearchFallbackRecoverableError(secondError)) throw secondError;
          debugTrace.push(`[tool_retry] failed: ${String((secondError as Error)?.message || secondError)}`);
          toolFallbackNoSearch = true;
          llmPayload = await runCandidateCall(false, "no_tool_fallback");
        }
      }
    } else {
      llmPayload = await runCandidateCall(false, "no_tool_primary");
    }

    const candidates = llmPayload.recommendations;
    const normalizedCandidates = normalizeCandidateSet(candidates).map(normalizeCandidateIngredients).map(normalizeCandidateSteps);
    if (!normalizedCandidates.length) {
      return {
        recommendations: [],
        referenceSources: [],
        noMatch: true,
        noMatchMessage: NO_MATCH_MESSAGE,
        recipePreviewByDishId: undefined,
        ...(debugRawOutputEnabled
          ? {
            llmRawOutput: lastRawOutput,
            llmDebugTrace: debugTrace,
          }
          : {}),
      };
    }

    const matched: CandidateRanked[] = normalizedCandidates.map((item) => ({
      candidate: item,
      cookability: scoreCookability(item.requiredIngredients || [], ownedIngredients),
      nameConfidence: 0.6,
    }));

    const recommendations = finalizeRecommendations(matched);
    const parsedRecommendations = recommendResponseSchema.parse({
      recommendations,
    }).recommendations;

    if (!parsedRecommendations.length) {
      return {
        recommendations: [],
        referenceSources: [],
        noMatch: true,
        noMatchMessage: NO_MATCH_MESSAGE,
        recipePreviewByDishId: undefined,
        ...(debugRawOutputEnabled
          ? {
            llmRawOutput: lastRawOutput,
            llmDebugTrace: debugTrace,
          }
          : {}),
      };
    }
    const perDifficulty = {
      easy: parsedRecommendations.filter((item) => item.difficulty === "easy").length,
      medium: parsedRecommendations.filter((item) => item.difficulty === "medium").length,
      hard: parsedRecommendations.filter((item) => item.difficulty === "hard").length,
    };
    const top3 = matched
      .slice()
      .sort((left, right) => compareByCookability(left, right))
      .slice(0, 3);
    const avgMissingTop3 = top3.length ? Number((top3.reduce((sum, item) => sum + item.cookability.missingCount, 0) / top3.length).toFixed(2)) : 0;
    console.info("[recommend] pipeline_stats", {
      rag_mode: "none",
      thinking_mode: thinkingType,
      web_search_enabled: useWebSearchByDefault,
      tool_retry_count: toolRetryCount,
      tool_fallback_no_search: toolFallbackNoSearch,
      owned_ingredients_count: ownedIngredients.length,
      candidate_total: candidates.length,
      candidate_after_dedup: normalizedCandidates.length,
      howtocook_hit_count: 0,
      llm_only_count: matched.length,
      hit_ratio: 0,
      target_per_bucket: 3,
      bucket_easy: perDifficulty.easy,
      bucket_medium: perDifficulty.medium,
      bucket_hard: perDifficulty.hard,
      bucket_all_met: perDifficulty.easy >= 3 && perDifficulty.medium >= 3 && perDifficulty.hard >= 3,
      avg_missing_top3: avgMissingTop3,
      avg_sparse_penalty_top3: top3.length ? Number((top3.reduce((sum, item) => sum + item.cookability.sparsePenalty, 0) / top3.length).toFixed(2)) : 0,
      howtocook_sort_bonus: 0,
    });

    return {
      recommendations: parsedRecommendations,
      referenceSources: [],
      noMatch: false,
      recipePreviewByDishId: buildRecipePreviewMap(parsedRecommendations),
      ...(debugRawOutputEnabled
        ? {
          llmRawOutput: lastRawOutput,
          llmDebugTrace: debugTrace,
        }
        : {}),
    };
  } catch (error) {
    if (debugRawOutputEnabled) {
      debugTrace.push(`[pipeline] failed: ${String((error as Error)?.message || error)}`);
    }
    console.error("[recommend] generateRecommendations failed", error);
    if (ownedIngredients.length) {
      const fallback = buildLocalFallbackRecommendations(ownedIngredients);
      return {
        recommendations: fallback,
        referenceSources: [],
        noMatch: false,
        recipePreviewByDishId: undefined,
        transientFailure: false,
        ...(debugRawOutputEnabled
          ? {
            llmRawOutput: lastRawOutput,
            llmDebugTrace: debugTrace,
          }
          : {}),
      };
    }
    return {
      recommendations: [],
      referenceSources: [],
      noMatch: true,
      noMatchMessage: "推荐服务暂时不可用，请重试",
      recipePreviewByDishId: undefined,
      transientFailure: true,
      ...(debugRawOutputEnabled
        ? {
          llmRawOutput: lastRawOutput,
          llmDebugTrace: debugTrace,
        }
        : {}),
    };
  }
}
