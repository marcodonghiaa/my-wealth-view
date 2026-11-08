import type { GroupSummary } from "@/lib/import/splitwise-balances";
import { money } from "@/lib/splits";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Per Splitwise group: who owes me and whom I owe, from my last import. */
export function BalancesView({ groups }: { groups: Array<GroupSummary> }) {
  if (groups.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl bg-card px-4 text-center text-sm text-muted-foreground">
        Import a Splitwise file to see who owes you there.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.group} className="overflow-hidden rounded-2xl bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold">{g.group}</h3>
            <span className="text-xs text-muted-foreground">as of {day(g.updatedAt)}</span>
          </div>
          {g.people.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">You're all square.</p>
          ) : (
            <ul className="divide-y">
              {g.people.map((p) => (
                <li
                  key={p.person}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"
                >
                  <span className="font-medium">{p.person}</span>
                  <span className={p.owesYou ? "text-positive" : "text-muted-foreground"}>
                    {p.owesYou ? "owes you" : "you owe"}{" "}
                    <span className="font-figure">{money(Math.abs(p.balance), g.currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Worked out expense by expense, without Splitwise's "simplify debts": per person it can
        differ from the Splitwise app, your total is the same.
      </p>
    </div>
  );
}
