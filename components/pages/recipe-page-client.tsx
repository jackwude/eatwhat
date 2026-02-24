"use client";

import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/common/error-state";
import { Loading } from "@/components/common/loading";
import { RecipeStepList } from "@/components/recipe/recipe-step-list";
import { ShoppingList } from "@/components/recipe/shopping-list";
import { RoyalDivider } from "@/components/ui/royal-divider";
import type { RecipeResponse } from "@/lib/schemas/recipe.schema";

type ReferenceSource = {
  title: string;
  path: string;
  score: number;
  excerpt: string;
};

type RecipeApiResponse = RecipeResponse & {
  referenceSources?: ReferenceSource[];
  sourceType?: "howtocook" | "web" | "fallback" | "llm";
  webReferences?: Array<{ title: string; url: string; snippet: string }>;
  cacheSource?: "memory" | "database" | "llm" | "recommend_snapshot" | "llm_fill";
  detailMode?: "full" | "preview_only";
  fillStatus?: "skipped" | "filled" | "failed";
  retryable?: boolean;
};

const PLACEHOLDER_IMAGE_URL = "/placeholder-dish.svg";

function isLocalRuntimeHost(hostname: string): boolean {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (hostname.endsWith(".local")) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
  const m = hostname.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

async function fetchRecipe(
  routeId: string,
  dishName: string,
  inputText: string,
  ownedIngredients: string[],
  sourceHintPath?: string,
  sourceHintType?: "howtocook" | "llm",
  forceFullDetail?: boolean,
): Promise<RecipeApiResponse> {
  const res = await fetch(`/api/recipe/${routeId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dishId: routeId, dishName, inputText, ownedIngredients, sourceHintPath, sourceHintType, forceFullDetail }),
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
  const sourceHintPath = searchParams.get("sourceHintPath") || undefined;
  const sourceHintType = (searchParams.get("sourceHintType") as "howtocook" | "llm" | null) || undefined;
  const [forceFullDetail, setForceFullDetail] = useState(false);
  const recommendBackHref = `/recommend?${new URLSearchParams({
    q: q || `我有${owned.join("、")}`,
    owned: owned.join(","),
  }).toString()}`;

  const recipeQuery = useQuery({
    queryKey: ["recipe", params.id, dishName, q, owned.join("|"), sourceHintPath || "", sourceHintType || "", forceFullDetail ? "force" : "normal"],
    queryFn: () => fetchRecipe(params.id, dishName, q || `我有${owned.join("、")}`, owned, sourceHintPath, sourceHintType, forceFullDetail),
    enabled: Boolean(dishName && params.id),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });

  const imageFeatureOverride = process.env.NEXT_PUBLIC_ENABLE_IMAGE_GEN;
  const imageFeatureEnabled =
    imageFeatureOverride === "true"
      ? true
      : imageFeatureOverride === "false"
        ? false
        : typeof window !== "undefined"
          ? !isLocalRuntimeHost(window.location.hostname)
          : false;

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
    enabled: Boolean(recipeQuery.data && dishName && imageFeatureEnabled),
    retry: 0,
    staleTime: 1000 * 60 * 60,
  });

  const imageUrl = imageQuery.data || PLACEHOLDER_IMAGE_URL;
  const sourceTypeLabel = {
    howtocook: "HowToCook 典籍优先",
    web: "联网检索补全",
    fallback: "降级通用菜谱",
    llm: "模型生成",
  } as const;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 sm:px-6">
      <section className="glass-card mb-6 rounded-3xl px-5 py-5 sm:px-8">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold sm:text-3xl">{dishName}</h1>
          <Link className="royal-link text-sm font-medium" href={recommendBackHref}>
            返回推荐
          </Link>
        </div>
      </section>

      {recipeQuery.isLoading ? <Loading label="正在生成精确菜谱..." showProgress /> : null}
      {recipeQuery.isError ? (
        <ErrorState
          title="菜谱生成失败"
          description={(recipeQuery.error as Error).message}
          actionLabel={sourceHintType === "llm" ? "重试获取完整详情" : "重试"}
          onAction={() => {
            if (sourceHintType === "llm") {
              setForceFullDetail(true);
            }
            recipeQuery.refetch();
          }}
        />
      ) : null}

      {recipeQuery.data ? (
        <section className="space-y-6">
          <article className="glass-card overflow-hidden rounded-2xl">
            <div className="relative h-44 w-full border-b border-[#d8bd85] bg-[#f8e6c7] p-2 sm:h-56">
              <div className="relative h-full w-full overflow-hidden rounded-xl border border-[#caa35f] bg-[#f4e2bf]">
                <Image fill src={imageUrl} alt={`${dishName} 预览图`} className="object-cover" unoptimized />
                {imageQuery.isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-full bg-[#2e1d10]/85 px-3 py-1 text-xs font-medium text-[#f5d483]">
                      <Loader2 className="royal-image-loading-icon h-4 w-4" />
                      正在生成御膳图
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>

          <article className="glass-card rounded-2xl px-4 py-3 text-xs text-[color:var(--muted)] sm:text-sm">
            御膳时序：备菜 {recipeQuery.data.timing.prepMin} 分钟 | 烹饪 {recipeQuery.data.timing.cookMin} 分钟 | 总计 {recipeQuery.data.timing.totalMin} 分钟
            {recipeQuery.data.tips.length ? ` | 宫廷提示：${recipeQuery.data.tips[0]}` : ""}
            {recipeQuery.data.sourceType ? ` | 来源模式：${sourceTypeLabel[recipeQuery.data.sourceType]}` : ""}
          </article>

          <ShoppingList required={recipeQuery.data.requiredIngredients} missing={recipeQuery.data.missingIngredients} />

          <article className="glass-card rounded-2xl p-5 sm:p-6">
            <RoyalDivider label="御膳工序" labelClassName="text-base sm:text-lg tracking-[0.08em]" />
            {recipeQuery.data.detailMode === "preview_only" || !recipeQuery.data.steps.length ? (
              <div className="mt-4 rounded-xl border border-[#dcc18d] bg-[#fff8ea] p-4 text-sm text-[color:var(--muted)]">
                暂无完整工序，当前已展示推荐概要。可点击“重试获取完整详情”尝试补全。
              </div>
            ) : (
              <RecipeStepList steps={recipeQuery.data.steps} />
            )}
            {sourceHintType === "llm" && (recipeQuery.data.detailMode === "preview_only" || !recipeQuery.data.steps.length) ? (
              <button
                type="button"
                className="royal-link mt-3 text-sm font-semibold"
                onClick={() => {
                  setForceFullDetail(true);
                  recipeQuery.refetch();
                }}
              >
                重试获取完整详情
              </button>
            ) : null}
            {recipeQuery.data.sourceType ? (
              <p className="mt-4 text-xs text-[color:var(--muted)]">来源：{sourceTypeLabel[recipeQuery.data.sourceType]}</p>
            ) : null}
          </article>

          <article className="glass-card rounded-2xl p-5 sm:p-6">
            <h2 className="text-xl font-semibold">HowToCook 典籍引注</h2>
            <RoyalDivider label="SOURCE" />
            {recipeQuery.data.referenceSources?.length ? (
              <ul className="space-y-2 text-sm">
                {recipeQuery.data.referenceSources.map((ref) => (
                  <li key={`${ref.path}-${ref.title}`} className="rounded-lg border border-[#e3cb9d] bg-[#fff8ea] px-3 py-2">
                    <span className="font-semibold">{ref.title}</span>
                    <span className="text-[color:var(--muted)]">（{ref.path}）</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">未命中本地 HowToCook 菜谱，当前结果仅按通用规则生成。</p>
            )}

            {recipeQuery.data.webReferences?.length ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-[color:var(--royal-red)]">联网检索来源</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {recipeQuery.data.webReferences.map((ref, idx) => (
                    <li key={`${ref.url}-${idx}`} className="rounded-lg border border-[#e3cb9d] bg-[#fff8ea] px-3 py-2">
                      <p className="font-semibold">{ref.title}</p>
                      <p className="text-xs text-[color:var(--muted)]">{ref.url}</p>
                      <p className="mt-1 text-xs text-[color:var(--muted)]">{ref.snippet}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        </section>
      ) : null}
    </main>
  );
}
