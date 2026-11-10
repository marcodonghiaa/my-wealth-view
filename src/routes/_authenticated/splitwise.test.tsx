import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The demo client mirrors the real tables: split bills plus Splitwise groups on both sides.
vi.mock("@/integrations/supabase/client", async () => {
  const { createFakeClient } = await import("@/lib/demo/fake-client");
  return { supabase: createFakeClient(new Date("2026-11-08T12:00:00Z")) };
});

import { Route } from "./splitwise";

const Page = Route.options.component as () => React.JSX.Element;

// protects=Who owes you answers with one net figure first, the two totals below it (#10);
// fails_when=the net is missing, or shows €0.00 while the balances are still loading
describe("Who owes you", () => {
  it("shows a loading state, then the net owed above the two totals", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("status", { name: "Loading balances" })).toBeTruthy();
    expect(screen.queryByText("Net owed to you")).toBeNull();

    const label = await screen.findByText("Net owed to you");
    const hero = label.closest("section")!;
    const owed = screen.getByText("Owed to you");
    const euros = (el: Element | null | undefined) =>
      Number(el!.textContent!.replace(/[^\d.]/g, ""));
    const net =
      euros(owed.nextElementSibling) - euros(screen.getByText("You owe").nextElementSibling);
    expect(net).toBeGreaterThan(0);
    expect(euros(hero.querySelector(".figure-display"))).toBeCloseTo(net, 2);
    expect(hero.compareDocumentPosition(owed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers the Splitwise import after the balances, not above them", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    const importButton = await screen.findByRole("button", { name: "Import from Splitwise" });
    const groups = screen.getByText(/Splitwise groups/);
    expect(
      groups.compareDocumentPosition(importButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
