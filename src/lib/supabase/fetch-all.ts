/**
 * Fetches all rows from a Supabase query by paginating through results.
 * Supabase/PostgREST defaults to returning max 1000 rows per request.
 * This helper paginates in batches to retrieve all matching rows.
 *
 * Pass a factory function that builds the query (without .range() or .limit()):
 *
 *   const allRows = await fetchAll(() =>
 *     db.from('opportunities').select('acv').eq('is_closed_won', true)
 *   );
 */

const PAGE_SIZE = 1000;

export async function fetchAll<T = Record<string, unknown>>(
  buildQuery: () => any
): Promise<T[]> {
  const allData: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) break;

    allData.push(...data);

    if (data.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  return allData;
}
