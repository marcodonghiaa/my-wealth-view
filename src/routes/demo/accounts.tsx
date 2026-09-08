import { createFileRoute } from "@tanstack/react-router";
import { AccountsPage } from "../_authenticated/accounts";

export const Route = createFileRoute("/demo/accounts")({
  component: AccountsPage,
});
