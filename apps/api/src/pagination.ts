/**
 * Page parameters and the shape every paged endpoint answers with.
 *
 * Offset-based rather than cursor-based on purpose: these back dashboard
 * tables, where "page 7 of 12" and a total are the point. A cursor is the right
 * answer for a feed nobody counts, and the wrong one for a table an operator
 * scans.
 *
 * Pure, so the clamping is testable — a `perPage` a caller can set to anything
 * is a way to ask for the whole table in one request.
 */

const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

export interface PageParams {
  page: number;
  perPage: number;
  offset: number;
}

export interface Paged<T> {
  rows: T[];
  page: number;
  perPage: number;
  total: number;
  /** Always at least 1, so "page 1 of 1" reads correctly on an empty table. */
  pages: number;
}

/** Read and clamp `?page=` / `?perPage=`. Nonsense falls back to the defaults. */
export function pageParams(
  query: { page?: string; perPage?: string },
  defaultPerPage = DEFAULT_PER_PAGE,
): PageParams {
  // `Number("")` is 0, not NaN, so an empty `?perPage=` would otherwise clamp
  // to one row per page instead of falling back to the default.
  const num = (raw: string | undefined): number | null => {
    if (raw === undefined || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const rawPage = num(query.page);
  const rawPerPage = num(query.perPage);

  const page = rawPage === null ? 1 : Math.max(1, Math.floor(rawPage));
  const perPage =
    rawPerPage === null
      ? defaultPerPage
      : Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(rawPerPage)));

  return { page, perPage, offset: (page - 1) * perPage };
}

export function paged<T>(rows: T[], total: number, params: PageParams): Paged<T> {
  return {
    rows,
    page: params.page,
    perPage: params.perPage,
    total,
    pages: Math.max(1, Math.ceil(total / params.perPage)),
  };
}
