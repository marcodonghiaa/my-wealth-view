import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/import/splitwise-balances";
import { BalancesView } from "./balances-view";

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
  // protects=only money between me and each person shows; fails_when=names or directions are lost
  it("shows who owes me and whom I owe", () => {
    render(<BalancesView groups={[group]} />);
    expect(screen.getByText("Matteo Mucciarella")).toBeTruthy();
    expect(screen.getByText(/owes you/)).toHaveTextContent("US$199.48");
    expect(screen.getByText(/you owe/)).toHaveTextContent("US$52.22");
    expect(screen.queryByText(/the group/)).toBeNull();
  });

  it("says when I'm square with everyone in a group", () => {
    render(<BalancesView groups={[{ ...group, people: [] }]} />);
    expect(screen.getByText(/all square/)).toBeTruthy();
  });

  it("says what to do when nothing has been imported", () => {
    render(<BalancesView groups={[]} />);
    expect(screen.getByText(/Import a Splitwise file/)).toBeTruthy();
  });

  // protects=nobody expects the Splitwise app's simplified numbers; fails_when=the caveat is removed
  it("explains the amounts are not simplified like in Splitwise", () => {
    render(<BalancesView groups={[group]} />);
    expect(screen.getByText(/simplify debts/)).toBeTruthy();
  });
});
