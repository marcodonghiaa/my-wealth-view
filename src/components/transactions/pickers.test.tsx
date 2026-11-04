import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { shareToRow } from "@/lib/transactions";
import { CategoryPicker } from "./pickers";

const tx = shareToRow({
  id: "s1",
  booking_date: "2026-10-04",
  category: "Entertainment",
  description: "Payment",
  group_name: "Trip",
  currency: "EUR",
  amount: 5000,
  amount_eur: 5000,
});

describe("CategoryPicker inside the transaction sheet", () => {
  // Regression: on phones the picker opens inside a modal Sheet, whose scroll
  // lock swallowed scroll gestures on the (portaled) category list.
  it("lets the category list scroll", async () => {
    render(
      <Sheet open>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Payment</SheetTitle>
          <CategoryPicker tx={tx} onSelect={vi.fn()} saving={false} />
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: /change category/i }));

    const option = await screen.findByRole("button", { name: "Transfer" });
    // jsdom has no CSS or layout: make the list a scrollable box by hand.
    const list = option.parentElement!;
    list.style.overflowY = "auto";
    Object.defineProperty(list, "scrollHeight", { value: 600 });
    Object.defineProperty(list, "clientHeight", { value: 288 });
    const scrolled = fireEvent.wheel(option, { deltaY: 100 });

    expect(scrolled).toBe(true);
  });
});
