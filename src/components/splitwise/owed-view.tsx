import { NO_NAME, owedByPerson, owedEur, parseNames, type SplitRow } from "@/lib/splits";
import { txId } from "@/lib/transactions";

const money = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

/** Splits made on bank transactions: who still owes you what, and a toggle for settled. */
export function OwedView({
  rows,
  onToggleSettled,
}: {
  rows: Array<SplitRow>;
  onToggleSettled: (row: SplitRow, settled: boolean) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl bg-card px-4 text-center text-sm text-muted-foreground">
        No splits yet. Split a transaction from Transactions and it shows up here.
      </div>
    );
  }
  const people = owedByPerson(rows);
  const open = people.reduce((sum, p) => sum + p.owed, 0);
  return (
    <section className="overflow-hidden rounded-2xl bg-card">
      <div className="border-b px-4 py-4 sm:px-5">
        <p className="text-xs text-muted-foreground">Still owed to you</p>
        <p className="font-figure text-3xl font-bold tracking-tight">{money(open)}</p>
        {people.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {people.map((p) => (
              <li key={p.name} className="rounded-full border px-3 py-1 text-sm">
                <span className="font-medium">{p.name}</span>{" "}
                <span className="font-figure text-muted-foreground">{money(p.owed)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ul className="divide-y">
        {rows.map((r) => {
          const settled = !!r.owed_settled;
          return (
            <li key={txId(r)} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
              <div className={`min-w-0 flex-1 ${settled ? "text-muted-foreground" : ""}`}>
                <div className="truncate font-medium">{r.creditor_name ?? "Transaction"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {day(r.booking_date)} · {parseNames(r.owed_by).join(", ") || NO_NAME}
                </div>
              </div>
              <span
                className={`font-figure ${settled ? "text-muted-foreground line-through" : ""}`}
              >
                {money(owedEur(r))}
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
      </ul>
    </section>
  );
}
