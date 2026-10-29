import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PushSubscribeButton } from "@/components/push-subscribe";
import { attentionCount, type HealthRow, type HealthState } from "@/lib/health";
import { useHealth } from "./use-health";

const DOT: Record<HealthState, string> = {
  ok: "bg-positive",
  warn: "bg-warning",
  bad: "bg-negative",
};
const STATE_LABEL: Record<HealthState, string> = {
  ok: "Healthy",
  warn: "Needs attention",
  bad: "Broken",
};

function HealthRowItem({ row, onPushed }: { row: HealthRow; onPushed: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          role="img"
          aria-label={STATE_LABEL[row.state]}
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[row.state]}`}
        />
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-medium text-foreground">{row.title}</p>
          <p className="max-w-xl text-sm text-muted-foreground">{row.detail}</p>
        </div>
      </div>
      {row.fix && "push" in row.fix && <PushSubscribeButton onSubscribed={onPushed} />}
      {row.fix && "to" in row.fix && (
        <Link
          to={row.fix.to}
          className="min-h-11 content-center rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/10"
        >
          {row.fix.label}
        </Link>
      )}
    </li>
  );
}

function RowList({ rows }: { rows: Array<HealthRow> }) {
  const queryClient = useQueryClient();
  return (
    <ul className="divide-y rounded-2xl border bg-card px-5 card-ring">
      {rows.map((row) => (
        <HealthRowItem
          key={row.id}
          row={row}
          onPushed={() => void queryClient.invalidateQueries({ queryKey: ["push-subscribed"] })}
        />
      ))}
    </ul>
  );
}

/** Bank access and sync checks, worst first. Push lives under Notifications. */
export function HealthSection() {
  const { accounts, rows } = useHealth();
  const attention = attentionCount(rows);

  return (
    <section id="health" aria-labelledby="health-heading" className="scroll-mt-6">
      <h2 id="health-heading" className="text-[0.9375rem] font-medium text-muted-foreground">
        Health
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Everything here can fail without an error message. Worst first.
        {!accounts.isPending && !accounts.isError && (
          <>
            {" "}
            <span className="font-medium text-foreground">
              {attention} need{attention === 1 ? "s" : ""} attention.
            </span>
          </>
        )}
      </p>

      {accounts.isError && (
        <div
          role="alert"
          className="mb-4 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load your accounts: {accounts.error.message}
        </div>
      )}

      {rows.length > 0 && <RowList rows={rows} />}
      {!accounts.isPending && !accounts.isError && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing to check yet. Connect a bank first.</p>
      )}
    </section>
  );
}

/** The push enable row and its install hint. Renders nothing where push can't work. */
export function NotificationsSection() {
  const { push } = useHealth();
  if (!push) return null;
  return (
    <section id="notifications" aria-labelledby="notifications-heading" className="scroll-mt-6">
      <h2
        id="notifications-heading"
        className="mb-4 text-[0.9375rem] font-medium text-muted-foreground"
      >
        Notifications
      </h2>
      <RowList rows={[push]} />
    </section>
  );
}
