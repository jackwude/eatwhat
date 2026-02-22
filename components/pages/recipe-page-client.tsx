"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/common/error-state";
import { Loading } from "@/components/common/loading";
import { RecipeStepList } from "@/components/recipe/recipe-step-list";
import { ShoppingList } from "@/components/recipe/shopping-list";
import type { RecipeResponse } from "@/lib/schemas/recipe.schema";

type ReferenceSource = {
  title: string;
  path: string;
  score: number;
  excerpt: string;
};

type RecipeApiResponse = RecipeResponse & {
  referenceSources?: ReferenceSource[];
};

const PLACEHOLDER_IMAGE_URL = "/placeholder-dish.svg";

async function fetchRecipe(routeId: string, dishName: string, ownedIngredients: string[]): Promise<RecipeApiResponse> {
  const res = await fetch(`/api/recipe/${routeId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dishName, ownedIngredients }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "菜谱生成失败");
  return data as RecipeApiResponse;
}

export function RecipePageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const dishName = searchParams.get("dishName") || "未命名菜品";
  const owned = (searchParams.get("owned") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const recipeQuery = useQuery({
    queryKey: ["recipe", params.id, dishName, owned.join("|")],
    queryFn: () => fetchRecipe(params.id, dishName, owned),
    enabled: Boolean(dishName && params.id),
    staleTime: 1000 * 60 * 5,
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">{dishName}</h1>
        <Link className="text-sm font-medium text-amber-700 hover:underline" href="/recommend">
          返回推荐
        </Link>
      </div>

      {recipeQuery.isLoading ? <Loading label="正在生成精确菜谱..." /> : null}
      {recipeQuery.isError ? (
        <ErrorState
          title="菜谱生成失败"
          description={(recipeQuery.error as Error).message}
          actionLabel="重试"
          onAction={() => recipeQuery.refetch()}
        />
      ) : null}

      {recipeQuery.data ? (
        <section className="space-y-6">
          <article className="glass-card overflow-hidden rounded-2xl">
            <div className="relative aspect-[4/3] w-full bg-amber-50">
              <Image fill src={PLACEHOLDER_IMAGE_URL} alt={`${dishName} 占位图`} className="object-cover" unoptimized />
            </div>
            <p className="border-t border-amber-100 px-4 py-2 text-xs text-[color:var(--muted)]">测试模式：已关闭 AI 图片生成，使用固定占位图。</p>
          </article>

          <ShoppingList required={recipeQuery.data.requiredIngredients} missing={recipeQuery.data.missingIngredients} />

          <article className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-xl font-semibold">制作步骤</h2>
            <RecipeStepList steps={recipeQuery.data.steps} />
          </article>

          <article className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-xl font-semibold">HowToCook 参考来源</h2>
            {recipeQuery.data.referenceSources?.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {recipeQuery.data.referenceSources.map((ref) => (
                  <li key={`${ref.path}-${ref.title}`}>
                    <span className="font-semibold">{ref.title}</span>
                    <span className="text-[color:var(--muted)]">（{ref.path}）</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[color:var(--muted)]">未命中本地 HowToCook 菜谱，当前结果仅按通用规则生成。</p>
            )}
          </article>

          <article className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-xl font-semibold">时间与提示</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              备菜 {recipeQuery.data.timing.prepMin} 分钟 | 烹饪 {recipeQuery.data.timing.cookMin} 分钟 | 总计 {recipeQuery.data.timing.totalMin} 分钟
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
              {recipeQuery.data.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}
    </main>
  );
}
