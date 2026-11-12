import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MAX_MATCH_TEXT, quoteText } from "@/lib/rules";
import { readPages } from "@/lib/read-pages";
import { RULE_COLUMNS, rulesQuery, type RuleRow } from "@/lib/rules-query";
import {
  incomeWindow,
  ruleFor,
  type IncomeKind,
  type IncomeRule,
  type IncomeTx,
} from "@/lib/regular-income";

/** Income credits in the six months ending with `month`, from `transactions` (original names). */
export function fetchIncomeWindow(month: Date): Promise<Array<IncomeTx>> {
  const { start, end } = incomeWindow(month);
  return readPages<IncomeTx>((from, to) =>
    supabase
      .from("transactions")
      .select(
        "account_uid,entry_reference,booking_date,merchant_key,creditor_name,remittance_info,amount,currency",
      )
      .eq("credit_debit_indicator", "CRDT")
      // The Income list (v_transactions_eur) reads a flow the sync hasn't set yet as the direction.
      .or("flow_type.is.null,flow_type.eq.income")
      .is("deleted_at", null)
      .gte("booking_date", start)
      .lt("booking_date", end)
      .order("booking_date", { ascending: false })
      .order("account_uid", { ascending: true })
      .order("entry_reference", { ascending: true })
      .range(from, to),
  );
}

// Starts with "income" so a category or flow change (which refetches "income") refreshes it.
const incomeWindowKey = (month: Date) => ["income", "window", incomeWindow(month).start];

export const useIncomeWindow = (month: Date) =>
  useQuery({ queryKey: incomeWindowKey(month), queryFn: () => fetchIncomeWindow(month) });

/** The user's rules that mark income, in the order they apply (shares the Rules page's cache). */
export function useIncomeRules() {
  return useQuery({
    ...rulesQuery,
    select: (rules): Array<IncomeRule> =>
      rules.flatMap((r) => (r.set_income_kind != null ? [r] : [])),
  });
}

export interface MarkVars {
  tx: Pick<IncomeTx, "creditor_name" | "remittance_info">;
  kind: IncomeKind;
  rules: ReadonlyArray<IncomeRule>;
}

/** What marking a row did, so Undo can take it back. */
type Done =
  | { kind: "inserted"; id: string; rule: RuleRow }
  | { kind: "updated"; id: string; previous: string | null; text: string }
  | { kind: "none" };

/**
 * "Mark as regular / one-off": the rule already deciding this row changes its mind, else a new
 * rule for the row's exact name is added. Undo restores the rule or removes the new one.
 */
export async function markIncomeKind({ tx, kind, rules }: MarkVars): Promise<Done> {
  const existing = ruleFor(tx, rules);
  if (existing) {
    if (existing.set_income_kind === kind) return { kind: "none" };
    await updateKind(existing.id, kind);
    return {
      kind: "updated",
      id: existing.id,
      previous: existing.set_income_kind,
      text: existing.match_text,
    };
  }
  const name = tx.creditor_name?.trim();
  if (!name) throw new Error("This payment has no name to make a rule from.");
  if (name.length > MAX_MATCH_TEXT) throw new Error("This name is too long for a rule.");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You are signed out. Sign in again.");
  const { data, error } = await supabase
    .from("category_rules")
    .insert({
      user_id: auth.user.id,
      match_field: "creditor_name",
      match_text: name,
      match_mode: "exact",
      set_category: null,
      set_income_kind: kind,
    })
    .select(RULE_COLUMNS)
    .single();
  if (error) throw error;
  return { kind: "inserted", id: data.id, rule: data };
}

// An update that matches no row is no error to PostgREST: say so instead of claiming a save.
async function updateKind(id: string, kind: string | null) {
  const { data, error } = await supabase
    .from("category_rules")
    .update({ set_income_kind: kind })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("That rule was deleted meanwhile. Reload and try again.");
}

export async function undoMark(done: Done): Promise<void> {
  if (done.kind === "none") return;
  if (done.kind === "updated") return updateKind(done.id, done.previous);
  const { error } = await supabase.from("category_rules").delete().eq("id", done.id);
  if (error) throw error;
}

export const kindLabel = (kind: IncomeKind) => (kind === "regular" ? "regular" : "one-off");

export function useMarkIncomeKind() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: rulesQuery.queryKey });
  const patchRules = (change: (old: Array<RuleRow>) => Array<RuleRow>) =>
    // Nothing cached yet: leave it, or one rule would pass for the whole list.
    queryClient.setQueryData<Array<RuleRow>>(rulesQuery.queryKey, (old) => old && change(old));
  return useMutation<Done, Error, MarkVars>({
    mutationFn: markIncomeKind,
    onError: (error) => toast.error("Couldn't save", { description: error.message }),
    onSuccess: (done, { tx, kind }) => {
      // The rule is in the cache at once: a second Mark before the refetch lands sees it.
      if (done.kind !== "none")
        patchRules((old) =>
          done.kind === "inserted"
            ? [...old, done.rule]
            : old.map((r) => (r.id === done.id ? { ...r, set_income_kind: kind } : r)),
        );
      void refresh();
      if (done.kind === "none") return;
      toast.success(
        `${tx.creditor_name ?? "This payment"} now counts as ${kindLabel(kind)} income`,
        {
          // An existing rule may cover other names too: say which one changed.
          description:
            done.kind === "inserted"
              ? "Saved as a rule."
              : `Changed your rule for ${quoteText(done.text)}.`,
          action: {
            label: "Undo",
            onClick: () =>
              void undoMark(done).then(
                () => {
                  // Same as Mark: the cache shows the undo before the refetch lands.
                  patchRules((old) =>
                    done.kind === "inserted"
                      ? old.filter((r) => r.id !== done.id)
                      : old.map((r) =>
                          r.id === done.id ? { ...r, set_income_kind: done.previous } : r,
                        ),
                  );
                  void refresh();
                },
                (e: Error) => toast.error("Couldn't undo", { description: e.message }),
              ),
          },
        },
      );
    },
  });
}
