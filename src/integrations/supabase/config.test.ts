import { describe, it, expect } from "vitest";
import { NOT_CONFIGURED_URL, resolveSupabaseConfig } from "./config";

const own = { url: "https://own.supabase.co", key: "sb_publishable_own" };

describe("resolveSupabaseConfig", () => {
  it("uses the configured project when both variables are set", () => {
    const cfg = resolveSupabaseConfig({ ...own, hostname: "money.example.com", dev: false });
    expect(cfg).toEqual({ ...own, configured: true });
  });

  it("refuses to fall back in a browser on a self-hosted domain", () => {
    expect(() =>
      resolveSupabaseConfig({ url: "", key: "", hostname: "money.example.com", dev: false }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it("refuses to fall back when only one variable is set", () => {
    expect(() =>
      resolveSupabaseConfig({ url: own.url, key: "", hostname: "money.example.com", dev: false }),
    ).toThrow();
  });

  it("refuses to fall back on localhost outside the dev server", () => {
    expect(() =>
      resolveSupabaseConfig({ url: undefined, key: undefined, hostname: "localhost", dev: false }),
    ).toThrow();
  });

  it("refuses to fall back on a former Lovable domain", () => {
    expect(() =>
      resolveSupabaseConfig({ url: "", key: "", hostname: "app.lovable.app", dev: false }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  // Regression: without .env the dev server and server rendering used the maintainer's own
  // Supabase project, so another person's dev login (and data) went there.
  it("never uses a real project when the variables are missing in the dev server", () => {
    const cfg = resolveSupabaseConfig({ url: "", key: "", hostname: "localhost", dev: true });
    expect(cfg).toEqual({ url: NOT_CONFIGURED_URL, key: "not-configured", configured: false });
    expect(new URL(cfg.url).hostname.endsWith(".invalid")).toBe(true);
  });

  it("never uses a real project on the server either", () => {
    const cfg = resolveSupabaseConfig({ url: "", key: "", hostname: undefined, dev: false });
    expect(cfg.url).toBe(NOT_CONFIGURED_URL);
  });

  it("names no Supabase project anywhere in the config", async () => {
    const source = await import("./config?raw").then((m: { default: string }) => m.default);
    expect(source).not.toMatch(/\.supabase\.co|sb_publishable_/);
  });
});
