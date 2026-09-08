import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Landmark,
  Loader2,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/integrations/supabase/client";
import { AccountBadge } from "@/components/bank-badge";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Finance Dashboard" },
      {
        name: "description",
        content: "Your bank accounts and fixed-term deposits.",
      },
      { property: "og:title", content: "Accounts — Finance Dashboard" },
      {
        property: "og:description",
        content: "Your bank accounts and fixed-term deposits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

interface BankAccountRow {
  uid: string;
  label: string | null;
  iban: string | null;
  currency: string;
  snapshot_date: string | null;
  amount: number | null;
  amount_eur: number | null;
}

interface CdRow {
  id: string;
  label: string;
  bank_label: string | null;
  currency: string;
  principal: number;
  annual_rate: number;
  start_date: string;
  maturity_date: string;
  is_matured: boolean;
  current_value_native: number;
  current_value_eur: number;
}

async function fetchBankAccounts(): Promise<Array<BankAccountRow>> {
  const { data, error } = await getSupabase()
    .from("v_bank_accounts_latest")
    .select("uid,label,iban,currency,snapshot_date,amount,amount_eur")
    .order("amount_eur", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<BankAccountRow>;
}

async function fetchCds(): Promise<Array<CdRow>> {
  const { data, error } = await getSupabase()
    .from("v_cd_holdings")
    .select(
      "id,label,bank_label,currency,principal,annual_rate,start_date,maturity_date,is_matured,current_value_native,current_value_eur",
    )
    .order("maturity_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<CdRow>;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AccountsPage() {
  const queryClient = useQueryClient();
  const bankQuery = useQuery({
    queryKey: ["bank-accounts-latest"],
    queryFn: fetchBankAccounts,
  });
  const cdQuery = useQuery({ queryKey: ["cd-holdings"], queryFn: fetchCds });

  const bankAccounts = bankQuery.data ?? [];
  const cds = cdQuery.data ?? [];

  const totalBankEur = useMemo(
    () => bankAccounts.reduce((sum, a) => sum + (a.amount_eur ?? 0), 0),
    [bankAccounts],
  );
  const totalCdEur = useMemo(
    () => cds.reduce((sum, c) => sum + (c.current_value_eur ?? 0), 0),
    [cds],
  );

  // Add-CD form state
  const [label, setLabel] = useState("");
  const [bankLabel, setBankLabel] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [principal, setPrincipal] = useState("");
  const [annualRatePct, setAnnualRatePct] = useState("");
  const [startDate, setStartDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [maturityDate, setMaturityDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addCd = useMutation({
    mutationFn: async (input: {
      label: string;
      bank_label: string | null;
      currency: string;
      principal: number;
      annual_rate: number;
      start_date: string;
      maturity_date: string;
    }) => {
      const supabase = getSupabase();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Not signed in");
      const { error } = await supabase
        .from("cd_holdings")
        .insert({ ...input, user_id: userData.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate of deposit added");
      setLabel("");
      setBankLabel("");
      setPrincipal("");
      setAnnualRatePct("");
      setMaturityDate("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["cd-holdings"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to add CD");
    },
  });

  const deleteCd = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("cd_holdings").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["cd-holdings"] });
      const previous = queryClient.getQueryData<Array<CdRow>>(["cd-holdings"]);
      queryClient.setQueryData<Array<CdRow>>(["cd-holdings"], (old) =>
        old?.filter((c) => c.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["cd-holdings"], ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to delete CD");
    },
    onSuccess: () => toast.success("Certificate of deposit removed"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["cd-holdings"] }),
  });

  function handleAddCd(e: React.FormEvent) {
    e.preventDefault();
    const principalNum = parseFloat(principal);
    const ratePctNum = parseFloat(annualRatePct);
    if (!label.trim()) {
      setFormError("Give it a name, e.g. \"House deposit CD\".");
      return;
    }
    if (!Number.isFinite(principalNum) || principalNum <= 0) {
      setFormError("Principal must be a positive number.");
      return;
    }
    if (!Number.isFinite(ratePctNum) || ratePctNum < 0) {
      setFormError("Annual rate (APY) must be zero or more.");
      return;
    }
    if (!maturityDate || maturityDate <= startDate) {
      setFormError("Maturity date must be after the start date.");
      return;
    }
    setFormError(null);
    addCd.mutate({
      label: label.trim(),
      bank_label: bankLabel.trim() || null,
      currency,
      principal: principalNum,
      annual_rate: ratePctNum / 100,
      start_date: startDate,
      maturity_date: maturityDate,
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Accounts
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your bank accounts and fixed-term deposits.
        </p>
      </header>

      {/* Bank accounts */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Landmark className="size-4 text-primary" />
            Bank accounts
          </h2>
          {!bankQuery.isPending && (
            <span className="font-figure text-sm font-medium text-foreground">
              {formatEur(totalBankEur)}
            </span>
          )}
        </div>

        {bankQuery.isError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
          >
            Couldn't load bank accounts: {bankQuery.error.message}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border bg-card card-ring">
          {bankQuery.isPending ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : bankAccounts.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No bank accounts found yet.
            </div>
          ) : (
            <ul className="divide-y">
              {bankAccounts.map((a) => {
                const percent =
                  totalBankEur > 0 ? ((a.amount_eur ?? 0) / totalBankEur) * 100 : 0;
                return (
                  <li
                    key={a.uid}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <AccountBadge label={a.label ?? "Bank account"} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {a.label ?? "Bank account"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.iban ?? a.currency}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-figure text-sm font-medium text-foreground">
                        {formatMoney(a.amount ?? 0, a.currency)}
                      </div>
                      {a.currency !== "EUR" && (
                        <div className="font-figure text-xs text-muted-foreground">
                          {formatEur(a.amount_eur ?? 0)} · {percent.toFixed(1)}%
                        </div>
                      )}
                      {a.currency === "EUR" && (
                        <div className="text-xs text-muted-foreground">
                          {percent.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Certificates of deposit */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lock className="size-4 text-primary" />
            Certificates of deposit
          </h2>
          {!cdQuery.isPending && cds.length > 0 && (
            <span className="font-figure text-sm font-medium text-foreground">
              {formatEur(totalCdEur)}
            </span>
          )}
        </div>

        {/* Add CD form */}
        <form
          onSubmit={handleAddCd}
          className="mb-4 rounded-2xl border bg-card p-5 card-ring"
        >
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Add a certificate of deposit
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">
                Name
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. House deposit CD"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Bank (optional)
              </label>
              <input
                type="text"
                value={bankLabel}
                onChange={(e) => setBankLabel(e.target.value)}
                placeholder="Fineco"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Principal
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                placeholder="10000"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                APY %
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={annualRatePct}
                onChange={(e) => setAnnualRatePct(e.target.value)}
                placeholder="3.5"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Maturity date
              </label>
              <input
                type="date"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={addCd.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {addCd.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add CD
            </button>
            {formError && <p className="text-sm text-negative">{formError}</p>}
          </div>
        </form>

        {cdQuery.isError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
          >
            Couldn't load CDs: {cdQuery.error.message}
          </div>
        )}

        {!cdQuery.isPending && cds.length === 0 && !cdQuery.isError && (
          <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center text-sm text-muted-foreground">
            No certificates of deposit yet — add one above when you open one.
          </div>
        )}

        {cds.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {cds.map((cd) => {
              const progressPct = Math.min(
                100,
                Math.max(
                  0,
                  ((new Date().getTime() - new Date(cd.start_date).getTime()) /
                    (new Date(cd.maturity_date).getTime() -
                      new Date(cd.start_date).getTime())) *
                    100,
                ),
              );
              return (
                <div
                  key={cd.id}
                  className="rounded-2xl border bg-card p-5 card-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-foreground">
                        {cd.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {cd.bank_label ? `${cd.bank_label} · ` : ""}
                        {(cd.annual_rate * 100).toFixed(2)}% APY
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteCd.mutate(cd.id)}
                      disabled={deleteCd.isPending}
                      aria-label={`Remove ${cd.label}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-negative/10 hover:text-negative disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-3 font-figure text-2xl font-semibold text-foreground">
                    {formatMoney(cd.current_value_native, cd.currency)}
                  </div>
                  {cd.currency !== "EUR" && (
                    <div className="font-figure text-xs text-muted-foreground">
                      {formatEur(cd.current_value_eur)}
                    </div>
                  )}

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${cd.is_matured ? "bg-positive" : "bg-primary"}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {cd.is_matured
                      ? `Matured ${formatDate(cd.maturity_date)}`
                      : `Matures ${formatDate(cd.maturity_date)}`}
                    {" · "}
                    principal {formatMoney(cd.principal, cd.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
