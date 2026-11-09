import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SplitRow } from "@/lib/splits";
import { OwedView } from "./owed-view";

const row = (over: Partial<SplitRow> = {}): SplitRow => ({
  entry_reference: "r1",
  account_uid: "a1",
  booking_date: "2026-11-01",
  creditor_name: "Pizzeria",
  owed_by: "Luca M",
  owed_settled: false,
  signed_amount_eur: -30,
  personal_signed_amount_eur: -10,
  ...over,
});

const view = (rows: Array<SplitRow>, onToggle = vi.fn(), onAll = vi.fn()) =>
  render(<OwedView rows={rows} onToggleSettled={onToggle} onSettleAll={onAll} />);

describe("OwedView", () => {
  it("says where split bills come from when there are none", () => {
    view([]);
    expect(screen.getByText(/No split bills yet/)).toBeTruthy();
  });

  // protects=per-person open totals; fails_when=shared bills double count or settled people clutter
  it("lists who still owes, sharing bills split among several, and folds settled people", () => {
    view([
      row(),
      row({ entry_reference: "r2", owed_by: "Luca M, Anna" }),
      row({ entry_reference: "r3", owed_by: "Bea", owed_settled: true }),
    ]);
    const luca = screen.getByText("Luca M").closest("summary")!;
    expect(luca).toHaveTextContent("Owes you · 2 open bills");
    expect(luca).toHaveTextContent("€30.00");
    expect(screen.getByText("Anna").closest("summary")).toHaveTextContent("€10.00");
    const settled = screen.getByText("Settled (1)").closest("details")!;
    expect(settled).not.toHaveAttribute("open");
    expect(within(settled).getByText("Bea").closest("summary")).toHaveTextContent("All paid back");
    expect(screen.getAllByText(/shared with 1 more/)).toHaveLength(2);
  });

  it("says when nobody owes anything any more", () => {
    view([row({ owed_settled: true })]);
    expect(screen.getByText("Nobody owes you from split bills.")).toBeTruthy();
  });

  it("shows money going the other way, e.g. a refund of a split bill", () => {
    view([row({ signed_amount_eur: 100, personal_signed_amount_eur: 50 })]);
    expect(screen.getByText("Luca M").closest("summary")).toHaveTextContent(
      "You owe · 1 open bill",
    );
  });

  it("settles one bill, or every bill a person owes alone", async () => {
    const onToggle = vi.fn();
    const onAll = vi.fn();
    const a = row({ creditor_name: null, booking_date: null });
    const b = row({ entry_reference: "r2" });
    const shared = row({ entry_reference: "r4", owed_by: "Luca M, Anna" });
    const done = row({ entry_reference: "r3", owed_settled: true });
    view([a, b, shared, done], onToggle, onAll);
    await userEvent.click(screen.getByText("Luca M"));
    await userEvent.click(screen.getByRole("button", { name: /^Settle: Transaction, —/ }));
    expect(onToggle).toHaveBeenLastCalledWith(a, true);
    await userEvent.click(screen.getByRole("button", { name: /^Mark as not settled: Pizzeria/ }));
    expect(onToggle).toHaveBeenLastCalledWith(done, false);
    await userEvent.click(screen.getByRole("button", { name: "Settle all 2 with Luca M" }));
    expect(onAll).toHaveBeenCalledWith("Luca M", [a, b]);
  });
});
