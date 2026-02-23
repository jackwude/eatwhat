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
  sourceType: z.enum(["howtocook", "llm"]).optional(),
  sourcePath: z.string().min(1).optional(),
  sourceTitle: z.string().min(1).optional(),
});

export const recommendResponseSchema = z.object({
  recommendations: z.array(recommendationSchema).min(1).max(9),
});

export const recommendRequestSchema = z.object({
  inputText: z.string().min(1),
  ownedIngredients: z.array(z.string().min(1)).default([]),
});

export type RecommendResponse = z.infer<typeof recommendResponseSchema>;
export type IngredientExtractSource = "llm" | "fallback_rule";
export type IngredientExtractReason = "llm_success" | "breaker_open" | "llm_failed_fallback";
