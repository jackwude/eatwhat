import { NextResponse } from "next/server";
import { createHistoryEntry, findCachedRecommendationByHash } from "@/lib/db/queries";
import { generateRecommendations, type RecommendWithSources } from "@/lib/ai/recommend";
import { recommendRequestSchema } from "@/lib/schemas/recommend.schema";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";
import { getEnv } from "@/lib/utils/env";
import { sha256 } from "@/lib/utils/hash";
import { retrieveHowToCookReferences } from "@/lib/rag/howtocook";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = recommendRequestSchema.parse(body);
    const ownedIngredients = normalizeIngredientList(parsed.ownedIngredients);
    const key = toCacheKey(parsed.inputText, ownedIngredients);
    const requestHash = toRequestHash(parsed.inputText, ownedIngredients);

    const cached = readCache(key);
    if (cached) {
      return NextResponse.json({ ...cached, cacheHit: true, cacheSource: "memory" });
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
      return NextResponse.json({ ...value, cacheHit: true, cacheSource: "database" });
    }

    const response = await generateRecommendations(parsed.inputText, ownedIngredients);
    writeCache(key, response);

    await createHistoryEntry({
      kind: "recommend",
      requestHash,
      inputText: parsed.inputText,
      ownedIngredients,
      recommendations: response.recommendations,
    });

    return NextResponse.json({ ...response, cacheHit: false, cacheSource: "llm" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
