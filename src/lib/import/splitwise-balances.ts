import { isPaymentRow, type SplitwiseFile } from "./splitwise-parse";
import type { RpcClient } from "./splitwise-commit";

export interface FileBalances {
  currency: string;
  entries: Array<{ person: string; cents: number; isMe: boolean }>;
  /** Rows in another currency than the totals: left out of the per-person amounts. */
  skippedRows: number;
}

/**
 * How stored balances read. 'group': each member's net toward the group (rows saved before
 * per-person amounts; only my own row can be trusted). 'pairwise': what I owe each member.
 */
export type BalanceBasis = "group" | "pairwise";

/**
 * One stored balance. My row: what the group owes me overall. Anyone else's row: what I owe that
 * person (negative: they owe me), worked out expense by expense, without Splitwise's debt
 * simplification.
 */
export interface BalanceRow {
  group_name: string;
  person: string;
  balance: number;
  currency: string;
  is_me: boolean;
  updated_at: string;
  basis: BalanceBasis;
}

// One row's share between me and each other member, in (fractional) cents: when I'm owed on the
// row, those who owe on it pay me in proportion; when I owe, I pay those who are owed in proportion.
function addRow(out: Array<number>, netCents: Array<number>, me: number) {
  const mine = netCents[me] ?? 0;
  const owed = netCents.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (mine === 0 || owed === 0) return;
  netCents.forEach((n, i) => {
    if (i !== me && Math.sign(n) === -Math.sign(mine)) out[i]! += (n * Math.abs(mine)) / owed;
  });
}

// Moves `amount` off member i onto the others on the given side (sign), in proportion, so the
// total doesn't change: used when a payment was really made on someone else's behalf.
function passOn(d: Array<number>, i: number, me: number, amount: number) {
  const side = Math.sign(d[i]!);
  const others = d.map((v, j) => (j !== i && j !== me && Math.sign(v) === -side ? Math.abs(v) : 0));
  const pool = others.reduce((a, b) => a + b, 0);
  const take = Math.min(amount, pool);
  if (take <= 0) return;
  others.forEach((v, j) => {
    if (v) d[j]! += (side * take * v) / pool;
  });
  d[i]! -= side * take;
}

/**
 * What I owe each member (negative: they owe me), in cents, expense by expense, without
 * Splitwise's debt simplification. Settle-ups first pay off the debt between the two people; when
 * Splitwise had someone settle on another's behalf ("simplify debts"), the rest is passed on to
 * the people it was really for, so no debt appears that nobody has. Only rows in the totals'
 * currency count. Rounded so the amounts add up to exactly what the rows say I'm owed overall.
 */
export function pairwiseCents(
  file: SplitwiseFile,
  me: number,
  currency: string,
): { cents: Array<number>; skippedRows: number } {
  const debts = file.members.map(() => 0);
  const payments = file.members.map(() => 0);
  let skippedRows = 0;
  for (const row of file.rows) {
    if (row.currency !== currency) skippedRows++;
    else addRow(isPaymentRow(row) ? payments : debts, row.netCents, me);
  }
  const d = debts.map((v, i) => v + payments[i]!);
  // A payment that more than cleared what's between us was on someone else's behalf.
  d.forEach((v, i) => {
    const p = payments[i]!;
    if (i !== me && p !== 0 && Math.sign(v) === Math.sign(p))
      passOn(d, i, me, Math.min(Math.abs(v), Math.abs(p)));
  });

  const cents = d.map((v) => Math.round(v) || 0);
  const residual = Math.round(d.reduce((a, b) => a + b, 0)) - cents.reduce((a, b) => a + b, 0);
  if (residual !== 0) {
    let k = -1;
    cents.forEach((c, i) => {
      if (i !== me && (k < 0 || Math.abs(c) > Math.abs(cents[k]!))) k = i;
    });
    if (k >= 0) cents[k]! += residual;
  }
  return { cents, skippedRows };
}

/** My net from the export's totals row and what I owe each other member, or null without totals. */
export function balancesFromFile(file: SplitwiseFile, me: number): FileBalances | null {
  if (!file.total) return null;
  const { currency, netCents } = file.total;
  const { cents: pairwise, skippedRows } = pairwiseCents(file, me, currency);
  return {
    currency,
    skippedRows,
    entries: file.members.map((name, i) => ({
      person:
        file.members.filter((m) => m === name).length > 1 ? `${name} (column ${i + 1})` : name,
      cents: i === me ? (netCents[i] ?? 0) : (pairwise[i] ?? 0),
      isMe: i === me,
    })),
  };
}

/** Replaces the stored balances of one group with the ones in this file. */
export async function saveBalances(
  client: Pick<RpcClient, "rpc">,
  group: string,
  balances: FileBalances,
): Promise<void> {
  const { error } = await client.rpc("save_splitwise_balances", {
    p_group: group,
    p_balances: balances.entries.map((e) => ({
      person: e.person,
      balance: e.cents / 100,
      currency: balances.currency,
      is_me: e.isMe,
      basis: "pairwise",
    })),
  });
  if (error) throw new Error(error.message);
}

type RateToEur = (currency: string) => number | null;

export interface GroupSummary {
  group: string;
  myBalance: number;
  myBalanceEur: number | null;
  currency: string;
  updatedAt: string;
  /** Everyone but me (leaving out those I'm square with), those who owe me first. */
  people: Array<{ person: string; balance: number; owesYou: boolean }>;
  /** Saved before per-person amounts: only my group total is known until the next import. */
  stale: boolean;
}

export function summarizeBalances(rows: Array<BalanceRow>, rate: RateToEur): Array<GroupSummary> {
  const groups = [...new Set(rows.map((r) => r.group_name))].sort();
  return groups.flatMap((group) => {
    const inGroup = rows.filter((r) => r.group_name === group);
    const me = inGroup.find((r) => r.is_me);
    if (!me) return [];
    const r2e = rate(me.currency);
    const stale = inGroup.some((r) => r.basis !== "pairwise");
    return [
      {
        group,
        myBalance: me.balance,
        myBalanceEur: r2e === null ? null : me.balance * r2e,
        currency: me.currency,
        updatedAt: me.updated_at,
        stale,
        people: inGroup
          .filter((r) => !stale && !r.is_me && r.balance !== 0)
          .sort((a, b) => a.balance - b.balance)
          .map((r) => ({ person: r.person, balance: r.balance, owesYou: r.balance < 0 })),
      },
    ];
  });
}
