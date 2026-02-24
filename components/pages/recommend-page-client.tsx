"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/common/error-state";
import { Loading } from "@/components/common/loading";
import { RecommendationCard } from "@/components/recipe/recommendation-card";
import type { IngredientExtractReason, IngredientExtractSource, RecommendResponse } from "@/lib/schemas/recommend.schema";

type RecommendApiResponse = RecommendResponse & {
  normalizedOwnedIngredients?: string[];
  ingredientExtractSource?: IngredientExtractSource;
  ingredientExtractReason?: IngredientExtractReason;
  noMatch?: boolean;
  noMatchMessage?: string;
};

async function fetchRecommendations(inputText: string, ownedIngredients: string[]): Promise<RecommendApiResponse> {
  const res = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputText, ownedIngredients }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "推荐生成失败");
  }

  return data as RecommendApiResponse;
}

export function RecommendPageClient() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const owned = (searchParams.get("owned") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const effectiveQ = q || `我有${owned.join("、")}`;

  const query = useQuery({
    queryKey: ["recommend", effectiveQ, owned.join("|")],
    queryFn: () => fetchRecommendations(effectiveQ, owned),
    enabled: Boolean(effectiveQ),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });

  const effectiveOwned = query.data?.normalizedOwnedIngredients?.length ? query.data.normalizedOwnedIngredients : owned;

  const grouped = query.data
    ? {
        easy: query.data.recommendations.filter((item) => item.difficulty === "easy").slice(0, 3),
        medium: query.data.recommendations.filter((item) => item.difficulty === "medium").slice(0, 3),
        hard: query.data.recommendations.filter((item) => item.difficulty === "hard").slice(0, 3),
      }
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6">
      <section className="glass-card mb-6 rounded-3xl px-5 py-5 sm:px-8">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold sm:text-3xl">御膳推荐</h1>
          <Link className="royal-link text-sm font-medium" href="/">
            返回输入
          </Link>
        </div>
        <p className="text-sm text-[color:var(--muted)]">已有食材：{effectiveOwned.join("、") || "未识别"}</p>
        {query.data?.ingredientExtractSource ? (
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            识别来源：{query.data.ingredientExtractSource === "llm" ? "DeepSeek 语义抽取" : "规则兜底抽取"}
          </p>
        ) : null}
      </section>

      {query.isLoading ? <Loading label="正在分析食材并生成推荐..." showProgress /> : null}

      {query.isError ? (
        <ErrorState
          title="推荐失败"
          description={(query.error as Error).message}
          actionLabel="重试"
          onAction={() => query.refetch()}
        />
      ) : null}

      {!effectiveQ ? (
        <section className="glass-card rounded-2xl p-5 text-sm text-[color:var(--muted)]">
          缺少输入参数，无法生成推荐。请返回输入页重新提交。
        </section>
      ) : null}

      {query.data ? (
        <>
          {(query.data.noMatch || !query.data.recommendations.length) && !query.isError ? (
            <section className="glass-card mb-5 rounded-2xl p-5 text-sm text-[color:var(--muted)]">
              {query.data.noMatchMessage || "当前没有匹配到菜谱"}
            </section>
          ) : null}

          {grouped?.easy.length ? (
            <section className="mb-5">
              <h2 className="mb-3 text-lg font-semibold text-[color:var(--royal-red)]">简 · 快手御膳</h2>
              <div className="stagger-list grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.easy.map((dish) => {
                  const params = new URLSearchParams({
                    dishName: dish.name,
                    owned: effectiveOwned.join(","),
                    q: effectiveQ,
                    sourceHintType: dish.sourceType || "llm",
                  });
                  if (dish.sourcePath) {
                    params.set("sourceHintPath", dish.sourcePath);
                  }
                  return <RecommendationCard key={dish.id} href={`/recipe/${dish.id}?${params.toString()}`} recommendation={dish} />;
                })}
              </div>
            </section>
          ) : null}

          {grouped?.medium.length ? (
            <section className="mb-5">
              <h2 className="mb-3 text-lg font-semibold text-[color:var(--royal-red)]">中 · 家常御膳</h2>
              <div className="stagger-list grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.medium.map((dish) => {
                  const params = new URLSearchParams({
                    dishName: dish.name,
                    owned: effectiveOwned.join(","),
                    q: effectiveQ,
                    sourceHintType: dish.sourceType || "llm",
                  });
                  if (dish.sourcePath) {
                    params.set("sourceHintPath", dish.sourcePath);
                  }
                  return <RecommendationCard key={dish.id} href={`/recipe/${dish.id}?${params.toString()}`} recommendation={dish} />;
                })}
              </div>
            </section>
          ) : null}

          {grouped?.hard.length ? (
            <section className="mb-5">
              <h2 className="mb-3 text-lg font-semibold text-[color:var(--royal-red)]">难 · 进阶御膳</h2>
              <div className="stagger-list grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.hard.map((dish) => {
                  const params = new URLSearchParams({
                    dishName: dish.name,
                    owned: effectiveOwned.join(","),
                    q: effectiveQ,
                    sourceHintType: dish.sourceType || "llm",
                  });
                  if (dish.sourcePath) {
                    params.set("sourceHintPath", dish.sourcePath);
                  }
                  return <RecommendationCard key={dish.id} href={`/recipe/${dish.id}?${params.toString()}`} recommendation={dish} />;
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
