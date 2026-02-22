"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorState } from "@/components/common/error-state";
import { Loading } from "@/components/common/loading";
import { formatBeijingTime } from "@/lib/utils/time";

type HistoryEntry = {
  id: string;
  inputText: string;
  dishName: string | null;
  createdAt: string;
};

async function fetchHistory(): Promise<HistoryEntry[]> {
  const res = await fetch("/api/history?limit=20");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "历史记录读取失败");
  return data.history as HistoryEntry[];
}

export default function HistoryPage() {
  const query = useQuery({
    queryKey: ["history", 20],
    queryFn: fetchHistory,
    staleTime: 1000 * 30,
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">历史记录</h1>
        <Link href="/" className="text-sm font-medium text-amber-700 hover:underline">
          返回首页
        </Link>
      </div>

      {query.isLoading ? <Loading label="正在读取历史记录..." /> : null}
      {query.isError ? (
        <ErrorState
          title="读取失败"
          description={(query.error as Error).message}
          actionLabel="重试"
          onAction={() => query.refetch()}
        />
      ) : null}

      {query.data ? (
        <ul className="space-y-3">
          {query.data.map((item) => (
            <li key={item.id} className="glass-card rounded-xl p-4">
              <p className="text-xs text-[color:var(--muted)]">{formatBeijingTime(item.createdAt)} (北京时间)</p>
              <p className="mt-1 font-medium">{item.dishName || item.inputText}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
