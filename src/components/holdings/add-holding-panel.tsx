import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseQuantity } from "@/lib/holdings";

export type HoldingKind = "stock" | "crypto";

interface Candidate {
  id: string;
  symbol: string;
  name: string;
  detail: string;
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const COPY: Record<
  HoldingKind,
  { title: string; placeholder: string; quantity: string; queryKey: string }
> = {
  stock: {
    title: "Add an investment",
    placeholder: "Name, ticker or ISIN, e.g. VWCE or IE00BK5BQT80",
    quantity: "Shares",
    queryKey: "portfolio-latest",
  },
  crypto: {
    title: "Add a coin",
    placeholder: "Name or symbol, e.g. Bitcoin or ETH",
    quantity: "Amount",
    queryKey: "crypto-latest",
  },
};

// add-holding answers errors as { error } with a 4xx/5xx; supabase-js wraps that in a generic
// message, so read the body to show the real reason.
async function functionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response }).context;
  try {
    const body = (await context?.json()) as { error?: string } | undefined;
    if (body?.error) return body.error;
  } catch {
    // Not JSON: fall through.
  }
  return fallback;
}

async function callAddHolding<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("add-holding", { body });
  if (error) throw new Error(await functionError(error, fallback));
  if (!data) throw new Error(fallback);
  return data;
}

export function AddHoldingPanel({
  kind,
  defaultOpen = false,
}: {
  kind: HoldingKind;
  defaultOpen?: boolean;
}) {
  const copy = COPY[kind];
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<Candidate> | null>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [quantity, setQuantity] = useState("");
  const [broker, setBroker] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const search = useMutation({
    mutationFn: (q: string) =>
      callAddHolding<{ results: Array<Candidate> }>(
        { action: "search", kind, query: q },
        "Search is unavailable right now, try again",
      ),
    onSuccess: (data) => {
      setResults(data.results);
      setPicked(data.results.length === 1 ? data.results[0]! : null);
    },
    onError: (err) => setFormError(err.message),
  });

  const add = useMutation({
    mutationFn: (input: { candidate: Candidate; quantity: number }) =>
      callAddHolding<{ added: boolean; priced: boolean }>(
        {
          action: "add",
          kind,
          id: input.candidate.id,
          symbol: input.candidate.symbol,
          name: input.candidate.name,
          quantity: input.quantity,
          // The search term is the ISIN when the user typed one: keep it as the holding's key.
          ...(kind === "stock" && ISIN.test(query.trim().toUpperCase())
            ? { isin: query.trim().toUpperCase() }
            : {}),
          ...(kind === "stock" && broker.trim() ? { broker: broker.trim() } : {}),
        },
        "Couldn't add it right now, try again",
      ),
    onSuccess: (data, input) => {
      toast.success(
        data.priced
          ? `${input.candidate.name} added`
          : `${input.candidate.name} added; its value shows after the next price sync`,
      );
      void queryClient.invalidateQueries({ queryKey: [copy.queryKey] });
      void queryClient.invalidateQueries({ queryKey: ["net-worth-daily"] });
      setQuery("");
      setResults(null);
      setPicked(null);
      setQuantity("");
      setBroker("");
    },
    onError: (err) => setFormError(err.message),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setFormError(null);
    search.mutate(q);
  }

  function handleAdd() {
    if (!picked) {
      setFormError("Pick one of the results first.");
      return;
    }
    const value = parseQuantity(quantity);
    if (value == null) {
      setFormError(`${copy.quantity} must be a number above zero.`);
      return;
    }
    setFormError(null);
    add.mutate({ candidate: picked, quantity: value });
  }

  return (
    <div className="mb-6 rounded-2xl border bg-card card-ring">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 p-5 text-left"
        aria-expanded={open}
      >
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Plus className="size-4 text-primary" />
          {copy.title}
        </h2>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 px-5 pb-5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <label className="sr-only" htmlFor={`${kind}-search`}>
              Search
            </label>
            <input
              id={`${kind}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.placeholder}
              maxLength={50}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <button
              type="submit"
              disabled={search.isPending || !query.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {search.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Search
            </button>
          </form>

          {results && results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing found. Try the ISIN or a shorter name.
            </p>
          )}

          {results && results.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-xs text-muted-foreground">Pick the right one</legend>
              <div className="divide-y rounded-lg border">
                {results.map((r) => (
                  <label
                    key={r.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm has-[:checked]:bg-primary/10"
                  >
                    <input
                      type="radio"
                      name={`${kind}-pick`}
                      checked={picked?.id === r.id}
                      onChange={() => setPicked(r)}
                      className="accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.symbol}
                        {r.detail ? ` · ${r.detail}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {picked && (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label
                  className="mb-1 block text-xs text-muted-foreground"
                  htmlFor={`${kind}-quantity`}
                >
                  {copy.quantity}
                </label>
                <input
                  id={`${kind}-quantity`}
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
                />
              </div>
              {kind === "stock" && (
                <div>
                  <label
                    className="mb-1 block text-xs text-muted-foreground"
                    htmlFor="stock-broker"
                  >
                    Broker (optional)
                  </label>
                  <input
                    id="stock-broker"
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                    maxLength={40}
                    placeholder="e.g. Degiro"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-base focus:ring-2 focus:ring-ring focus:outline-none"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={add.isPending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {add.isPending && <Loader2 className="size-4 animate-spin" />}
                Add
              </button>
            </div>
          )}

          {formError && (
            <p role="alert" className="text-sm text-negative">
              {formError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
