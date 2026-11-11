import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

const invoke = vi.fn();
const toastError = vi.fn((_m: string, _o?: unknown) => {});
const inserted: Array<Record<string, unknown>> = [];
const onlyFlowRules = { current: false };
// How the mocked database answers: the rules list, a delete, an insert.
const db = {
  rules: "ok" as "ok" | "error" | "empty" | "pending" | "legacy",
  rulesReads: 0,
  table: "",
  deleted: [] as string[],
  deleteError: null as Error | null,
  insertError: null as Error | null,
};
let search: Record<string, string> = {};

const toastSuccess = vi.fn();
// Polish 3 #9: the real sonner closes a toast when its action is clicked (unless the click
// calls preventDefault: node_modules/sonner/dist/index.mjs, action onClick), so a second click
// on Re-sort can't happen. This mock doesn't render toasts, so that is not tested here.
const toastInfo = vi.fn((_m: string, _o?: unknown) => "");
const toastDismiss = vi.fn();
const toastLoading = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (m: string, o?: unknown) => (o ? toastSuccess(m, o) : toastSuccess(m)),
    error: (m: string, o?: unknown) => (o ? toastError(m, o) : toastError(m)),
    info: (m: string, o?: unknown) => toastInfo(m, o),
    loading: (m: string, o?: unknown) => toastLoading(m, o),
    dismiss: (id: unknown) => toastDismiss(id),
  },
}));

