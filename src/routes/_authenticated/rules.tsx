import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ApplyToPast } from "@/components/rules/apply-to-past";
import { rulesQuery as rulesQueryOptions, type RuleRow } from "@/lib/rules-query";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { GroupedList, SectionTitle } from "@/components/ui/grouped-list";
import { SegmentedControl } from "@/components/segmented-control";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { TRANSACTION_TYPES } from "@/lib/categories";
import { useCategories } from "@/lib/use-categories";
import { plural } from "@/lib/plural";
import {
  MATCH_FIELDS,
  MATCH_MODES,
  isLooseMatch,
  MAX_MATCH_TEXT,
  modeHint,
  quoteText,
  ruleCondition,
  LOOSE_MATCH_HINT,
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

// Rules from "To review" only decide how a row counts: "spend" and "income" both mean "count by
// direction".
const flowLabel = (setFlowType: string) =>
  setFlowType === "transfer" ? "Count as transfer" : "Not a transfer";

const LABEL = "mb-1.5 block text-xs font-medium text-muted-foreground";
const CHIP = "rounded-sm bg-muted px-2 py-0.5 text-xs font-medium";

function RulesPage() {
  const prefill = Route.useSearch();
  const navigate = Route.useNavigate();
  const [showForm, setShowForm] = useState(!!prefill.text);
  // Focus goes back to "New rule" when the form closes, not to the top of the page.
  const newRuleButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(showForm);
  useEffect(() => {
    if (wasOpen.current && !showForm) newRuleButton.current?.focus();
    wasOpen.current = showForm;
  }, [showForm]);
  const rulesQuery = useQuery(rulesQueryOptions);
  const rules = rulesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ios-large-title">Rules</h1>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            Rules set the category or type of new transactions that match, before the AI guesses. If
            two rules match, the one higher in the list wins.
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
          onClose={() => {
            setShowForm(false);
            // Back or a refresh must not open the filled-in form again.
            if (prefill.text || prefill.category) void navigate({ search: {}, replace: true });
          }}
        />
      )}

      {rulesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : rulesQuery.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <Alert>Failed to load rules.</Alert>
          <Button variant="quiet" onClick={() => void rulesQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : rules.length === 0 ? (
        <GroupedList>
          <EmptyState
            title="No rules yet"
            hint="Use New rule above, or change a transaction's category and pick Make a rule. For example: Name has the word “Netflix” → Entertainment."
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
  // The field a message is about: marked invalid, described by the message, and focused.
  const [errorField, setErrorField] = useState<"text" | "set" | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const categorySelect = useRef<HTMLSelectElement>(null);
  // A message about the form goes away as soon as you change the form.
  useEffect(() => {
    setFormError(null);
    setErrorField(null);
  }, [matchField, matchMode, matchText, category, type]);

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
    onError: () => setFormError("Couldn't save the rule. Try again."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchText.trim()) {
      setFormError("Type the text to look for.");
      setErrorField("text");
      return textInput.current?.focus();
    }
    if (!shownCategory && !type) {
      setFormError("Pick a category, a type, or both.");
      setErrorField("set");
      return categorySelect.current?.focus();
    }
    setFormError(null);
    setErrorField(null);
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
            <span id="rule-look-in" className={LABEL}>
              Look in
            </span>
            <SegmentedControl
              label="Look in"
              labelledBy="rule-look-in"
              options={MATCH_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
              value={matchField}
              onChange={setMatchField}
            />
          </div>
          <div>
            <span id="rule-match" className={LABEL}>
              Match
            </span>
            <SegmentedControl
              label="Match"
              labelledBy="rule-match"
              options={MATCH_MODES.map((m) => ({ value: m.value, label: m.label }))}
              value={matchMode}
              onChange={setMatchMode}
            />
          </div>
        </div>

        <div>
          <label htmlFor="rule-match-text" className={LABEL}>
            Text to look for
          </label>
          <Input
            id="rule-match-text"
            ref={textInput}
            type="text"
            autoComplete="off"
            value={matchText}
            maxLength={MAX_MATCH_TEXT}
            onChange={(e) => setMatchText(e.target.value)}
            placeholder="e.g. Spotify"
            autoFocus
            aria-describedby={
              errorField === "text" ? "rule-match-hint rule-form-error" : "rule-match-hint"
            }
            aria-invalid={errorField === "text" || undefined}
          />
          <p
            id="rule-match-hint"
            className={`mt-1.5 text-[0.8125rem] ${loose ? "text-foreground" : "text-muted-foreground"}`}
          >
            {loose ? LOOSE_MATCH_HINT : modeHint(matchMode)}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-category" className={LABEL}>
              Set category
            </label>
            <Select
              id="rule-category"
              ref={categorySelect}
              aria-invalid={errorField === "set" || undefined}
              aria-describedby={errorField === "set" ? "rule-form-error" : undefined}
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

      {matchText.trim() && (shownCategory || type) && (
        <p className="mt-6 text-sm break-words">
          {ruleCondition(matchField, matchMode)} {quoteText(matchText.trim())} →{" "}
          {[shownCategory, type].filter(Boolean).join(", ")}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={addRule.isPending}>
          {addRule.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add rule
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {formError && (
          <p id="rule-form-error" role="alert" className="text-sm text-negative">
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
  // Focus goes back to "Apply to past transactions" when the preview closes.
  const applyButton = useRef<HTMLButtonElement>(null);
  const wasChecking = useRef(false);
  useEffect(() => {
    if (wasChecking.current && !checking) applyButton.current?.focus();
    wasChecking.current = checking;
  }, [checking]);
  const hasCategoryRules = rules.some((r) => r.set_category);

  // Undo after a delete saves the same rule again: a new id, but its old date keeps its place in
  // the list (the list, and which rule wins, go by priority then date).
  const restoreRule = useMutation({
    mutationFn: async ({ id: _id, ...rule }: RuleRow) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Not signed in");
      const { error } = await supabase
        .from("category_rules")
        .insert({ ...rule, user_id: userData.user.id });
      if (error) throw error;
    },
    onError: () => toast.error("Couldn't restore the rule. Add it again."),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["category-rules"] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("category_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      setChecking(false); // its count would include the rule being deleted
      await queryClient.cancelQueries({ queryKey: ["category-rules"] });
      const previous = queryClient.getQueryData<RuleRow[]>(["category-rules"]);
      queryClient.setQueryData<RuleRow[]>(["category-rules"], (old) =>
        old?.filter((r) => r.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["category-rules"], ctx.previous);
      toast.error("Couldn't delete the rule. Try again.");
    },
    onSuccess: (_data, id, ctx) => {
      const rule = ctx?.previous?.find((r) => r.id === id);
      // Rules from before the 200-character cap can't be saved again, so no Undo for them.
      const length = rule ? [...rule.match_text].length : 0;
      const restorable = rule && length >= 1 && length <= MAX_MATCH_TEXT;
      toast.success(
        "Rule deleted",
        restorable ? { action: { label: "Undo", onClick: () => restoreRule.mutate(rule) } } : {},
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["category-rules"] }),
  });

  // After a delete, focus moves to the next rule's delete button (the previous one for the last
  // rule), once the buttons are enabled again; otherwise it falls to the page.
  const focusAfterDelete = useRef<string | null>(null);
  useEffect(() => {
    if (deleteRule.isPending || !focusAfterDelete.current) return;
    document.querySelector<HTMLElement>(`[data-rule-id="${focusAfterDelete.current}"]`)?.focus();
    focusAfterDelete.current = null;
  }, [deleteRule.isPending, deleteRule.submittedAt]); // submittedAt: a quick delete may never render as pending
  const remove = (id: string) => {
    const i = rules.findIndex((r) => r.id === id);
    focusAfterDelete.current = (rules[i + 1] ?? rules[i - 1])?.id ?? null;
    deleteRule.mutate(id);
  };

  return (
    <section>
      {checking && (
        <ApplyToPast ruleIds={rules.map((r) => r.id).join()} onDone={() => setChecking(false)} />
      )}

      <SectionTitle
        className="items-center"
        action={
          hasCategoryRules && !checking ? (
            <Button ref={applyButton} variant="quiet" onClick={() => setChecking(true)}>
              Apply to past transactions
            </Button>
          ) : undefined
        }
      >
        {plural(rules.length, "rule")}
      </SectionTitle>

      <GroupedList>
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 py-3 pr-2 pl-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] break-words">
                <span className="text-muted-foreground">
                  {ruleCondition(rule.match_field, rule.match_mode)}
                </span>{" "}
                <span className="font-medium">{quoteText(rule.match_text)}</span>
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
              onClick={() => remove(rule.id)}
              disabled={deleteRule.isPending}
              data-rule-id={rule.id}
              aria-label={`Delete rule for ${rule.match_text}`}
              className="hover:text-negative"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </GroupedList>
    </section>
  );
}
