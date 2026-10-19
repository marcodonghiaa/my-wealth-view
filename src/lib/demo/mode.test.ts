import { afterEach, describe, expect, it, vi } from "vitest";
import { enterDemoMode, exitDemoMode, isDemoMode } from "./mode";
import { supabase } from "@/integrations/supabase/client";

afterEach(() => {
  exitDemoMode();
  vi.restoreAllMocks();
});

describe("demo mode flag", () => {
  it("is off by default, on after entering, off after exiting", () => {
    expect(isDemoMode()).toBe(false);
    enterDemoMode();
    expect(isDemoMode()).toBe(true);
    exitDemoMode();
    expect(isDemoMode()).toBe(false);
  });

  it("survives a reload of the same tab (kept in sessionStorage)", () => {
    enterDemoMode();
    expect(window.sessionStorage.getItem("mwv-demo")).toBe("1");
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    enterDemoMode();
    expect(isDemoMode()).toBe(true);
  });
});

describe("the shared supabase client in demo mode", () => {
  it("answers from fake data and never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    enterDemoMode();
    const { data: session } = await supabase.auth.getSession();
    expect(session.session?.user.id).toBeTruthy();
    const { data } = await supabase.from("accounts").select("uid,label");
    expect(data!.length).toBeGreaterThan(0);
    await supabase.functions.invoke("list-banks", { body: { country: "IT" } });
    await supabase.rpc("import_splitwise", {} as never);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("goes back to the real client when demo mode is off", async () => {
    // Real client with no stored login: no session, and no demo rows.
    const { data } = await supabase.auth.getSession();
    expect(data.session).toBeNull();
  });

  it("starts from fresh data after leaving and re-entering demo", async () => {
    enterDemoMode();
    await supabase.from("category_rules").delete().neq("id", "");
    exitDemoMode();
    enterDemoMode();
    const { data } = await supabase.from("category_rules").select("id");
    expect(data!.length).toBeGreaterThan(0);
  });
});
