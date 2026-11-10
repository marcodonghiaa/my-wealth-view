import { ChevronDown } from "lucide-react";
import {
  money,
  owedEur,
  parseNames,
  peopleFrom,
  type SplitPerson,
  type SplitRow,
} from "@/lib/splits";
import { txId } from "@/lib/transactions";
import { Button } from "@/components/ui/button";
import { GroupedList } from "@/components/ui/grouped-list";

const eur = (value: number) => money(value, "EUR");

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

const bills = (n: number) => `${n} open ${n === 1 ? "bill" : "bills"}`;

/** Initial in a neutral circle: tells a person row from a group row at a glance. */
export function Initial({ name, size = "size-10" }: { name: string; size?: string }) {
  return (
    <span
      aria-hidden
      className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[0.9375rem] font-semibold text-muted-foreground`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Bills split on bank transactions, grouped by person: only who still owes shows, settled people
 * fold away. Open a person to see the bills and settle them.
 */
export function OwedView({
  rows,
  onToggleSettled,
  onSettleAll,
}: {
  rows: Array<SplitRow>;
  onToggleSettled: (row: SplitRow, settled: boolean) => void;
  onSettleAll: (name: string, rows: Array<SplitRow>) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No split bills yet. Split a transaction in Transactions and it shows up here.
      </p>
    );
  }
  const people = peopleFrom(rows);
  const open = people.filter((p) => p.open !== 0);
  const settled = people.filter((p) => p.open === 0);

  const card = (p: SplitPerson) => {
    const openRows = p.rows.filter((r) => !r.owed_settled);
    // A bill shared with others has one settled flag for everyone: settle it on its own.
    const alone = openRows.filter((r) => parseNames(r.owed_by).length <= 1);
    return (
      <li key={p.name}>
        <details className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-accent/40 sm:px-5 [&::-webkit-details-marker]:hidden">
            <Initial name={p.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-medium">{p.name}</span>
              <span className="block truncate text-[0.8125rem] text-muted-foreground">
                {p.open === 0
                  ? "All paid back"
                  : `${p.open > 0 ? "Owes you" : "You owe"} · ${bills(openRows.length)}`}
              </span>
            </span>
            {p.open !== 0 && (
              <span className="shrink-0 font-figure text-[0.9375rem]">{eur(Math.abs(p.open))}</span>
            )}
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0"
            />
          </summary>
          <ul className="divide-y border-t bg-muted/30">
            {p.rows.map((r) => {
              const isSettled = !!r.owed_settled;
              const names = parseNames(r.owed_by);
              const share = owedEur(r) / Math.max(1, names.length);
              const label = r.creditor_name ?? "Transaction";
              return (
                <li
                  key={txId(r)}
                  className="flex items-center gap-3 px-4 py-2 pl-[4.25rem] sm:pr-5"
                >
                  <div className={`min-w-0 flex-1 ${isSettled ? "text-muted-foreground" : ""}`}>
                    <div className="truncate text-sm">{label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {day(r.booking_date)}
                      {names.length > 1 && ` · shared with ${names.length - 1} more`}
                    </div>
                  </div>
                  <span
                    className={`font-figure text-sm ${isSettled ? "text-muted-foreground line-through" : ""}`}
                  >
                    {eur(share)}
                  </span>
                  <button
                    type="button"
                    aria-label={`${isSettled ? "Mark as not settled" : "Settle"}: ${label}, ${day(r.booking_date)}, ${eur(share)}`}
                    onClick={() => onToggleSettled(r, !isSettled)}
                    className={`min-h-11 min-w-20 shrink-0 rounded-sm px-3 text-xs font-medium transition-colors ${
                      isSettled
                        ? "text-muted-foreground hover:bg-accent"
                        : "bg-muted text-foreground hover:bg-accent"
                    }`}
                  >
                    {isSettled ? "Settled ✓" : "Settle"}
                  </button>
                </li>
              );
            })}
            {alone.length > 1 && (
              <li className="px-4 py-2 text-right sm:px-5">
                <Button
                  size="sm"
                  className="min-h-11 px-4"
                  onClick={() => onSettleAll(p.name, alone)}
                >
                  Settle all {alone.length} with {p.name}
                </Button>
              </li>
            )}
          </ul>
        </details>
      </li>
    );
  };

  return (
    <div>
      {open.length > 0 ? (
        <GroupedList>
          <ul className="divide-y divide-hairline">{open.map(card)}</ul>
        </GroupedList>
      ) : (
        <p className="rounded-lg bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nobody owes you from split bills.
        </p>
      )}
      {settled.length > 0 && (
        <details className="group/settled mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden
              className="size-4 -rotate-90 transition-transform group-open/settled:rotate-0"
            />
            Settled ({settled.length})
          </summary>
          <GroupedList className="mt-2">
            <ul className="divide-y divide-hairline">{settled.map(card)}</ul>
          </GroupedList>
        </details>
      )}
    </div>
  );
}
