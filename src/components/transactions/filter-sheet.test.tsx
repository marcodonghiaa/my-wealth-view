import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterSheet, type FilterSheetProps } from "./filter-sheet";

const props = (over: Partial<FilterSheetProps> = {}): FilterSheetProps => ({
  category: "all",
  onCategory: vi.fn(),
  categories: { list: ["Dine Out", "Groceries"], hasUncategorized: false },
  bank: "all",
  onBank: vi.fn(),
  banks: ["Fineco"],
  tag: "",
  onTag: vi.fn(),
  tags: [],
  day: "",
  onDay: vi.fn(),
  minDay: "2026-11-01",
  maxDay: "2026-11-30",
  count: 0,
  resultCount: 12,
  onClear: vi.fn(),
  ...over,
});

// protects=on a phone, category, day and bank sit behind one Filter button that says how many are
// set, and the sheet can clear them; fails_when=the count is missing, Clear is live with nothing
// set, or a single-bank user is offered a bank filter
describe("FilterSheet", () => {
  it("names the button plainly when nothing is set", () => {
    render(<FilterSheet {...props()} />);
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("counts the active filters on the button", () => {
    render(<FilterSheet {...props({ count: 2 })} />);
    expect(screen.getByRole("button", { name: "Filter, 2 active" })).toHaveTextContent("2");
  });

  it("opens the sheet; a category choice is reported; one bank means no bank field", async () => {
    const p = props();
    render(<FilterSheet {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Groceries");
    expect(p.onCategory).toHaveBeenCalledWith("Groceries");
    expect(screen.getByLabelText("Day")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bank")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show 12 transactions" })).toBeInTheDocument();
  });

  it("offers banks and Uncategorized when there are any, and clears", async () => {
    const p = props({
      banks: ["Fineco", "Revolut"],
      categories: { list: ["Dine Out"], hasUncategorized: true },
      count: 1,
      resultCount: 1,
    });
    render(<FilterSheet {...p} />);
    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    await userEvent.selectOptions(screen.getByLabelText("Bank"), "Revolut");
    expect(p.onBank).toHaveBeenCalledWith("Revolut");
    expect(screen.getByRole("option", { name: "Uncategorized" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(p.onClear).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Show 1 transaction" }));
    expect(screen.queryByLabelText("Bank")).toBeNull();
  });
});

// protects=the phone sheet offers the tag filter once the month has a tag;
// fails_when=it shows with no tags or picking one does not reach the page
describe("FilterSheet tag", () => {
  it("hides the tag filter when the month has no tags", async () => {
    render(<FilterSheet {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.queryByLabelText("Tag")).toBeNull();
  });

  it("picks a tag", async () => {
    const onTag = vi.fn();
    render(<FilterSheet {...props({ tags: ["trip", "work"], onTag })} />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.selectOptions(screen.getByLabelText("Tag"), "work");
    expect(onTag).toHaveBeenCalledWith("work");
  });
});
