import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as renderPlain, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({
  listAuthenticators: vi.fn(),
  startEnrollment: vi.fn(),
  finishEnrollment: vi.fn(),
  removeAuthenticator: vi.fn(),
}));
vi.mock("@/lib/mfa", () => ({
  ...lib,
  defaultAuthenticatorName: (taken: Array<string>) => `Authenticator ${taken.length + 1}`,
}));

import { TwoFactorSection } from "./two-factor-section";

const render = (ui: React.ReactElement) =>
  renderPlain(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

// protects=a user can turn on two-step sign-in and remove an authenticator from Settings;
// fails_when=the QR step is skipped, the code isn't sent, or a failure is swallowed
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
      .mockResolvedValueOnce([{ id: "f1", name: "Phone" }]);
    render(<TwoFactorSection />);
    expect(await screen.findByText(/^Off\./)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Phone" } });
    fireEvent.click(screen.getByRole("button", { name: "Set up two-step sign-in" }));
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DP")).toBeInTheDocument();
    expect(lib.startEnrollment).toHaveBeenCalledWith("Phone");
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/^On\./)).toBeInTheDocument();
    expect(lib.finishEnrollment).toHaveBeenCalledWith("f1", "123456");
    expect(screen.getByText("Phone")).toBeInTheDocument();
  });

  // protects=a user with authenticators is never told two-step is off because loading failed;
  // fails_when=a load error shows "Off" and the setup button
  it("on a load error shows the error and a retry, not Off", async () => {
    lib.listAuthenticators
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce([{ id: "f1", name: "Phone" }]);
    render(<TwoFactorSection />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
    expect(screen.queryByText(/^Off\./)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set up two-step sign-in" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/^On\./)).toBeInTheDocument();
  });

  it("shows a wrong code and stays on the QR step", async () => {
    lib.listAuthenticators.mockResolvedValue([]);
    lib.finishEnrollment.mockRejectedValue(new Error("Invalid TOTP code entered"));
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    fireEvent.change(await screen.findByLabelText("Authenticator code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid TOTP code entered");
    expect(screen.getByAltText(/QR code/)).toBeInTheDocument();
  });

  // The next setup clears the unfinished factor (startEnrollment), so Cancel needs no request.
  it("cancel closes the setup without a request", async () => {
    lib.listAuthenticators.mockResolvedValue([]);
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByAltText(/QR code/)).not.toBeInTheDocument();
    expect(lib.removeAuthenticator).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Set up two-step sign-in" })).toBeInTheDocument();
  });

  // protects=a failed setup start says why instead of doing nothing;
  // fails_when=the startEnrollment error is swallowed
  it("shows why the setup couldn't start", async () => {
    lib.listAuthenticators.mockResolvedValue([]);
    lib.startEnrollment.mockRejectedValue(new Error("MFA enroll is disabled"));
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MFA enroll is disabled");
    expect(screen.queryByAltText(/QR code/)).not.toBeInTheDocument();
  });

  it("removes an authenticator after a second click", async () => {
    lib.listAuthenticators
      .mockResolvedValueOnce([{ id: "a", name: "Phone" }])
      .mockResolvedValueOnce([]);
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone" }));
    expect(lib.removeAuthenticator).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByText(/^Off\./)).toBeInTheDocument();
    expect(lib.removeAuthenticator).toHaveBeenCalledWith("a");
  });

  // protects=one remove at a time; fails_when=another row can start a remove mid-request
  it("disables the other rows' remove buttons while one is being removed", async () => {
    lib.listAuthenticators.mockResolvedValue([
      { id: "a", name: "Phone" },
      { id: "b", name: "Laptop" },
    ]);
    lib.removeAuthenticator.mockReturnValue(new Promise(() => {}));
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(screen.getByRole("button", { name: "Remove Laptop" })).toBeDisabled();
  });

  it("says when the list can't load", async () => {
    lib.listAuthenticators.mockRejectedValue(new Error("network down"));
    render(<TwoFactorSection />);
    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
  });
});
