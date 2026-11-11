import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

const invoke = vi.fn();
const toastError = vi.fn();
const inserted: Array<Record<string, unknown>> = [];
const onlyFlowRules = { current: false };
// How the mocked database answers: the rules list, a delete, an insert.
const db = {
  rules: "ok" as "ok" | "error" | "empty" | "pending",
  rulesReads: 0,
  table: "",
  deleted: [] as string[],
  deleteError: null as Error | null,
  insertError: null as Error | null,
};
let search: Record<string, string> = {};

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order"]) q[m] = () => q;
  q["then"] = (resolve: (v: unknown) => void) => {
    if (db.table === "category_rules") db.rulesReads++;
    if (db.rules === "pending") return;
    if (db.rules === "error") return resolve({ data: null, error: new Error("down") });
    if (db.rules === "empty") return resolve({ data: [], error: null });
    return resolve({
      data: [
        {
          id: "r1",
          match_field: "creditor_name",
          match_text: "Netflix",
          match_mode: "contains",
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
        // Rules saved during the test show up on the next read, like the real table.
        ...inserted.map((r, i) => ({
          id: `new${i}`,
          set_flow_type: null,
          created_at: "2026-11-01T00:00:00Z",
          ...r,
        })),
      ].filter((r) => !onlyFlowRules.current || !("set_category" in r) || r.set_category === null),
      error: null,
    });
  };
  q["insert"] = (row: Record<string, unknown>) => (
    inserted.push(row),
    Promise.resolve({ error: db.insertError })
  );
  q["delete"] = () => ({
    eq: (_col: string, id: string) => (
      db.deleted.push(id),
      Promise.resolve({ error: db.deleteError })
    ),
  });
  return {
    supabase: {
      from: (table: string) => ((db.table = table), q),
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
      auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    },
  };
});

import { Route } from "./rules";
vi.spyOn(Route, "useSearch").mockImplementation((() => search) as never);

// Shared mock state goes back to defaults after every test, even one that fails half-way.
afterEach(() => {
  search = {};
  inserted.length = 0;
  onlyFlowRules.current = false;
  Object.assign(db, {
    rules: "ok",
    rulesReads: 0,
    deleted: [],
    deleteError: null,
    insertError: null,
  });
  invoke.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

const Page = Route.options.component as () => React.JSX.Element;

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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

  // Polish pass 4 #7: these were 36px tall.
  it("makes every button on the page at least 44px tall", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    renderPage();
    const apply = await screen.findByRole("button", { name: "Apply to past transactions" });
    expect(apply).toHaveClass("min-h-11");
    await openForm();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveClass("min-h-11");
    fireEvent.click(apply);
    expect(await screen.findByRole("button", { name: "Try again" })).toHaveClass("min-h-11");
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

  // Polish pass 4 #5: "sort" read as ordering, and "the first rule" pointed at an order you can't see.
  it("says what a rule does and which one wins", async () => {
    renderPage();
    expect(
      await screen.findByText(
        "Rules set the category or type of new transactions that match, before the AI guesses. If two rules match, the one higher in the list wins.",
      ),
    ).toBeTruthy();
  });

  it("counts the rules above the list", async () => {
    renderPage();
    expect(await screen.findByText("3 rules")).toBeTruthy();
  });

  it("closes the form with Cancel", async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Text")).toBeNull();
    expect(screen.getByRole("button", { name: "New rule" })).toBeTruthy();
  });

  it("asks for text, then for something to set, before saving", async () => {
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
    search = { text: "BAR ROMA", category: "Gone category" };
    renderPage();
    expect(await screen.findByLabelText("Set category")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a category, a type, or both.");
    expect(inserted).toHaveLength(0);
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
  it("shows how each rule matches", async () => {
    renderPage();
    await screen.findByText("“Netflix”");
    expect(screen.getByText("“Netflix”").parentElement).toHaveTextContent(
      "Name contains “Netflix”",
    );
    expect(screen.getByText("“Revolut”").parentElement).toHaveTextContent("is exactly “Revolut”");
    expect(screen.getByText("“Mum”").parentElement).toHaveTextContent("has the word “Mum”");
  });

  it("saves new rules as whole-word matches by default", async () => {
    renderPage();
    await openForm();
    expect(screen.getByRole("radio", { name: "Whole word" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
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

  // Polish pass 2 #2: rule text had no limit; the database now caps it at 200 characters.
  it("caps rule text at 200 characters, typed or from a link", async () => {
    const validate = Route.options.validateSearch as (s: Record<string, unknown>) => {
      text?: string;
    };
    expect(validate({ text: "a".repeat(300) }).text).toHaveLength(200);
    renderPage();
    await openForm();
    expect(screen.getByLabelText("Text")).toHaveAttribute("maxLength", "200");
  });

  it("opens the form filled in when coming from a transaction", async () => {
    search = { text: "BAR ROMA", category: "Dine Out" };
    renderPage();
    expect(await screen.findByLabelText("Text")).toHaveValue("BAR ROMA");
    expect(screen.getByLabelText("Set category")).toHaveValue("Dine Out");
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

  // Polish pass 4 #6: on a phone the name was cut to "Superm…" to fit "from → to" beside it.
  it("shows each example's whole name", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        changes: 1,
        sample: [{ name: "Supermercato Coop Milano", from: null, to: "Groceries" }],
      },
      error: null,
    });
    await open();
    expect(await screen.findByText("Supermercato Coop Milano")).not.toHaveClass("truncate");
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
    // Polish pass 4 #4: it said "Couldn't apply… try again" next to Try again, while only checking.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^Couldn't check your transactions\.$/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Nothing to change/)).toBeTruthy();
  });

  it("lists every change with a colon when the sample is all of them", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({
      data: { changes: 1, sample: [{ name: "Bar Roma", from: null, to: "Dine Out" }] },
      error: null,
    });
    await open();
    expect(await screen.findByText(/would change/)).toHaveTextContent(
      "1 transaction would change:",
    );
    expect(screen.getByText("Uncategorized")).toBeTruthy();
  });

  it("keeps the panel open and shows the error when applying fails", async () => {
    invoke.mockReset();
    toastError.mockReset();
    invoke.mockResolvedValueOnce({ data: { changes: 2, sample: [] }, error: null });
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Update 2 transactions" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't update your transactions."),
    );
    expect(screen.getByRole("button", { name: "Update 2 transactions" })).toBeTruthy();
  });

  // Polish pass 4 #2: keyboard focus fell to the page body on open and on close.
  it("moves focus into the preview on open and back to its button on close", async () => {
    invoke.mockResolvedValueOnce({ data: { changes: 0, sample: [] }, error: null });
    await open();
    const heading = await screen.findByRole("heading", { name: "Apply to past transactions" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Apply to past transactions" }),
      ),
    );
  });

  it("is not offered when no rule sets a category", async () => {
    onlyFlowRules.current = true;
    renderPage();
    await screen.findByText("“Revolut”");
    expect(screen.queryByRole("button", { name: "Apply to past transactions" })).toBeNull();
  });
});

// Polish pass 3 #3: these branches could be removed without any test failing.
describe("rules list states", () => {
  it("shows placeholders while the rules load", () => {
    db.rules = "pending";
    const { container } = renderPage();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByText("No rules yet")).toBeNull();
  });

  it("says so when the rules can't be loaded", async () => {
    db.rules = "error";
    renderPage();
    expect(await screen.findByText("Failed to load rules.")).toBeTruthy();
  });

  // Polish pass 3 #9: the error had no way to try again.
  it("loads the rules again from Try again", async () => {
    db.rules = "error";
    renderPage();
    await screen.findByText("Failed to load rules.");
    db.rules = "ok";
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("“Netflix”")).toBeTruthy();
  });

  it("explains how to make a first rule when there are none", async () => {
    db.rules = "empty";
    renderPage();
    expect(await screen.findByText("No rules yet")).toBeTruthy();
  });
});

describe("deleting a rule", () => {
  it("removes it and says so", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Rule deleted"));
    expect(db.deleted).toEqual(["r1"]);
  });

  it("puts the rule back and shows the error when the delete fails", async () => {
    db.deleteError = new Error("Couldn't delete");
    renderPage();
    const remove = await screen.findByRole("button", { name: "Delete rule for Netflix" });
    db.rules = "pending"; // the refetch after the failure never lands: only the rollback restores it
    fireEvent.click(remove);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't delete"));
    expect(screen.getByText("“Netflix”")).toBeTruthy();
  });
});

