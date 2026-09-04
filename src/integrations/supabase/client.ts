import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client for the externally connected project
// (org "Marcoo", ref diwezyrtlwdbrsgegkay). Uses the publishable/anon key only —
// all data access respects the project's Row Level Security policies.
// Created lazily so SSR never touches browser storage.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key =
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
      (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
    if (!url || !key) {
      throw new Error(
        "Supabase is not configured. Connect the external Supabase project in Project Settings → Integrations.",
      );
    }
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export interface NetWorthSnapshot {
  snapshot_date: string;
  total_eur: number;
}

export interface FxRate {
  date: string;
  currency: string;
  rate_to_eur: number;
}
