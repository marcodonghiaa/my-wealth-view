import type { SplitwiseFile } from "./splitwise-parse";
import type { RpcClient } from "./splitwise-commit";

export interface FileBalances {
  currency: string;
  entries: Array<{ person: string; cents: number; isMe: boolean }>;
}

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
}

/**
 * What I owe each member (negative: they owe me), from each row: when I'm owed on a row, those who
 * owe on it pay me in proportion; when I owe, I pay those who are owed in proportion. Settle-up
 * rows count the same way. Only rows in the totals' currency count, so the sums share one currency.
 */
export function pairwiseCents(file: SplitwiseFile, me: number, currency: string): Array<number> {
  const out = file.members.map(() => 0);
  for (const row of file.rows) {
    if (row.currency !== currency) continue;
    const mine = row.netCents[me] ?? 0;
    const owed = row.netCents.reduce((sum, n) => sum + Math.max(0, n), 0);
    if (mine === 0 || owed === 0) continue;
    row.netCents.forEach((n, i) => {
      if (i !== me && Math.sign(n) === -Math.sign(mine)) out[i]! += (n * Math.abs(mine)) / owed;
    });
  }
  return out.map((c) => Math.round(c) || 0);
}

/** My net from the export's totals row and what I owe each other member, or null without totals. */
export function balancesFromFile(file: SplitwiseFile, me: number): FileBalances | null {
  if (!file.total) return null;
  const { currency, netCents } = file.total;
  const pairwise = pairwiseCents(file, me, currency);
  return {
    currency,
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
}

export function summarizeBalances(rows: Array<BalanceRow>, rate: RateToEur): Array<GroupSummary> {
  const groups = [...new Set(rows.map((r) => r.group_name))].sort();
  return groups.flatMap((group) => {
    const inGroup = rows.filter((r) => r.group_name === group);
    const me = inGroup.find((r) => r.is_me);
    if (!me) return [];
    const r2e = rate(me.currency);
    return [
      {
        group,
        myBalance: me.balance,
        myBalanceEur: r2e === null ? null : me.balance * r2e,
        currency: me.currency,
        updatedAt: me.updated_at,
        people: inGroup
          .filter((r) => !r.is_me && r.balance !== 0)
          .sort((a, b) => a.balance - b.balance)
          .map((r) => ({ person: r.person, balance: r.balance, owesYou: r.balance < 0 })),
      },
    ];
  });
}
