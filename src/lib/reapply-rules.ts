// The reapply-rules Edge Function: { apply } re-runs your rules over past transactions;
// with `retired` (a rule just deleted), only the rows it filed that no other rule matches,
// back to uncategorized for the next sync. apply=false previews.
import { supabase } from "@/integrations/supabase/client";
import { functionErrorMessage } from "@/lib/function-error";
import type { RuleRow } from "@/lib/rules-query";

export type ReapplyResult = {
  changes: number;
  sample: Array<{ name: string; from: string | null; to: string | null }>;
};

// A rule just deleted: the server finds the rows it filed that no other rule matches.
export type RetiredRule = Pick<
  RuleRow,
  "match_field" | "match_text" | "match_mode" | "set_category"
>;

export async function reapply(apply: boolean, retired?: RetiredRule): Promise<ReapplyResult> {
  const { data, error } = await supabase.functions.invoke<ReapplyResult>("reapply-rules", {
    body: retired ? { apply, retired } : { apply },
  });
  if (error || !data) {
    const fallback = apply
      ? "Couldn't update your transactions."
      : "Couldn't check your transactions.";
    throw new Error(await functionErrorMessage(error, fallback));
  }
  return data;
}
