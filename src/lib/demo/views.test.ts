import { describe, expect, it } from "vitest";
import { createFakeClient } from "./fake-client";

const NOW = new Date("2026-10-20T12:00:00Z");

describe("demo v_transactions_eur", () => {
  it("counts an unsplit purchase as fully mine, like the real view", async () => {
    const client = createFakeClient(NOW);
    const { data: all } = await client
      .from("v_transactions_eur")
      .select("*")
      .eq("flow_type", "spend");
    const { data: mine } = await client
      .from("v_transactions_eur")
      .select("*")
      .eq("flow_type", "spend")
      .lt("personal_signed_amount_eur", 0);
    expect(all?.length).toBeGreaterThan(0);
    expect(mine?.length).toBe(all?.length);
  });

  it("splits only what is split", async () => {
    const client = createFakeClient(NOW);
    const { data } = await client
      .from("v_transactions_eur")
      .select("*")
      .not("personal_amount", "is", null);
    expect(data?.length).toBeGreaterThan(0);
    for (const t of data ?? [])
      expect(t.personal_signed_amount_eur).toBe(-(t.personal_amount ?? 0));
  });
});
