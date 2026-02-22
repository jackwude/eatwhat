import { z } from "zod";

export const imageRequestSchema = z.object({
  dishName: z.string().min(1),
  style: z.string().min(1).default("高清美食摄影"),
});

export const imageResponseSchema = z.object({
  imageUrl: z.string().url(),
});