// Spied on, not replaced: tests can wait until a failed call has been turned into a message.
const errorMessages = vi.hoisted(() => ({ calls: [] as Promise<string>[] }));
vi.mock("@/lib/function-error", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/function-error")>();
  return {
    ...real,
    functionErrorMessage: (...args: Parameters<typeof real.functionErrorMessage>) => {
      const message = real.functionErrorMessage(...args);
      errorMessages.calls.push(message);
      return message;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order"]) q[m] = () => q;
  q["then"] = (resolve: (v: unknown) => void) => {
    if (db.table === "category_rules") db.rulesReads++;
    if (db.rules === "pending") return;
    if (db.rules === "error") return resolve({ data: null, error: new Error("down") });
    if (db.rules === "empty") return resolve({ data: [], error: null });
    // A rule from before the 200-character cap: the database refuses to insert it again.
    if (db.rules === "legacy")
      return resolve({
        data: [
          {
            id: "old",
            match_field: "creditor_name",
            match_text: "x".repeat(201),
            match_mode: "contains",
            set_category: "Shopping",
            set_transaction_type: null,
            set_flow_type: null,
            priority: 1,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      });
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
const navigate = vi.fn();
vi.spyOn(Route, "useNavigate").mockImplementation((() => navigate) as never);

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
  navigate.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastInfo.mockClear();
  toastDismiss.mockReset();
  toastLoading.mockReset();
  errorMessages.calls.length = 0;
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

  // Polish pass 4 #20: the third look for a delete button; Subscriptions' is ghost + red on hover.
  it("styles delete like the other lists", async () => {
    renderPage();
    const remove = await screen.findByRole("button", { name: "Delete rule for Netflix" });
    expect(remove).toHaveClass("hover:text-negative");
    expect(remove).not.toHaveClass("hover:bg-negative/10");
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

  // Polish pass 4 #21: labels were 13px; other forms use text-xs.
  it("sizes form labels like the other forms", async () => {
    renderPage();
    await openForm();
    for (const name of ["Look in", "Match", "Text to look for", "Set category", "Set type"]) {
      expect(screen.getByText(name, { selector: "label, span" })).toHaveClass("text-xs");
    }
  });

  // Polish pass 4 #18: each picker's name was read twice (the visible label, then aria-label).
  it("names each picker by its visible label", async () => {
    renderPage();
    await openForm();
    for (const name of ["Look in", "Match"]) {
      const group = screen.getByRole("radiogroup", { name });
      expect(group).not.toHaveAttribute("aria-label");
      expect(
        document.getElementById(group.getAttribute("aria-labelledby") ?? ""),
      ).toHaveTextContent(name);
    }
  });

  // Regression: the form's labels weren't tied to their fields, so screen readers read the
  // match-text box and the pickers with no name.
  it("names every field of the new-rule form", async () => {
    renderPage();
    await openForm();
    expect(screen.getByLabelText("Text to look for")).toHaveAttribute("type", "text");
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

  // Polish pass 4 #23: New rule lined up with the subtitle's last line, unlike Who owes you.
  it("lines New rule up with the title, like Who owes you", async () => {
    renderPage();
    const header = (await screen.findByRole("heading", { name: "Rules", level: 1 })).closest(
      "header",
    );
    expect(header).toHaveClass("items-start");
  });

  it("counts the rules above the list", async () => {
    renderPage();
    expect(await screen.findByText("3 rules")).toBeTruthy();
  });

  it("closes the form with Cancel", async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Text to look for")).toBeNull();
    expect(screen.getByRole("button", { name: "New rule" })).toBeTruthy();
  });

  it("asks for text, then for something to set, before saving", async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type the text to look for.");
    fireEvent.change(screen.getByLabelText("Text to look for"), { target: { value: "Spotify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a category, a type, or both.");
    expect(inserted).toHaveLength(0);
  });
});

// Polish pass 4 #10: the message stayed after the field was filled in.
describe("form message", () => {
  it("clears the message once you change the form", async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Text to look for"), { target: { value: "Spotify" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// Polish pass 4 #17: the message was announced but not tied to the field it is about.
describe("form message and its field", () => {
  it("marks the field that needs fixing and moves focus to it", async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    const text = screen.getByLabelText("Text to look for");
    expect(text).toHaveAttribute("aria-invalid", "true");
    expect(text.getAttribute("aria-describedby")).toContain("rule-form-error");
    expect(text).toHaveFocus();
    fireEvent.change(text, { target: { value: "Spotify" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    const category = screen.getByLabelText("Set category");
    expect(category).toHaveAttribute("aria-invalid", "true");
    expect(category).toHaveAccessibleDescription("Pick a category, a type, or both.");
    expect(category).toHaveFocus();
    expect(text).not.toHaveAttribute("aria-invalid");
  });
});

describe("form focus and keys", () => {
  it("focuses Text on open; Escape closes and focus returns to New rule", async () => {
    renderPage();
    await openForm();
    expect(screen.getByLabelText("Text to look for")).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText("Text to look for"), { key: "Escape" });
    expect(screen.queryByLabelText("Text to look for")).toBeNull();
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

  // Polish pass 4 #12: vague hints, and "Anywhere" in the picker but "contains" in the list.
  it("explains each mode with an example, in the list's words", async () => {
    renderPage();
    await openForm();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Name",
      "Description",
      "Either",
      "Whole word",
      "Exact",
      "Contains",
    ]);
    fireEvent.change(screen.getByLabelText("Text to look for"), { target: { value: "Netflix" } });
    fireEvent.click(screen.getByRole("radio", { name: "Exact" }));
    expect(
      screen.getByText(
        "Matches only when the whole name or description is exactly this, ignoring case: “Netflix” finds “NETFLIX”, not “Netflix Italia”.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Contains" }));
    expect(
      screen.getByText("Matches it anywhere, even inside other words: “bar” finds “Barclays” too."),
    ).toBeTruthy();
  });

  it("saves new rules as whole-word matches by default", async () => {
    renderPage();
    await openForm();
    expect(screen.getByRole("radio", { name: "Whole word" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.change(screen.getByLabelText("Text to look for"), { target: { value: "bar" } });
    expect(screen.queryByText(/is in “Barclays”/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Contains" }));
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
    expect(screen.getByLabelText("Text to look for")).toHaveAttribute("maxLength", "200");
  });

  it("opens the form filled in when coming from a transaction", async () => {
    search = { text: "BAR ROMA", category: "Dine Out" };
    renderPage();
    expect(await screen.findByLabelText("Text to look for")).toHaveValue("BAR ROMA");
    expect(screen.getByLabelText("Set category")).toHaveValue("Dine Out");
  });

  // Polish pass 4 #13: a filled-in form gave no hint of what it would save.
  it("sums up the rule it will save", async () => {
    search = { text: "BAR ROMA", category: "Dine Out" };
    renderPage();
    expect(await screen.findByText("Name has the word “BAR ROMA” → Dine Out")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Set type"), { target: { value: "Subscription" } });
    expect(screen.getByText("Name has the word “BAR ROMA” → Dine Out, Subscription")).toBeTruthy();
  });

  // Polish pass 4 #13: the link's text stayed in the address, so Back reopened the form.
  it("drops the link's text from the address when the form closes", async () => {
    search = { text: "BAR ROMA", category: "Dine Out" };
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(navigate).toHaveBeenCalledWith({ search: {}, replace: true });
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

  // Polish pass 4 #16: a screen reader ran each name into the row before it.
  it("reads the examples as a list", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        changes: 2,
        sample: [
          { name: "Bar Roma", from: null, to: "Dine Out" },
          { name: "Esselunga", from: "Shopping", to: "Groceries" },
        ],
      },
      error: null,
    });
    await open();
    const list = await screen.findByRole("list");
    expect(Array.from(list.children).map((li) => li.getAttribute("role"))).toEqual([
      "listitem",
      "listitem",
    ]);
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

  // pass5 #5: the Update button is disabled while it works, so the browser drops focus to the
  // page; after a failure focus goes back to it, ready to try again
  it("puts focus back on Update when applying fails", async () => {
    invoke.mockResolvedValueOnce({ data: { changes: 2, sample: [] }, error: null });
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Update 2 transactions" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Update 2 transactions" }),
      ),
    );
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

  // pass5 #6: Escape closed the rule form but not this panel
  it("closes on Escape, but not while it is updating", async () => {
    invoke.mockResolvedValueOnce({ data: { changes: 2, sample: [] }, error: null });
    invoke.mockReturnValueOnce(new Promise(() => {})); // the update never finishes
    await open();
    const update = await screen.findByRole("button", { name: "Update 2 transactions" });
    fireEvent.click(update);
    await waitFor(() => expect(update).toBeDisabled());
    fireEvent.keyDown(update, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Apply to past transactions" })).toBeTruthy();
    cleanup();
    invoke.mockResolvedValueOnce({ data: { changes: 0, sample: [] }, error: null });
    await open();
    fireEvent.keyDown(await screen.findByRole("heading", { name: "Apply to past transactions" }), {
      key: "Escape",
    });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Apply to past transactions" })).toBeNull(),
    );
  });

  // Polish pass 4 #8: the panel sat between "3 rules" and the list it counts.
  it("opens above the rules count, which stays with its list", async () => {
    invoke.mockResolvedValueOnce({ data: { changes: 0, sample: [] }, error: null });
    await open();
    const panel = await screen.findByRole("heading", { name: "Apply to past transactions" });
    const count = screen.getByText("3 rules");
    expect(panel.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Polish pass 4 #22: it opens where the form does, with different padding (edges jumped).
  it("has the same padding as the new-rule form", async () => {
    invoke.mockResolvedValueOnce({ data: { changes: 0, sample: [] }, error: null });
    await open();
    const panel = (
      await screen.findByRole("heading", { name: "Apply to past transactions" })
    ).closest(".rounded-lg");
    expect(panel).toHaveClass("p-5", "sm:p-6");
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
    // Polish pass 4 #15: "Make one here" didn't say how, and gave no example.
    expect(
      screen.getByText(
        "Use New rule above, or change a transaction's category and pick Make a rule. For example: Name has the word “Netflix” → Entertainment.",
      ),
    ).toBeTruthy();
  });
});

describe("deleting a rule", () => {
  it("removes it and says so", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Rule deleted", expect.anything()),
    );
    expect(db.deleted).toEqual(["r1"]);
  });

  // pass5 #7: the deleted row's button went away and keyboard focus fell to the page
  it("moves focus to the next rule's delete button", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Delete rule for Revolut" }),
      ),
    );
  });

  it("moves focus to the rule above when the last one is deleted", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Mum" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Delete rule for Revolut" }),
      ),
    );
  });

  // Polish pass 4 #11: one tap deleted a rule for good.
  it("puts the rule back from Undo", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Rule deleted", {
        action: { label: "Undo", onClick: expect.any(Function) },
      }),
    );
    const undo = toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    undo.action.onClick();
    await waitFor(() =>
      expect(inserted).toEqual([
        {
          match_field: "creditor_name",
          match_text: "Netflix",
          match_mode: "contains",
          set_category: "Entertainment",
          set_transaction_type: null,
          set_flow_type: null,
          priority: 1,
          // Re-audit of #11: without its date the restored rule sank below rules it used to beat.
          created_at: "2026-10-01T00:00:00Z",
          user_id: "u1",
        },
      ]),
    );
  });

  // pass5 #3: a rule longer than the cap can't be saved again, so Undo would always fail
  it("offers no Undo for a rule the database wouldn't take back", async () => {
    db.rules = "legacy";
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Delete rule for x+/ }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess.mock.calls[0]?.[1]).not.toHaveProperty("action");
  });

  it("says so when Undo can't save the rule again", async () => {
    db.insertError = new Error("down");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    (toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } }).action.onClick();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't restore the rule. Add it again."),
    );
  });

  it("puts the rule back and shows the error when the delete fails", async () => {
    db.deleteError = new Error("permission denied for table category_rules");
    renderPage();
    const remove = await screen.findByRole("button", { name: "Delete rule for Netflix" });
    db.rules = "pending"; // the refetch after the failure never lands: only the rollback restores it
    fireEvent.click(remove);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't delete the rule. Try again."),
    );
    expect(screen.getByText("“Netflix”")).toBeTruthy();
  });
});

