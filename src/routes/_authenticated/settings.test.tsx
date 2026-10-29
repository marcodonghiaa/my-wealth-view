import { describe, expect, it } from "vitest";
import { Route as HealthRoute } from "./health";
import { Route as SettingsRoute } from "./settings";

// protects=old /health links and bookmarks still land on the Health section;
// fails_when=the redirect is removed or points elsewhere
describe("/health", () => {
  it("redirects to the Health section of Settings", () => {
    const beforeLoad = HealthRoute.options.beforeLoad as () => void;
    expect(beforeLoad).toThrowError(
      expect.objectContaining({
        options: expect.objectContaining({ to: "/settings", hash: "health" }),
      }),
    );
  });

  it("serves Settings from its own route", () => {
    expect(SettingsRoute.options.component).toBeTypeOf("function");
  });
});
