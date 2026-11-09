import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
const invoke = vi.fn();
const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: Array<unknown>) => invoke(...a) },
    auth: { signOut: () => signOut() },
  },
}));

import { DeleteAccount } from "./delete-account";

const button = () => screen.getByRole("button", { name: /Delete account/ });
const type = (v: string) =>
  fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/), { target: { value: v } });
const typePassword = (v: string) =>
  fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: v } });

// protects=an account is only deleted after typing DELETE, and a failure keeps the user signed in;
// fails_when=the button works without the word, or an error still signs out
describe("DeleteAccount", () => {
  beforeEach(() => {
    navigate.mockReset();
    invoke.mockReset();
    signOut.mockClear();
  });

  it("stays disabled until DELETE is typed exactly and a password is given", () => {
    render(<DeleteAccount />);
    expect(button()).toBeDisabled();
    typePassword("pw");
    type("delete");
    expect(button()).toBeDisabled();
    type("DELETE");
    expect(button()).toBeEnabled();
    typePassword("");
    expect(button()).toBeDisabled();
  });

  it("deletes, signs out and goes to /auth", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(<DeleteAccount />);
    type("DELETE");
    typePassword("pw");
    fireEvent.click(button());
    expect(button()).toBeDisabled();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth", replace: true }));
    expect(invoke).toHaveBeenCalledWith("delete-account", {
      body: { confirm: "DELETE", password: "pw" },
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("shows the server's reason and stays signed in", async () => {
    const context = new Response(JSON.stringify({ error: "Bank disconnect failed" }), {
      status: 502,
    });
    invoke.mockResolvedValue({ data: null, error: { context } });
    render(<DeleteAccount />);
    type("DELETE");
    typePassword("pw");
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Bank disconnect failed");
    expect(signOut).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });
});
