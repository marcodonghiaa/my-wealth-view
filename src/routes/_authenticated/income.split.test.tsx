import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The Income page splits the month into Regular (a sender paying in 3+ of the last 6 months, or
// a rule says so) and One-off, and "Mark …" saves a rule for that name.

const db = vi.hoisted(() => ({
  window: [] as Array<Record<string, unknown>>,
  rules: [] as Array<Record<string, unknown>>,
  windowError: null as { message: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  hold: false,
}));
// A fixed clock: the page reads the date again, and a run across midnight at month end must
// not see two different months (Polish 3 #13).
const now = new Date(2026, 10, 15, 12);
const ym = (back: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const bank = (ref: string, date: string, name: string) => ({
  account_uid: "a1",
  entry_reference: ref,
  booking_date: date,
  merchant_key: name.toLowerCase(),
  creditor_name: name,
  remittance_info: null,
  amount: 100,
  currency: "EUR",
});
const view = (ref: string, name: string, eur: number) => ({
  entry_reference: ref,
  account_uid: "a1",
  booking_date: `${ym(0)}-01`,
  category: "Income",
  creditor_name: name,
  currency: "EUR",
  amount: eur,
  signed_amount_eur: eur,
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      let from = 0;
      for (const m of ["select", "order", "eq", "gte", "lt", "in", "is", "or", "delete"])
        q[m] = () => q;
      q["range"] = (f: number) => {
        from = f;
        return q;
      };
      q["maybeSingle"] = () => Promise.resolve({ data: null, error: null });
      q["insert"] = (row: Record<string, unknown>) => {
        db.inserts.push(row);
        if (!db.hold) db.rules = [...db.rules, { id: "new-rule", ...row }]; // the refetch sees it
        return q;
      };
      q["update"] = (row: Record<string, unknown>) => {
        db.updates.push(row);
        return q;
      };
      q["single"] = () =>
        db.hold
          ? new Promise(() => undefined) // a save that never answers
          : Promise.resolve({ data: { id: "new-rule", ...db.inserts.at(-1) }, error: null });
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === "v_transactions_eur"
            ? {
                data: [view("e1", "ACME Ltd", 2000), view("e2", "Aunt May", 50)],
                error: null,
              }
            : table === "transactions"
              ? { data: db.windowError ? null : db.window.slice(from), error: db.windowError }
              : table === "category_rules"
                ? { data: db.rules, error: null }
                : { data: [], error: null },
        );
      return q;
    },
  },
}));

import { toast } from "sonner";
import { Route } from "./income";

