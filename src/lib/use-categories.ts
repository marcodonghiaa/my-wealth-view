import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, categoriesFor } from "@/lib/categories";

export type CategorySetting = { name: string; hidden: boolean };

export const CATEGORIES_KEY = ["user-categories"];

// Before the backend migration (table missing) or if it can't be read: the built-in list.
async function fetchSettings(): Promise<Array<CategorySetting> | null> {
  const { data, error } = await supabase.from("user_categories").select("name,hidden");
  if (error) return null;
  return data as Array<CategorySetting>;
}

/** Your categories, for every picker: built-ins minus the hidden ones, plus your own. */
export function useCategories() {
  const query = useQuery({ queryKey: CATEGORIES_KEY, queryFn: fetchSettings, staleTime: 60_000 });
  const settings = query.data ?? [];
  return {
    list: query.data ? categoriesFor(settings) : [...CATEGORIES],
    settings,
    available: query.data != null,
    isPending: query.isPending,
  };
}
