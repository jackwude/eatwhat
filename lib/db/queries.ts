import { getEnv } from "@/lib/utils/env";
import { getSupabaseServerClient, type HistoryEntryRow, type JsonValue } from "@/lib/db/supabase";

type HistoryCreateInput = {
  kind?: string;
  requestHash?: string;
  inputText: string;
  ownedIngredients: string[];
  dishName?: string;
  recommendations?: JsonValue;
  recipeDetail?: JsonValue;
};

const HISTORY_TABLE_NAME = "HistoryEntry" as const;

function createHistoryId() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertTableConfig() {
  const table = getEnv().SUPABASE_HISTORY_TABLE;
  if (table !== HISTORY_TABLE_NAME) {
    throw new Error(`Unsupported SUPABASE_HISTORY_TABLE: ${table}. Current code expects ${HISTORY_TABLE_NAME}.`);
  }
}

export async function createHistoryEntry(input: HistoryCreateInput) {
  assertTableConfig();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(HISTORY_TABLE_NAME)
    .insert({
      id: createHistoryId(),
      kind: input.kind ?? "generic",
      requestHash: input.requestHash ?? null,
      inputText: input.inputText,
      ownedIngredients: input.ownedIngredients,
      dishName: input.dishName ?? null,
      recommendations: input.recommendations ?? null,
      recipeDetail: input.recipeDetail ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`History create failed: ${error.message}`);
  }

  return { id: data.id };
}

export async function listHistoryEntries(limit = 20, kind?: string) {
  assertTableConfig();
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from(HISTORY_TABLE_NAME)
    .select("id, inputText, ownedIngredients, dishName, createdAt")
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`History list failed: ${error.message}`);
  }

  return (data ?? []) as Array<Pick<HistoryEntryRow, "id" | "inputText" | "ownedIngredients" | "dishName" | "createdAt">>;
}

export async function findCachedRecommendationByHash(requestHash: string) {
  assertTableConfig();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(HISTORY_TABLE_NAME)
    .select("recommendations, inputText, ownedIngredients, createdAt")
    .eq("kind", "recommend")
    .eq("requestHash", requestHash)
    .not("recommendations", "is", null)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Recommend cache query failed: ${error.message}`);
  }

  if (!data) return null;

  return {
    recommendations: data.recommendations,
    inputText: data.inputText,
    ownedIngredients: data.ownedIngredients,
    createdAt: data.createdAt,
  };
}
