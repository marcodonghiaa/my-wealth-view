import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CATEGORIES_KEY, type CategorySetting } from "@/lib/use-categories";

/**
 * A query client for component tests: no retries, and your categories already loaded (none by
 * default, so the built-in list), so pickers render without reaching for the network.
 */
export function queryWrapper(categories: Array<CategorySetting> = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(CATEGORIES_KEY, categories);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
