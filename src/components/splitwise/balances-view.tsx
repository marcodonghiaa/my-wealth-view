import type { GroupSummary } from "@/lib/import/splitwise-balances";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(value);

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function BalancesView({ groups }: { groups: Array<GroupSummary> }) {
  if (groups.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border bg-card px-4 text-center text-sm text-muted-foreground card-ring">
        Import a Splitwise file below to see who owes what.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.group} className="overflow-hidden rounded-2xl border bg-card card-ring">
          <div className="border-b px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{g.group}</h2>
              <span className="text-xs text-muted-foreground">as of {day(g.updatedAt)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {g.myBalance >= 0 ? "The group owes you" : "You owe the group"}
            </p>
            <p className="font-figure text-3xl font-bold tracking-tight">
              {money(Math.abs(g.myBalance), g.currency)}
            </p>
            {g.myBalanceEur !== null && g.currency !== "EUR" && (
              <p className="text-xs text-muted-foreground">
                about {money(Math.abs(g.myBalanceEur), "EUR")}
              </p>
            )}
          </div>
          <ul className="divide-y">
            {g.people.map((p) => (
              <li
                key={p.person}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"
              >
                <span className="font-medium">{p.person}</span>
                <span className="text-right">
                  <span className="font-figure">{money(Math.abs(p.balance), g.currency)}</span>{" "}
                  <span className={p.owesYou ? "text-positive" : "text-muted-foreground"}>
                    {p.owesYou ? "owes the group" : "is owed"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        These are each person's total balance in the group, as of your last import. Splitwise
        simplifies debts, so this shows who is ahead or behind, not who pays whom: for that, open
        Splitwise.
      </p>
    </div>
  );
}

/** One line under the net worth headline: friends' credit, kept out of the main total. */
export function FriendsCreditLine({
  creditEur,
  netWorthEur,
  format,
}: {
  creditEur: number | null;
  netWorthEur: number | null;
  format: (eurValue: number) => string;
}) {
  if (creditEur === null) return null;
  const owed = creditEur >= 0;
  return (
    <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
      <p>
        {owed ? "Friends owe you" : "You owe your groups"}{" "}
        <span className="font-figure text-foreground">{format(Math.abs(creditEur))}</span>
      </p>
      <p>
        On Splitwise, not counted above
        {netWorthEur !== null && (
          <>
            {" · "}with it{" "}
            <span className="font-figure text-foreground">{format(netWorthEur + creditEur)}</span>
          </>
        )}
      </p>
    </div>
  );
}
