import { describe, expect, it, vi } from "vitest";
import type { SplitwiseFile } from "./splitwise-parse";
import {
  balancesFromFile,
  friendsCreditEur,
  saveBalances,
  summarizeBalances,
  type BalanceRow,
} from "./splitwise-balances";

const file = (total: SplitwiseFile["total"], members = ["Marco", "Pietro", "Giulia"]) =>
  ({ members, rows: [], total }) as SplitwiseFile;

describe("balancesFromFile", () => {
  it("reads each member's net balance from the totals row and marks me", () => {
    const out = balancesFromFile(file({ currency: "USD", netCents: [39145, -764, 261] }), 0);
    expect(out).toEqual({
      currency: "USD",
      entries: [
        { person: "Marco", cents: 39145, isMe: true },
        { person: "Pietro", cents: -764, isMe: false },
        { person: "Giulia", cents: 261, isMe: false },
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

describe("friendsCreditEur", () => {
  it("adds my balance across groups in euros, keeping the sign", () => {
    expect(friendsCreditEur(rows, rate)).toBe(150);
  });
  it("is null when there are no balances or no rate for a currency", () => {
    expect(friendsCreditEur([], rate)).toBeNull();
    expect(friendsCreditEur(rows, () => null)).toBeNull();
  });
});

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
});
