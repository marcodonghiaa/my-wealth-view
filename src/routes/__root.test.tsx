import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ErrorComponentProps } from "@tanstack/react-router";

const invalidate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ invalidate }),
}));

import { Route } from "./__root";

const ErrorPage = Route.options.errorComponent as (p: ErrorComponentProps) => React.JSX.Element;

describe("error page Try again", () => {
  const reload = vi.fn();
  const original = window.location;
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    vi.clearAllMocks();
  });

  // Regression: after a page's code failed to download, "Try again" re-rendered
  // the same failed import and never recovered. The browser keeps a failed
  // module import, so only a full reload fetches it again.
  it("reloads the page when the page's code failed to load", async () => {
    const reset = vi.fn();
    const error = new TypeError(
      "Failed to fetch dynamically imported module: https://x/assets/reports-abc.js",
    );
    render(<ErrorPage error={error} reset={reset} info={{ componentStack: "" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("retries in place for any other error", async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} info={{ componentStack: "" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
