import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionRow } from "@/lib/transactions";
import { TransfersSection } from "./transfers-section";

const transfer = (over: Partial<TransactionRow>): TransactionRow => ({
  entry_reference: "r1",
  account_uid: "a1",
  booking_date: "2026-10-02",
  category: null,
  transaction_type: null,
  creditor_name: "Alex",
  currency: "EUR",
  amount: 25,
  signed_amount_eur: -25,
  credit_debit_indicator: "DBIT",
  created_at: null,
  worth_it: null,
  personal_amount: null,
  owed_by: null,
  flow_type: "transfer",
  refund_of: null,
  ...over,
});

describe("TransfersSection", () => {
  // protects=a wrongly marked transfer can be seen and put back in the totals;
  // fails_when=the button is missing, mislabelled for the direction, or does not pass the row
  it("offers the right action per direction and passes the row back", async () => {
    const onRestore = vi.fn();
    const debit = transfer({});
    const credit = transfer({
      entry_reference: "r2",
      creditor_name: "Sam",
      signed_amount_eur: 40,
      credit_debit_indicator: "CRDT",
    });
    render(<TransfersSection rows={[debit, credit]} savingId={undefined} onRestore={onRestore} />);

    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /count as income/i }));
    expect(onRestore).toHaveBeenCalledWith(credit);
    await userEvent.click(screen.getByRole("button", { name: /count as spend/i }));
    expect(onRestore).toHaveBeenCalledWith(debit);
  });

  it("disables the button of the row being saved", () => {
    render(<TransfersSection rows={[transfer({})]} savingId="a1|r1" onRestore={vi.fn()} />);
    expect(
      (screen.getByRole("button", { name: /count as spend/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
