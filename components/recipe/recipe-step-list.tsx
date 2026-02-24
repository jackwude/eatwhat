import { KeypointHighlight } from "@/components/recipe/keypoint-highlight";
import type { RecipeResponse } from "@/lib/schemas/recipe.schema";

type Step = RecipeResponse["steps"][number];

function formatStepNo(stepNo: number) {
  const safeNo = Number.isFinite(stepNo) && stepNo > 0 ? Math.floor(stepNo) : 0;
  return String(safeNo).padStart(2, "0");
}

export function RecipeStepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="stagger-list mt-4 space-y-4">
      {steps.map((step) => (
        <li key={step.stepNo} className="rounded-xl border border-[#dcc18d] bg-[#fffaef] p-4 shadow-[0_6px_14px_rgba(53,27,7,0.08)]">
          <p className="flex items-center gap-3 text-sm font-semibold tracking-[0.12em] text-[color:var(--royal-red)]">
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[#b78a3d] bg-[#efe3c1] px-2 font-mono text-base font-bold leading-none text-[#7e1e16] shadow-[inset_0_-1px_0_rgba(126,30,22,0.25)]">
              {formatStepNo(step.stepNo)}
            </span>
            <span>御膳步骤</span>
          </p>
          <p className="mt-1 text-sm leading-6">{step.instruction}</p>
          {step.keyPoint?.trim() ? <KeypointHighlight text={step.keyPoint} /> : null}
        </li>
      ))}
    </ol>
  );
}
