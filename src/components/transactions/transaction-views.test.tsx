import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { shareToRow } from "@/lib/transactions";
import {
  TransactionCardView,
  TransactionRowView,
  type TransactionViewProps,
} from "./transaction-views";

const props = (): TransactionViewProps => ({
  tx: shareToRow({
    id: "s1",
    booking_date: "2026-10-04",
    category: "Dine Out",
    description: "Dinner",
    group_name: "Trip",
    currency: "EUR",
    amount: 12.5,
    amount_eur: 12.5,
  }),
  accountLabel: "—",
  onSelectCategory: vi.fn(),
  savingCategory: false,
  onSelectType: vi.fn(),
  savingType: false,
  selected: false,
  onToggleSelect: vi.fn(),
  onAnswerWorthIt: vi.fn(),
  savingSplit: false,
  onSaveSplit: vi.fn(),
  onRename: vi.fn(),
  savingRename: false,
});

// protects=a Splitwise share cannot be edited, selected or deleted like a bank row (those writes
// target the transactions table and would fail); fails_when=a checkbox or an editor appears
describe("Splitwise share rows are read only", () => {
  it("table row shows name, category and a Splitwise label, with nothing to edit", () => {
    render(
      <table>
        <tbody>
          <TransactionRowView {...props()} />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    expect(screen.getByText("Dine Out")).toBeInTheDocument();
    expect(screen.getByTitle("Splitwise")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("card shows the same and nothing to edit", () => {
    render(
      <ul>
        <TransactionCardView {...props()} />
      </ul>,
    );
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    expect(screen.getByTitle("Splitwise")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
