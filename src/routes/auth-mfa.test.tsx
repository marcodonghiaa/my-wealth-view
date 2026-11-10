import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn(async () => {});
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => ({}),
    useRouteContext: () => ({ leftDemo: false }),
  }),
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
let session: unknown = null;
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session } }), ...auth },
  },
}));
const mfa = vi.hoisted(() => ({ needsMfaCode: vi.fn(), verifyMfaCode: vi.fn() }));
vi.mock("@/lib/mfa", () => mfa);

import { AuthPage } from "./auth";

function signIn() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "me@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

// protects=an account with an authenticator needs its code to open the dashboard;
// fails_when=sign-in navigates after the password alone, or a half-signed-in tab loops
describe("sign-in with two-step", () => {
  beforeEach(() => {
    session = null;
    navigate.mockClear();
    auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    mfa.needsMfaCode.mockReset().mockResolvedValue(false);
    mfa.verifyMfaCode.mockReset().mockResolvedValue(undefined);
  });

  it("goes straight in without an authenticator", async () => {
    render(<AuthPage />);
    await screen.findByLabelText("Email");
    signIn();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
  });

  it("asks for the code after the password, then goes in", async () => {
    mfa.needsMfaCode.mockResolvedValue(true);
    render(<AuthPage />);
    await screen.findByLabelText("Email");
    signIn();
    const field = await screen.findByLabelText("Authenticator code");
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(mfa.verifyMfaCode).toHaveBeenCalledWith("123456");
  });

  it("shows a wrong code and stays", async () => {
    mfa.needsMfaCode.mockResolvedValue(true);
    mfa.verifyMfaCode.mockRejectedValue(new Error("Invalid TOTP code entered"));
    session = { user: { id: "u" } };
    render(<AuthPage />);
    fireEvent.change(await screen.findByLabelText("Authenticator code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid TOTP code entered");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("an existing session without the code lands on the code step, and can switch account", async () => {
    mfa.needsMfaCode.mockResolvedValue(true);
    session = { user: { id: "u" } };
    render(<AuthPage />);
    await screen.findByLabelText("Authenticator code");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));
    expect(auth.signOut).toHaveBeenCalled();
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  });
});
