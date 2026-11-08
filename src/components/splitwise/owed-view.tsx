import { money, NO_NAME, owedEur, parseNames, type SplitRow } from "@/lib/splits";
import { txId } from "@/lib/transactions";

const eur = (value: number) => money(value, "EUR");

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

/** Splits grouped by person: what each still owes, open to see the bills and settle them. */
export function OwedView({
  rows,
  onToggleSettled,
}: {
  rows: Array<SplitRow>;
  onToggleSettled: (row: SplitRow, settled: boolean) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl bg-card px-4 text-center text-sm text-muted-foreground">
        No splits yet. Split a transaction from Transactions and it shows up here.
      </div>
    );
  }
  const people = new Map<string, { name: string; rows: Array<SplitRow> }>();
  for (const r of rows) {
    const names = parseNames(r.owed_by);
    for (const name of names.length ? names : [NO_NAME]) {
      const key = name.toLowerCase();
      const p = people.get(key) ?? { name, rows: [] };
      p.rows.push(r);
      people.set(key, p);
    }
  }
  const sorted = [...people.values()]
    .map((p) => ({
      ...p,
      open: p.rows
        .filter((r) => !r.owed_settled)
        .reduce((sum, r) => sum + owedEur(r) / Math.max(1, parseNames(r.owed_by).length), 0),
    }))
    .sort((a, b) => b.open - a.open);

  return (
    <section className="divide-y overflow-hidden rounded-2xl bg-card">
      {sorted.map((p) => {
        const open = p.rows.filter((r) => !r.owed_settled);
        return (
          <details key={p.name} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
              <span className="font-medium">{p.name}</span>
              <span className={p.open > 0 ? "text-positive" : "text-muted-foreground"}>
                {p.open > 0 ? (
                  <>
                    owes you <span className="font-figure">{eur(p.open)}</span>
                  </>
                ) : (
                  "settled"
                )}
                <span className="ml-2 inline-block text-muted-foreground transition-transform group-open:rotate-90">
                  ›
                </span>
              </span>
            </summary>
            <ul className="divide-y border-t bg-background/40">
              {p.rows.map((r) => {
                const settled = !!r.owed_settled;
                const shared = parseNames(r.owed_by).length > 1;
                return (
                  <li key={txId(r)} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <div className={`min-w-0 flex-1 ${settled ? "text-muted-foreground" : ""}`}>
                      <div className="truncate">{r.creditor_name ?? "Transaction"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {day(r.booking_date)}
                        {shared && ` · with ${parseNames(r.owed_by).join(", ")}`}
                      </div>
                    </div>
                    <span
                      className={`font-figure ${settled ? "text-muted-foreground line-through" : ""}`}
                    >
                      {eur(owedEur(r) / Math.max(1, parseNames(r.owed_by).length))}
                    </span>
                    <button
                      type="button"
                      aria-pressed={settled}
                      onClick={() => onToggleSettled(r, !settled)}
                      className={`min-h-9 shrink-0 rounded-full border px-3 text-xs transition-colors ${
                        settled
                          ? "border-positive/30 bg-positive/10 text-positive"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {settled ? "Settled" : "Settle"}
                    </button>
                  </li>
                );
              })}
              {open.length > 1 && (
                <li className="px-4 py-2.5 text-right sm:px-5">
                  <button
                    type="button"
                    onClick={() => open.forEach((r) => onToggleSettled(r, true))}
                    className="min-h-9 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
                  >
                    Settle all with {p.name}
                  </button>
                </li>
              )}
            </ul>
          </details>
        );
      })}
    </section>
  );
}
