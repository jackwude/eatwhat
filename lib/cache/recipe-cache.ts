import { sha256 } from "@/lib/utils/hash";

type RecipeCacheItem<T> = {
  value: T;
  expiresAt: number;
};

const RECIPE_CACHE_TTL_MS = 1000 * 60 * 10;
const recipeCache = new Map<string, RecipeCacheItem<unknown>>();

function normalizeInput(input: string): string {
  return input.trim().toLowerCase();
}

export function toRecipeCacheHash(
  dishName: string,
  ownedIngredients: string[],
  sourceHintPath?: string,
  sourceHintType?: "howtocook" | "llm",
) {
  const normalizedDish = normalizeInput(dishName);
  const normalizedOwned = ownedIngredients.map(normalizeInput).sort().join("|");
  const hintPath = sourceHintPath ? normalizeInput(sourceHintPath) : "";
  const hintType = sourceHintType || "";
  return sha256(`${normalizedDish}__${normalizedOwned}__${hintPath}__${hintType}`);
}

export function readRecipeCache<T>(hash: string): T | null {
  const cached = recipeCache.get(hash);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    recipeCache.delete(hash);
    return null;
  }
  return cached.value as T;
}

export function writeRecipeCache<T>(hash: string, value: T) {
  recipeCache.set(hash, {
    value,
    expiresAt: Date.now() + RECIPE_CACHE_TTL_MS,
  });
}
