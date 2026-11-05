import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      updateUser: (args: unknown) => updateUser(args),
    },
  },
}));

import { isRecoverySession, ResetPasswordPage, resetPasswordUrl } from "./reset-password";

const NOW = Date.UTC(2026, 10, 5, 12);
const b64url = (o: unknown) =>
  btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (method: string, ageMs = 0) =>
  `h.${b64url({ amr: [{ method, timestamp: Math.floor((Date.now() - ageMs) / 1000) }] })}.s`;

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    updateUser.mockClear();
    updateError = null;
  });

  // protects=a locked-out user can set a new password from the recovery email;
  // fails_when=the new password is not saved, or the user is left on the page after saving
  it("saves the new password and opens the dashboard", async () => {
    session = { user: { id: "u" }, access_token: token("recovery") };
    render(<ResetPasswordPage />);
    fireEvent.change(await screen.findByLabelText("New password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(updateUser).toHaveBeenCalledWith({ password: "correct horse" });
  });

  it("shows Supabase's error and stays on the page", async () => {
    session = { user: { id: "u" }, access_token: token("recovery") };
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

  // Regression: any signed-in session got the form, so someone at an unlocked laptop could
  // set a new password without knowing the current one.
  it("hides the form for a session that signed in with a password", async () => {
    session = { user: { id: "u" }, access_token: token("password") };
    render(<ResetPasswordPage />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/expired or was already used/);
    expect(screen.queryByLabelText("New password")).toBeNull();
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

describe("isRecoverySession", () => {
  const at = (method: string, ageMs: number) =>
    `h.${b64url({
      amr: [
        { method: "password", timestamp: 1 },
        { method, timestamp: (NOW - ageMs) / 1000 },
      ],
    })}.s`;

  it("accepts a recovery sign-in from the last hour", () => {
    expect(isRecoverySession(at("recovery", 5 * 60_000), NOW)).toBe(true);
  });

  it("rejects an old recovery, other sign-ins, and bad tokens", () => {
    expect(isRecoverySession(at("recovery", 2 * 3_600_000), NOW)).toBe(false);
    expect(isRecoverySession(at("otp", 0), NOW)).toBe(false);
    expect(isRecoverySession(undefined, NOW)).toBe(false);
    expect(isRecoverySession("demo", NOW)).toBe(false);
    expect(isRecoverySession("a.%%%.b", NOW)).toBe(false);
  });
});
