import { Suspense } from "react";
import { RecommendPageClient } from "@/components/pages/recommend-page-client";

export default function RecommendPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">加载中...</div>}>
      <RecommendPageClient />
    </Suspense>
  );
}
