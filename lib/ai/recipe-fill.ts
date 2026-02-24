import { z } from "zod";
import { callJsonModel } from "@/lib/ai/client";
import { buildRecipeFillPrompt, SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_RECIPE_FILL } from "@/lib/ai/prompts";
import { normalizeIngredientList } from "@/lib/parser/ingredient-normalizer";

const fillTemplate = `{
  "steps": [
    { "stepNo": 1, "instruction": "步骤描述", "keyPoint": "关键点（可选）" }
  ],
  "tips": ["技巧1"],
  "timing": { "prepMin": 8, "cookMin": 10, "totalMin": 18 }
}`;

const fillSchema = z.object({
  steps: z
    .array(
      z.object({
        stepNo: z.number().int().positive(),
        instruction: z.string().min(1),
        keyPoint: z.string().min(1).optional(),
      }),
    )
    .min(1),
  tips: z.array(z.string().min(1)).min(1),
  timing: z.object({
    prepMin: z.number().int().nonnegative(),
    cookMin: z.number().int().nonnegative(),
    totalMin: z.number().int().positive(),
  }),
});

function filterInstructionByIngredients(text: string, allowedIngredients: string[]): boolean {
  const normalizedText = normalizeIngredientList([text])[0] || text;
  if (!allowedIngredients.length) return true;
  // 松校验：只过滤明显无关水果等离谱食材，避免过度拦截正常步骤。
  const suspicious = ["蓝莓", "草莓", "榴莲", "芒果", "香蕉"];
  return !suspicious.some((item) => normalizedText.includes(item) && !allowedIngredients.includes(item));
}

export async function fillRecipeStepsFromPreview(args: {
  dishName: string;
  requiredIngredients: Array<{ name: string; amount: string }>;
  ownedIngredients: string[];
  reason?: string;
  estimatedTimeMin?: number;
}) {
  const allowedIngredients = normalizeIngredientList(args.requiredIngredients.map((item) => item.name));

  const raw = await callJsonModel<unknown>({
    system: `${SYSTEM_PROMPT_BASE}\n${SYSTEM_PROMPT_RECIPE_FILL}`,
    user: buildRecipeFillPrompt(args),
    responseTemplate: fillTemplate,
    retries: 0,
    model: "deepseek-v3-2-251201",
  });

  const parsed = fillSchema.parse(raw);
  const steps = parsed.steps
    .map((step, idx) => ({
      stepNo: idx + 1,
      instruction: step.instruction.trim(),
      ...(step.keyPoint?.trim() ? { keyPoint: step.keyPoint.trim() } : {}),
      sourceTag: "llm" as const,
    }))
    .filter((step) => step.instruction && filterInstructionByIngredients(step.instruction, allowedIngredients));

  if (!steps.length) {
    throw new Error("fill_empty_steps");
  }

  return {
    steps,
    tips: parsed.tips.map((tip) => tip.trim()).filter(Boolean),
    timing: parsed.timing,
  };
}
