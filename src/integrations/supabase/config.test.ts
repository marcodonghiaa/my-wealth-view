import { describe, it, expect } from "vitest";
import { resolveSupabaseConfig, REFERENCE_SUPABASE_URL } from "./config";

const own = { url: "https://own.supabase.co", key: "sb_publishable_own" };

describe("resolveSupabaseConfig", () => {
  it("uses the configured project when both variables are set", () => {
    const cfg = resolveSupabaseConfig({ ...own, hostname: "money.example.com", dev: false });
    expect(cfg).toEqual({ ...own, usingFallback: false });
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

  it("falls back under the Vite dev server", () => {
    const cfg = resolveSupabaseConfig({ url: "", key: "", hostname: "localhost", dev: true });
    expect(cfg.usingFallback).toBe(true);
  });

  it("falls back on the server, where no credentials are typed", () => {
    const cfg = resolveSupabaseConfig({ url: "", key: "", hostname: undefined, dev: false });
    expect(cfg.usingFallback).toBe(true);
  });
});
