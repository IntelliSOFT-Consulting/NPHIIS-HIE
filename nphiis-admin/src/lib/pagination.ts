// Page sizes offered by every paged list in the portal.

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

/** `page`/`pageSize` from a query string, clamped to valid values. */
export function parsePaging(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(params.get("page") ?? "", 10) || 1);
  const requested = parseInt(params.get("pageSize") ?? "", 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requested) ? requested : DEFAULT_PAGE_SIZE;
  return { page, pageSize };
}
