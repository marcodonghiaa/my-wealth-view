import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
          priority: 1,
          created_at: "2026-10-01T00:00:00Z",
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
});
