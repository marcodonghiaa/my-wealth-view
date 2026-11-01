import { describe, expect, it, vi } from "vitest";
import { classifyRows } from "./splitwise-classify";
import {
  diffStored,
  planCorrections,
  runCorrections,
  type StoredShare,
} from "./splitwise-corrections";
import { fingerprintRows } from "./splitwise-match";
import type { SplitwiseRow } from "./splitwise-parse";
import { splitAtCheckpoint } from "./splitwise-plan";

const row = (over: Partial<SplitwiseRow>): SplitwiseRow => ({
  row: 1,
  date: "2026-08-10",
  description: "Dinner",
  category: "Dining out",
  costCents: 9000,
  currency: "USD",
  netCents: [-3000, 6000, -3000],
  ...over,
});
const rowsOf = (...r: Array<SplitwiseRow>) =>
  classifyRows({ members: ["Me", "Ann", "Ben"], rows: r, total: null }, 0);

const stored = (fingerprint: string, over: Partial<StoredShare> = {}): StoredShare => {
  const [date = ""] = fingerprint.split("|");
  return {
    id: `id-${fingerprint}`,
    fingerprint,
    booking_date: date,
    description: fingerprint.split("|")[1] ?? "",
    amount: 30,
    currency: "USD",
    linked_entry_reference: null,
    ...over,
  };
};
const DINNER = "2026-08-10|Dinner|9000|USD|-3000#1";
const LAST = stored("2026-08-20|Last|9000|USD|-3000#1");

const diff = (rows: ReturnType<typeof rowsOf>, shares: Array<StoredShare>) =>
  diffStored(rows, fingerprintRows(rows), shares);

describe("diffStored", () => {
  // protects=an amount edit shows old vs new, not a removal plus an addition; fails_when=pairing
  // stops matching same date and description
  it("pairs a stored row gone from the file with its edit", () => {
    const rows = rowsOf(row({ costCents: 12000, netCents: [-4000, 8000, -4000] }));
    const d = diff(rows, [stored(DINNER)]);
    expect(d.edited).toHaveLength(1);
    expect(d.edited[0]?.stored.fingerprint).toBe(DINNER);
    expect(d.edited[0]?.row.costCents).toBe(12000);
    expect(d.removed).toEqual([]);
  });

  it("pairs a renamed row by date and cost", () => {
    const renamed = diff(rowsOf(row({ description: "Supper" })), [stored(DINNER)]);
    expect(renamed.edited).toHaveLength(1);
  });

  // protects=a new expense is not swallowed as an edit of an old one; fails_when=a monthly bill
  // with a new date pairs with last month's, which would hide it from the new rows
  it("keeps the same description and cost on another date apart", () => {
    const other = row({ row: 2, date: "2026-08-01", description: "Other", costCents: 100 });
    const d = diff(rowsOf(other, row({ date: "2026-08-12" })), [stored(DINNER)]);
    expect(d.edited).toEqual([]);
    expect(d.removed).toHaveLength(1);
  });

  // protects=two unrelated expenses are not presented as one; fails_when=one shared field pairs
  it("keeps rows that share only the date apart", () => {
    const rows = rowsOf(row({ description: "Taxi", costCents: 800, netCents: [-400, 800, -400] }));
    const d = diff(rows, [stored(DINNER)]);
    expect(d.edited).toEqual([]);
    expect(d.removed.map((s) => s.fingerprint)).toEqual([DINNER]);
  });

  it("shows separate rows when one stored row could be either of two edits", () => {
    const rows = rowsOf(
      row({ row: 1, costCents: 12000, netCents: [-4000, 8000, -4000] }),
      row({ row: 2, costCents: 15000, netCents: [-5000, 10000, -5000] }),
    );
    const d = diff(rows, [stored(DINNER)]);
    expect(d.edited).toEqual([]);
    expect(d.removed).toHaveLength(1);
  });

  it("shows separate rows when two stored rows could be one edit", () => {
    const rows = rowsOf(row({ costCents: 12000, netCents: [-4000, 8000, -4000] }));
    const d = diff(rows, [stored(DINNER), stored("2026-08-10|Dinner|7000|USD|-2000#1")]);
    expect(d.edited).toEqual([]);
    expect(d.removed).toHaveLength(2);
  });

  // protects=one of two identical rows deleted is one removal; fails_when=the #counter is ignored
  it("flags only the missing copy of identical rows", () => {
    const d = diff(rowsOf(row({})), [stored(DINNER), stored(DINNER.replace("#1", "#2"))]);
    expect(d.removed.map((s) => s.fingerprint)).toEqual([DINNER.replace("#1", "#2")]);
    expect(d.edited).toEqual([]);
  });

  // protects=an export with fewer months does not read as deletions; fails_when=coverage is ignored
  it("does not flag stored rows outside the dates the file covers", () => {
    const d = diff(rowsOf(row({ date: "2026-09-01" })), [
      stored(DINNER),
      stored("2026-10-01|Later|9000|USD|-3000#1"),
    ]);
    expect(d.removed).toEqual([]);
  });

  // protects=a linked row is not moved onto an expense I did not pay; fails_when=its bank
  // transaction keeps a personal amount for a row someone else paid
  it("does not pair a linked row with an expense someone else now pays", () => {
    const linked = stored("2026-08-10|Dinner|9000|USD|6000#1", { linked_entry_reference: "e1" });
    const d = diff(rowsOf(row({})), [linked]);
    expect(d.edited).toEqual([]);
    expect(d.removed).toEqual([linked]);
  });

  it("ignores a row that is not a share", () => {
    const d = diff(rowsOf(row({ netCents: [0, 2000, -2000] })), [stored(DINNER)]);
    expect(d.edited).toEqual([]);
    expect(d.removed).toHaveLength(1);
  });
});

