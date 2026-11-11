import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const demo = vi.hoisted(() => ({ current: false }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: () => demo.current }));
vi.mock("@/components/settings/change-password-form", () => ({
  ChangePasswordForm: () => <h2>Password</h2>,
}));
vi.mock("@/components/settings/delete-account", () => ({ DeleteAccount: () => <h2>Delete</h2> }));
vi.mock("@/components/settings/export-data", () => ({ ExportData: () => <h2>Export</h2> }));
vi.mock("@/components/settings/categories-section", () => ({
  CategoriesSection: () => <h2>Categories</h2>,
}));
vi.mock("@/components/health/health-section", () => ({
  HealthSection: () => <h2>Health</h2>,
  NotificationsSection: () => <h2>Notifications</h2>,
}));

import { SettingsPage } from "./settings-page";

const order = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

// protects=Health ("can I trust these numbers?") is the first thing in Settings (#14);
// fails_when=it sinks below the category list again
describe("SettingsPage order", () => {
  it("puts Health first and account management last", () => {
    demo.current = false;
    render(<SettingsPage />);
    expect(order()).toEqual([
      "Health",
      "Notifications",
      "Categories",
      "Password",
      "Export",
      "Delete",
    ]);
  });

  it("leaves out the account sections in the demo", () => {
    demo.current = true;
    render(<SettingsPage />);
    expect(order()).toEqual(["Health", "Notifications", "Categories"]);
  });
});
