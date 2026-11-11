import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
let session: unknown = null;
let updateError: Error | null = null;
const updateUser = vi.fn(async (_args: unknown) => ({ error: updateError }));
let fromRecoveryLink = true;
let emit: ((event: string) => void) | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  openedFromRecoveryLink: () => fromRecoveryLink,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      updateUser: (args: unknown) => updateUser(args),
      onAuthStateChange: (cb: (event: string) => void) => {
        emit = cb;
        return { data: { subscription: { unsubscribe: () => (emit = null) } } };
      },
    },
  },
}));

const mfa = vi.hoisted(() => ({ needsMfaCode: vi.fn(), verifyMfaCode: vi.fn() }));
vi.mock("@/lib/mfa", () => mfa);

import { ResetPasswordPage, resetPasswordUrl } from "./reset-password";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    updateUser.mockClear();
    updateError = null;
    fromRecoveryLink = true;
    mfa.needsMfaCode.mockReset().mockResolvedValue(false);
    mfa.verifyMfaCode.mockReset().mockResolvedValue(undefined);
  });

  // protects=a user with two-step sign-in can still reset a forgotten password;
  // fails_when=the new password is sent on the password-only session Supabase refuses
  it("asks for the authenticator code and verifies it before saving", async () => {
    session = { user: { id: "u" } };
    mfa.needsMfaCode.mockResolvedValue(true);
    const order: string[] = [];
    mfa.verifyMfaCode.mockImplementation(async () => void order.push("verify"));
    updateUser.mockImplementationOnce(async () => (order.push("update"), { error: null }));
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "correct horse" },
    });
    fireEvent.change(await screen.findByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(mfa.verifyMfaCode).toHaveBeenCalledWith("123456");
    expect(order).toEqual(["verify", "update"]);
  });

  it("keeps the form and saves nothing when the code is wrong", async () => {
    session = { user: { id: "u" } };
    mfa.needsMfaCode.mockResolvedValue(true);
    mfa.verifyMfaCode.mockRejectedValue(new Error("Invalid TOTP code entered"));
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "correct horse" },
    });
    fireEvent.change(await screen.findByLabelText("Authenticator code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid TOTP code entered");
    expect(screen.getByLabelText("Authenticator code")).toHaveAccessibleDescription(
      /type the 6-digit code.*Invalid TOTP code entered/,
    );
    expect(screen.getByLabelText("Authenticator code")).toHaveAttribute("aria-invalid", "true");
    expect(updateUser).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  // protects=a user whose new password is refused can fix it without a new code;
  // fails_when=the accepted code is checked again on retry (a spent try, maybe expired by then)
  it("does not check the code again after it was accepted", async () => {
    session = { user: { id: "u" } };
    mfa.needsMfaCode.mockResolvedValue(true);
    updateUser.mockImplementationOnce(async () => ({ error: new Error("Password is too weak") }));
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "correct horse" },
    });
    fireEvent.change(await screen.findByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(mfa.verifyMfaCode).toHaveBeenCalledTimes(1);
  });

  // protects=a user with an authenticator always gets the code step before saving;
  // fails_when=Save works before the check answers and Supabase's raw aal2 error shows
  it("waits for the authenticator check before allowing Save", async () => {
    session = { user: { id: "u" } };
    let answer: (needed: boolean) => void = () => {};
    mfa.needsMfaCode.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
    render(<ResetPasswordPage />);
    await screen.findByLabelText("New password");
    expect(screen.getByRole("button", { name: "Save and sign in" })).toBeDisabled();
    act(() => answer(true));
    expect(await screen.findByLabelText("Authenticator code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and sign in" })).toBeEnabled();
  });

  it("asks for no code when the account has no authenticator", async () => {
    session = { user: { id: "u" } };
    render(<ResetPasswordPage />);
    await screen.findByLabelText("New password");
    expect(screen.queryByLabelText("Authenticator code")).toBeNull();
  });

  // protects=a locked-out user can set a new password from the recovery email;
  // fails_when=the new password is not saved, or the user is left on the page after saving
  it("saves the new password and opens the dashboard", async () => {
    session = { user: { id: "u" } };
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(updateUser).toHaveBeenCalledWith({ password: "correct horse" });
  });

  it("shows Supabase's error and stays on the page", async () => {
    session = { user: { id: "u" } };
    updateError = new Error("Password should be different from the old password.");
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Password should be different from the old password.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  // Regression: any signed-in tab got the form, so someone at an unlocked laptop could set a new
  // password without knowing the current one.
  it("hides the form for a tab that was signed in without a recovery link", async () => {
    session = { user: { id: "u" } };
    fromRecoveryLink = false;
    render(<ResetPasswordPage />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/expired or was already used/);
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("shows the form when the recovery sign-in lands after the page asked", async () => {
    session = { user: { id: "u" } };
    fromRecoveryLink = false;
    render(<ResetPasswordPage />);
    await screen.findByRole("alert");
    act(() => emit?.("PASSWORD_RECOVERY"));
    expect(await screen.findByLabelText("New password")).toBeTruthy();
  });

  it("explains an expired link when there is no recovery session", async () => {
    session = null;
    render(<ResetPasswordPage />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/expired or was already used/);
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
      "/auth",
    );
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

describe("resetPasswordUrl", () => {
  it("points the recovery email at this page on the dashboard's own origin", () => {
    expect(resetPasswordUrl("https://money.example.com")).toBe(
      "https://money.example.com/reset-password",
    );
  });
});