describe("splitAtCheckpoint with corrections", () => {
  const edit = row({ row: 2, date: "2026-08-20", description: "Last", costCents: 12000 });

  // protects=an edited row is not also imported as new; fails_when=a checkpoint-day edit counts twice
  it("holds a checkpoint-day edit out of the new rows", () => {
    const rows = rowsOf({ ...edit, netCents: [-4000, 8000, -4000] });
    const split = splitAtCheckpoint(rows, fingerprintRows(rows), [LAST]);
    expect(split.rows).toEqual([]);
    expect(split.edited).toHaveLength(1);
    expect(split.older).toEqual([]);
  });

  it("lists an unpaired row before the checkpoint as added late, with its id", () => {
    const rows = rowsOf(
      row({ description: "Taxi", costCents: 800 }),
      row({ row: 2, date: "2026-08-20", description: "Last" }),
    );
    const fps = fingerprintRows(rows);
    const split = splitAtCheckpoint(rows, fps, [stored(fps[1] as string)]);
    expect(split.older.map((o) => o.fingerprint)).toEqual([fps[0]]);
  });
});

describe("planCorrections", () => {
  const rows = rowsOf(
    row({ row: 1, description: "Taxi", costCents: 800, netCents: [-400, 800, -400] }),
    row({ row: 2, date: "2026-08-15", costCents: 12000, netCents: [-4000, 8000, -4000] }),
  );
  const fps = fingerprintRows(rows);
  const edited = {
    stored: stored("2026-08-15|Dinner|9000|USD|-3000#1", { description: "My own name" }),
    row: rows[1] as (typeof rows)[number],
    fingerprint: fps[1] as string,
  };
  const removed = stored(DINNER);
  const input = {
    older: [{ row: rows[0] as (typeof rows)[number], fingerprint: fps[0] as string }],
    edited: [edited],
    removed: [removed],
    ticked: new Set<string>(),
    rate: () => 0.9,
    categoryFor: () => "Food",
  };

  // protects=nothing old changes without a tick; fails_when=the default selection sends a row
  it("sends nothing when nothing is ticked", () => {
    expect(planCorrections(input)).toEqual({ add: [], edit: [], remove: [], problems: [] });
  });

  it("sends only the ticked rows, named", () => {
    const plan = planCorrections({ ...input, ticked: new Set([fps[0] as string, removed.id]) });
    expect(plan.add).toEqual([
      {
        fingerprint: fps[0],
        booking_date: "2026-08-10",
        description: "Taxi",
        category: "Food",
        amount: 4,
        currency: "USD",
      },
    ]);
    expect(plan.remove).toEqual([{ id: removed.id, old_fingerprint: DINNER }]);
    expect(plan.edit).toEqual([]);
  });

  // protects=the bank's personal amount can be recalculated, and a name the user changed here
  // survives; fails_when=cost or my share is sent wrong
  it("sends an edit with my share and the cost, keeping my own description", () => {
    const plan = planCorrections({ ...input, ticked: new Set([edited.stored.id]) });
    expect(plan.edit).toEqual([
      {
        id: edited.stored.id,
        old_fingerprint: edited.stored.fingerprint,
        fingerprint: fps[1],
        booking_date: "2026-08-15",
        description: "My own name",
        amount: 40,
        currency: "USD",
        cost: 120,
      },
    ]);
  });

  it("takes the new description when Splitwise changed it", () => {
    const renamed = { ...edited, row: { ...edited.row, description: "Supper" } };
    const plan = planCorrections({
      ...input,
      edited: [renamed],
      ticked: new Set([edited.stored.id]),
    });
    expect(plan.edit[0]?.description).toBe("Supper");
  });

  it("blocks a ticked row with no exchange rate", () => {
    const plan = planCorrections({
      ...input,
      ticked: new Set([fps[0] as string]),
      rate: () => null,
    });
    expect(plan.problems).toEqual([expect.stringMatching(/rate.*USD/i)]);
  });
});

describe("runCorrections", () => {
  const plan = { add: [], edit: [], remove: [{ id: "a", old_fingerprint: "b" }], problems: [] };

  it("calls the function once and returns the counts", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { added: 0, edited: 0, removed: 1 }, error: null });
    await expect(runCorrections({ rpc }, "berkeley", plan)).resolves.toEqual({
      added: 0,
      edited: 0,
      removed: 1,
    });
    expect(rpc.mock.calls[0]?.[0]).toBe("apply_splitwise_corrections");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_group: "berkeley", p_remove: plan.remove });
  });

  // protects=a dashboard ahead of the database says what to do; fails_when=the raw error is shown
  it("explains a missing database function", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.apply_splitwise_corrections(...)" },
    });
    await expect(runCorrections({ rpc }, "g", plan)).rejects.toThrow(
      /database update.*Nothing was changed/,
    );
  });

  it("passes on any other error and refuses a blocked plan", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(runCorrections({ rpc }, "g", plan)).rejects.toThrow("boom");
    await expect(runCorrections({ rpc }, "g", { ...plan, problems: ["no"] })).rejects.toThrow("no");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses an unexpected answer", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    await expect(runCorrections({ rpc }, "g", plan)).rejects.toThrow(/unexpected/);
  });
});
