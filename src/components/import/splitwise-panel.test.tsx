import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The bank review is tested on its own; here it only needs something to read.
vi.mock("./splitwise-review", () => ({
  SplitwiseReview: ({
    group,
    onImported,
    onBack,
  }: {
    group: string;
    onImported?: () => void;
    onBack: () => void;
  }) => (
    <p>
      review of {group}
      <button onClick={onImported}>finish import</button>
      <button onClick={onBack}>back</button>
    </p>
  ),
}));

const answer: { data: unknown[]; error: { message: string } | null } = { data: [], error: null };
const balances: { data: unknown[] } = { data: [] };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "limit", "eq"]) chain[m] = () => chain;
      chain["then"] = (resolve: (v: unknown) => unknown) =>
        resolve(table === "splitwise_balances" ? { ...balances, error: null } : answer);
      return chain;
    },
  },
}));

import { SplitwisePanel } from "./splitwise-panel";

const CSV = [
  "Date,Description,Category,Cost,Currency,Ann,Bob",
  "",
  "2026-08-16,Dinner,Dining out,30.00,USD,-15.00,15.00",
  "2026-08-17,Taxi,Taxi,20.00,USD,10.00,-10.00",
  "2026-08-18,Ann paid Bob,Payment,5.00,USD,5.00,-5.00",
  "",
  "2026-08-18,Total balance, , ,USD,0.00,0.00",
].join("\n");

const proceed = async () => {
  const button = (await screen.findByRole("button", { name: "Continue" })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};
const upload = (text: string, name = "berkeley_2026-10-18_export.csv") =>
  fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
    target: { files: [new File([text], name, { type: "text/csv" })] },
  });

const DINNER = "2026-08-16|Dinner|3000|USD|-1500#1";
const TAXI = "2026-08-17|Taxi|2000|USD|1000#1";
const groups = (...names: Array<string>) =>
  names.map((group_name) => ({ group_name, fingerprint: `other-${group_name}` }));

