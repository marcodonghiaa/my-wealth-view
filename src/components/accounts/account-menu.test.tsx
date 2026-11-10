import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AccountMenu, AddDebt, type MenuAccount } from "./account-menu";

function setup(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { invalidate };
}

const bank: MenuAccount = { uid: "u1", name: "Demo Bank EUR", account_type: null, amount: 10 };
const manual: MenuAccount = {
  uid: "u2",
  name: "Car loan",
  account_type: "loan",
  manual: true,
  amount: 1200,
};

beforeEach(() => rpc.mockReset());

describe("AccountMenu", () => {
  it("shows an unknown type as Checking and saves a new type, refreshing net worth", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { invalidate } = setup(<AccountMenu title="Demo Bank" accounts={[bank]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Demo Bank" }));
    const select = screen.getByRole("combobox", { name: "Account type" });
    expect(select).toHaveValue("checking");
    // A bank account has no balance to type in.
    expect(screen.queryByLabelText("Owed now")).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "credit_card" } });
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_account_type", {
        p_account: "u1",
        p_type: "credit_card",
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["net-worth-daily"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bank-accounts-latest"] });
  });

  it("names each account when the menu covers several", () => {
    setup(
      <AccountMenu
        title="Demo Bank"
        accounts={[bank, { ...bank, uid: "u3", name: "Demo Bank USD" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Demo Bank" }));
    expect(
      screen.getByRole("combobox", { name: "Demo Bank USD: account type" }),
    ).toBeInTheDocument();
  });

  it("explains a missing backend migration", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x", code: "PGRST202" } });
    setup(<AccountMenu title="Demo Bank" accounts={[bank]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Demo Bank" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "loan" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/database update first/);
  });

  // protects=the backend refuses other types on a manual account
  it("offers only debt types on a manual debt", () => {
    setup(<AccountMenu title="Car loan" accounts={[manual]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Car loan" }));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Credit card", "Loan"]);
  });

  it("saves what is owed on a manual debt, as a positive amount", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    setup(<AccountMenu title="Car loan" accounts={[manual]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Car loan" }));
    const owed = screen.getByLabelText("Owed now");
    expect(owed).toHaveValue("1200");
    fireEvent.change(owed, { target: { value: "950,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_manual_balance", { p_account: "u2", p_amount: 950.5 }),
    );
  });

  it("refuses an amount it can't read, and shows a server error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not a manual account" } });
    setup(<AccountMenu title="Car loan" accounts={[manual]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Car loan" }));
    fireEvent.change(screen.getByLabelText("Owed now"), { target: { value: "-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter what you owe");
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Owed now"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("not a manual account")).toBeInTheDocument();
  });
});

describe("AccountMenu delete", () => {
  it("asks to confirm inline, then deletes the manual debt", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { invalidate } = setup(<AccountMenu title="Car loan" accounts={[manual]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Car loan" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("delete_manual_debt", { p_account: "u2" }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["net-worth-daily"] }));
  });

  it("can be cancelled, and shows the server's error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not a manual debt" } });
    setup(<AccountMenu title="Car loan" accounts={[manual]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Car loan" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Delete for good" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    expect(await screen.findByText("not a manual debt")).toBeInTheDocument();
  });

  it("is not offered on a bank account", () => {
    setup(<AccountMenu title="Demo Bank" accounts={[bank]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Demo Bank" }));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});

describe("AddDebt", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Add a debt" }));

  it("adds a named debt in the chosen currency", async () => {
    rpc.mockResolvedValue({ data: "new-uid", error: null });
    const { invalidate } = setup(<AddDebt />);
    open();
    expect(screen.getByPlaceholderText("e.g. Taxes owed, Family loan")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Taxes owed " } });
    fireEvent.change(screen.getByLabelText("Owed"), { target: { value: "800" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "GBP" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("add_manual_debt", {
        p_name: "Taxes owed",
        p_amount: 800,
        p_currency: "GBP",
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["net-worth-daily"] }));
  });

  it("asks for a name and an amount before saving", () => {
    setup(<AddDebt />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Loan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter what you owe");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows the server's error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "name is required" } });
    setup(<AddDebt />);
    open();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Loan" } });
    fireEvent.change(screen.getByLabelText("Owed"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("name is required")).toBeInTheDocument();
  });
});
