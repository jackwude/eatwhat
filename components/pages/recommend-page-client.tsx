"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/common/error-state";
import { Loading } from "@/components/common/loading";
import { RecommendationCard } from "@/components/recipe/recommendation-card";
import { RoyalDivider } from "@/components/ui/royal-divider";
import type { RecommendResponse } from "@/lib/schemas/recommend.schema";

type ReferenceSource = {
  title: string;
  path: string;
  score: number;
  excerpt: string;
};

type RecommendApiResponse = RecommendResponse & {
  referenceSources?: ReferenceSource[];
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
    enabled: Boolean(effectiveQ && owned.length),
    staleTime: 1000 * 60 * 5,
  });

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
        <p className="text-sm text-[color:var(--muted)]">已有食材：{owned.join("、") || "未提供"}</p>
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

      {!owned.length ? (
        <section className="glass-card rounded-2xl p-5 text-sm text-[color:var(--muted)]">
          缺少食材参数，无法生成推荐。请返回输入页重新提交食材。
        </section>
      ) : null}

      {query.data ? (
        <>
          {grouped?.easy.length ? (
            <section className="mb-5">
              <h2 className="mb-3 text-lg font-semibold text-[color:var(--royal-red)]">简 · 快手御膳</h2>
              <div className="stagger-list grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.easy.map((dish) => {
                  const params = new URLSearchParams({
                    dishName: dish.name,
                    owned: owned.join(","),
                    q: effectiveQ,
                  });
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
                    owned: owned.join(","),
                    q: effectiveQ,
                  });
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
                    owned: owned.join(","),
                    q: effectiveQ,
                  });
                  return <RecommendationCard key={dish.id} href={`/recipe/${dish.id}?${params.toString()}`} recommendation={dish} />;
                })}
              </div>
            </section>
          ) : null}

          <section className="glass-card mt-6 rounded-2xl p-5">
            <h2 className="text-lg font-semibold">御膳典籍引注</h2>
            <RoyalDivider label="HOWTOCOOK" />
            {query.data.referenceSources?.length ? (
              <ul className="space-y-2 text-sm">
                {query.data.referenceSources.map((ref) => (
                  <li key={`${ref.path}-${ref.title}`} className="rounded-lg border border-[#e3cb9d] bg-[#fff8ea] px-3 py-2">
                    <span className="font-semibold">{ref.title}</span>
                    <span className="text-[color:var(--muted)]">（{ref.path}）</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">未命中本地 HowToCook 菜谱，当前结果仅按通用规则生成。</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
