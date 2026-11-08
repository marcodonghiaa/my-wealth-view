import { describe, expect, it, vi } from "vitest";
import type { SplitwiseFile } from "./splitwise-parse";
import type { SplitwiseRow } from "./splitwise-parse";
import {
  balancesFromFile,
  pairwiseCents,
  saveBalances,
  summarizeBalances,
  type BalanceRow,
} from "./splitwise-balances";

const file = (total: SplitwiseFile["total"], members = ["Marco", "Pietro", "Giulia"]) =>
  ({ members, rows: [], total }) as SplitwiseFile;

const r = (netCents: Array<number>, currency = "USD", category = "General"): SplitwiseRow => ({
  row: 1,
  date: "2026-10-01",
  description: "x",
  category,
  costCents: 0,
  currency,
  netCents,
});

describe("pairwiseCents", () => {
  // protects=who owes me, not the group; fails_when=a payer's debtors are not split in proportion
  it("works out what each person owes me or I owe them, row by row", () => {
    const f = {
      members: ["Marco", "Pietro", "Giulia"],
      rows: [
        r([2000, -1000, -1000]), // I paid 30, split 3 ways: each owes me 10
        r([-500, 1000, -500]), // Pietro paid 15: I owe him 5
        r([1000, -1000, 0], "USD", "Payment"), // I paid Pietro 10: I owe him 10 less
        r([-700, 1400, -700], "EUR"), // other currency: left out
        r([0, 300, -300]), // between the others: not mine
      ],
      total: null,
    } as SplitwiseFile;
    expect(pairwiseCents(f, 0, "USD")).toEqual([0, -1500, -1000]);
  });

  it("shares my debt among several payers in proportion", () => {
    const f = {
      members: ["Me", "A", "B"],
      rows: [r([-900, 600, 300])],
      total: null,
    } as SplitwiseFile;
    expect(pairwiseCents(f, 0, "USD")).toEqual([0, 600, 300]);
  });
});

describe("balancesFromFile", () => {
  it("keeps my group total from the totals row and what I owe each other member", () => {
    const f = {
      members: ["Marco", "Pietro", "Giulia"],
      rows: [r([2000, -1000, -1000])],
      total: { currency: "USD", netCents: [2000, -1000, -1000] },
    } as SplitwiseFile;
    expect(balancesFromFile(f, 0)).toEqual({
      currency: "USD",
      entries: [
        { person: "Marco", cents: 2000, isMe: true },
        { person: "Pietro", cents: -1000, isMe: false },
        { person: "Giulia", cents: -1000, isMe: false },
      ],
    });
  });

  it("returns null when the file has no totals row", () => {
    expect(balancesFromFile(file(null), 0)).toBeNull();
  });

  it("keeps same-named members apart", () => {
    const out = balancesFromFile(
      file({ currency: "USD", netCents: [1, 2, 3] }, ["A", "B", "B"]),
      0,
    );
    expect(out?.entries.map((e) => e.person)).toEqual(["A", "B (column 2)", "B (column 3)"]);
  });
});

describe("saveBalances", () => {
  it("sends the group and balances in whole currency units", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await saveBalances({ rpc }, "berkeley", {
      currency: "USD",
      entries: [{ person: "Marco", cents: 39145, isMe: true }],
    });
    expect(rpc).toHaveBeenCalledWith("save_splitwise_balances", {
      p_group: "berkeley",
      p_balances: [{ person: "Marco", balance: 391.45, currency: "USD", is_me: true }],
    });
  });

  it("throws the database message on failure", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(saveBalances({ rpc }, "g", { currency: "USD", entries: [] })).rejects.toThrow(
      "nope",
    );
  });
});

const rows: Array<BalanceRow> = [
  {
    group_name: "berkeley",
    person: "Marco",
    balance: 400,
    currency: "USD",
    is_me: true,
    updated_at: "2026-10-18T10:00:00Z",
  },
  {
    group_name: "berkeley",
    person: "Pietro",
    balance: -100,
    currency: "USD",
    is_me: false,
    updated_at: "2026-10-18T10:00:00Z",
  },
  {
    group_name: "berkeley",
    person: "Giulia",
    balance: 20,
    currency: "USD",
    is_me: false,
    updated_at: "2026-10-18T10:00:00Z",
  },
  {
    group_name: "trip",
    person: "Me",
    balance: -50,
    currency: "EUR",
    is_me: true,
    updated_at: "2026-10-01T10:00:00Z",
  },
];
const rate = (c: string) => (c === "EUR" ? 1 : c === "USD" ? 0.5 : null);

describe("summarizeBalances", () => {
  it("groups people per group, owes first, with my balance and the euro value", () => {
    const [g] = summarizeBalances(rows, rate).filter((s) => s.group === "berkeley");
    expect(g?.myBalance).toBe(400);
    expect(g?.myBalanceEur).toBe(200);
    expect(g?.people.map((p) => p.person)).toEqual(["Pietro", "Giulia"]);
    expect(g?.people[0]).toMatchObject({ person: "Pietro", balance: -100, owesYou: true });
    expect(g?.people[1]).toMatchObject({ person: "Giulia", balance: 20, owesYou: false });
    expect(g?.updatedAt).toBe("2026-10-18T10:00:00Z");
  });

  it("leaves out people I'm square with", () => {
    const square = rows.map((x) => (x.person === "Giulia" ? { ...x, balance: 0 } : x));
    const [g] = summarizeBalances(square, rate).filter((s) => s.group === "berkeley");
    expect(g?.people.map((p) => p.person)).toEqual(["Pietro"]);
  });
});
