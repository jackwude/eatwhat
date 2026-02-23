import type { IngredientExtractReason, IngredientExtractResult } from "@/lib/ai/ingredient-extractor";

type ExtractCacheItem = {
  value: IngredientExtractResult;
  reason: IngredientExtractReason;
  expiresAt: number;
};

const EXTRACT_CACHE_TTL_MS = 1000 * 60 * 30;
const extractCache = new Map<string, ExtractCacheItem>();

function normalizeInputText(inputText: string): string {
  return inputText.trim().toLowerCase().replace(/\s+/g, " ");
}

export function toExtractCacheKey(inputText: string): string {
  return normalizeInputText(inputText);
}

export function readExtractCache(inputText: string): { result: IngredientExtractResult; reason: IngredientExtractReason } | null {
  const key = toExtractCacheKey(inputText);
  const cached = extractCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    extractCache.delete(key);
    return null;
  }
  return {
    result: cached.value,
    reason: cached.reason,
  };
}

export function writeExtractCache(inputText: string, result: IngredientExtractResult, reason: IngredientExtractReason) {
  const key = toExtractCacheKey(inputText);
  extractCache.set(key, {
    value: result,
    reason,
    expiresAt: Date.now() + EXTRACT_CACHE_TTL_MS,
  });
}
