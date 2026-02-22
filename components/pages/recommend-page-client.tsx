"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/common/error-state";
import { Loading } from "@/components/common/loading";
import { RecommendationCard } from "@/components/recipe/recommendation-card";
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

  const query = useQuery({
    queryKey: ["recommend", q, owned.join("|")],
    queryFn: () => fetchRecommendations(q, owned),
    enabled: Boolean(q && owned.length),
    staleTime: 1000 * 60 * 5,
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">推荐菜品</h1>
        <Link className="text-sm font-medium text-amber-700 hover:underline" href="/">
          返回输入
        </Link>
      </div>

      <p className="mb-6 text-sm text-[color:var(--muted)]">已有食材：{owned.join("、") || "未提供"}</p>

      {query.isLoading ? <Loading label="正在分析食材并生成推荐..." /> : null}

      {query.isError ? (
        <ErrorState
          title="推荐失败"
          description={(query.error as Error).message}
          actionLabel="重试"
          onAction={() => query.refetch()}
        />
      ) : null}

      {query.data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.recommendations.map((dish) => {
              const params = new URLSearchParams({
                dishName: dish.name,
                owned: owned.join(","),
              });

              return <RecommendationCard key={dish.id} href={`/recipe/${dish.id}?${params.toString()}`} recommendation={dish} />;
            })}
          </section>

          <section className="glass-card mt-6 rounded-2xl p-5">
            <h2 className="text-lg font-semibold">HowToCook 参考来源</h2>
            {query.data.referenceSources?.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {query.data.referenceSources.map((ref) => (
                  <li key={`${ref.path}-${ref.title}`}>
                    <span className="font-semibold">{ref.title}</span>
                    <span className="text-[color:var(--muted)]">（{ref.path}）</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[color:var(--muted)]">未命中本地 HowToCook 菜谱，当前结果仅按通用规则生成。</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