describe("adding a rule", () => {
  const fillAndSave = async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText("Text to look for"), { target: { value: "Spotify" } });
    fireEvent.change(screen.getByLabelText("Set type"), { target: { value: "Subscription" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
  };

  it("closes the form and reloads the list on success", async () => {
    renderPage();
    await screen.findByText("“Netflix”");
    const reads = db.rulesReads;
    await fillAndSave();
    await waitFor(() => expect(screen.queryByLabelText("Text to look for")).toBeNull());
    await waitFor(() => expect(db.rulesReads).toBeGreaterThan(reads));
  });

  it("keeps the form open with the error when saving fails", async () => {
    db.insertError = new Error("Rule text is too long");
    renderPage();
    await fillAndSave();
    // Polish pass 4 #9: the database's own message showed here.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save the rule. Try again.",
    );
    expect(screen.getByLabelText("Text to look for")).toHaveValue("Spotify");
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
    fireEvent.change(screen.getByLabelText("Text to look for"), { target: { value: "Spotify" } });
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

describe("re-sorting what a deleted rule filed", () => {
  const netflix = {
    match_field: "creditor_name",
    match_text: "Netflix",
    match_mode: "contains",
    set_category: "Entertainment",
  };
  const answer = (changes: number) => ({ data: { changes, sample: [] }, error: null });
  type Offer = { action: { label: string; onClick: () => void } };

  it("offers to re-sort the rows only that rule explained, then sends them back to the sync", async () => {
    invoke.mockResolvedValue(answer(3));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith("3 transactions still filed by this rule", {
        id: "resort-r1",
        description:
          "Re-sort them: they show as uncategorized until the next sync sorts them again.",
        action: { label: "Re-sort", onClick: expect.any(Function) },
      }),
    );
    expect(invoke).toHaveBeenCalledWith("reapply-rules", {
      body: { apply: false, retired: netflix },
    });
    (toastInfo.mock.calls[0] as unknown as [string, Offer])[1].action.onClick();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "3 transactions will be re-sorted at the next sync",
        { id: "resort-r1" },
      ),
    );
    expect(invoke).toHaveBeenLastCalledWith("reapply-rules", {
      body: { apply: true, retired: netflix },
    });
  });

  it("offers nothing when no row is left to re-sort", async () => {
    invoke.mockResolvedValue(answer(0));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("doesn't ask for a rule that sets no category", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Revolut" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stays quiet when the check fails: the delete itself worked", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("down") });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    // Polish 3 #8: wait until the failed check reached its error path, not just a tick.
    await waitFor(() => expect(errorMessages.calls).toHaveLength(1));
    await errorMessages.calls[0];
    await new Promise((r) => setTimeout(r, 0)); // let offerResort's catch run (microtasks only)
    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("Undo takes the offer away, even one still being checked", async () => {
    let finish: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((r) => (finish = r)));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    (toastSuccess.mock.calls[0]?.[1] as Offer).action.onClick(); // Undo before the count is back
    finish(answer(3));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("Undo closes an offer already showing", async () => {
    invoke.mockResolvedValue(answer(2));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    (toastSuccess.mock.calls[0]?.[1] as Offer).action.onClick();
    expect(toastDismiss).toHaveBeenCalledWith("resort-r1");
  });

  it("says so when re-sorting fails", async () => {
    invoke
      .mockResolvedValueOnce(answer(2))
      .mockResolvedValueOnce({ data: null, error: new Error("down") });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    (toastInfo.mock.calls[0] as unknown as [string, Offer])[1].action.onClick();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't update your transactions.", {
        id: "resort-r1",
      }),
    );
  });

  // Polish 1 #1: one shared toast handle meant Undo on the first of two deletes closed the
  // second rule's offer and left the restored rule's offer up.
  it("Undo closes that rule's own offer when two rules were deleted", async () => {
    inserted.push({
      match_field: "creditor_name",
      match_text: "Bar",
      match_mode: "word",
      set_category: "Dine Out",
      set_transaction_type: null,
      priority: 100,
    });
    invoke.mockResolvedValue(answer(2));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Bar" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(2));
    (toastSuccess.mock.calls[0]?.[1] as Offer).action.onClick(); // Undo Netflix
    expect(toastDismiss).toHaveBeenCalledTimes(1);
    expect(toastDismiss).toHaveBeenCalledWith("resort-r1");
  });

  // Polish 1 #3: Transfer rows never change, so deleting a Transfer rule asks nothing.
  it("doesn't ask for a Transfer rule", async () => {
    inserted.push({
      match_field: "creditor_name",
      match_text: "Savings",
      match_mode: "word",
      set_category: "Transfer",
      set_transaction_type: null,
      priority: 100,
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Savings" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(invoke).not.toHaveBeenCalled();
  });

  // Polish 1 #12: Re-sort, then Undo the delete. The rows are already uncategorized; the
  // restored rule files them again at the next sync, so Undo just puts the rule back.
  it("Undo after a re-sort still puts the rule back", async () => {
    invoke.mockResolvedValue(answer(2));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    (toastInfo.mock.calls[0] as unknown as [string, Offer])[1].action.onClick();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "2 transactions will be re-sorted at the next sync",
        { id: "resort-r1" },
      ),
    );
    (toastSuccess.mock.calls[0]?.[1] as Offer).action.onClick();
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  // Polish 3 #1: after a Re-sort, categories on every page are read again.
  it("refreshes the data after a re-sort", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    invoke.mockResolvedValue(answer(2));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    invalidate.mockClear();
    (toastInfo.mock.calls[0] as unknown as [string, Offer])[1].action.onClick();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "2 transactions will be re-sorted at the next sync",
        { id: "resort-r1" },
      ),
    );
    const refreshesTransactions = invalidate.mock.calls.some(([filters]) => {
      const predicate = (
        filters as unknown as { predicate?: (q: { queryKey: unknown[] }) => boolean }
      )?.predicate;
      return predicate?.({ queryKey: ["transactions"] }) === true;
    });
    invalidate.mockRestore();
    expect(refreshesTransactions).toBe(true);
  });

  // Polish 3 #2: a rule from before the 200-character cap has no Undo, but its rows still need
  // re-sorting, so the offer stays (the server takes text up to 2000 characters).
  it("still offers a re-sort for a rule longer than 200 characters", async () => {
    db.rules = "legacy";
    invoke.mockResolvedValue(answer(1));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Delete rule for x+/ }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("reapply-rules", {
      body: {
        apply: false,
        retired: {
          match_field: "creditor_name",
          match_text: "x".repeat(201),
          match_mode: "contains",
          set_category: "Shopping",
        },
      },
    });
  });

  // Polish 3 #3: the offer closes on click; "Re-sorting…" shows until the answer replaces it.
  it("shows that it's re-sorting, then the result in the same toast", async () => {
    let finish: (v: unknown) => void = () => {};
    invoke.mockResolvedValueOnce(answer(2)).mockReturnValueOnce(new Promise((r) => (finish = r)));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    (toastInfo.mock.calls[0] as unknown as [string, Offer])[1].action.onClick();
    expect(toastLoading).toHaveBeenCalledWith("Re-sorting…", { id: "resort-r1" });
    finish(answer(2));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "2 transactions will be re-sorted at the next sync",
        {
          id: "resort-r1",
        },
      ),
    );
  });

  // Polish 3 #4: leave the page while the count loads. The offer still shows (toasts are
  // app-wide) and Re-sort still works from the next page.
  it("still offers and re-sorts after you leave the page", async () => {
    let count: (v: unknown) => void = () => {};
    invoke.mockReturnValueOnce(new Promise((r) => (count = r))).mockResolvedValueOnce(answer(2));
    const { unmount } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete rule for Netflix" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    unmount();
    count(answer(2));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    (toastInfo.mock.calls[0] as unknown as [string, Offer])[1].action.onClick();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "2 transactions will be re-sorted at the next sync",
        {
          id: "resort-r1",
        },
      ),
    );
  });

  // Polish 3 #5: with no cached list there's no rule to restore or check: just "Rule deleted".
  it("deletes with an empty cache: no Undo, no check", async () => {
    renderPage();
    const remove = await screen.findByRole("button", { name: "Delete rule for Netflix" });
    const read = vi.spyOn(QueryClient.prototype, "getQueryData").mockReturnValue(undefined);
    fireEvent.click(remove);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    read.mockRestore();
    expect(toastSuccess).toHaveBeenCalledWith("Rule deleted");
    expect(invoke).not.toHaveBeenCalled();
  });
});
