import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { queryWrapper } from "@/test/query-wrapper";
import userEvent from "@testing-library/user-event";
import type { TransactionRow } from "@/lib/transactions";
import { CategoryPicker, TypePicker } from "./pickers";
import { SplitEditor } from "./split-editor";
import { setLocaleOverride } from "@/lib/locale";
import { WorthItPrompt, WorthItSpotlight } from "./worth-it";

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: queryWrapper() });

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
    const share = await screen.findByLabelText(/Your share/);
    await userEvent.clear(share);
    await userEvent.type(share, "5");
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    await userEvent.type(screen.getByLabelText("New contact name"), " Anna {Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(5, "Anna");
  });

  it("polish-3 #4 takes a share typed with a decimal comma and says when it can't", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    const share = await screen.findByLabelText(/Your share/);
    await userEvent.clear(share);
    await userEvent.type(share, "abc");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/between 0 and/);
    await userEvent.clear(share);
    await userEvent.type(share, "6,25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(6.25, null);
  });

  it("polish-4 #2 fills the share box with the chosen decimal mark", async () => {
    setLocaleOverride("it-IT");
    try {
      const onSave = vi.fn();
      render(<SplitEditor tx={tx({ amount: 23.78 })} onSave={onSave} saving={false} />);
      await open();
      expect(await screen.findByLabelText(/Your share/)).toHaveValue("23,78");
      await userEvent.click(screen.getByRole("button", { name: "Split in 3" }));
      expect(screen.getByLabelText(/Your share/)).toHaveValue("7,93");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledWith(7.93, null);
    } finally {
      setLocaleOverride("");
    }
  });

  // protects=quick ÷2/÷3 splits; fails_when=the preset share is wrong or not saved
  it("fills the share from a quick split", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Split in 3" }));
    expect(screen.getByLabelText(/Your share/)).toHaveValue("6.67");
    await userEvent.click(screen.getByRole("button", { name: "Split in 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(10, null);
  });

  // protects=saved contacts as pills; fails_when=picking several people loses one
  it("offers saved contacts as pills and saves everyone picked", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} contacts={["Luca M", "Anna"]} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Split in 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Luca M" }));
    await userEvent.click(screen.getByRole("button", { name: "Anna" }));
    expect(screen.getByRole("button", { name: "Anna" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Anna" }));
    expect(screen.getByRole("button", { name: "Anna" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(6.67, "Luca M");
  });

  it("doesn't add a blank or duplicate new contact, and Escape cancels", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} contacts={["Anna"]} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Split in 2" }));
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    await userEvent.type(screen.getByLabelText("New contact name"), "   {Enter}");
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    await userEvent.type(screen.getByLabelText("New contact name"), "anna{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    await userEvent.type(screen.getByLabelText("New contact name"), "Bob{Escape}");
    expect(screen.queryByRole("button", { name: "Bob" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(10, "anna");
  });

  it("stores the full amount as no split", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "+ New" }));
    await userEvent.type(screen.getByLabelText("New contact name"), "Anna{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(null, null);
  });

  it("ignores a share above the full amount", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    const share = await screen.findByLabelText(/Your share/);
    await userEvent.clear(share);
    await userEvent.type(share, "99");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores an empty share instead of saving it as zero", async () => {
    const onSave = vi.fn();
    render(<SplitEditor tx={tx()} onSave={onSave} saving={false} />);
    await open();
    await userEvent.clear(await screen.findByLabelText(/Your share/));
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
    expect(await screen.findByRole("button", { name: "Anna" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));
    expect(onSave).toHaveBeenCalledWith(null, null);
  });
});
