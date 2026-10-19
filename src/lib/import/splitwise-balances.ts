import type { SplitwiseFile } from "./splitwise-parse";
import type { RpcClient } from "./splitwise-commit";

export interface FileBalances {
  currency: string;
  entries: Array<{ person: string; cents: number; isMe: boolean }>;
}

/** One stored balance: how much a person is owed by the group (negative: they owe the group). */
export interface BalanceRow {
  group_name: string;
  person: string;
  balance: number;
  currency: string;
  is_me: boolean;
  updated_at: string;
}

/** Each member's net balance from the export's totals row, or null if the file has none. */
export function balancesFromFile(file: SplitwiseFile, me: number): FileBalances | null {
  if (!file.total) return null;
  const { currency, netCents } = file.total;
  return {
    currency,
    entries: file.members.map((name, i) => ({
      person:
        file.members.filter((m) => m === name).length > 1 ? `${name} (column ${i + 1})` : name,
      cents: netCents[i] ?? 0,
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

/** What the groups owe me in total, in euros (negative if I owe). Null if unknown. */
export function friendsCreditEur(rows: Array<BalanceRow>, rate: RateToEur): number | null {
  const mine = rows.filter((r) => r.is_me);
  if (mine.length === 0) return null;
  let total = 0;
  for (const r of mine) {
    const r2e = rate(r.currency);
    if (r2e === null) return null;
    total += r.balance * r2e;
  }
  return total;
}

export interface GroupSummary {
  group: string;
  myBalance: number;
  myBalanceEur: number | null;
  currency: string;
  updatedAt: string;
  /** Everyone but me, those who owe the group first. */
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
          .filter((r) => !r.is_me)
          .sort((a, b) => a.balance - b.balance)
          .map((r) => ({ person: r.person, balance: r.balance, owesYou: r.balance < 0 })),
      },
    ];
  });
}
