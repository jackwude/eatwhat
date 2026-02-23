import { NextResponse } from "next/server";
import { createHistoryEntry, findCachedRecommendationByHash } from "@/lib/db/queries";
import { generateRecommendations, type RecommendWithSources } from "@/lib/ai/recommend";
import { recommendRequestSchema } from "@/lib/schemas/recommend.schema";
import { getEnv } from "@/lib/utils/env";
import { sha256 } from "@/lib/utils/hash";
import { retrieveHowToCookReferences } from "@/lib/rag/howtocook";
import { extractOwnedIngredients } from "@/lib/ai/ingredient-extractor";

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
    const extracted = await extractOwnedIngredients(parsed.inputText, parsed.ownedIngredients);
    const ownedIngredients = extracted.ingredients;
    if (!ownedIngredients.length) {
      return NextResponse.json({ error: "未识别到可用食材，请补充更明确的食材名" }, { status: 400 });
    }
    const key = toCacheKey(parsed.inputText, ownedIngredients);
    const requestHash = toRequestHash(parsed.inputText, ownedIngredients);

    const cached = readCache(key);
    if (cached) {
      await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, cached.recommendations);
      return NextResponse.json({
        ...cached,
        normalizedOwnedIngredients: ownedIngredients,
        ingredientExtractSource: extracted.source,
        cacheHit: true,
        cacheSource: "memory",
      });
    }

    const dbCached = await findCachedRecommendationByHash(requestHash);
    if (dbCached && isRecommendationArray(dbCached.recommendations)) {
      const dbInputText = dbCached.inputText || parsed.inputText;
      const dbOwnedIngredients = Array.isArray(dbCached.ownedIngredients)
        ? dbCached.ownedIngredients.map((item) => String(item)).filter(Boolean)
        : ownedIngredients;
      const referenceSources = await retrieveHowToCookReferences({
        inputText: dbInputText,
        ownedIngredients: dbOwnedIngredients,
        limit: 3,
      });
      const value: RecommendWithSources = {
        recommendations: dbCached.recommendations,
        referenceSources,
      };
      writeCache(key, value);
      await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, value.recommendations);
      return NextResponse.json({
        ...value,
        normalizedOwnedIngredients: ownedIngredients,
        ingredientExtractSource: extracted.source,
        cacheHit: true,
        cacheSource: "database",
      });
    }

    const response = await generateRecommendations(parsed.inputText, ownedIngredients);
    writeCache(key, response);

    await persistRecommendHistory(parsed.inputText, ownedIngredients, requestHash, response.recommendations);

    return NextResponse.json({
      ...response,
      normalizedOwnedIngredients: ownedIngredients,
      ingredientExtractSource: extracted.source,
      cacheHit: false,
      cacheSource: "llm",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
