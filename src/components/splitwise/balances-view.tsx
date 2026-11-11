import { dateLocale } from "@/lib/locale";
import { ChevronDown, Users } from "lucide-react";
import { useId, useState } from "react";
import type { GroupSummary } from "@/lib/import/splitwise-balances";
import { money } from "@/lib/splits";
import { Initial } from "./owed-view";
import { GroupedList } from "@/components/ui/grouped-list";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

function GroupCard({ g, defaultOpen }: { g: GroupSummary; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const square = g.people.length === 0;
  const meta = g.stale
    ? "Import again to see who owes you here"
    : `${square ? "All square" : people(g.people.length)} · as of ${day(g.updatedAt)}`;
  const header = (
    <>
      <span
        aria-hidden
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Users className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[0.9375rem] font-medium">{g.group}</span>
        <span className="block truncate text-[0.8125rem] font-normal text-muted-foreground">
          {meta}
        </span>
      </span>
      {g.myBalance !== 0 && (
        <span className="shrink-0 text-right">
          <span className="block font-figure text-[0.9375rem]">
            {money(Math.abs(g.myBalance), g.currency)}
          </span>
          <span className="block text-xs font-normal text-muted-foreground">
            {g.myBalance > 0 ? "owed to you" : "you owe"}
          </span>
        </span>
      )}
    </>
  );

  return (
    <GroupedList>
      <h3>
        {square ? (
          <div className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5">{header}</div>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen(!open)}
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 hover:bg-accent/40 sm:px-5"
          >
            {header}
            <ChevronDown
              aria-hidden
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
            />
          </button>
        )}
      </h3>
      {!square && open && (
        <ul id={id} className="divide-y divide-hairline bg-muted/30">
          {g.people.map((p) => (
            <li key={p.person} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <Initial name={p.person} size="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.person}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.owesYou ? "owes you" : "you owe"}
                </span>
              </span>
              <span className="shrink-0 font-figure text-sm">
                {money(Math.abs(p.balance), g.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GroupedList>
  );
}

/** One card per Splitwise group: the group's net up top, open it to see who owes whom. */
export function BalancesView({ groups }: { groups: Array<GroupSummary> }) {
  if (groups.length === 0) {
    return (
      <p className="rounded-lg bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Import a Splitwise export to see your group balances.
      </p>
    );
  }
  // Groups with money still open first; a lone group opens by itself.
  const done = (g: GroupSummary) => Number(g.people.length === 0 && !g.stale);
  const sorted = [...groups].sort((a, b) => done(a) - done(b));
  return (
    <div className="space-y-3">
      {sorted.map((g) => (
        <GroupCard key={g.group} g={g} defaultOpen={groups.length === 1} />
      ))}
      <p className="px-1 text-xs text-muted-foreground">
        Per person this can differ from the Splitwise app, which simplifies debts. Your total is the
        same.
      </p>
    </div>
  );
}
