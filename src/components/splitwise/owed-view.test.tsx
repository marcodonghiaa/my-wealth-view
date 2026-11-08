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

  // protects=per-person open totals; fails_when=settled bills count or shared bills double count
  it("shows what each person still owes, sharing bills split among several", () => {
    render(
      <OwedView
        rows={[
          row(),
          row({ entry_reference: "r2", owed_by: "Luca M, Anna" }),
          row({ entry_reference: "r3", owed_by: null, owed_settled: true }),
        ]}
        onToggleSettled={vi.fn()}
      />,
    );
    expect(screen.getByText("Luca M").nextSibling).toHaveTextContent("owes you €30.00");
    expect(screen.getByText("Anna").nextSibling).toHaveTextContent("owes you €10.00");
    expect(screen.getByText("Not assigned").nextSibling).toHaveTextContent("settled");
    expect(screen.getAllByText(/with Luca M, Anna/)).toHaveLength(2);
  });

  it("settles one bill, or every open bill of a person", async () => {
    const onToggle = vi.fn();
    const a = row({ creditor_name: null, booking_date: null });
    const b = row({ entry_reference: "r2" });
    const done = row({ entry_reference: "r3", owed_settled: true });
    render(<OwedView rows={[a, b, done]} onToggleSettled={onToggle} />);
    await userEvent.click(screen.getByText("Luca M"));
    expect(screen.getByText("Transaction")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "Settle" })[0]!);
    expect(onToggle).toHaveBeenLastCalledWith(a, true);
    await userEvent.click(screen.getByRole("button", { name: "Settled" }));
    expect(onToggle).toHaveBeenLastCalledWith(done, false);
    onToggle.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Settle all with Luca M" }));
    expect(onToggle.mock.calls).toEqual([
      [a, true],
      [b, true],
    ]);
  });
});
