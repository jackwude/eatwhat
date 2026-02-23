import { z } from "zod";

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default("doubao-seed-2-0-pro-260215"),
  OPENAI_RECOMMEND_MODEL: z.string().min(1).optional(),
  OPENAI_RECIPE_WEBSEARCH_MODEL: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional().or(z.literal("")),
  OPENAI_API_STYLE: z.enum(["responses", "chat"]).default("responses"),
  OPENAI_STT_MODEL: z.string().min(1).default("whisper-1"),
  OPENAI_IMAGE_MODEL: z.string().min(1).default("doubao-seedream-4-5-251128"),
  OPENAI_IMAGE_SIZE: z.string().min(1).default("2K"),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_BASE_URL: z.string().url().optional().or(z.literal("")),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_HISTORY_TABLE: z.string().min(1).default("HistoryEntry"),
  RECOMMEND_CACHE_TTL_SEC: z.coerce.number().int().positive().default(600),
});

export type ServerEnv = {
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_RECOMMEND_MODEL?: string;
  OPENAI_RECIPE_WEBSEARCH_MODEL?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_API_STYLE: "responses" | "chat";
  OPENAI_STT_MODEL: string;
  OPENAI_IMAGE_MODEL: string;
  OPENAI_IMAGE_SIZE: string;
  IMAGE_API_KEY?: string;
  IMAGE_BASE_URL?: string;
  DATABASE_URL?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_HISTORY_TABLE: string;
  RECOMMEND_CACHE_TTL_SEC: number;
};

let cache: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cache) return cache;

  const parsed = serverEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_RECOMMEND_MODEL: process.env.OPENAI_RECOMMEND_MODEL,
    OPENAI_RECIPE_WEBSEARCH_MODEL: process.env.OPENAI_RECIPE_WEBSEARCH_MODEL,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_API_STYLE: process.env.OPENAI_API_STYLE,
    OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_SIZE: process.env.OPENAI_IMAGE_SIZE,
    IMAGE_API_KEY: process.env.IMAGE_API_KEY,
    IMAGE_BASE_URL: process.env.IMAGE_BASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_HISTORY_TABLE: process.env.SUPABASE_HISTORY_TABLE,
    RECOMMEND_CACHE_TTL_SEC: process.env.RECOMMEND_CACHE_TTL_SEC,
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const detail = Object.entries(flattened)
      .map(([key, value]) => `${key}: ${(value || []).join(", ")}`)
      .join(" | ");
    throw new Error(`Invalid server env: ${detail}`);
  }

  cache = {
    ...parsed.data,
    OPENAI_BASE_URL: parsed.data.OPENAI_BASE_URL || undefined,
    IMAGE_BASE_URL: parsed.data.IMAGE_BASE_URL || undefined,
    DATABASE_URL: parsed.data.DATABASE_URL || undefined,
  };

  return cache;
}
