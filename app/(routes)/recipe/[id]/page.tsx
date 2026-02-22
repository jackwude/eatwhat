import { Suspense } from "react";
import { RecipePageClient } from "@/components/pages/recipe-page-client";

export default function RecipeDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">加载中...</div>}>
      <RecipePageClient />
    </Suspense>
  );
}
