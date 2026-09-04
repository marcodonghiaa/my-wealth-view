import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_fx_rates",
  title: "Get FX rates",
  description:
    "Read the latest FX rate to EUR for each currency (divide a EUR amount by rate_to_eur to convert).",
  inputSchema: {
    currency: z
      .string()
      .trim()
      .min(3)
      .max(3)
      .optional()
      .describe("Optional ISO currency code, e.g. USD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ currency }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("fx_rates")
      .select("date,currency,rate_to_eur")
      .order("date", { ascending: false })
      .limit(500);
    if (currency) query = query.eq("currency", currency.toUpperCase());
    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    const latest: Record<string, unknown> = {};
    for (const row of data ?? []) {
      const code = (row as { currency: string }).currency;
      if (!(code in latest)) latest[code] = row;
    }
    const rates = Object.values(latest);
    return {
      content: [{ type: "text", text: JSON.stringify(rates) }],
      structuredContent: { rates },
    };
  },
});
