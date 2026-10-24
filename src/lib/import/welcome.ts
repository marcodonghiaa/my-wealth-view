export interface WelcomeFacts {
  accounts: number; // linked bank accounts
  holdings: number; // investments + coins
  history: number; // imported net worth months
  notifications: number; // push subscriptions
  dismissed: boolean;
}

export type StepId = "bank" | "investments" | "history" | "notifications";

export interface ChecklistStep {
  id: StepId;
  done: boolean;
  optional: boolean;
}

export function checklistSteps({ accounts, holdings, history, notifications }: WelcomeFacts) {
  const steps: Array<ChecklistStep> = [
    { id: "bank", done: accounts > 0, optional: false },
    { id: "investments", done: holdings > 0, optional: false },
    { id: "history", done: history > 0, optional: true },
    { id: "notifications", done: notifications > 0, optional: true },
  ];
  return steps;
}

/** The getting-started checklist stays until the required steps are done, or it is dismissed. */
export function shouldShowChecklist(facts: WelcomeFacts): boolean {
  return !facts.dismissed && checklistSteps(facts).some((s) => !s.optional && !s.done);
}