const Page = Route.options.component as () => React.JSX.Element;
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.clearAllMocks();
  db.window = [
    bank("e1", `${ym(0)}-01`, "ACME Ltd"),
    bank("p1", `${ym(1)}-01`, "ACME Ltd"),
    bank("p2", `${ym(2)}-01`, "ACME Ltd"),
    bank("e2", `${ym(0)}-01`, "Aunt May"),
  ];
  db.rules = [];
  db.windowError = null;
  db.inserts = [];
  db.updates = [];
  db.hold = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Income: Regular and One-off", () => {
  it("puts a sender paying in 3 of the last 6 months under Regular, the rest under One-off", async () => {
    renderPage();
    const regular = await screen.findByRole("region", { name: "Regular" });
    expect(within(regular).getByText("ACME Ltd")).toBeTruthy();
    const oneOff = screen.getByRole("region", { name: "One-off" });
    expect(within(oneOff).getByText("Aunt May")).toBeTruthy();
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && /^Regular /.test(el.textContent ?? ""))
        .textContent,
    ).toBe("Regular €2,000.00 · One-off €50.00");
  });

  it("follows a rule over the guess", async () => {
    db.rules = [
      {
        id: "r1",
        match_field: "creditor_name",
        match_text: "ACME Ltd",
        match_mode: "exact",
        set_income_kind: "one_off",
      },
    ];
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    expect(within(oneOff).getByText("ACME Ltd")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Regular" })).toBeNull();
  });

  it("saves an exact-name rule when you mark a row", async () => {
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    fireEvent.click(within(oneOff).getByRole("button", { name: "Mark Aunt May as regular" }));
    await vi.waitFor(() => expect(db.inserts).toHaveLength(1));
    expect(db.inserts[0]).toMatchObject({
      user_id: "u1",
      match_field: "creditor_name",
      match_text: "Aunt May",
      match_mode: "exact",
      set_income_kind: "regular",
    });
    expect(db.inserts[0]).not.toHaveProperty("set_category"); // Polish 3 #8: null by default
  });

  it("changes the rule that already decides the row instead of adding one", async () => {
    db.rules = [
      {
        id: "r1",
        match_field: "creditor_name",
        match_text: "acme",
        match_mode: "word",
        set_income_kind: "regular",
      },
    ];
    renderPage();
    const regular = await screen.findByRole("region", { name: "Regular" });
    fireEvent.click(within(regular).getByRole("button", { name: "Mark ACME Ltd as one-off" }));
    await vi.waitFor(() => expect(db.updates).toEqual([{ set_income_kind: "one_off" }]));
    expect(db.inserts).toEqual([]);
    // Polish #7: the rule may cover other names too, so the toast says which rule changed.
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "ACME Ltd now counts as one-off income",
        expect.objectContaining({ description: "Changed your rule for “acme”." }),
      ),
    );
  });

  // Polish 3 #3: no name, no rule to make; and a save in flight can't be sent twice.
  it("offers no Mark when the bank sent no name", async () => {
    db.window = db.window.map((r) =>
      r["entry_reference"] === "e2" ? { ...r, creditor_name: null } : r,
    );
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    expect(within(oneOff).getByText("Aunt May")).toBeTruthy();
    expect(within(oneOff).queryByRole("button", { name: /Mark/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Mark ACME Ltd as one-off" })).toBeTruthy();
  });

  it("disables Mark while a save is in flight, so a double click saves once", async () => {
    db.hold = true;
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    const button = within(oneOff).getByRole("button", { name: "Mark Aunt May as regular" });
    fireEvent.click(button);
    await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(
      (screen.getByRole("button", { name: "Mark ACME Ltd as one-off" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(button);
    expect(db.inserts).toHaveLength(1);
  });

  // Polish 5 B: two clicks in one frame both landed before isPending disabled the button, saving
  // two identical rules; Undo then removed only one, so it looked broken.
  it("saves one rule for a double click in one frame", async () => {
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    const button = within(oneOff).getByRole("button", { name: "Mark Aunt May as regular" });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Mark Aunt May as one-off" });
    expect(db.inserts).toHaveLength(1);
  });

  // Polish 5 C: on a phone the list shifts up when a row moves, so a quick second tap lands on
  // another row's Mark and changes it. Taps right after a save are ignored for a moment.
  it("ignores a Mark tapped right after a row moved, then works again", async () => {
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    fireEvent.click(within(oneOff).getByRole("button", { name: "Mark Aunt May as regular" }));
    await screen.findByRole("button", { name: "Mark Aunt May as one-off" });
    const changes = () => db.inserts.length + db.updates.length;
    const before = changes();
    const acme = () => screen.getByRole("button", { name: "Mark ACME Ltd as one-off" });
    fireEvent.click(acme());
    await new Promise((r) => setTimeout(r, 50));
    expect(changes()).toBe(before);
    await new Promise((r) => setTimeout(r, 600));
    fireEvent.click(acme());
    await vi.waitFor(() => expect(changes()).toBe(before + 1));
  });

  // Polish 4 #1: the button a keyboard user pressed moves with its row; focus follows it there
  // instead of dropping to the top of the page, and the Undo toast stays long enough to reach.
  it("keeps focus on the moved row's button, and gives Undo ten seconds", async () => {
    renderPage();
    const markOf = (region: HTMLElement) =>
      within(within(region).getByText("Aunt May").closest("li")!).getByRole("button", {
        name: /^Mark/,
      });
    fireEvent.click(markOf(await screen.findByRole("region", { name: "One-off" })));
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(markOf(screen.getByRole("region", { name: "Regular" }))),
    );
    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ duration: 10_000 }),
    );
  });

  // Polish 4 #8: the button names the payer for screen readers and looks like a link at rest.
  it("names the payer on Mark and underlines it", async () => {
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    const button = within(oneOff).getByRole("button", { name: "Mark Aunt May as regular" });
    expect(button.textContent).toBe("Mark as regular");
    expect(button.className).toMatch(/(^|\s)underline(\s|$)/);
  });

  it("keeps one list when the six months can't be read", async () => {
    db.windowError = { message: "boom" };
    renderPage();
    expect(await screen.findByText("Aunt May")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Regular" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark/ })).toBeNull();
    // Polish 4 #14: not silently: say why there is one list.
    expect(screen.getByText("Couldn't sort regular and one-off income: boom")).toBeTruthy();
  });
});
