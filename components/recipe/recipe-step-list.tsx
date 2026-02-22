import { KeypointHighlight } from "@/components/recipe/keypoint-highlight";
import type { RecipeResponse } from "@/lib/schemas/recipe.schema";

type Step = RecipeResponse["steps"][number];

export function RecipeStepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-4 space-y-4">
      {steps.map((step) => (
        <li key={step.stepNo} className="rounded-xl border border-amber-100 bg-white p-4">
          <p className="text-sm font-semibold text-amber-700">步骤 {step.stepNo}</p>
          <p className="mt-1 text-sm leading-6">{step.instruction}</p>
          <KeypointHighlight text={step.keyPoint} />
        </li>
      ))}
    </ol>
  );
}
