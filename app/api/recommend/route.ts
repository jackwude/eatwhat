import { NextResponse } from "next/server";
import { createHistoryEntry, findCachedRecommendationByHash } from "@/lib/db/queries";
import { generateRecommendations, type RecommendWithSources } from "@/lib/ai/recommend";
import { recommendRequestSchema } from "@/lib/schemas/recommend.schema";
import { extractOwnedIngredientsWithReason } from "@/lib/ai/ingredient-extractor";
import { readExtractCache, writeExtractCache, toExtractCacheKey } from "@/lib/cache/extract-cache";
import { getEnv } from "@/lib/utils/env";
import { sha256 } from "@/lib/utils/hash";
import type { HowToCookReference } from "@/lib/rag/howtocook";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";

export const runtime = "nodejs";

type CacheItem = {
  value: RecommendWithSources;
  expiresAt: number;
};

const recommendCache = new Map<string, CacheItem>();
const DISABLE_RECOMMEND_CACHE = true;

function normalizeInput(inputText: string, ownedIngredients: string[], thinkingEnabled: boolean) {
  const normalizedInput = inputText.trim().toLowerCase();
  const normalizedOwned = [...ownedIngredients].map((i) => i.toLowerCase()).sort();
  return { normalizedInput, normalizedOwned, thinkingTag: thinkingEnabled ? "think_on" : "think_off" };
}

function toCacheKey(inputText: string, ownedIngredients: string[], thinkingEnabled: boolean) {
  const { normalizedInput, normalizedOwned, thinkingTag } = normalizeInput(inputText, ownedIngredients, thinkingEnabled);
  return `${normalizedInput}__${normalizedOwned.join("|")}__${thinkingTag}`;
}

function toRequestHash(inputText: string, ownedIngredients: string[], thinkingEnabled: boolean) {
  const { normalizedInput, normalizedOwned, thinkingTag } = normalizeInput(inputText, ownedIngredients, thinkingEnabled);
  return sha256(`${normalizedInput}__${normalizedOwned.join("|")}__${thinkingTag}`);
}

function readCache(key: string): RecommendWithSources | null {
  const cached = recommendCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    recommendCache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache(key: string, value: RecommendWithSources) {
  const ttlMs = getEnv().RECOMMEND_CACHE_TTL_SEC * 1000;
  recommendCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function isRecommendationArray(value: unknown): value is RecommendWithSources["recommendations"] {
  return Array.isArray(value);
}

function toReferenceSources(recommendations: RecommendWithSources["recommendations"]): HowToCookReference[] {
  const refs = recommendations
    .filter((item) => item.sourceType === "howtocook" && item.sourcePath && item.sourceTitle)
    .map((item) => ({
      title: item.sourceTitle as string,
      path: item.sourcePath as string,
      score: 100,
      excerpt: "",
    }));
  const unique = new Map<string, HowToCookReference>();
  for (const ref of refs) unique.set(ref.path, ref);
  return Array.from(unique.values());
}

function toRecipePreviewByDishId(
  recommendations: RecommendWithSources["recommendations"],
): RecommendWithSources["recipePreviewByDishId"] {
  const map: NonNullable<RecommendWithSources["recipePreviewByDishId"]> = {};
  for (const item of recommendations) {
    if (item.recipePreview) {
      map[item.id] = item.recipePreview;
    }
  }
  return Object.keys(map).length ? map : undefined;
}

async function persistRecommendHistory(
  inputText: string,
  ownedIngredients: string[],
  requestHash: string,
  recommendations: RecommendWithSources["recommendations"],
) {
  try {
    await createHistoryEntry({
      kind: "recommend",
      requestHash,
      inputText,
      ownedIngredients,
      recommendations,
    });
  } catch (error) {
    console.error("[recommend] history persist failed", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = recommendRequestSchema.parse(body);

    // NOTE: 食材提取必须在 LLM 推荐之前完成，保证推荐用到标准化后的食材
    let ownedIngredients: string[];
    let ingredientExtractSource: "llm" | "fallback_rule" | "input_direct";
    let ingredientExtractReason: string;

    const extractCacheKey = toExtractCacheKey(parsed.inputText);
    const cachedExtract = readExtractCache(parsed.inputText);

    if (cachedExtract) {
      ownedIngredients = cachedExtract.result.ingredients;
      ingredientExtractSource = cachedExtract.result.source;
      ingredientExtractReason = "cache_reuse";
    } else {
      const { result, reason } = await extractOwnedIngredientsWithReason(
        parsed.inputText,
        parsed.ownedIngredients,
      );
      ownedIngredients = result.ingredients;
      ingredientExtractSource = result.source;
      ingredientExtractReason = reason;
      writeExtractCache(parsed.inputText, result, reason as "llm_success" | "breaker_open" | "llm_failed_fallback");
    }

    if (!ownedIngredients.length) {
      return NextResponse.json({ error: "请补充更明确的食材信息后再试" }, { status: 400 });
    }

    const key = toCacheKey(parsed.inputText, ownedIngredients, parsed.thinkingEnabled);
    const requestHash = toRequestHash(parsed.inputText, ownedIngredients, parsed.thinkingEnabled);

    if (!DISABLE_RECOMMEND_CACHE) {
      const cached = readCache(key);
      if (cached) {
        if (!cached.recommendations.length) {
          recommendCache.delete(key);
        } else {
          await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, cached.recommendations);
          return NextResponse.json({
            ...cached,
            normalizedOwnedIngredients: ownedIngredients,
            ingredientExtractSource,
            ingredientExtractReason,
            cacheHit: true,
            cacheSource: "memory",
          });
        }
      }

      const dbCached = await findCachedRecommendationByHash(requestHash);
      if (dbCached && isRecommendationArray(dbCached.recommendations)) {
        if (dbCached.recommendations.length === 0) {
          // 避免历史错误版本写入的空结果长期污染推荐。
        } else {
          const value: RecommendWithSources = {
            recommendations: dbCached.recommendations,
            referenceSources: toReferenceSources(dbCached.recommendations),
            noMatch: dbCached.recommendations.length === 0,
            noMatchMessage: dbCached.recommendations.length === 0 ? "当前没有匹配到菜谱" : undefined,
            recipePreviewByDishId: toRecipePreviewByDishId(dbCached.recommendations),
          };
          writeCache(key, value);
          await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, value.recommendations);
          return NextResponse.json({
            ...value,
            normalizedOwnedIngredients: ownedIngredients,
            ingredientExtractSource,
            ingredientExtractReason,
            cacheHit: true,
            cacheSource: "database",
          });
        }
      }
    }

    // NOTE: 使用标准化后的食材调用推荐，保证 Cookability 打分准确
    const response = await generateRecommendations(parsed.inputText, ownedIngredients, parsed.thinkingEnabled);

    if (response.transientFailure) {
      return NextResponse.json(
        {
          error: response.noMatchMessage || "推荐服务暂时不可用，请重试",
          retryable: true,
        },
        { status: 502 },
      );
    }

    if (!DISABLE_RECOMMEND_CACHE) {
      writeCache(key, response);
    }

    await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, response.recommendations);

    return NextResponse.json({
      ...response,
      normalizedOwnedIngredients: ownedIngredients,
      ingredientExtractSource,
      ingredientExtractReason,
      cacheHit: false,
      cacheSource: "llm",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
