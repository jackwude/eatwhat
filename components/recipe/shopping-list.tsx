import type { RecipeResponse } from "@/lib/schemas/recipe.schema";

type Ingredient = RecipeResponse["requiredIngredients"][number];

export function ShoppingList({ required, missing }: { required: Ingredient[]; missing: Ingredient[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <article className="glass-card rounded-2xl p-5">
        <h2 className="text-lg font-semibold">总食材</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {required.map((item) => (
            <li key={`required-${item.name}`}>• {item.name} · {item.amount}</li>
          ))}
        </ul>
      </article>

      <article className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-red-800">缺失采购清单</h2>
        {missing.length ? (
          <ul className="mt-3 space-y-1 text-sm text-red-900">
            {missing.map((item) => (
              <li key={`missing-${item.name}`}>• {item.name} · {item.amount}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-red-900">现有食材已齐全，可直接开做。</p>
        )}
      </article>
    </div>
  );
}
