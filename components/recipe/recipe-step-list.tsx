import { KeypointHighlight } from "@/components/recipe/keypoint-highlight";
import type { RecipeResponse } from "@/lib/schemas/recipe.schema";

type Step = RecipeResponse["steps"][number];

const cjkNumbers = ["壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "拾"];

function toCjkNo(stepNo: number) {
  if (stepNo >= 1 && stepNo <= cjkNumbers.length) {
    return cjkNumbers[stepNo - 1];
  }
  return String(stepNo);
}

export function RecipeStepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="stagger-list mt-4 space-y-4">
      {steps.map((step) => (
        <li key={step.stepNo} className="rounded-xl border border-[#dcc18d] bg-[#fffaef] p-4 shadow-[0_6px_14px_rgba(53,27,7,0.08)]">
          <p className="text-sm font-semibold tracking-[0.16em] text-[color:var(--royal-red)]">{toCjkNo(step.stepNo)} · 御膳步骤</p>
          <p className="mt-1 text-sm leading-6">{step.instruction}</p>
          <KeypointHighlight text={step.keyPoint} />
        </li>
      ))}
    </ol>
  );
}
