import Link from "next/link";
import { RoyalBadge } from "@/components/ui/royal-badge";
import { Card } from "@/components/ui/card";
import type { RecommendResponse } from "@/lib/schemas/recommend.schema";

type Recommendation = RecommendResponse["recommendations"][number];

export function RecommendationCard({ recommendation, href }: { recommendation: Recommendation; href: string }) {
  const difficultyMap = {
    easy: "简",
    medium: "中",
    hard: "难",
  } as const;

  return (
    <Link href={href}>
      <Card className="h-full rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{recommendation.name}</h3>
          <RoyalBadge label={difficultyMap[recommendation.difficulty]} variant={recommendation.difficulty} />
        </div>
        <p
          className={
            recommendation.sourceType === "howtocook"
              ? "mb-2 inline-flex rounded-full border border-[#c9a55a] bg-[#fff3cf] px-2 py-0.5 text-[11px] font-semibold text-[#8c1f17]"
              : "mb-2 inline-flex rounded-full border border-[#94a3b8] bg-[#f8fafc] px-2 py-0.5 text-[11px] font-semibold text-[#334155]"
          }
        >
          {recommendation.sourceType === "howtocook" ? "典籍" : "AI"}
        </p>
        <p className="text-sm leading-6 text-[color:var(--muted)]">{recommendation.reason}</p>
        <p className="mt-3 text-xs font-semibold tracking-[0.08em] text-[color:var(--royal-red)]">预计 {recommendation.estimatedTimeMin} 分钟</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {recommendation.requiredIngredients.slice(0, 4).map((ingredient) => (
            <li key={`${recommendation.id}-${ingredient.name}`}>
              {ingredient.name} · {ingredient.amount}
            </li>
          ))}
        </ul>
      </Card>
    </Link>
  );
}
