import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionRow } from "@/lib/transactions";
import { CategoryPicker, TypePicker } from "./pickers";
import { SplitEditor } from "./split-editor";
import { WorthItPrompt, WorthItSpotlight } from "./worth-it";

const tx = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  entry_reference: "r1",
  account_uid: "a1",
  booking_date: "2026-10-05",
  category: "Shopping",
  transaction_type: "One-time",
  creditor_name: "Amazon",
  currency: "EUR",
  amount: 20,
  signed_amount_eur: -20,
  credit_debit_indicator: "DBIT",
  created_at: "2026-10-05T08:00:00Z",
  worth_it: null,
  personal_amount: null,
  owed_by: null,
  flow_type: "spend",
  refund_of: null,
  ...over,
});

describe("WorthItPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the recorded answer when one exists", () => {
    render(<WorthItPrompt tx={tx({ worth_it: "no" })} onAnswer={vi.fn()} />);
    expect(screen.getByText("Not worth it")).toBeInTheDocument();
  });

  it("asks and reports the answer for an eligible purchase", async () => {
    const onAnswer = vi.fn();
    render(<WorthItPrompt tx={tx()} onAnswer={onAnswer} />);
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: "Yes" }));
    expect(onAnswer).toHaveBeenCalledWith("yes");
  });

  it("renders nothing for an ineligible transaction", () => {
    const { container } = render(
      <WorthItPrompt tx={tx({ category: "Groceries" })} onAnswer={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WorthItSpotlight", () => {
  it("answers and closes", async () => {
    const onAnswer = vi.fn();
    const onClose = vi.fn();
    render(<WorthItSpotlight tx={tx()} onAnswer={onAnswer} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).toHaveBeenCalledWith(tx(), "no");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders no dialog without a transaction", () => {
    render(<WorthItSpotlight tx={null} onAnswer={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("pickers", () => {
  it("CategoryPicker reports a new category and ignores the current one", async () => {
    const onSelect = vi.fn();
    render(<CategoryPicker tx={tx()} onSelect={onSelect} saving={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Change category for Amazon/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));
    expect(onSelect).toHaveBeenCalledWith("Groceries");

    await userEvent.click(screen.getByRole("button", { name: /Change category for Amazon/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Shopping" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("CategoryPicker is disabled while saving", () => {
    render(<CategoryPicker tx={tx()} onSelect={vi.fn()} saving />);
    expect(screen.getByRole("button", { name: /Change category/ })).toBeDisabled();
  });

  it("TypePicker shows a dash when the type is unset", () => {
    render(<TypePicker tx={tx({ transaction_type: null })} onSelect={vi.fn()} saving={false} />);
    expect(screen.getByRole("button", { name: /Change type/ })).toHaveTextContent("—");
  });
});

describe("SplitEditor", () => {
  async function open() {
    await userEvent.click(screen.getByRole("button", { name: /Split Amazon/ }));
  }

  it("saves a partial share with the person who owes the rest", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    const share = await screen.findByRole("spinbutton");
    const owedBy = screen.getByPlaceholderText("e.g. Anna, Luca");
    await userEvent.clear(share);
    await userEvent.type(share, "5");
    await userEvent.type(owedBy, " Anna ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(5, "Anna");
  });

  it("stores the full amount as no split", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    await userEvent.type(await screen.findByPlaceholderText("e.g. Anna, Luca"), "Anna");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(null, null);
  });

  it("ignores a share above the full amount", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    const share = await screen.findByRole("spinbutton");
    await userEvent.clear(share);
    await userEvent.type(share, "99");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("offers Clear only for an existing split and clears it", async () => {
    const onSave = vi.fn();
    render(
      <SplitEditor
        tx={tx({ personal_amount: 8, owed_by: "Anna" })}
        onSave={onSave}
        saving={false}
      />,
    );
    expect(screen.getByRole("button", { name: /Split Amazon/ })).toHaveTextContent("owed €12.00");
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));
    expect(onSave).toHaveBeenCalledWith(null, null);
  });
});
