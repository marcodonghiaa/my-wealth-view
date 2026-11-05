import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const upsert = vi.fn(async (_row: unknown) => ({ error: null }));
const del = vi.fn((_col: string, _val: unknown) => Promise.resolve({ error: null }));
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: async () => selectResult,
      upsert: (row: unknown) => upsert(row),
      delete: () => ({ eq: (c: string, v: unknown) => del(c, v) }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CategoriesSection } from "./categories-section";

function renderSection() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CategoriesSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  upsert.mockClear();
  del.mockClear();
  selectResult = {
    data: [
      { name: "Gym", hidden: false },
      { name: "Taxes", hidden: true },
    ],
    error: null,
  };
});

// A self-hoster wanted their own categories instead of the built-in ones.
describe("CategoriesSection", () => {
  it("adds a category of your own", async () => {
    renderSection();
    fireEvent.change(await screen.findByLabelText("New category"), {
      target: { value: "  Pets " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith({ name: "Pets", hidden: false }));
  });

  it("hides a built-in category, and shows a hidden one again", async () => {
    renderSection();
    const shopping = (await screen.findByText("Shopping")).closest("li")!;
    fireEvent.click(within(shopping).getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith({ name: "Shopping", hidden: true }));
    const taxes = screen.getByText("Taxes").closest("li")!;
    fireEvent.click(within(taxes).getByRole("button", { name: "Show" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("name", "Taxes"));
  });

  it("deletes a category you added; Transfer and Income can't be hidden", async () => {
    renderSection();
    const gym = (await screen.findByText("Gym")).closest("li")!;
    fireEvent.click(within(gym).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("name", "Gym"));
    const transfer = screen.getByText("Transfer").closest("li")!;
    expect(within(transfer).queryByRole("button")).toBeNull();
  });

  it("refuses a name already in the list", async () => {
    renderSection();
    fireEvent.change(await screen.findByLabelText("New category"), {
      target: { value: "groceries" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("says a database update is needed before the backend migration", async () => {
    selectResult = { data: null, error: { code: "PGRST205", message: "missing" } };
    renderSection();
    expect(await screen.findByText(/database update/i)).toBeInTheDocument();
  });
});
