import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const invoke = vi.fn();
const inserted: Array<Record<string, unknown>> = [];
let search: Record<string, string> = {};

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
          match_mode: null,
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
          match_mode: "exact",
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
          match_mode: "word",
          set_category: null,
          set_transaction_type: null,
          set_flow_type: "spend",
          priority: 100,
          created_at: "2026-10-03T00:00:00Z",
        },
      ],
      error: null,
    });
  q["insert"] = (row: Record<string, unknown>) => (
    inserted.push(row),
    Promise.resolve({ error: null })
  );
  return {
    supabase: {
      from: () => q,
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
      auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    },
  };
});

import { Route } from "./rules";
import { isLooseMatch } from "@/lib/rules";
vi.spyOn(Route, "useSearch").mockImplementation((() => search) as never);

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
    expect(screen.getByLabelText("this text")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("How it matches").tagName).toBe("SELECT");
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

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );

describe("match modes", () => {
  it("shows how each rule matches; older rules without a mode match anywhere", async () => {
    renderPage();
    await screen.findByText("“Netflix”");
    expect(screen.getByText("“Netflix”").parentElement).toHaveTextContent(
      "Creditor name contains “Netflix”",
    );
    expect(screen.getByText("“Revolut”").parentElement).toHaveTextContent("is exactly “Revolut”");
    expect(screen.getByText("“Mum”").parentElement).toHaveTextContent("has the word “Mum”");
  });

  it("warns about short text only when it can match inside other words", () => {
    expect(isLooseMatch("bar", "contains")).toBe(true);
    expect(isLooseMatch("bar", "word")).toBe(false);
    expect(isLooseMatch("netflix", "contains")).toBe(false);
    expect(isLooseMatch("  ", "contains")).toBe(false);
  });

  it("saves new rules as whole-word matches by default", async () => {
    inserted.length = 0;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Add rule/ }));
    fireEvent.change(screen.getByLabelText("this text"), { target: { value: "bar" } });
    expect(screen.queryByText(/is in “Barclays”/)).toBeNull();
    fireEvent.change(screen.getByLabelText("How it matches"), { target: { value: "contains" } });
    expect(screen.getByText(/is in “Barclays”/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("How it matches"), { target: { value: "word" } });
    fireEvent.click(screen.getByLabelText("set type (optional)"));
    fireEvent.click(await screen.findByRole("button", { name: "Subscription" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Add rule/ }).at(-1)!);
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({ match_mode: "word", match_text: "bar" });
  });

  it("opens the form filled in when coming from a transaction", async () => {
    search = { text: "BAR ROMA", category: "Dine Out" };
    renderPage();
    expect(await screen.findByLabelText("this text")).toHaveValue("BAR ROMA");
    expect(screen.getByLabelText("set category (optional)")).toHaveTextContent("Dine Out");
    search = {};
  });
});

describe("apply to past transactions", () => {
  it("previews the changes, then applies them", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({
      data: { changes: 2, sample: [{ name: "Bar Roma", from: "Others", to: "Dine Out" }] },
      error: null,
    });
    invoke.mockResolvedValueOnce({ data: { changes: 2, sample: [] }, error: null });
    renderPage();
    await screen.findByText("“Netflix”"); // the button waits for the rules
    fireEvent.click(screen.getByRole("button", { name: "Check what would change" }));
    expect(await screen.findByText("2 transactions would change, for example:")).toBeTruthy();
    expect(invoke).toHaveBeenLastCalledWith("reapply-rules", { body: { apply: false } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to 2 transactions" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("reapply-rules", { body: { apply: true } }),
    );
    expect(await screen.findByRole("button", { name: "Check what would change" })).toBeTruthy();
  });

  it("says so when nothing would change", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: { changes: 0, sample: [] }, error: null });
    renderPage();
    await screen.findByText("“Netflix”"); // the button waits for the rules
    fireEvent.click(screen.getByRole("button", { name: "Check what would change" }));
    expect(await screen.findByText(/Nothing to change/)).toBeTruthy();
  });

  it("keeps the check button when the server fails", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    renderPage();
    await screen.findByText("“Netflix”"); // the button waits for the rules
    fireEvent.click(screen.getByRole("button", { name: "Check what would change" }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Check what would change" })).toBeEnabled();
  });
});
