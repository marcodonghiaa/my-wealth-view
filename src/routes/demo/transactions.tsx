import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage } from "../_authenticated/transactions";

export const Route = createFileRoute("/demo/transactions")({
  component: TransactionsPage,
});
