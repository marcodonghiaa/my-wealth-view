import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronDown, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MaskedIban } from "@/components/masked-iban";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { assertHttpsUrl } from "@/lib/consent-url";
import {
  COUNTRIES,
  linkErrorMessage,
  linkedMessage,
  pendingLink,
  renewTarget,
} from "@/lib/bank-link";
import { functionErrorMessage } from "@/lib/function-error";
import { consentAlerts, type ConsentAlert } from "@/lib/consent-expiry";
import { asOf, formatISODate } from "@/lib/date";
import { AccountBadge, accountName, bankOf } from "@/components/bank-badge";
import { formatEur, formatMoney } from "@/lib/transactions";
import { HeadlineFigure } from "@/components/headline-figure";
import { AccountMenu, AddDebt, type MenuAccount } from "@/components/accounts/account-menu";
import { accountTypeLabel, debtEur, isDebt } from "@/lib/account-types";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Alopex" },
      {
        name: "description",
        content: "Your bank accounts and debts.",
      },
      { property: "og:title", content: "Accounts — Alopex" },
      {
        property: "og:description",
        content: "Your bank accounts and debts.",
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
  consent_valid_until: string | null;
  // Absent on a database without the bank columns yet, null until the bank is renewed.
  bank_name?: string | null;
  bank_logo?: string | null;
  bank_country?: string | null;
  // Absent before the account types migration; null = unknown, counted as checking.
  account_type?: string | null;
  manual?: boolean | null;
}

interface BankGroup {
  bank: string;
  main: BankAccountRow;
  subAccounts: Array<BankAccountRow>;
  subtotalEur: number;
}

