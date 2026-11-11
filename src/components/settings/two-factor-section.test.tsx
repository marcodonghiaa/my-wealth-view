import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as renderPlain, screen, waitFor } from "@testing-library/react";
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
  retryUnlessRefused: (count: number) => count < 3,
}));

import { TwoFactorSection } from "./two-factor-section";

const LOAD_FAILED = "Couldn't check right now. Check your connection and try again.";

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
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Phone" } });
    fireEvent.click(screen.getByRole("button", { name: "Set up two-step sign-in" }));
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument();
    expect(screen.getByText("JBSW Y3DP")).toBeInTheDocument();
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
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce([{ id: "f1", name: "Phone" }]);
    render(<TwoFactorSection />);
    expect(await screen.findByText(LOAD_FAILED, {}, { timeout: 3000 })).toBeInTheDocument();
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
    // Next to the field it is about, and tied to it.
    const field = screen.getByLabelText("Authenticator code");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Invalid TOTP code entered/);
    expect(
      screen
        .getByRole("alert")
        .compareDocumentPosition(screen.getByRole("button", { name: "Turn on" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    // The running remove shows it is working.
    expect(
      screen.getByRole("button", { name: "Confirm remove" }).querySelector(".animate-spin"),
    ).not.toBeNull();
  });

  it("keeps the authenticator and says why when removing fails", async () => {
    lib.listAuthenticators.mockResolvedValue([{ id: "a", name: "Phone" }]);
    lib.removeAuthenticator.mockRejectedValue(new Error("AAL2 required"));
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AAL2 required");
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText(/^On\./)).toBeInTheDocument();
  });

  // fails_when=a refresh that fails after a change silently keeps the old list
  it("says so when the list can't refresh after a change", async () => {
    lib.listAuthenticators
      .mockResolvedValueOnce([{ id: "a", name: "Phone" }])
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent(
      "Failed to fetch",
    );
  });

  // fails_when=Try again vanishes while it retries, so the card jumps and shows no progress
  it("keeps Try again in place, busy, while it retries", async () => {
    lib.listAuthenticators
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockReturnValueOnce(new Promise(() => {}));
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }, { timeout: 3000 }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeDisabled();
  });

  // protects=an accidental bin tap can be undone, and removing the last one says what it does;
  // fails_when=the confirm can't be cancelled (no Cancel, Esc ignored) or turns two-step off silently
  it("lets a remove be cancelled, and warns when it is the last authenticator", async () => {
    lib.listAuthenticators.mockResolvedValue([{ id: "a", name: "Phone" }]);
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Phone" }));
    expect(screen.getByText(/Sign-in won't ask for a code any more/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Confirm remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Confirm remove" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Confirm remove" })).toBeNull();
    expect(lib.removeAuthenticator).not.toHaveBeenCalled();
  });

  // protects=keyboard and screen-reader users keep their place (WCAG 2.4.3);
  // fails_when=focus falls to the page body after setup starts, finishes or a remove
  it("moves focus to the code field, then back to the section heading", async () => {
    lib.listAuthenticators
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: "f1", name: "Phone" }]);
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    await waitFor(() => expect(screen.getByLabelText("Authenticator code")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    const heading = screen.getByRole("heading", { name: "Two-step sign-in" });
    await waitFor(() => expect(heading).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    await waitFor(() => expect(lib.removeAuthenticator).toHaveBeenCalled());
    await waitFor(() => expect(heading).toHaveFocus());
  });

  // protects=touch targets of at least 44px (DESIGN.md); fails_when=the bin is a 36px small button
  it("gives the remove bin a full-size touch target", async () => {
    lib.listAuthenticators.mockResolvedValue([{ id: "a", name: "Phone" }]);
    render(<TwoFactorSection />);
    expect(await screen.findByRole("button", { name: "Remove Phone" })).toHaveClass("size-11");
  });

  // protects=end users get a recovery note they can act on, when it matters;
  // fails_when=it points them at the Supabase SQL editor, or shows while two-step is off
  it("shows a plain-words recovery note only once two-step is on", async () => {
    lib.listAuthenticators.mockResolvedValueOnce([]);
    const { unmount } = render(<TwoFactorSection />);
    await screen.findByText(/^Off\./);
    expect(screen.queryByText(/backup codes/)).toBeNull();
    unmount();
    lib.listAuthenticators.mockResolvedValue([{ id: "a", name: "Phone" }]);
    render(<TwoFactorSection />);
    const note = await screen.findByText(/backup codes/);
    expect(note).toHaveTextContent("ask the person who runs this app");
    expect(note.textContent).not.toMatch(/SQL|UPGRADING|Supabase/);
  });

  // protects=secondary buttons inside the white card look like buttons;
  // fails_when=they use the quiet variant, white on white
  it("gives the card's secondary buttons a visible fill", async () => {
    lib.listAuthenticators.mockResolvedValue([{ id: "a", name: "Phone" }]);
    render(<TwoFactorSection />);
    const add = await screen.findByRole("button", { name: "Add another authenticator" });
    expect(add).toHaveClass("bg-background");
    expect(add).not.toHaveClass("bg-card");
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("bg-background");
  });

  // fails_when=a failed load retries 3 times (about 8s) or shows the failure twice, once raw
  // fails_when=pressing Enter in the name field does nothing
  it("starts setup when Enter is pressed in the name field", async () => {
    lib.listAuthenticators.mockResolvedValue([]);
    render(<TwoFactorSection />);
    const name = await screen.findByLabelText("Name (optional)");
    fireEvent.change(name, { target: { value: "Phone" } });
    fireEvent.submit(name);
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument();
    expect(lib.startEnrollment).toHaveBeenCalledWith("Phone");
  });

  it("tries once more, then says it once in plain words", async () => {
    lib.listAuthenticators.mockRejectedValue(new Error("network down"));
    render(<TwoFactorSection />);
    expect(await screen.findByText(LOAD_FAILED, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(lib.listAuthenticators).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("network down")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // fails_when=the hand-typed key wraps mid-group or can't be copied whole
  it("shows the key in groups of four and copies it without the spaces", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    lib.listAuthenticators.mockResolvedValue([]);
    render(<TwoFactorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    expect(await screen.findByText("JBSW Y3DP")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    expect(writeText).toHaveBeenCalledWith("JBSWY3DP");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  // fails_when=the name field looks required, or the Off pitch stays above the QR during setup
  it("marks the name optional and says setup is under way", async () => {
    lib.listAuthenticators.mockResolvedValue([{ id: "f1", name: "Phone" }]);
    render(<TwoFactorSection />);
    expect(await screen.findByLabelText("Name of the new one (optional)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add another authenticator" }));
    await screen.findByAltText(/QR code/);
    expect(screen.getByText("Setting up…")).toBeInTheDocument();
    expect(screen.queryByText(/^On\./)).toBeNull();
  });
});
