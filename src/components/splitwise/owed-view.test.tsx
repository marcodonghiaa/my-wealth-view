import { render, screen } from "@testing-library/react";
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

describe("OwedView", () => {
  it("says where splits come from when there are none", () => {
    render(<OwedView rows={[]} onToggleSettled={vi.fn()} />);
    expect(screen.getByText(/No splits yet/)).toBeTruthy();
  });

  // protects=the user sees who still owes what; fails_when=settled splits stay in the total
  it("shows the open total per person and leaves settled splits out", () => {
    render(
      <OwedView
        rows={[row(), row({ entry_reference: "r2", owed_by: null, owed_settled: true })]}
        onToggleSettled={vi.fn()}
      />,
    );
    expect(screen.getByText("Still owed to you").nextSibling).toHaveTextContent("€20.00");
    expect(screen.getAllByText("Luca M")[0]).toBeTruthy();
    expect(screen.getByText(/Not assigned/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settled" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles settled on a split", async () => {
    const onToggle = vi.fn();
    const r = row({ creditor_name: null, booking_date: null });
    render(<OwedView rows={[r]} onToggleSettled={onToggle} />);
    expect(screen.getByText("Transaction")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Settle" }));
    expect(onToggle).toHaveBeenCalledWith(r, true);
  });
});
