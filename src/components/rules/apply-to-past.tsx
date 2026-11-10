// "Apply to past transactions" on the Rules page: a preview of what your rules would change,
// then the update (supabase/functions/reapply-rules).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GroupedList } from "@/components/ui/grouped-list";
import { functionErrorMessage } from "@/lib/function-error";
import { plural } from "@/lib/plural";
import { previewLine } from "@/lib/rules";

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
// starts as soon as the panel opens. A change to the rules is a new preview (ruleIds in the key).
export function ApplyToPast({ ruleIds, onDone }: { ruleIds: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ["reapply-preview", ruleIds],
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
            {previewLine(changes, preview.data.sample.length)}
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
