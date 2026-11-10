import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({
  listAuthenticators: vi.fn(),
  startEnrollment: vi.fn(),
  finishEnrollment: vi.fn(),
  removeAuthenticator: vi.fn(),
}));
vi.mock("@/lib/mfa", () => ({
  ...lib,
  defaultAuthenticatorName: (n: number) => `Authenticator ${n + 1}`,
}));

import { TwoFactorSection } from "./two-factor-section";

// protects=a user can turn on two-step sign-in and remove an authenticator from Settings;
// fails_when=the QR step is skipped, the code isn't sent, or Cancel leaves a pending factor
describe("TwoFactorSection", () => {
  beforeEach(() => {
    for (const fn of Object.values(lib)) fn.mockReset();
    lib.startEnrollment.mockResolvedValue({
      factorId: "f1",
      qrCode: "data:image/svg+xml;utf8,<svg/>",
      secret: "JBSWY3DP",
    });
    lib.finishEnrollment.mockResolvedValue(undefined);
    lib.removeAuthenticator.mockResolvedValue(undefined);
  });

  it("sets up an authenticator: QR, key, code, then shows it as on", async () => {
    lib.listAuthenticators
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "f1", name: "Phone", createdAt: "" }]);
    render(<TwoFactorSection />);
    expect(await screen.findByText(/^Off\./)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Phone" } });
    fireEvent.click(screen.getByRole("button", { name: "Set up two-step sign-in" }));
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DP")).toBeInTheDocument();
    expect(lib.startEnrollment).toHaveBeenCalledWith("Phone");
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/^On\./)).toBeInTheDocument();
    expect(lib.finishEnrollment).toHaveBeenCalledWith("f1", "123456");
    expect(screen.getByText("Phone")).toBeInTheDocument();
  });

  it("shows a wrong code and stays on the QR step", async () => {
    lib.listAuthenticators.mockResolvedValue([]);
    lib.finishEnrollment.mockRejectedValue(new Error("Invalid TOTP code entered"));
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    fireEvent.change(await screen.findByLabelText("Code from the app"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid TOTP code entered");
    expect(screen.getByAltText(/QR code/)).toBeInTheDocument();
  });

  it("cancel removes the unfinished authenticator", async () => {
    lib.listAuthenticators.mockResolvedValue([]);
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(lib.removeAuthenticator).toHaveBeenCalledWith("f1"));
    expect(screen.queryByAltText(/QR code/)).not.toBeInTheDocument();
  });

  it("removes an authenticator after a second click", async () => {
    lib.listAuthenticators
      .mockResolvedValueOnce([{ id: "a", name: "Phone", createdAt: "" }])
      .mockResolvedValueOnce([]);
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone" }));
    expect(lib.removeAuthenticator).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByText(/^Off\./)).toBeInTheDocument();
    expect(lib.removeAuthenticator).toHaveBeenCalledWith("a");
  });

  it("says when the list can't load", async () => {
    lib.listAuthenticators.mockRejectedValue(new Error("network down"));
    render(<TwoFactorSection />);
    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
  });
});
