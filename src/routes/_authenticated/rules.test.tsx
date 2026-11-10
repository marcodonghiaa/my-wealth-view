import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order"]) q[m] = () => q;
  q["then"] = (resolve: (v: unknown) => void) =>
    resolve({
      data: [
        {
          id: "r1",
          match_field: "creditor_name",
          match_text: "Netflix",
          set_category: "Entertainment",
          set_transaction_type: null,
          set_flow_type: null,
          priority: 1,
          created_at: "2026-10-01T00:00:00Z",
        },
        {
          id: "r2",
          match_field: "creditor_name",
          match_text: "Revolut",
          set_category: null,
          set_transaction_type: null,
          set_flow_type: "transfer",
          priority: 100,
          created_at: "2026-10-02T00:00:00Z",
        },
        {
          id: "r3",
          match_field: "creditor_name",
          match_text: "Mum",
          set_category: null,
          set_transaction_type: null,
          set_flow_type: "spend",
          priority: 100,
          created_at: "2026-10-03T00:00:00Z",
        },
      ],
      error: null,
    });
  return { supabase: { from: () => q } };
});

import { Route } from "./rules";

const Page = Route.options.component as () => React.JSX.Element;

describe("Rules list", () => {
  // Regression: the delete button was 28px, hard to hit with a thumb on a phone.
  it("has a delete button big enough to tap (44px)", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );

    const remove = await screen.findByRole("button", { name: "Delete rule for Netflix" });

    expect(remove).toHaveClass("size-11");
  });

  // Regression: the form's labels weren't tied to their fields, so screen readers read the
  // match-text box and the pickers with no name.
  it("names every field of the new-rule form", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Add rule/ }));
    expect(screen.getByLabelText("contains this text")).toHaveAttribute("type", "text");
    for (const label of ["If this field", "set category (optional)", "set type (optional)"]) {
      expect(screen.getByLabelText(label).tagName).toBe("BUTTON");
    }
  });
});

describe("flow rules", () => {
  // Regression risk: a rule from To review has no category or type and looked empty.
  it("shows a flow-only rule's effect", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Count as transfer")).toBeTruthy();
    expect(screen.getByText("Not a transfer")).toBeTruthy();
  });
});
