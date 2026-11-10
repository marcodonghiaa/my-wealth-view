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

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
const openForm = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "New rule" }));

describe("Rules list", () => {
  // Regression: the delete button was 28px, hard to hit with a thumb on a phone.
  it("has a delete button big enough to tap (44px)", async () => {
    renderPage();
    const remove = await screen.findByRole("button", { name: "Delete rule for Netflix" });
    expect(remove).toHaveClass("size-11");
  });

  // Regression: the form's labels weren't tied to their fields, so screen readers read the
  // match-text box and the pickers with no name.
  it("names every field of the new-rule form", async () => {
    renderPage();
    await openForm();
    expect(screen.getByLabelText("Text")).toHaveAttribute("type", "text");
    expect(screen.getByRole("radiogroup", { name: "Look in" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Match" })).toBeTruthy();
    for (const label of ["Set category", "Set type"]) {
      expect(screen.getByLabelText(label).tagName).toBe("SELECT");
    }
  });

  it("closes the form with Cancel", async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Text")).toBeNull();
    expect(screen.getByRole("button", { name: "New rule" })).toBeTruthy();
  });

  it("asks for text, then for something to set, before saving", async () => {
    inserted.length = 0;
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type the text to look for.");
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Spotify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a category, a type, or both.");
    expect(inserted).toHaveLength(0);
  });
});

describe("form focus and keys", () => {
  it("focuses Text on open; Escape closes and focus returns to New rule", async () => {
    renderPage();
    await openForm();
    expect(screen.getByLabelText("Text")).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText("Text"), { key: "Escape" });
    expect(screen.queryByLabelText("Text")).toBeNull();
    expect(screen.getByRole("button", { name: "New rule" })).toHaveFocus();
  });

  // A category from a link that isn't in your list (renamed since) must not be saved unseen.
  it("ignores a prefilled category that isn't in your list", async () => {
    inserted.length = 0;
    search = { text: "BAR ROMA", category: "Gone category" };
    renderPage();
    expect(await screen.findByLabelText("Set category")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a category, a type, or both.");
    expect(inserted).toHaveLength(0);
    search = {};
  });
});

describe("flow rules", () => {
  // Regression risk: a rule from To review has no category or type and looked empty.
  it("shows a flow-only rule's effect", async () => {
    renderPage();
    expect(await screen.findByText("Count as transfer")).toBeTruthy();
    expect(screen.getByText("Not a transfer")).toBeTruthy();
  });
});

describe("match modes", () => {
  it("shows how each rule matches; older rules without a mode match anywhere", async () => {
    renderPage();
    await screen.findByText("“Netflix”");
    expect(screen.getByText("“Netflix”").parentElement).toHaveTextContent(
      "Name contains “Netflix”",
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
    await openForm();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "bar" } });
    expect(screen.queryByText(/is in “Barclays”/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Anywhere" }));
    expect(screen.getByText(/is in “Barclays”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Whole word" }));
    fireEvent.change(screen.getByLabelText("Set type"), { target: { value: "Subscription" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({
      match_field: "creditor_name",
      match_mode: "word",
      match_text: "bar",
      set_category: null,
      set_transaction_type: "Subscription",
    });
  });

  it("opens the form filled in when coming from a transaction", async () => {
    search = { text: "BAR ROMA", category: "Dine Out" };
    renderPage();
    expect(await screen.findByLabelText("Text")).toHaveValue("BAR ROMA");
    expect(screen.getByLabelText("Set category")).toHaveValue("Dine Out");
    search = {};
  });
});

describe("apply to past transactions", () => {
  const open = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Apply to past transactions" }));
  };

  it("previews the changes as soon as it opens, then applies them", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({
      data: { changes: 2, sample: [{ name: "Bar Roma", from: "Others", to: "Dine Out" }] },
      error: null,
    });
    invoke.mockResolvedValueOnce({ data: { changes: 2, sample: [] }, error: null });
    await open();
    expect(await screen.findByText(/would change, for example/)).toHaveTextContent(
      "2 transactions would change, for example:",
    );
    expect(screen.getByText("Bar Roma")).toBeTruthy();
    expect(invoke).toHaveBeenLastCalledWith("reapply-rules", { body: { apply: false } });
    fireEvent.click(screen.getByRole("button", { name: "Update 2 transactions" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("reapply-rules", { body: { apply: true } }),
    );
    expect(await screen.findByRole("button", { name: "Apply to past transactions" })).toBeTruthy();
  });

  it("says so when nothing would change", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: { changes: 0, sample: [] }, error: null });
    await open();
    expect(await screen.findByText(/Nothing to change/)).toBeTruthy();
  });

  it("shows the error with a retry when the server fails", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    invoke.mockResolvedValueOnce({ data: { changes: 0, sample: [] }, error: null });
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't apply your rules");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Nothing to change/)).toBeTruthy();
  });
});