describe("SplitwisePanel", () => {
  beforeEach(() => {
    answer.data = [];
    answer.error = null;
    balances.data = [];
  });

  // protects=the user must choose who they are before anything is summed; fails_when=a default
  // member is silently picked or the summary shows early
  it("asks who you are after the file and shows no summary until chosen", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    expect(await screen.findByLabelText(/Which one are you/)).toBeTruthy();
    expect(screen.queryByText(/paid by others/i)).toBeNull();
  });

  // protects=the file name can never choose the group; fails_when=the near miss comes back: a
  // name like "berkeley 2026-11-01 export (1)" bypasses the checkpoint
  it("picks the only stored group, whatever the file is called", async () => {
    answer.data = groups("berkeley");
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV, "berkeley 2026-11-01 export (1).csv");
    expect(((await screen.findByLabelText(/^Group$/)) as HTMLSelectElement).value).toBe("berkeley");
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    await proceed();
    expect(await screen.findByText(/review of berkeley/)).toBeTruthy();
  });

  it("makes the user choose between several groups", async () => {
    answer.data = groups("berkeley", "trip");
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    const select = (await screen.findByLabelText(/^Group$/)) as HTMLSelectElement;
    expect(select.value).toBe("");
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    expect(screen.queryByText(/review of/)).toBeNull();
    fireEvent.change(select, { target: { value: "trip" } });
    fireEvent.change(screen.getByLabelText(/Which one are you/), { target: { value: "0" } });
    await proceed();
    expect(await screen.findByText(/review of trip/)).toBeTruthy();
  });

  it("asks for a name on a first import, with nothing filled in from the file", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    const input = (await screen.findByLabelText(/New group name/)) as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    expect(screen.queryByText(/review of/)).toBeNull();
  });

  const startNewGroup = async (name: string) => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    fireEvent.change(await screen.findByLabelText(/^Group$/), { target: { value: "__new__" } });
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    const input = await screen.findByLabelText(/New group name/);
    fireEvent.change(input, { target: { value: name } });
    fireEvent.blur(input);
  };

  it("refuses a new group that differs from a stored one only by case", async () => {
    answer.data = groups("berkeley");
    await startNewGroup("Berkeley");
    expect((await screen.findByRole("alert")).textContent).toMatch(/berkeley already exists/);
    expect(screen.queryByText(/review of/)).toBeNull();
  });

  // protects=the same file under any new name; fails_when=rows are imported twice
  it("refuses a new group when the file is already imported in another", async () => {
    answer.data = [DINNER, TAXI].map((fingerprint) => ({ group_name: "berkeley", fingerprint }));
    await startNewGroup("something else");
    expect((await screen.findByRole("alert")).textContent).toMatch(/already imported in berkeley/);
    expect(screen.queryByText(/review of/)).toBeNull();
  });

  it("shows a read error and no review", async () => {
    answer.error = { message: "boom" };
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
    expect(screen.queryByText(/review of/)).toBeNull();
  });

  it("refuses when the stored rows may be cut at the page limit", async () => {
    answer.data = Array.from({ length: 1000 }, () => ({ group_name: "a", fingerprint: "x" }));
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many stored/);
  });

  // protects=the summary numbers shown to the user; fails_when=share or totals are wrong
  it("shows the summary once a member is chosen", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    expect(await screen.findByText(/1 paid by others, your share 15\.00 USD/)).toBeTruthy();
    expect(screen.getByText(/1 paid by you/)).toBeTruthy();
    expect(screen.getByText(/You paid back 5\.00 USD/)).toBeTruthy();
  });

  it("tells apart two members with the same name", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV.replace("Ann,Bob", "Ann,Ann"));
    const options = await screen.findAllByRole("option", { name: /Ann/ });
    expect(options.map((o) => o.textContent)).toEqual(["Ann (column 1)", "Ann (column 2)"]);
  });

  // protects=a broken file never gets to the choice step; fails_when=errors are not blocking
  it("shows a blocking error for rows that do not add up", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV.replace("-15.00,15.00", "-15.00,10.00"));
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Which one are you/)).toBeNull();
  });

  it("rejects a file that is not a Splitwise export", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload("hello,world\n1,2\n");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Splitwise|column/i);
  });

  it("rejects an oversized file without reading it", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    const big = new File(["x"], "big.csv");
    Object.defineProperty(big, "size", { value: 3_000_000 });
    fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
      target: { files: [big] },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/too large/);
  });

  // protects=the bank is not re-read on every letter typed; fails_when=the review follows the
  // draft name instead of the finished one
  // protects=expenses and balances land in one group; fails_when=the review gets the raw text
  it("trims a new group name", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    const input = await screen.findByLabelText(/New group name/);
    fireEvent.change(input, { target: { value: " Trip " } });
    fireEvent.blur(input);
    await proceed();
    expect((await screen.findByText(/review of/)).textContent).toMatch(/^review of Trip/);
  });

  // protects=the checks see a group just created; fails_when=its case variant passes as new
  it("treats a group just imported as existing, keeping the review open", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    const input = await screen.findByLabelText(/New group name/);
    fireEvent.change(input, { target: { value: "trip" } });
    fireEvent.blur(input);
    await proceed();
    answer.data = groups("trip");
    fireEvent.click(await screen.findByRole("button", { name: "finish import" }));
    expect(screen.getByText(/review of trip/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(((await screen.findByLabelText(/^Group$/)) as HTMLSelectElement).value).toBe("trip");
  });

  it("passes a new group name to the review only when typing is done", async () => {
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    const input = await screen.findByLabelText(/New group name/);
    fireEvent.change(input, { target: { value: "trip" } });
    expect(screen.queryByText(/review of/)).toBeNull();
    fireEvent.blur(input);
    await proceed();
    expect(await screen.findByText(/review of trip/)).toBeTruthy();
  });

  // protects=the user need not say who they are again; fails_when=a saved name goes unused, or one
  // not in this file picks a wrong column
  it("remembers who you are from the group's saved balances", async () => {
    answer.data = groups("berkeley");
    balances.data = [{ person: "Bob" }];
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    const select = (await screen.findByLabelText(/Which one are you/)) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("1"));
  });

  it("asks who you are when the saved name is not in the file", async () => {
    answer.data = groups("berkeley");
    balances.data = [{ person: "Carol" }];
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    const select = (await screen.findByLabelText(/Which one are you/)) as HTMLSelectElement;
    await screen.findByLabelText(/^Group$/);
    expect(select.value).toBe("");
  });

  // protects=shares are never computed for the previous group's person; fails_when=me survives
  it("forgets who you are when the group changes", async () => {
    answer.data = groups("berkeley", "trip");
    render(<SplitwisePanel onClose={() => undefined} />);
    upload(CSV);
    const select = (await screen.findByLabelText(/Which one are you/)) as HTMLSelectElement;
    fireEvent.change(await screen.findByLabelText(/^Group$/), { target: { value: "trip" } });
    fireEvent.change(select, { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/^Group$/), { target: { value: "berkeley" } });
    expect((screen.getByLabelText(/Which one are you/) as HTMLSelectElement).value).toBe("");
  });
});
