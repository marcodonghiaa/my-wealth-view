import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const RECURRING_KEY = ["recurring_streams"];

/** Shared by the Subscriptions page and the nav badge, so they hit one cache entry. */
export const useRecurringStreams = () =>
  useQuery({
    queryKey: RECURRING_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("recurring_streams").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
