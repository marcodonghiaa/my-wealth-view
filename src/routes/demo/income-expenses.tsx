import { createFileRoute } from "@tanstack/react-router";
import { IncomeExpensesPage } from "../_authenticated/income-expenses";

export const Route = createFileRoute("/demo/income-expenses")({
  component: IncomeExpensesPage,
});
