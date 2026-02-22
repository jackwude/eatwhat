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
  const q = searchParams.get("q") || "";
  const owned = (searchParams.get("owned") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const recommendBackHref = `/recommend?${new URLSearchParams({
    q: q || `我有${owned.join("、")}`,
    owned: owned.join(","),
  }).toString()}`;

  const recipeQuery = useQuery({
    queryKey: ["recipe", params.id, dishName, owned.join("|")],
    queryFn: () => fetchRecipe(params.id, dishName, owned),
    enabled: Boolean(dishName && params.id),
    staleTime: 1000 * 60 * 5,
  });

  const imageQuery = useQuery({
    queryKey: ["dish-image", dishName],
    queryFn: async () => {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishName,
          style: "中式家常菜高清美食摄影",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "图片生成失败");
      }
      return data.imageUrl as string;
    },
    enabled: Boolean(recipeQuery.data && dishName),
    retry: 0,
    staleTime: 1000 * 60 * 60,
  });

  const imageUrl = imageQuery.data || PLACEHOLDER_IMAGE_URL;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">{dishName}</h1>
        <Link className="text-sm font-medium text-amber-700 hover:underline" href={recommendBackHref}>
          返回推荐
        </Link>
      </div>

      {recipeQuery.isLoading ? <Loading label="正在生成精确菜谱..." showProgress /> : null}
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
            <div className="relative h-44 w-full bg-amber-50 sm:h-56">
              <Image fill src={imageUrl} alt={`${dishName} 预览图`} className="object-cover" unoptimized />
            </div>
            <p className="border-t border-amber-100 px-4 py-2 text-xs text-[color:var(--muted)]">
              {imageQuery.isLoading ? "正在生成菜品预览图..." : imageQuery.isError ? "预览图生成失败，已使用占位图。" : "AI 生成菜品预览图"}
            </p>
          </article>

          <article className="glass-card rounded-2xl px-4 py-3 text-xs text-[color:var(--muted)] sm:text-sm">
            备菜 {recipeQuery.data.timing.prepMin} 分钟 | 烹饪 {recipeQuery.data.timing.cookMin} 分钟 | 总计 {recipeQuery.data.timing.totalMin} 分钟
            {recipeQuery.data.tips.length ? ` | 提示：${recipeQuery.data.tips[0]}` : ""}
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
        </section>
      ) : null}
    </main>
  );
}