describe("adding a rule", () => {
  const fillAndSave = async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Spotify" } });
    fireEvent.change(screen.getByLabelText("Set type"), { target: { value: "Subscription" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
  };

  it("closes the form and reloads the list on success", async () => {
    renderPage();
    await screen.findByText("“Netflix”");
    const reads = db.rulesReads;
    await fillAndSave();
    await waitFor(() => expect(screen.queryByLabelText("Text")).toBeNull());
    await waitFor(() => expect(db.rulesReads).toBeGreaterThan(reads));
  });

  it("keeps the form open with the error when saving fails", async () => {
    db.insertError = new Error("Rule text is too long");
    renderPage();
    await fillAndSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("Rule text is too long");
    expect(screen.getByLabelText("Text")).toHaveValue("Spotify");
  });
});

describe("applying twice", () => {
  it("sends one apply while the first is still running", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: { changes: 2, sample: [] }, error: null });
    invoke.mockReturnValueOnce(new Promise(() => {})); // apply never finishes
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Apply to past transactions" }));
    const update = await screen.findByRole("button", { name: "Update 2 transactions" });
    fireEvent.click(update);
    await waitFor(() => expect(update).toBeDisabled());
    fireEvent.click(update);
    expect(
      invoke.mock.calls.filter(([, o]) => (o as { body: { apply: boolean } }).body.apply),
    ).toHaveLength(1);
  });
});

// Polish pass 3 #1: coming back to the tab re-ran the server scan under the open preview.
describe("preview and tab focus", () => {
  it("doesn't re-run the preview when the tab regains focus", async () => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { changes: 2, sample: [] }, error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Apply to past transactions" }));
    await screen.findByRole("button", { name: "Update 2 transactions" });
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((r) => setTimeout(r, 20));
    focusManager.setFocused(undefined);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

// Polish pass 3 #2: after a rule change the panel briefly showed the old count, clickable.
describe("preview after the rules change", () => {
  it("checks again instead of showing the old count when a rule is added", async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: { changes: 2, sample: [] }, error: null });
    invoke.mockReturnValue(new Promise(() => {})); // the new preview is still running
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Apply to past transactions" }));
    await screen.findByRole("button", { name: "Update 2 transactions" });
    await openForm();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Spotify" } });
    fireEvent.change(screen.getByLabelText("Set category"), { target: { value: "Entertainment" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(await screen.findByText("“Spotify”")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update 2 transactions" })).toBeNull();
    expect(screen.getByText("Checking your transactions…")).toBeTruthy();
  });

  it("closes the preview when a rule is deleted", async () => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { changes: 2, sample: [] }, error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Apply to past transactions" }));
    await screen.findByRole("button", { name: "Update 2 transactions" });
    fireEvent.click(screen.getByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Update 2 transactions" })).toBeNull(),
    );
    expect(screen.queryByText("Checking your transactions…")).toBeNull();
  });
});
