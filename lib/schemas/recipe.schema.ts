import { z } from "zod";
import { ingredientItemSchema } from "@/lib/schemas/recommend.schema";

export const recipeStepSchema = z.object({
  stepNo: z.number().int().positive(),
  instruction: z.string().min(1),
  keyPoint: z.string().min(1),
});

export const recipeResponseSchema = z.object({
  dishName: z.string().min(1),
  servings: z.string().min(1),
  requiredIngredients: z.array(ingredientItemSchema).min(1),
  missingIngredients: z.array(ingredientItemSchema),
  steps: z.array(recipeStepSchema).min(1).max(8),
  tips: z.array(z.string().min(1)).min(1),
  timing: z.object({
    prepMin: z.number().int().nonnegative(),
    cookMin: z.number().int().nonnegative(),
    totalMin: z.number().int().positive(),
  }),
});

export const recipeRequestSchema = z.object({
  dishName: z.string().min(1),
  ownedIngredients: z.array(z.string().min(1)).min(1),
});

export type RecipeResponse = z.infer<typeof recipeResponseSchema>;
