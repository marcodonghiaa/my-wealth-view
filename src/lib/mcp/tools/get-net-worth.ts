import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_net_worth",
  title: "Get net worth history",
  description:
    "Read the signed-in user's daily net worth snapshots (in EUR), newest last.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Maximum number of most recent daily snapshots to return."),
  },
  outputSchema: {
    snapshots: z.array(
      z.object({ snapshot_date: z.string(), total_eur: z.number() }),
    ),
    latest: z
      .object({ snapshot_date: z.string(), total_eur: z.number() })
      .nullable(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("v_net_worth_daily")
      .select("snapshot_date,total_eur")
      .order("snapshot_date", { ascending: false })
      .limit(limit ?? 365);
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).slice().reverse();
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { snapshots: rows, latest: rows.at(-1) ?? null },
    };
  },
});
