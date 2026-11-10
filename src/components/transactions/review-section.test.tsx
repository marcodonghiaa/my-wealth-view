import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReviewGroup } from "@/lib/transfer-review";
import { ReviewSection } from "./review-section";

const group = (over: Partial<ReviewGroup>): ReviewGroup => ({
  key: "revolut",
  name: "Revolut",
  rows: [],
  totals: [{ currency: "EUR", amount: -30 }],
  direction: "spend",
  ...over,
});

describe("ReviewSection", () => {
  it("renders nothing when there is nothing to review", () => {
    const { container } = render(
      <ReviewSection groups={[]} savingKey={undefined} onDecide={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  // protects=each group's answer reaches the right group; fails_when=labels or wiring drift
  it("shows each group with its count and total and passes the answer back", async () => {
    const onDecide = vi.fn();
    const spend = group({ rows: [{} as never, {} as never] });
    const income = group({ key: "k2", name: null, direction: "income" });
    const mixed = group({ key: "k3", name: "Mixed", direction: "mixed" });
    render(
      <ReviewSection groups={[spend, income, mixed]} savingKey={undefined} onDecide={onDecide} />,
    );

    expect(screen.getByText("To review")).toBeTruthy();
    expect(screen.getByText("No name")).toBeTruthy();
    expect(screen.getByText(/2 transactions/)).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "It's a transfer" })[0]!);
    expect(onDecide).toHaveBeenCalledWith(spend, "transfer");
    await userEvent.click(screen.getByRole("button", { name: "Count as income" }));
    expect(onDecide).toHaveBeenCalledWith(income, "count");
    expect(screen.getByRole("button", { name: "Count as spend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not a transfer" })).toBeTruthy();
  });

  it("disables the buttons of the group being saved", () => {
    render(<ReviewSection groups={[group({})]} savingKey="revolut" onDecide={vi.fn()} />);
    for (const b of screen.getAllByRole("button"))
      expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});
