// Fetch ALL matching rows from Supabase, working around PostgREST's default
// 1000-row response cap. Supabase caps each response at ~1000 rows regardless of
// the service-role key, so aggregate/count queries that read the whole table
// must page through with .range() until a short page is returned.

type QueryResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Repeatedly runs `makeQuery(from, to)` in 1000-row windows and concatenates
 * the results until a page returns fewer than 1000 rows.
 *
 * makeQuery must apply .range(from, to) to a Supabase query builder.
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<QueryResult<T>>
): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}
