/** Rows asked for per request: PostgREST's default cap. */
export const PAGE = 1000;

type Page = PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Every row of a paged query, read until a page comes back empty: a self-hoster's server may cap
 * a response below PAGE, so a short page is not the end. The query needs a total order.
 */
export async function readPages<T>(page: (from: number, to: number) => Page): Promise<Array<T>> {
  const rows: Array<T> = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as Array<T>;
    if (got.length === 0) return rows;
    rows.push(...got);
  }
}
