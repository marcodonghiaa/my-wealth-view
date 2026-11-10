import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select, fieldClass } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { TRANSACTION_TYPES } from "@/lib/categories";
import { useCategories } from "@/lib/use-categories";
import { functionErrorMessage } from "@/lib/function-error";
import { MATCH_MODES, isLooseMatch, modeLabel } from "@/lib/rules";

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
    text: typeof s["text"] === "string" ? s["text"] : undefined,
    category: typeof s["category"] === "string" ? s["category"] : undefined,
  }),
  component: RulesPage,
});

type RuleRow = {
  id: string;
  match_field: string;
  match_text: string;
  match_mode: string | null; // null on a backend without the match_mode migration: "contains"
  set_category: string | null;
  set_transaction_type: string | null;
  set_flow_type: string | null;
  priority: number;
  created_at: string;
};

const MATCH_FIELDS = [
  { value: "creditor_name", label: "Creditor name" },
  { value: "remittance_info", label: "Remittance info" },
  { value: "any", label: "Either field" },
];

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

function fieldLabel(value: string) {
  return MATCH_FIELDS.find((f) => f.value === value)?.label ?? value;
}

function RulesPage() {
  const queryClient = useQueryClient();
  const prefill = Route.useSearch();
  const [matchField, setMatchField] = useState("creditor_name");
  const [matchMode, setMatchMode] = useState("word");
  const [matchText, setMatchText] = useState(prefill.text ?? "");
  const [category, setCategory] = useState<string | null>(prefill.category ?? null);
  const [type, setType] = useState<string | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!!prefill.text);
  const categories = useCategories().list;

  const rulesQuery = useQuery({ queryKey: ["category-rules"], queryFn: fetchRules });

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
      setMatchText("");
      setCategory(null);
      setType(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["category-rules"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to add rule");
    },
  });

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category && !type) {
      setFormError("Set a category and/or a type — a rule must do at least one thing.");
      return;
    }
    if (!matchText.trim()) {
      setFormError("Match text can't be empty.");
      return;
    }
    setFormError(null);
    addRule.mutate({
      match_field: matchField,
      match_mode: matchMode,
      match_text: matchText.trim(),
      set_category: category,
      set_transaction_type: type,
    });
  }

  const rules = rulesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="ios-large-title">Rules</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Matched before AI categorization.</p>
      </header>

      {/* Add rule form — collapsed by default so it doesn't push the
          existing rules list below the fold on a phone. */}
      <form onSubmit={handleSubmit} className="mb-8 rounded-lg bg-card">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 p-5 text-left"
          aria-expanded={showForm}
        >
          <h2 className="text-sm font-medium">Add rule</h2>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${showForm ? "rotate-180" : ""}`}
          />
        </button>
        {showForm && (
          <div className="px-5 pb-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-1">
                <label htmlFor="rule-field" className="mb-1 block text-xs text-muted-foreground">
                  If this field
                </label>
                <Popover open={fieldOpen} onOpenChange={setFieldOpen}>
                  <PopoverTrigger asChild>
                    <button
                      id="rule-field"
                      type="button"
                      className={cn(fieldClass(), "flex items-center justify-between text-left")}
                    >
                      {fieldLabel(matchField)}
                      <ChevronDown className="size-3.5 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="start">
                    {MATCH_FIELDS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => {
                          setMatchField(f.value);
                          setFieldOpen(false);
                        }}
                        className={cn(
                          "min-h-11 w-full rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                          f.value === matchField && "bg-accent",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="lg:col-span-1">
                <label htmlFor="rule-mode" className="mb-1 block text-xs text-muted-foreground">
                  How it matches
                </label>
                <Select
                  id="rule-mode"
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value)}
                >
                  {MATCH_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="rule-match-text"
                  className="mb-1 block text-xs text-muted-foreground"
                >
                  this text
                </label>
                <Input
                  id="rule-match-text"
                  type="text"
                  value={matchText}
                  onChange={(e) => setMatchText(e.target.value)}
                  placeholder="e.g. spotify"
                />
                {isLooseMatch(matchText, matchMode) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Short text can match other names (“bar” is in “Barclays”). Pick “has the word”
                    to avoid that.
                  </p>
                )}
              </div>

              <div className="lg:col-span-1">
                <label htmlFor="rule-category" className="mb-1 block text-xs text-muted-foreground">
                  set category (optional)
                </label>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <button
                      id="rule-category"
                      type="button"
                      className={cn(fieldClass(), "flex items-center justify-between text-left")}
                    >
                      <span className={cn(!category && "text-muted-foreground/60")}>
                        {category ?? "—"}
                      </span>
                      <ChevronDown className="size-3.5 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="start">
                    <button
                      type="button"
                      onClick={() => {
                        setCategory(null);
                        setCategoryOpen(false);
                      }}
                      className={cn(
                        "min-h-11 w-full rounded-sm px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent",
                        !category && "bg-accent",
                      )}
                    >
                      None
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCategory(c);
                          setCategoryOpen(false);
                        }}
                        className={cn(
                          "min-h-11 w-full rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                          c === category && "bg-accent",
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="lg:col-span-1">
                <label htmlFor="rule-type" className="mb-1 block text-xs text-muted-foreground">
                  set type (optional)
                </label>
                <Popover open={typeOpen} onOpenChange={setTypeOpen}>
                  <PopoverTrigger asChild>
                    <button
                      id="rule-type"
                      type="button"
                      className={cn(fieldClass(), "flex items-center justify-between text-left")}
                    >
                      <span className={cn(!type && "text-muted-foreground/60")}>{type ?? "—"}</span>
                      <ChevronDown className="size-3.5 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="start">
                    <button
                      type="button"
                      onClick={() => {
                        setType(null);
                        setTypeOpen(false);
                      }}
                      className={cn(
                        "min-h-11 w-full rounded-sm px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent",
                        !type && "bg-accent",
                      )}
                    >
                      None
                    </button>
                    {TRANSACTION_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setType(t);
                          setTypeOpen(false);
                        }}
                        className={cn(
                          "min-h-11 w-full rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                          t === type && "bg-accent",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button type="submit" disabled={addRule.isPending}>
                {addRule.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add rule
              </Button>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
          </div>
        )}
      </form>

      <ApplyToPast key={rules.map((r) => r.id).join()} hasRules={rules.length > 0} />

      {/* Rules list */}
      <div className="overflow-hidden rounded-lg bg-card">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-medium">
            Existing rules <span className="text-muted-foreground">({rules.length})</span>
          </h2>
        </div>

        {rulesQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rulesQuery.isError ? (
          <Alert className="m-5">Failed to load rules.</Alert>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No rules yet.</div>
        ) : (
          <ul className="divide-y">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">{fieldLabel(rule.match_field)}</span>{" "}
                    {modeLabel(rule.match_mode)}{" "}
                    <span className="font-medium text-foreground">“{rule.match_text}”</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {rule.set_category && (
                    <span className="rounded-sm bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {rule.set_category}
                    </span>
                  )}
                  {rule.set_transaction_type && (
                    <span className="rounded-sm bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {rule.set_transaction_type}
                    </span>
                  )}
                  {rule.set_flow_type && (
                    <span className="rounded-sm bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {flowLabel(rule.set_flow_type)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRule.mutate(rule.id)}
                    disabled={deleteRule.isPending}
                    aria-label={`Delete rule for ${rule.match_text}`}
                    className="-m-2 hover:bg-negative/10 hover:text-negative"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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

const plural = (n: number) => `${n} transaction${n === 1 ? "" : "s"}`;

// Rules run on new transactions only; this re-runs them on the past ones, after a preview.
// Remounted (key) whenever the rules change, so a preview never describes old rules.
function ApplyToPast({ hasRules }: { hasRules: boolean }) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<ReapplyResult | null>(null);
  const check = useMutation({
    mutationFn: () => reapply(false),
    onSuccess: setPreview,
    onError: (err) => toast.error(err.message),
  });
  const apply = useMutation({
    mutationFn: () => reapply(true),
    onSuccess: (result) => {
      toast.success(`Updated ${plural(result.changes)}`);
      setPreview(null);
      void queryClient.invalidateQueries(); // categories show on most pages
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <section className="mb-8 rounded-lg bg-card p-5">
      <h2 className="text-sm font-medium">Apply to past transactions</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Rules run on new transactions. This runs them on the ones you already have. Categories you
        picked yourself never change.
      </p>
      {preview === null ? (
        <Button
          className="mt-4"
          onClick={() => check.mutate()}
          disabled={!hasRules || check.isPending}
        >
          {check.isPending && <Loader2 className="size-4 animate-spin" />}
          Check what would change
        </Button>
      ) : preview.changes === 0 ? (
        <p className="mt-4 text-sm">
          Nothing to change: your past transactions already follow your rules.
        </p>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-medium">
            {plural(preview.changes)} would change, for example:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {preview.sample.map((s, i) => (
              <li key={i}>
                <span className="text-foreground">{s.name || "No name"}</span>: {s.from ?? "—"} →{" "}
                <span className="text-foreground">{s.to}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
              {apply.isPending && <Loader2 className="size-4 animate-spin" />}
              Apply to {plural(preview.changes)}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={apply.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
