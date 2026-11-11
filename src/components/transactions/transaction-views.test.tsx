import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { queryWrapper } from "@/test/query-wrapper";
import userEvent from "@testing-library/user-event";
import { shareToRow } from "@/lib/transactions";
import {
  TransactionCardView,
  TransactionRowView,
  type TransactionViewProps,
} from "./transaction-views";

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: queryWrapper() });

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

// protects=a Splitwise share offers only name and category: the other editors and the bulk
// select/delete write to the transactions table, which a share is not part of;
// fails_when=a checkbox, type or split editor appears, or name/category cannot be changed
describe("Splitwise share rows allow only name and category edits", () => {
  it("table row lets you rename and recategorise, with no checkbox", async () => {
    const p = props();
    render(
      <table>
        <tbody>
          <TransactionRowView {...p} />
        </tbody>
      </table>,
    );
    expect(screen.getByTitle("Splitwise")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Rename Dinner" }));
    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Pizza");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onRename).toHaveBeenCalledWith("Pizza");

    await userEvent.click(screen.getByRole("button", { name: /Change category for/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));
    expect(p.onSelectCategory).toHaveBeenCalledWith("Groceries");
  });

  it("card opens a sheet with name and category only", async () => {
    render(
      <ul>
        <TransactionCardView {...props()} />
      </ul>,
    );
    expect(screen.getByTitle("Splitwise")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Dinner/ }));
    expect(await screen.findByRole("button", { name: "Rename Dinner" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change category for/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Type")).toBeNull();
    expect(screen.queryByText("Split")).toBeNull();
  });
});

// protects=a bank row stays a single clean line on a phone and every editor sits behind a tap;
// fails_when=the editors render inline in the row again, or the tap no longer opens them
describe("Bank card rows", () => {
  const bankProps = (): TransactionViewProps => {
    const base = props();
    return {
      ...base,
      tx: {
        ...base.tx,
        entry_reference: "bank-1",
        creditor_name: "Uber",
        category: "Transports",
        currency: "USD",
        amount: 15,
        signed_amount_eur: -13.2,
      },
      accountLabel: "Revolut USD",
    };
  };

  it("shows the foreign amount with its symbol and the euro value, with no editors inline", () => {
    render(
      <ul>
        <TransactionCardView {...bankProps()} />
      </ul>,
    );
    expect(screen.getByText("Uber")).toBeInTheDocument();
    expect(screen.getByText(/−US\$15\.00/)).toBeInTheDocument();
    expect(screen.getByText(/≈ €13\.20/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByLabelText(/Change category/)).toBeNull();
  });

  it("opens the editors in a sheet when tapped", async () => {
    render(
      <ul>
        <TransactionCardView {...bankProps()} />
      </ul>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Uber/ }));
    expect(await screen.findByLabelText(/Change category for Uber/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });
});

// protects=only transactions added by hand get an amount editor: bank amounts are the bank's
describe("amount editing", () => {
  const bankRow = (): TransactionViewProps => ({
    ...props(),
    tx: { ...props().tx, account_uid: "acc", entry_reference: "manual-1", amount: 45.5 },
  });

  it("shows Change amount in the sheet for a manual row", async () => {
    render(<TransactionCardView {...bankRow()} onSaveAmount={vi.fn()} savingAmount={false} />);
    await userEvent.click(screen.getAllByRole("button")[0]!);
    expect(await screen.findByRole("button", { name: "Change amount" })).toBeTruthy();
  });

  it("has no amount editor for a bank row", async () => {
    render(<TransactionCardView {...bankRow()} />);
    await userEvent.click(screen.getAllByRole("button")[0]!);
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Change amount" })).toBeNull();
  });
});

// protects=the table drops the account badge when every row is from one account, and an open
// "worth it?" is a one-line hint (answered in the sheet), so rows keep one height;
// fails_when=the badge shows with one account, hides with several, or Yes/No buttons are inline
describe("Table row noise", () => {
  const bank = (over: Partial<TransactionViewProps> = {}): TransactionViewProps => {
    const base = props();
    return {
      ...base,
      tx: {
        ...base.tx,
        entry_reference: "bank-2",
        account_uid: "acc-1",
        creditor_name: "Zalando",
        category: "Shopping",
        amount: 40,
        signed_amount_eur: -40,
        credit_debit_indicator: "DBIT",
        created_at: "2020-01-01T00:00:00Z",
      },
      accountLabel: "Revolut EUR",
      ...over,
    };
  };
  const renderRow = (p: TransactionViewProps) =>
    render(
      <table>
        <tbody>
          <TransactionRowView {...p} />
        </tbody>
      </table>,
    );

  it("shows the account badge with several accounts", () => {
    renderRow(bank({ showAccount: true }));
    expect(screen.getByTitle("Revolut EUR")).toBeInTheDocument();
  });

  it("hides the account badge with one account", () => {
    renderRow(bank({ showAccount: false }));
    expect(screen.queryByTitle("Revolut EUR")).toBeNull();
  });

  it("puts an open worth-it question on the second line, with no inline buttons", () => {
    renderRow(bank());
    expect(screen.getByText("Worth it?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes" })).toBeNull();
  });

  it("shows a recorded answer in the second line", () => {
    const p = bank();
    renderRow({ ...p, tx: { ...p.tx, worth_it: "no" } });
    expect(screen.getByText(/Not worth it/)).toBeInTheDocument();
    expect(screen.queryByText("Worth it?")).toBeNull();
  });

  it("card shows the hint and the recorded answer the same way", () => {
    const p = bank();
    const { unmount } = render(<TransactionCardView {...p} />);
    expect(screen.getByText("Worth it?")).toBeInTheDocument();
    unmount();
    render(<TransactionCardView {...p} tx={{ ...p.tx, worth_it: "yes" }} />);
    expect(screen.getByText("Shopping · Worth it")).toBeInTheDocument();
  });
});
