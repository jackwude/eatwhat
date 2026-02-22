import { normalizeIngredientName } from "@/lib/parser/ingredient-normalizer";

export type IngredientItem = {
  name: string;
  amount: string;
};

export function computeMissingIngredients(required: IngredientItem[], owned: string[]): IngredientItem[] {
  const ownedSet = new Set(owned.map((item) => normalizeIngredientName(item)));

  return required.filter((ingredient) => !ownedSet.has(normalizeIngredientName(ingredient.name)));
}
