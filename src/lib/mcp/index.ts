import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getNetWorthTool from "./tools/get-net-worth";
import getFxRatesTool from "./tools/get-fx-rates";

// The OAuth issuer must be the direct Supabase host (never a proxy URL).
const projectRef =
  (import.meta.env["VITE_SUPABASE_PROJECT_ID"] as string | undefined) ??
  "diwezyrtlwdbrsgegkay";

export default defineMcp({
  name: "finance-dashboard",
  title: "Finance Dashboard",
  version: "0.1.0",
  instructions:
    "Tools for Finance Dashboard. Use `get_net_worth` for the signed-in user's daily net worth history in EUR, and `get_fx_rates` to convert those EUR amounts to another currency.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getNetWorthTool, getFxRatesTool],
});
