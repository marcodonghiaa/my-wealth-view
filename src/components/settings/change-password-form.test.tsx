import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let session: unknown;
const signInWithPassword = vi.fn(async (_a: unknown): Promise<{ error: unknown }> => ({
  error: null,
}));
const updateUser = vi.fn(async (_a: unknown): Promise<{ error: unknown }> => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: (a: unknown) => signInWithPassword(a),
      updateUser: (a: unknown) => updateUser(a),
    },
  },
}));

import { ChangePasswordForm } from "./change-password-form";

function fill(current: string, next: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirmation },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

// protects=a signed-in user can change the password without any email;
// fails_when=the current-password check or the update call is skipped or reordered
describe("ChangePasswordForm", () => {
  beforeEach(() => {
    session = { user: { email: "me@example.com" } };
    signInWithPassword.mockClear().mockResolvedValue({ error: null });
    updateUser.mockClear().mockResolvedValue({ error: null });
  });

  it("verifies the current password, saves the new one and clears the form", async () => {
    render(<ChangePasswordForm />);
    fill("oldpassword", "newpassword1", "newpassword1");
    expect(await screen.findByRole("status")).toHaveTextContent(/Password changed/);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "me@example.com",
      password: "oldpassword",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "newpassword1" });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });

  it("blocks a mismatched confirmation before any request", async () => {
    render(<ChangePasswordForm />);
    fill("oldpassword", "newpassword1", "newpassword2");
    expect(await screen.findByRole("alert")).toHaveTextContent(/don't match/);
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("does not change anything when the current password is wrong", async () => {
    signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }),
    });
    render(<ChangePasswordForm />);
    fill("wrongpass", "newpassword1", "newpassword1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/current password is wrong/);
    expect(updateUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText("New password")).toHaveValue("newpassword1");
  });

  it("shows the server's reason and keeps the form when saving fails", async () => {
    updateUser.mockResolvedValue({
      error: Object.assign(new Error("raw"), { code: "same_password" }),
    });
    render(<ChangePasswordForm />);
    fill("oldpassword", "newpassword1", "newpassword1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/different/);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("asks to sign in when there is no session", async () => {
    session = null;
    render(<ChangePasswordForm />);
    fill("oldpassword", "newpassword1", "newpassword1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/signed out/);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("disables the button while saving so a double tap sends one request", async () => {
    let release: () => void = () => {};
    updateUser.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ error: null }))),
    );
    render(<ChangePasswordForm />);
    fill("oldpassword", "newpassword1", "newpassword1");
    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled());
    release();
    await screen.findByRole("status");
    expect(updateUser).toHaveBeenCalledTimes(1);
  });
});
