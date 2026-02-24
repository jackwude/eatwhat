import { NextResponse } from "next/server";
import { createHistoryEntry, findCachedRecommendationByHash, findLatestOwnedIngredientsByInputText } from "@/lib/db/queries";
import { generateRecommendations, type RecommendWithSources } from "@/lib/ai/recommend";
import { recommendRequestSchema } from "@/lib/schemas/recommend.schema";
import { getEnv } from "@/lib/utils/env";
import { sha256 } from "@/lib/utils/hash";
import type { HowToCookReference } from "@/lib/rag/howtocook";
import { extractOwnedIngredientsWithReason, type IngredientExtractReason, type IngredientExtractResult } from "@/lib/ai/ingredient-extractor";
import { readExtractCache, writeExtractCache } from "@/lib/cache/extract-cache";

export const runtime = "nodejs";

type CacheItem = {
  value: RecommendWithSources;
  expiresAt: number;
};

const recommendCache = new Map<string, CacheItem>();

function normalizeInput(inputText: string, ownedIngredients: string[]) {
  const normalizedInput = inputText.trim().toLowerCase();
  const normalizedOwned = [...ownedIngredients].map((i) => i.toLowerCase()).sort();
  return { normalizedInput, normalizedOwned };
}

function toCacheKey(inputText: string, ownedIngredients: string[]) {
  const { normalizedInput, normalizedOwned } = normalizeInput(inputText, ownedIngredients);
  return `${normalizedInput}__${normalizedOwned.join("|")}`;
}

function toRequestHash(inputText: string, ownedIngredients: string[]) {
  const { normalizedInput, normalizedOwned } = normalizeInput(inputText, ownedIngredients);
  return sha256(`${normalizedInput}__${normalizedOwned.join("|")}`);
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
    let extracted: IngredientExtractResult;
    let ingredientExtractReason: IngredientExtractReason;

    const extractMemory = readExtractCache(parsed.inputText);
    if (extractMemory) {
      extracted = extractMemory.result;
      ingredientExtractReason = extractMemory.reason;
    } else {
      const dbOwnedIngredients = await findLatestOwnedIngredientsByInputText(parsed.inputText);
      if (dbOwnedIngredients?.length) {
        extracted = {
          ingredients: dbOwnedIngredients,
          source: "fallback_rule",
          rawCandidates: dbOwnedIngredients,
        };
        ingredientExtractReason = "cache_reuse";
      } else {
        const extractResult = await extractOwnedIngredientsWithReason(parsed.inputText, parsed.ownedIngredients);
        extracted = extractResult.result;
        ingredientExtractReason = extractResult.reason;
      }
      writeExtractCache(parsed.inputText, extracted, ingredientExtractReason);
    }

    const ownedIngredients = extracted.ingredients;
    if (!ownedIngredients.length) {
      return NextResponse.json({ error: "未识别到可用食材，请补充更明确的食材名" }, { status: 400 });
    }
    const key = toCacheKey(parsed.inputText, ownedIngredients);
    const requestHash = toRequestHash(parsed.inputText, ownedIngredients);

    const cached = readCache(key);
    if (cached) {
      if (!cached.recommendations.length) {
        recommendCache.delete(key);
      } else {
      await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, cached.recommendations);
      return NextResponse.json({
        ...cached,
        normalizedOwnedIngredients: ownedIngredients,
        ingredientExtractSource: extracted.source,
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
        ingredientExtractSource: extracted.source,
        ingredientExtractReason,
        cacheHit: true,
        cacheSource: "database",
      });
      }
    }

    const response = await generateRecommendations(parsed.inputText, ownedIngredients);
    if (response.transientFailure) {
      return NextResponse.json(
        {
          error: response.noMatchMessage || "推荐服务暂时不可用，请重试",
          retryable: true,
        },
        { status: 502 },
      );
    }

    writeCache(key, response);

    await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, response.recommendations);

    return NextResponse.json({
      ...response,
      normalizedOwnedIngredients: ownedIngredients,
      ingredientExtractSource: extracted.source,
      ingredientExtractReason,
      cacheHit: false,
      cacheSource: "llm",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