async function fetchBankAccounts(): Promise<Array<BankAccountRow>> {
  const { data, error } = await supabase
    .from("v_bank_accounts_latest")
    // "*" rather than a column list, so the page still loads on a database without bank_name/bank_logo.
    .select("*")
    .order("amount_eur", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<BankAccountRow>;
}

const menuAccount = (a: BankAccountRow): MenuAccount => ({
  uid: a.uid,
  name: accountName(a),
  account_type: a.account_type,
  manual: a.manual,
  amount: a.amount,
});

function consentMessage({ bank, daysLeft }: ConsentAlert): string {
  if (daysLeft < 0) return `Bank access to ${bank} has expired, so it no longer syncs.`;
  if (daysLeft === 0) return `Bank access to ${bank} ends today.`;
  return `Bank access to ${bank} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`;
}

function AccountsPage() {
  const queryClient = useQueryClient();
  const bankQuery = useQuery({
    queryKey: ["bank-accounts-latest"],
    queryFn: fetchBankAccounts,
  });

  // Landed here from the bank-consent-callback redirect after connecting a bank. The redirect
  // only carries the bank's one-time code: the link is finished here, signed in, so the accounts
  // go to whoever started it and nobody else.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const showResult = (result: URLSearchParams) => {
      const linked = linkedMessage(result);
      const error = linkErrorMessage(result);
      if (linked) {
        toast.success(linked);
        void queryClient.invalidateQueries({ queryKey: ["bank-accounts-latest"] });
        // A new account's balance comes from its first sync, which runs a few seconds behind.
        setTimeout(
          () => void queryClient.invalidateQueries({ queryKey: ["bank-accounts-latest"] }),
          20_000,
        );
      } else if (error) {
        toast.error("Couldn't connect bank", { description: error });
      }
    };
    const pending =
      pendingLink(new URLSearchParams(window.location.hash.slice(1))) ?? pendingLink(params);
    if (pending) {
      // Off the address bar before the call: a reload must not spend the code twice.
      window.history.replaceState(null, "", window.location.pathname);
      const toastId = toast.loading("Connecting your bank…");
      void supabase.functions
        .invoke<Record<string, string>>("complete-bank-consent", { body: pending })
        .then(async ({ data, error }) => {
          toast.dismiss(toastId);
          if (error) {
            const message = await functionErrorMessage(
              error,
              "Couldn't link the bank, please try again",
            );
            showResult(new URLSearchParams({ bank_link_error: message }));
          } else showResult(new URLSearchParams(data ?? {}));
        });
      return;
    }
    showResult(params);
    if (linkedMessage(params) || linkErrorMessage(params)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bankAccounts = useMemo(() => bankQuery.data ?? [], [bankQuery.data]);
  const expiring = useMemo(() => consentAlerts(bankAccounts, new Date()), [bankAccounts]);

  // Credit cards and loans get their own group; everything else is cash, as before.
  const cashAccounts = useMemo(
    () => bankAccounts.filter((a) => !isDebt(a.account_type)),
    [bankAccounts],
  );
  const debts = useMemo(() => bankAccounts.filter((a) => isDebt(a.account_type)), [bankAccounts]);
  const totalBankEur = useMemo(
    () => cashAccounts.reduce((sum, a) => sum + (a.amount_eur ?? 0), 0),
    [cashAccounts],
  );
  const totalDebtEur = useMemo(
    () => debts.reduce((sum, a) => sum + debtEur(a.amount_eur), 0),
    [debts],
  );

  const bankGroups = useMemo<Array<BankGroup>>(() => {
    const byBank = new Map<string, Array<BankAccountRow>>();
    for (const a of cashAccounts) {
      const bank = bankOf(a);
      const list = byBank.get(bank) ?? [];
      list.push(a);
      byBank.set(bank, list);
    }
    return Array.from(byBank.entries())
      .map(([bank, accountsForBank]) => {
        const eurAccount = accountsForBank.find((a) => a.currency === "EUR");
        // Fall back to the largest-balance account if a bank somehow has no
        // EUR account — shouldn't happen for Revolut/Wise/Fineco today, but
        // keeps the grouping from silently dropping accounts if it ever does.
        const main =
          eurAccount ??
          // accountsForBank always has >=1 entry -- it's only ever created via
          // list.push(a) before byBank.set(bank, list), never empty.
          [...accountsForBank].sort(
            (a, b) => Math.abs(b.amount_eur ?? 0) - Math.abs(a.amount_eur ?? 0),
          )[0]!;
        const subAccounts = accountsForBank
          .filter((a) => a.uid !== main.uid && (a.amount ?? 0) !== 0)
          .sort((a, b) => (b.amount_eur ?? 0) - (a.amount_eur ?? 0));
        const subtotalEur =
          (main.amount_eur ?? 0) + subAccounts.reduce((sum, a) => sum + (a.amount_eur ?? 0), 0);
        return { bank, main, subAccounts, subtotalEur };
      })
      .sort((a, b) => b.subtotalEur - a.subtotalEur);
  }, [cashAccounts]);

  // Connect-a-bank form state
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankCountry, setBankCountry] = useState("IT");
  const [connectError, setConnectError] = useState<string | null>(null);
  const connectStepsRef = useRef<HTMLOListElement>(null);

  // Only fetched once the form is actually open, and cached per country so
  // switching back to a country already loaded doesn't re-hit the function.
  const banksQuery = useQuery({
    queryKey: ["enable-banking-banks", bankCountry],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        banks?: Array<{ name: string; logo: string | null }>;
        error?: string;
      }>("list-banks", { body: { country: bankCountry } });
      if (error)
        throw new Error(await functionErrorMessage(error, "Couldn't load banks for this country."));
      if (!data?.banks) throw new Error(data?.error ?? "No bank list returned");
      return data.banks;
    },
    enabled: showConnectForm,
    staleTime: 10 * 60_000,
  });
  const banks = banksQuery.data ?? [];

  const connectBank = useMutation({
    mutationFn: async (input: { bankName: string; country: string }) => {
      const { data, error } = await supabase.functions.invoke<{
        url?: string;
        error?: string;
      }>("start-bank-consent", { body: input });
      if (error)
        throw new Error(await functionErrorMessage(error, "Couldn't start bank connection"));
      if (!data?.url) throw new Error(data?.error ?? "No consent URL returned");
      return assertHttpsUrl(data.url);
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't start bank connection");
    },
  });

  function handleConnectBank(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName) {
      setConnectError("Pick a bank first.");
      return;
    }
    setConnectError(null);
    connectBank.mutate({ bankName, country: bankCountry });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-10">
        <h1 className="text-[0.9375rem] font-medium text-muted-foreground">Accounts</h1>
        <div className="mt-1 min-h-16">
          {bankQuery.isPending ? (
            <Skeleton className="h-16 w-72" />
          ) : bankQuery.isError ? (
            <p className="figure-display text-muted-foreground">—</p>
          ) : (
            <HeadlineFigure value={totalBankEur + totalDebtEur} currency="EUR" />
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {debts.length > 0 ? "Your bank accounts and debts." : "Your bank accounts."}{" "}
          <Link to="/import" className="text-primary underline-offset-2 hover:underline">
            Import data
          </Link>
        </p>
      </header>

      {/* Bank accounts */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Bank accounts</h2>
          {!bankQuery.isPending && (
            <span className="font-figure text-sm text-foreground">{formatEur(totalBankEur)}</span>
          )}
        </div>

        {bankQuery.isError && (
          <Alert className="mb-4">Couldn't load bank accounts: {bankQuery.error.message}</Alert>
        )}

        {/* Renewing is linking the bank again, so the button opens Connect a bank below. */}
        {expiring.map((alert) => (
          <div
            key={alert.bank}
            role="status"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning/10 px-4 py-3 text-sm text-foreground"
          >
            <span>{consentMessage(alert)}</span>
            <Button
              variant="ghost"
              onClick={() => {
                // Prefill without the country select's handler, which would clear the bank.
                const t = renewTarget(alert.bank, bankAccounts);
                if (t) {
                  setBankCountry(t.country);
                  setBankName(t.bankName);
                } else {
                  setBankName(""); // never keep another bank from an earlier Renew
                }
                flushSync(() => setShowConnectForm(true));
                connectStepsRef.current?.scrollIntoView({ block: "center" });
                connectStepsRef.current?.focus({ preventScroll: true });
              }}
              className="px-3 text-primary hover:bg-primary/10 hover:text-primary"
            >
              Renew access
            </Button>
          </div>
        ))}

        {/* Connect a bank — collapsed by default. */}
        <form onSubmit={handleConnectBank} className="mb-4 rounded-lg bg-card">
          <button
            type="button"
            onClick={() => setShowConnectForm((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-3 p-5 text-left"
            aria-expanded={showConnectForm}
          >
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Link2 className="size-4 text-primary" />
              Connect a bank
            </h3>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${showConnectForm ? "rotate-180" : ""}`}
            />
          </button>
          {showConnectForm && (
            <div className="px-5 pb-5">
              <ol
                ref={connectStepsRef}
                tabIndex={-1}
                className="mb-4 list-decimal space-y-2 pl-5 text-sm text-foreground focus:outline-none"
              >
                <li>
                  <a
                    href="https://enablebanking.com/cp/applications"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    Approve in Enable Banking <span aria-hidden="true">↗</span>
                    <span className="sr-only">(opens in new tab)</span>
                  </a>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Once per bank: in your app, use Link accounts and pick this bank. Already done?
                    Skip.
                  </p>
                </li>
                <li>Pick the bank below, then Approve here and sign in with your bank.</li>
              </ol>
              <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                <div>
                  <label htmlFor="acc-country" className="mb-1 block text-xs text-muted-foreground">
                    Country
                  </label>
                  <Select
                    id="acc-country"
                    value={bankCountry}
                    onChange={(e) => {
                      setBankCountry(e.target.value);
                      setBankName("");
                    }}
                    className="sm:w-28"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="acc-bank" className="mb-1 block text-xs text-muted-foreground">
                    Bank
                  </label>
                  <Select
                    id="acc-bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    disabled={banksQuery.isPending || banksQuery.isError}
                  >
                    <option value="">
                      {banksQuery.isPending ? "Loading banks…" : "Select a bank…"}
                    </option>
                    {banks.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                  {banksQuery.isError && (
                    <p className="mt-1 break-words text-xs text-negative">
                      {banksQuery.error.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={connectBank.isPending || !banks.some((b) => b.name === bankName)}
                >
                  {connectBank.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link2 className="size-4" />
                  )}
                  {connectBank.isPending ? "Connecting…" : "Approve here"}
                </Button>
                {connectError && <p className="text-sm text-negative">{connectError}</p>}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">You sign in on your bank's site.</p>
            </div>
          )}
        </form>
        {/* No debts yet: adding one starts the Debts group. */}
        {!bankQuery.isPending && debts.length === 0 && (
          <div className="-mt-2 mb-2 flex justify-end">
            <AddDebt />
          </div>
        )}

        <div className="overflow-hidden rounded-lg bg-card">
          {bankQuery.isPending ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : bankAccounts.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No bank accounts found yet.
            </div>
          ) : (
            <ul className="divide-y">
              {bankGroups.map((group) => {
                const percent = totalBankEur > 0 ? (group.subtotalEur / totalBankEur) * 100 : 0;
                return (
                  <li key={group.bank} className="px-4 py-3 sm:px-5">
                    {/* Main (EUR) account */}
                    <div className="flex items-center gap-3">
                      <AccountBadge
                        label={group.main.label ?? group.bank}
                        bank={group.bank}
                        logo={group.main.bank_logo ?? null}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {group.bank}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {group.main.iban ? (
                            <MaskedIban iban={group.main.iban} />
                          ) : (
                            group.main.currency
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-figure text-sm text-foreground">
                          {formatEur(group.subtotalEur)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {group.main.snapshot_date
                            ? [
                                `${percent.toFixed(1)}%`,
                                asOf(group.main.snapshot_date, formatISODate(new Date())),
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : "Syncing…"}
                        </div>
                      </div>
                      <AccountMenu
                        title={group.bank}
                        accounts={[group.main, ...group.subAccounts].map(menuAccount)}
                      />
                    </div>

                    {/* Sub-accounts in other currencies */}
                    {group.subAccounts.length > 0 && (
                      <ul className="mt-2 ml-9 space-y-1.5 border-l pl-3">
                        {group.subAccounts.map((sub) => (
                          <li
                            key={sub.uid}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-xs font-medium text-muted-foreground">
                              {sub.currency}
                            </span>
                            <span className="font-figure text-foreground">
                              {formatMoney(sub.amount ?? 0, sub.currency)}
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                ({formatEur(sub.amount_eur ?? 0)})
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {debts.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Debts</h2>
            <div className="flex items-center gap-1">
              <AddDebt />
              <span className="font-figure text-sm font-medium text-foreground">
                {formatEur(totalDebtEur)}
              </span>
            </div>
          </div>
          <ul className="divide-y overflow-hidden rounded-lg bg-card">
            {debts.map((a) => {
              const bank = bankOf(a);
              return (
                <li key={a.uid} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <AccountBadge label={a.label ?? bank} bank={bank} logo={a.bank_logo ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {a.manual ? (a.label ?? bank) : bank}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[
                        accountTypeLabel(a.account_type),
                        a.snapshot_date && asOf(a.snapshot_date, formatISODate(new Date())),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-figure text-sm font-medium text-foreground">
                      {formatMoney(debtEur(a.amount), a.currency)}
                    </div>
                    {a.currency !== "EUR" && (
                      <div className="font-figure text-xs text-muted-foreground">
                        {formatEur(debtEur(a.amount_eur))}
                      </div>
                    )}
                  </div>
                  <AccountMenu title={a.label ?? bank} accounts={[menuAccount(a)]} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
