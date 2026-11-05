import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { SoldHoldings } from "./sold-holdings";

// Regression: a holding marked sold vanished from the page, and adding it again failed ("already
// in your holdings"), so it could neither come back nor be deleted.
describe("SoldHoldings", () => {
  it("lists sold holdings with their edit menu, collapsed", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SoldHoldings
          items={[{ key: "IE1", name: "World ETF", target: { kind: "stock", isin: "IE1" } }]}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByText("Sold (1)"));
    expect(screen.getByText("World ETF")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit World ETF" })).toBeInTheDocument();
  });

  it("shows nothing when nothing is sold", () => {
    const { container } = render(<SoldHoldings items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
