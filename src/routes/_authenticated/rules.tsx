import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase, isDemoRoute } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rules")({
  head: () => ({
    meta: [
      { title: "Rules — Finance Dashboard" },
      {
        name: "description",
        content: "Manage automatic transaction categorization rules.",
      },
      { property: "og:title", content: "Rules — Finance Dashboard" },
      {
        property: "og:description",
        content: "Manage automatic transaction categorization rules.",
      },
    ],
  }),
  component: RulesPage,
});

type RuleRow = {
  id: string;
  match_field: string;
  match_text: string;
  set_category: string | null;
  set_transaction_type: string | null;
  priority: number;
  created_at: string;
};

const CATEGORIES = [
  "Shopping",
  "Entertainment",
  "Groceries",
  "Dine Out",
  "Services",
  "Housing",
  "Transports",
  "Experiences",
  "Income",
  "Health",
  "Transfer",
  "Others",
];

const TYPES = ["Subscription", "One-time"];

const MATCH_FIELDS = [
  { value: "creditor_name", label: "Creditor name" },
  { value: "remittance_info", label: "Remittance info" },
  { value: "any", label: "Either field" },
];

async function fetchRules(): Promise<RuleRow[]> {
  const { data, error } = await getSupabase()
    .from("category_rules")
    .select(
      "id, match_field, match_text, set_category, set_transaction_type, priority, created_at",
    )
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function fieldLabel(value: string) {
  return MATCH_FIELDS.find((f) => f.value === value)?.label ?? value;
}

export function RulesPage() {
  const queryClient = useQueryClient();
  const [matchField, setMatchField] = useState("creditor_name");
  const [matchText, setMatchText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const rulesQuery = useQuery({ queryKey: ["category-rules"], queryFn: fetchRules });

  const addRule = useMutation({
    mutationFn: async (rule: {
      match_field: string;
      match_text: string;
      set_category: string | null;
      set_transaction_type: string | null;
    }) => {
      if (isDemoRoute()) throw new Error("This is a read-only demo — sign up to make changes.");
      const supabase = getSupabase();
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
      if (isDemoRoute()) throw new Error("This is a read-only demo — sign up to make changes.");
      const { error } = await getSupabase().from("category_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["category-rules"] });
      const previous = queryClient.getQueryData<RuleRow[]>(["category-rules"]);
      queryClient.setQueryData<RuleRow[]>(
        ["category-rules"],
        (old) => old?.filter((r) => r.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["category-rules"], ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    },
    onSuccess: () => toast.success("Rule deleted"),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ["category-rules"] }),
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
      match_text: matchText.trim(),
      set_category: category,
      set_transaction_type: type,
    });
  }

  const rules = rulesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Rules
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Rules run automatically before AI categorization — if a
          transaction's chosen field contains your match text, it's
          categorized instantly, no AI needed.
        </p>
      </header>

      {/* Add rule form — collapsed by default so it doesn't push the
          existing rules list below the fold on a phone. */}
      <form
        onSubmit={handleSubmit}
        className="card-ring mb-8 rounded-xl"
      >
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-muted-foreground">
              If this field
            </label>
            <Popover open={fieldOpen} onOpenChange={setFieldOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-base"
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
                      "min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      f.value === matchField && "bg-accent",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">
              contains this text
            </label>
            <input
              type="text"
              value={matchText}
              onChange={(e) => setMatchText(e.target.value)}
              placeholder="e.g. spotify"
              className="w-full rounded-lg border bg-background px-3 py-2 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-muted-foreground">
              set category (optional)
            </label>
            <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-base"
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
                    "min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent",
                    !category && "bg-accent",
                  )}
                >
                  None
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategory(c);
                      setCategoryOpen(false);
                    }}
                    className={cn(
                      "min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent",
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
            <label className="mb-1 block text-xs text-muted-foreground">
              set type (optional)
            </label>
            <Popover open={typeOpen} onOpenChange={setTypeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-base"
                >
                  <span className={cn(!type && "text-muted-foreground/60")}>
                    {type ?? "—"}
                  </span>
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
                    "min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent",
                    !type && "bg-accent",
                  )}
                >
                  None
                </button>
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      setTypeOpen(false);
                    }}
                    className={cn(
                      "min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent",
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
          <button
            type="submit"
            disabled={addRule.isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {addRule.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add rule
          </button>
          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}
        </div>
        </div>
        )}
      </form>

      {/* Rules list */}
      <div className="card-ring rounded-xl">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-medium">
            Existing rules{" "}
            <span className="text-muted-foreground">({rules.length})</span>
          </h2>
        </div>

        {rulesQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : rulesQuery.isError ? (
          <div className="p-5 text-sm text-destructive">
            Failed to load rules.
          </div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No rules yet. Add your first one above — e.g. any transaction whose
            creditor contains "spotify" becomes Entertainment / Subscription.
          </div>
        ) : (
          <ul className="divide-y">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {fieldLabel(rule.match_field)}
                    </span>{" "}
                    contains{" "}
                    <span className="font-medium text-foreground">
                      “{rule.match_text}”
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {rule.set_category && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {rule.set_category}
                    </span>
                  )}
                  {rule.set_transaction_type && (
                    <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {rule.set_transaction_type}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteRule.mutate(rule.id)}
                    disabled={deleteRule.isPending}
                    aria-label={`Delete rule for ${rule.match_text}`}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
