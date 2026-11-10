import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { GroupedList, SectionTitle } from "@/components/ui/grouped-list";
import { SegmentedControl } from "@/components/segmented-control";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { TRANSACTION_TYPES } from "@/lib/categories";
import { useCategories } from "@/lib/use-categories";
import { functionErrorMessage } from "@/lib/function-error";
import { plural } from "@/lib/plural";
import {
  MATCH_FIELDS,
  MATCH_MODES,
  fieldPhrase,
  isLooseMatch,
  MAX_MATCH_TEXT,
  modeHint,
  modeLabel,
  type MatchField,
  type MatchMode,
} from "@/lib/rules";

// "Make a rule" from a transaction's category opens this page with the form filled in.
type RulesSearch = { text?: string | undefined; category?: string | undefined };

export const Route = createFileRoute("/_authenticated/rules")({
  head: () => ({
    meta: [
      { title: "Rules — Alopex" },
      {
        name: "description",
        content: "Manage automatic transaction categorization rules.",
      },
      { property: "og:title", content: "Rules — Alopex" },
      {
        property: "og:description",
        content: "Manage automatic transaction categorization rules.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): RulesSearch => ({
    text: typeof s["text"] === "string" ? s["text"].slice(0, MAX_MATCH_TEXT) : undefined,
    category: typeof s["category"] === "string" ? s["category"] : undefined,
  }),
  component: RulesPage,
});

type RuleRow = {
  id: string;
  match_field: string;
  match_text: string;
  match_mode: string; // "word" | "exact" | "contains"; rules made before modes are "contains"
  set_category: string | null;
  set_transaction_type: string | null;
  set_flow_type: string | null;
  priority: number;
  created_at: string;
};

async function fetchRules(): Promise<RuleRow[]> {
  const { data, error } = await supabase
    .from("category_rules")
    .select(
      "id, match_field, match_text, match_mode, set_category, set_transaction_type, set_flow_type, priority, created_at",
    )
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Rules from "To review" only decide how a row counts: "spend" and "income" both mean "count by
// direction".
const flowLabel = (setFlowType: string) =>
  setFlowType === "transfer" ? "Count as transfer" : "Not a transfer";

const LABEL = "mb-1.5 block text-[0.8125rem] font-medium text-muted-foreground";
const CHIP = "rounded-sm bg-muted px-2 py-0.5 text-xs font-medium";

function RulesPage() {
  const prefill = Route.useSearch();
  const [showForm, setShowForm] = useState(!!prefill.text);
  // Focus goes back to "New rule" when the form closes, not to the top of the page.
  const newRuleButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(showForm);
  useEffect(() => {
    if (wasOpen.current && !showForm) newRuleButton.current?.focus();
    wasOpen.current = showForm;
  }, [showForm]);
  const rulesQuery = useQuery({ queryKey: ["category-rules"], queryFn: fetchRules });
  const rules = rulesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ios-large-title">Rules</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Rules sort matching transactions for you, before the AI guesses. The first rule that
            matches wins.
          </p>
        </div>
        {!showForm && (
          <Button ref={newRuleButton} onClick={() => setShowForm(true)}>
            <Plus />
            New rule
          </Button>
        )}
      </header>

      {showForm && (
        <RuleForm
          initialText={prefill.text ?? ""}
          initialCategory={prefill.category ?? ""}
          onClose={() => setShowForm(false)}
        />
      )}

      {rulesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : rulesQuery.isError ? (
        <Alert>Failed to load rules.</Alert>
      ) : rules.length === 0 ? (
        <GroupedList>
          <EmptyState
            title="No rules yet"
            hint="Make one here, or from a transaction after you change its category."
          />
        </GroupedList>
      ) : (
        <RuleList rules={rules} />
      )}
    </div>
  );
}

function RuleForm({
  initialText,
  initialCategory,
  onClose,
}: {
  initialText: string;
  initialCategory: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const categories = useCategories().list;
  const [matchField, setMatchField] = useState<MatchField>("creditor_name");
  const [matchMode, setMatchMode] = useState<MatchMode>("word");
  const [matchText, setMatchText] = useState(initialText);
  const [category, setCategory] = useState(initialCategory);
  // A category the picker can't show (renamed since) must not be saved unseen.
  const shownCategory = categories.includes(category) ? category : "";
  const [type, setType] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addRule = useMutation({
    mutationFn: async (rule: {
      match_field: string;
      match_mode: string;
      match_text: string;
      set_category: string | null;
      set_transaction_type: string | null;
    }) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Not signed in");
      const { error } = await supabase.from("category_rules").insert({
        ...rule,
        user_id: userData.user.id,
        priority: 100,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule added");
      void queryClient.invalidateQueries({ queryKey: ["category-rules"] });
      onClose();
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Failed to add rule"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchText.trim()) return setFormError("Type the text to look for.");
    if (!shownCategory && !type) return setFormError("Pick a category, a type, or both.");
    setFormError(null);
    addRule.mutate({
      match_field: matchField,
      match_mode: matchMode,
      match_text: matchText.trim(),
      set_category: shownCategory || null,
      set_transaction_type: type || null,
    });
  }

  const loose = isLooseMatch(matchText, matchMode);

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      aria-labelledby="rule-form-title"
      className="mb-8 rounded-lg bg-card p-5 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="rule-form-title" className="text-[0.9375rem] font-medium">
          New rule
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          className="-m-2"
        >
          <X />
        </Button>
      </div>

      <fieldset className="grid gap-5">
        <legend className="sr-only">When</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className={LABEL}>Look in</span>
            <SegmentedControl
              label="Look in"
              options={MATCH_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
              value={matchField}
              onChange={setMatchField}
            />
          </div>
          <div>
            <span className={LABEL}>Match</span>
            <SegmentedControl
              label="Match"
              options={MATCH_MODES.map((m) => ({ value: m.value, label: m.label }))}
              value={matchMode}
              onChange={setMatchMode}
            />
          </div>
        </div>

        <div>
          <label htmlFor="rule-match-text" className={LABEL}>
            Text
          </label>
          <Input
            id="rule-match-text"
            type="text"
            autoComplete="off"
            value={matchText}
            maxLength={MAX_MATCH_TEXT}
            onChange={(e) => setMatchText(e.target.value)}
            placeholder="e.g. Spotify"
            autoFocus
            aria-describedby="rule-match-hint"
          />
          <p
            id="rule-match-hint"
            className={`mt-1.5 text-[0.8125rem] ${loose ? "text-foreground" : "text-muted-foreground"}`}
          >
            {loose
              ? "Short text also matches inside other words (“bar” is in “Barclays”). Whole word avoids that."
              : modeHint(matchMode)}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-category" className={LABEL}>
              Set category
            </label>
            <Select
              id="rule-category"
              value={shownCategory}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Leave as is</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="rule-type" className={LABEL}>
              Set type
            </label>
            <Select id="rule-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Leave as is</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={addRule.isPending}>
          {addRule.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add rule
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {formError && (
          <p role="alert" className="text-sm text-negative">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}

function RuleList({ rules }: { rules: RuleRow[] }) {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const hasCategoryRules = rules.some((r) => r.set_category);

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("category_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["category-rules"] });
      const previous = queryClient.getQueryData<RuleRow[]>(["category-rules"]);
      queryClient.setQueryData<RuleRow[]>(["category-rules"], (old) =>
        old?.filter((r) => r.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["category-rules"], ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    },
    onSuccess: () => toast.success("Rule deleted"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["category-rules"] }),
  });

  return (
    <section>
      <SectionTitle
        className="items-center"
        action={
          hasCategoryRules && !checking ? (
            <Button variant="quiet" size="sm" onClick={() => setChecking(true)}>
              Apply to past transactions
            </Button>
          ) : undefined
        }
      >
        {rules.length} {rules.length === 1 ? "rule" : "rules"}
      </SectionTitle>

      {checking && (
        <ApplyToPast key={rules.map((r) => r.id).join()} onDone={() => setChecking(false)} />
      )}

      <GroupedList>
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 py-3 pr-2 pl-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] break-words">
                <span className="text-muted-foreground">
                  {fieldPhrase(rule.match_field)} {modeLabel(rule.match_mode)}
                </span>{" "}
                <span className="font-medium">“{rule.match_text}”</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
                {rule.set_category && <span className={CHIP}>{rule.set_category}</span>}
                {rule.set_transaction_type && (
                  <span className={`${CHIP} text-muted-foreground`}>
                    {rule.set_transaction_type}
                  </span>
                )}
                {rule.set_flow_type && (
                  <span className={`${CHIP} text-muted-foreground`}>
                    {flowLabel(rule.set_flow_type)}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteRule.mutate(rule.id)}
              disabled={deleteRule.isPending}
              aria-label={`Delete rule for ${rule.match_text}`}
              className="hover:bg-negative/10 hover:text-negative"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </GroupedList>
    </section>
  );
}

type ReapplyResult = {
  changes: number;
  sample: Array<{ name: string; from: string | null; to: string }>;
};

async function reapply(apply: boolean): Promise<ReapplyResult> {
  const { data, error } = await supabase.functions.invoke<ReapplyResult>("reapply-rules", {
    body: { apply },
  });
  if (error || !data) {
    throw new Error(await functionErrorMessage(error, "Couldn't apply your rules, try again"));
  }
  return data;
}

// Rules run on new transactions only; this re-runs them on the past ones, after a preview that
// starts as soon as the panel opens. Remounted (key) whenever the rules change.
function ApplyToPast({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ["reapply-preview"],
    queryFn: () => reapply(false),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false, // a scan of your whole history; the count stays put while you read it
  });
  const apply = useMutation({
    mutationFn: () => reapply(true),
    onSuccess: (result) => {
      toast.success(`Updated ${plural(result.changes)}`);
      onDone();
      // Categories show on most pages; the closed preview must not ask the server again.
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "reapply-preview" });
    },
    onError: (err) => toast.error(err.message),
  });
  const changes = preview.data?.changes ?? 0;

  return (
    <div className="mb-4 rounded-lg bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[0.9375rem] font-medium">Apply to past transactions</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Categories you picked yourself never change.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDone}
          aria-label="Close"
          className="-m-2"
          disabled={apply.isPending}
        >
          <X />
        </Button>
      </div>

      {preview.isPending ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking your transactions…
        </p>
      ) : preview.isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-negative">
            {preview.error.message}
          </p>
          <Button variant="quiet" size="sm" onClick={() => void preview.refetch()}>
            Try again
          </Button>
        </div>
      ) : changes === 0 ? (
        <p role="status" className="mt-4 text-sm">
          Nothing to change: your past transactions already follow your rules.
        </p>
      ) : (
        <>
          <p role="status" className="mt-4 text-sm">
            <span className="font-medium">{plural(changes)}</span> would change
            {preview.data.sample.length < changes ? ", for example:" : ":"}
          </p>
          <GroupedList className="mt-2 bg-background">
            {preview.data.sample.map((s, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium" title={s.name}>
                  {s.name || "No name"}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {s.from ?? "Uncategorized"}
                  <ArrowRight aria-label="to" className="size-3.5" />
                  <span className="text-foreground">{s.to}</span>
                </span>
              </div>
            ))}
          </GroupedList>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
              {apply.isPending && <Loader2 className="animate-spin" />}
              Update {plural(changes)}
            </Button>
            <Button variant="ghost" onClick={onDone} disabled={apply.isPending}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
