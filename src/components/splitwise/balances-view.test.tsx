import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/import/splitwise-balances";
import { BalancesView, FriendsCreditLine } from "./balances-view";

const group: GroupSummary = {
  group: "berkeley",
  myBalance: 391.45,
  myBalanceEur: 360.13,
  currency: "USD",
  updatedAt: "2026-10-18T10:00:00Z",
  people: [
    { person: "Matteo Mucciarella", balance: -199.48, owesYou: true },
    { person: "Filippo Casadio", balance: 52.22, owesYou: false },
  ],
};

describe("BalancesView", () => {
  // protects=the user sees who owes the group and by how much; fails_when=names or signs are lost
  it("shows each person with what they owe or are owed", () => {
    render(<BalancesView groups={[group]} />);
    expect(screen.getByText("Matteo Mucciarella")).toBeTruthy();
    expect(screen.getByText(/owes the group/)).toBeTruthy();
    expect(screen.getByText(/is owed/)).toBeTruthy();
    expect(screen.getByText(/199\.48/)).toBeTruthy();
  });

  it("shows my balance in the group currency and in euros", () => {
    render(<BalancesView groups={[group]} />);
    expect(screen.getByText(/391\.45/)).toBeTruthy();
    expect(screen.getByText(/360/)).toBeTruthy();
  });

  it("says what to do when nothing has been imported", () => {
    render(<BalancesView groups={[]} />);
    expect(screen.getByText(/Import a Splitwise file below/)).toBeTruthy();
  });

  // protects=nobody reads pairwise debts into the numbers; fails_when=the caveat is removed
  it("explains that these are group totals, not who pays whom", () => {
    render(<BalancesView groups={[group]} />);
    expect(screen.getByText(/not who pays whom/)).toBeTruthy();
  });
});

describe("FriendsCreditLine", () => {
  it("shows what friends owe you and the net worth including it", () => {
    render(<FriendsCreditLine creditEur={360} netWorthEur={10000} format={(v) => `€${v}`} />);
    expect(screen.getByText(/Friends owe you/)).toBeTruthy();
    expect(screen.getByText(/€360/)).toBeTruthy();
    expect(screen.getByText(/€10360/)).toBeTruthy();
  });

  it("says you owe the group when the balance is negative", () => {
    render(<FriendsCreditLine creditEur={-50} netWorthEur={100} format={(v) => `€${v}`} />);
    expect(screen.getByText(/You owe your groups/)).toBeTruthy();
  });

  it("renders nothing without a balance", () => {
    const { container } = render(
      <FriendsCreditLine creditEur={null} netWorthEur={100} format={(v) => `${v}`} />,
    );
    expect(container.textContent).toBe("");
  });
});
