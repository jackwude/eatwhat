import { z } from "zod";

export const ingredientItemSchema = z.object({
  name: z.string().min(1),
  amount: z.string().min(1),
});

export const recommendationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  reason: z.string().min(1),
  requiredIngredients: z.array(ingredientItemSchema).min(1),
  estimatedTimeMin: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  sourceType: z.enum(["howtocook", "llm", "web", "fallback"]).optional(),
  sourcePath: z.string().min(1).optional(),
  sourceTitle: z.string().min(1).optional(),
  recipePreview: z
    .object({
      servings: z.string().min(1).optional(),
      requiredIngredients: z.array(ingredientItemSchema).min(1).optional(),
      steps: z
        .array(
          z.object({
            stepNo: z.number().int().positive(),
            instruction: z.string().min(1),
            keyPoint: z.string().min(1).optional(),
          }),
        )
        .optional(),
      tips: z.array(z.string().min(1)).optional(),
      timing: z
        .object({
          prepMin: z.number().int().nonnegative(),
          cookMin: z.number().int().nonnegative(),
          totalMin: z.number().int().positive(),
        })
        .optional(),
      sourceType: z.enum(["howtocook", "llm", "web", "fallback"]).optional(),
      sourcePath: z.string().min(1).optional(),
      sourceTitle: z.string().min(1).optional(),
    })
    .optional(),
});

export const recommendResponseSchema = z.object({
  recommendations: z.array(recommendationSchema).min(0).max(9),
  noMatch: z.boolean().optional(),
  noMatchMessage: z.string().min(1).optional(),
  recipePreviewByDishId: z.record(z.string(), recommendationSchema.shape.recipePreview).optional(),
});

export const recommendRequestSchema = z.object({
  inputText: z.string().min(1),
  ownedIngredients: z.array(z.string().min(1)).default([]),
});

export type RecommendResponse = z.infer<typeof recommendResponseSchema>;
export type IngredientExtractSource = "llm" | "fallback_rule";
export type IngredientExtractReason = "llm_success" | "breaker_open" | "llm_failed_fallback" | "cache_reuse";
