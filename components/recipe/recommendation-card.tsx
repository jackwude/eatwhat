import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RecommendResponse } from "@/lib/schemas/recommend.schema";

type Recommendation = RecommendResponse["recommendations"][number];

export function RecommendationCard({ recommendation, href }: { recommendation: Recommendation; href: string }) {
  const difficultyMap = {
    easy: "简单",
    medium: "中等",
    hard: "进阶",
  } as const;

  return (
    <Link href={href}>
      <Card className="h-full transition hover:-translate-y-1 hover:shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{recommendation.name}</h3>
          <Badge label={difficultyMap[recommendation.difficulty]} variant={recommendation.difficulty} />
        </div>
        <p className="text-sm leading-6 text-[color:var(--muted)]">{recommendation.reason}</p>
        <p className="mt-3 text-xs font-medium text-amber-700">预计 {recommendation.estimatedTimeMin} 分钟</p>
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
