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

import { ResetPasswordPage, resetPasswordUrl } from "./reset-password";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    updateUser.mockClear();
    updateError = null;
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
