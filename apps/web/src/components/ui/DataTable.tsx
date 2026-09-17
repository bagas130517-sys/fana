"use client";

import { Pager, type PageInfo } from "./Pager";
import { SkeletonRows } from "./Skeleton";

/**
 * The table every growing list in the dashboard renders through.
 *
 * Columns are data, like the endpoint list in `lib/docs.ts` — a section
 * describes what to show and this owns how it looks, so the customer table and
 * the message table cannot drift into two different tables.
 *
 * Paging is *server-side*: `page` and `total` come from the endpoint, and the
 * component only asks for a different page. Sorting a page of ten rows in the
 * browser would sort ten rows out of four hundred, which is worse than not
 * offering it.
 */

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Applied to the cell and its header, for width and alignment. */
  className?: string;
  /** Hidden below `sm`, for the columns that matter least. */
  secondary?: boolean;
}

export type { PageInfo };

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  page,
  onPage,
  loading,
  empty = "Nothing here yet.",
  onRowClick,
  busy,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  page?: PageInfo;
  onPage?: (next: number) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Disables the pager while a mutation is in flight. */
  busy?: boolean;
}) {
  if (loading) return <SkeletonRows rows={5} />;

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-2">{empty}</p>;
  }


  return (
    <div className="space-y-3">
      {/* The table scrolls inside its own box; the page must not scroll sideways. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-full text-left text-sm">
          <thead className="border-b border-rule text-xs uppercase tracking-wide text-ink-2">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-2 font-semibold ${
                    col.secondary ? "hidden sm:table-cell" : ""
                  } ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer transition-colors hover:bg-paper-3" : ""}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 align-middle ${
                      col.secondary ? "hidden sm:table-cell" : ""
                    } ${col.className ?? ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {page && onPage && (
        <Pager info={page} onPage={onPage} busy={busy} shown={rows.length} />
      )}
    </div>
  );
}
