"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IngredientInput } from "@/components/input/ingredient-input";
import { Button } from "@/components/ui/button";
import { RoyalDivider } from "@/components/ui/royal-divider";
import { formatBeijingTime } from "@/lib/utils/time";

type HistoryItem = {
  id: string;
  inputText: string;
  ownedIngredients: unknown;
  createdAt: string;
};

function parseIngredients(input: string): string[] {
  return input
    .split(/[，,、\n\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toOwnedIngredients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

async function fetchRecommendHistory(): Promise<HistoryItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const res = await fetch("/api/history?kind=recommend&limit=10", {
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "历史记录读取失败");
  return data.history as HistoryItem[];
}

export default function HomePage() {
  const router = useRouter();
  const [inputText, setInputText] = useState("");

  const historyQuery = useQuery({
    queryKey: ["home", "recommend-history"],
    queryFn: fetchRecommendHistory,
    staleTime: 1000 * 30,
    retry: 0,
  });

  const ownedIngredients = useMemo(() => parseIngredients(inputText), [inputText]);

  function goToRecommend(input: string, owned: string[]) {
    const params = new URLSearchParams({
      q: input,
      owned: owned.join(","),
    });
    router.push(`/recommend?${params.toString()}`);
  }

  function handleSubmit() {
    if (!inputText.trim()) return;
    goToRecommend(inputText, ownedIngredients);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="glass-card animate-[rise-in_0.28s_ease_both] rounded-3xl p-6 sm:p-8">
        <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-[color:var(--royal-red)]">AI 御膳房</p>
        <div className="royal-title-plaque rounded-2xl px-4 py-5 sm:px-6">
          <h1 className="text-3xl font-black sm:text-4xl">AI 御膳房</h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--muted)] sm:text-base">
            您来啦！不知道吃啥？看看手头有啥、准备超市买啥，系统会自动生成 3 个推荐菜品
          </p>
        </div>

        <RoyalDivider label="御膳推演" />

        <div className="space-y-3">
          <IngredientInput value={inputText} onChange={setInputText} />
          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={!ownedIngredients.length}>
              智能推荐
            </Button>
          </div>
        </div>

        <div className="mt-6 text-sm text-[color:var(--muted)]">
          <p>识别到食材：{ownedIngredients.length ? ownedIngredients.join("、") : "尚未输入"}</p>
        </div>
      </section>

      <section className="glass-card rounded-3xl p-6 sm:p-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">历史推荐记录</h2>
          <Button
            type="button"
            className="relative z-10 h-9 px-3 text-xs"
            onClick={() => historyQuery.refetch()}
            disabled={historyQuery.isFetching}
          >
            {historyQuery.isFetching ? "刷新中..." : "刷新"}
          </Button>
        </div>

        {historyQuery.isLoading ? <p className="text-sm text-[color:var(--muted)]">正在读取历史记录...</p> : null}
        {historyQuery.isError ? <p className="text-sm text-red-700">{(historyQuery.error as Error).message}</p> : null}

        {historyQuery.data?.length ? (
          <ul className="stagger-list space-y-3">
            {historyQuery.data.map((item) => {
              const owned = toOwnedIngredients(item.ownedIngredients);
              return (
                <li key={item.id} className="rounded-2xl border border-[#e2c996] bg-[#fffaef] px-4 py-3 shadow-[0_8px_16px_rgba(53,27,7,0.08)]">
                  <p className="text-xs text-[color:var(--muted)]">
                    <span className="royal-scroll-time">{formatBeijingTime(item.createdAt)} (北京时间)</span>
                  </p>
                  <p className="mt-2 text-sm font-medium">{item.inputText}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">食材：{owned.join("、") || "未记录"}</p>
                  <button
                    type="button"
                    className="royal-link mt-2 text-sm font-semibold"
                    onClick={() => goToRecommend(item.inputText, owned)}
                  >
                    查看这次推荐
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!historyQuery.isLoading && !historyQuery.data?.length ? (
          <p className="text-sm text-[color:var(--muted)]">还没有历史推荐记录，先生成一次试试。</p>
        ) : null}
      </section>
    </main>
  );
}
