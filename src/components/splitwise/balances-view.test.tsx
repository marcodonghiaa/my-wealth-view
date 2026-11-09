import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/import/splitwise-balances";
import { BalancesView } from "./balances-view";

const group: GroupSummary = {
  group: "berkeley",
  myBalance: 147.25,
  myBalanceEur: 135.47,
  currency: "USD",
  updatedAt: "2026-10-18T10:00:00Z",
  people: [
    { person: "Matteo Mucciarella", balance: -199.48, owesYou: true },
    { person: "Filippo Casadio", balance: 52.22, owesYou: false },
  ],
};
const trip: GroupSummary = { ...group, group: "trip", myBalance: -10 };

describe("BalancesView", () => {
  // protects=group vs people hierarchy; fails_when=the group header reads like a person row
  it("shows each group as a header with its net, people inside", () => {
    render(<BalancesView groups={[group]} />);
    const header = screen.getByRole("button", { name: /berkeley/ });
    expect(header).toHaveTextContent("2 people · as of 18 Oct 2026");
    expect(header).toHaveTextContent("US$147.25owed to you");
    expect(screen.getByRole("heading", { name: /berkeley/ })).toBeTruthy();
  });

  // protects=only money between me and each person shows; fails_when=names or directions are lost
  it("opens a lone group by itself and shows who owes me and whom I owe", () => {
    render(<BalancesView groups={[group]} />);
    expect(screen.getByRole("button", { name: /berkeley/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Matteo Mucciarella").parentElement).toHaveTextContent("owes you");
    expect(screen.getByText("Filippo Casadio").parentElement).toHaveTextContent("you owe");
    expect(screen.getByText("US$199.48")).toBeTruthy();
  });

  it("keeps several groups closed until opened", async () => {
    render(<BalancesView groups={[trip, group]} />);
    expect(screen.queryByText("Matteo Mucciarella")).toBeNull();
    expect(screen.getByRole("button", { name: /trip/ })).toHaveTextContent("you owe");
    await userEvent.click(screen.getByRole("button", { name: /berkeley/ }));
    expect(screen.getByText("Matteo Mucciarella")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /berkeley/ }));
    expect(screen.queryByText("Matteo Mucciarella")).toBeNull();
  });

  it("puts all-square groups last, with nothing to open", () => {
    const square = { ...group, group: "flat", myBalance: 0, people: [] };
    render(<BalancesView groups={[square, trip]} />);
    const names = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(names[0]).toMatch(/^trip/);
    expect(names[1]).toMatch(/^flatAll square/);
    expect(screen.queryByRole("button", { name: /flat/ })).toBeNull();
  });

  it("says what to do when nothing has been imported", () => {
    render(<BalancesView groups={[]} />);
    expect(screen.getByText(/Import a Splitwise export/)).toBeTruthy();
  });

  // protects=nobody expects the Splitwise app's simplified numbers; fails_when=the caveat is removed
  it("explains the amounts are not simplified like in Splitwise", () => {
    render(<BalancesView groups={[group]} />);
    expect(screen.getByText(/simplifies debts/)).toBeTruthy();
  });
});
