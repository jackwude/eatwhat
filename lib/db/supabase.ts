import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/utils/env";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export type HistoryEntryRow = {
  id: string;
  kind: string;
  requestHash: string | null;
  inputText: string;
  ownedIngredients: JsonValue;
  dishName: string | null;
  recommendations: JsonValue | null;
  recipeDetail: JsonValue | null;
  createdAt: string;
};

export type HistoryEntryInsert = {
  id?: string;
  kind?: string;
  requestHash?: string | null;
  inputText: string;
  ownedIngredients: JsonValue;
  dishName?: string | null;
  recommendations?: JsonValue | null;
  recipeDetail?: JsonValue | null;
  createdAt?: string;
};

type Database = {
  public: {
    Tables: {
      HistoryEntry: {
        Row: HistoryEntryRow;
        Insert: HistoryEntryInsert;
        Update: Partial<HistoryEntryInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let client: SupabaseClient<Database> | null = null;

export function getSupabaseServerClient() {
  if (client) return client;

  const env = getEnv();
  client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
