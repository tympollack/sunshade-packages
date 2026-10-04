import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { cn } from '../../utils/cn';

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  width?: string | number;
  minWidth?: string | number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  accessor?: (row: T) => unknown;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Array of row data */
  data: T[];
  /** Unique key extractor for each row */
  getRowId?: (row: T, index: number) => string | number;
  /** Optional row click handler */
  onRowClick?: (row: T) => void;
  /** Action buttons revealed on row hover */
  rowActions?: (row: T) => React.ReactNode;
  /** Maximum container height for virtual scroll (e.g. 400, '400px') */
  maxHeight?: number | string;
  /** Estimated row height in pixels (default 44) */
  rowHeight?: number;
  /** Enable windowed virtualization (default true when data.length > 50) */
  virtualized?: boolean;
  /** Empty state message or custom element */
  emptyState?: React.ReactNode;
  /** Additional container classes */
  className?: string;
  /** Testing identifier */
  testID?: string;
}

/**
 * DataTable - Virtualized modern data grid primitive for @digitalcanopy/ui.
 * Supports sticky column headers, sort toggling, row hover micro-actions,
 * and high-performance virtual windowing for large datasets (> 200 rows).
 */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  getRowId,
  onRowClick,
  rowActions,
  maxHeight = 440,
  rowHeight = 44,
  virtualized,
  emptyState,
  className,
  testID = 'canopy-data-table',
}: DataTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(440);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  const shouldVirtualize = virtualized ?? data.length > 50;

  // Sorting logic
  const handleHeaderClick = (col: ColumnDef<T>) => {
    if (!col.sortable) return;
    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;

    return [...data].sort((a, b) => {
      const valA = col.accessor ? col.accessor(a) : a[sortKey];
      const valB = col.accessor ? col.accessor(b) : b[sortKey];

      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      const compare = String(valA).localeCompare(String(valB), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortDir === 'asc' ? compare : -compare;
    });
  }, [data, columns, sortKey, sortDir]);

  // Virtualization window calculations
  const totalRows = sortedData.length;
  const totalHeight = totalRows * rowHeight;
  const maxScroll = Math.max(0, totalHeight - containerHeight);
  const overscan = 5;

  // Clamp scrollTop and sync DOM scroll container when totalRows or filter shrinks
  useEffect(() => {
    if (!shouldVirtualize) return;
    if (scrollTop > maxScroll) {
      setScrollTop(maxScroll);
      if (containerRef.current) {
        containerRef.current.scrollTop = maxScroll;
      }
    }
  }, [totalRows, maxScroll, scrollTop, shouldVirtualize]);

  const effectiveScrollTop = Math.min(scrollTop, maxScroll);
  const rawStartIndex = shouldVirtualize
    ? Math.max(0, Math.floor(effectiveScrollTop / rowHeight) - overscan)
    : 0;
  const startIndex = totalRows > 0 ? Math.min(rawStartIndex, totalRows - 1) : 0;
  const endIndex = shouldVirtualize
    ? Math.min(totalRows, Math.ceil((effectiveScrollTop + containerHeight) / rowHeight) + overscan)
    : totalRows;

  const visibleRows = shouldVirtualize
    ? sortedData.slice(startIndex, endIndex)
    : sortedData;

  const offsetY = shouldVirtualize ? startIndex * rowHeight : 0;

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!shouldVirtualize) return;
      const target = e.currentTarget;
      setScrollTop(target.scrollTop);
      if (target.clientHeight && target.clientHeight !== containerHeight) {
        setContainerHeight(target.clientHeight);
      }
    },
    [shouldVirtualize, containerHeight]
  );

  return (
    <div
      data-testid={testID}
      className={cn(
        'w-full flex flex-col overflow-hidden rounded-xl border border-stone-800 bg-stone-900/90 shadow-xl',
        className
      )}
    >
      <div
        ref={containerRef}
        data-testid={`${testID}-scroll-container`}
        onScroll={handleScroll}
        style={{
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
        }}
        className="w-full overflow-auto relative"
      >
        <table className="w-full border-collapse text-left text-sm">
          {/* Sticky Table Header */}
          <thead className="sticky top-0 z-10 bg-stone-900 border-b border-stone-800 shadow-sm">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    data-testid={`${testID}-header-${col.key}`}
                    onClick={() => handleHeaderClick(col)}
                    style={{
                      width: col.width,
                      minWidth: col.minWidth,
                      textAlign: col.align || 'left',
                    }}
                    className={cn(
                      'px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider select-none',
                      col.sortable && 'cursor-pointer hover:text-stone-200 transition-colors'
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-center gap-1.5',
                        col.align === 'right' && 'justify-end',
                        col.align === 'center' && 'justify-center'
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-[10px] text-stone-500 font-mono">
                          {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
              {rowActions && (
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider text-right w-24 select-none"
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-stone-800/60">
            {totalRows === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="px-4 py-12 text-center text-sm text-stone-500"
                >
                  {emptyState || 'No records found.'}
                </td>
              </tr>
            ) : shouldVirtualize ? (
              <>
                {offsetY > 0 && (
                  <tr style={{ height: `${offsetY}px` }} aria-hidden="true">
                    <td colSpan={columns.length + (rowActions ? 1 : 0)} />
                  </tr>
                )}
                {visibleRows.map((row, index) => {
                  const actualIndex = startIndex + index;
                  const rowId = getRowId ? getRowId(row, actualIndex) : (row.id as string | number) || actualIndex;

                  return (
                    <tr
                      key={rowId}
                      data-testid={`${testID}-row-${actualIndex}`}
                      onClick={() => onRowClick?.(row)}
                      style={{ height: `${rowHeight}px`, maxHeight: `${rowHeight}px` }}
                      className={cn(
                        'group transition-colors border-b border-stone-800/50',
                        onRowClick ? 'cursor-pointer hover:bg-stone-800/50' : 'hover:bg-stone-800/30'
                      )}
                    >
                      {columns.map((col) => {
                        const cellValue = col.accessor ? col.accessor(row) : row[col.key];
                        return (
                          <td
                            key={col.key}
                            style={{
                              textAlign: col.align || 'left',
                              height: `${rowHeight}px`,
                              maxHeight: `${rowHeight}px`,
                            }}
                            className="px-4 py-1.5 text-stone-300 font-normal whitespace-nowrap overflow-hidden"
                          >
                            <div
                              style={{ maxHeight: `${rowHeight - 8}px` }}
                              className="w-full overflow-hidden text-ellipsis flex items-center"
                            >
                              {col.render ? col.render(cellValue, row, actualIndex) : (cellValue as React.ReactNode)}
                            </div>
                          </td>
                        );
                      })}
                      {rowActions && (
                        <td
                          style={{
                            height: `${rowHeight}px`,
                            maxHeight: `${rowHeight}px`,
                          }}
                          className="px-4 py-1.5 text-right whitespace-nowrap overflow-hidden"
                        >
                          <div
                            style={{ maxHeight: `${rowHeight - 8}px` }}
                            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 inline-flex items-center gap-1.5 justify-end overflow-hidden"
                          >
                            {rowActions(row)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {totalHeight - (offsetY + visibleRows.length * rowHeight) > 0 && (
                  <tr
                    style={{
                      height: `${totalHeight - (offsetY + visibleRows.length * rowHeight)}px`,
                    }}
                    aria-hidden="true"
                  >
                    <td colSpan={columns.length + (rowActions ? 1 : 0)} />
                  </tr>
                )}
              </>
            ) : (
              visibleRows.map((row, index) => {
                const rowId = getRowId ? getRowId(row, index) : (row.id as string | number) || index;
                return (
                  <tr
                    key={rowId}
                    data-testid={`${testID}-row-${index}`}
                    onClick={() => onRowClick?.(row)}
                    style={{ height: `${rowHeight}px`, maxHeight: `${rowHeight}px` }}
                    className={cn(
                      'group transition-colors border-b border-stone-800/50',
                      onRowClick ? 'cursor-pointer hover:bg-stone-800/50' : 'hover:bg-stone-800/30'
                    )}
                  >
                    {columns.map((col) => {
                      const cellValue = col.accessor ? col.accessor(row) : row[col.key];
                      return (
                        <td
                          key={col.key}
                          style={{
                            textAlign: col.align || 'left',
                            height: `${rowHeight}px`,
                            maxHeight: `${rowHeight}px`,
                          }}
                          className="px-4 py-1.5 text-stone-300 font-normal whitespace-nowrap overflow-hidden"
                        >
                          <div
                            style={{ maxHeight: `${rowHeight - 8}px` }}
                            className="w-full overflow-hidden text-ellipsis flex items-center"
                          >
                            {col.render ? col.render(cellValue, row, index) : (cellValue as React.ReactNode)}
                          </div>
                        </td>
                      );
                    })}
                    {rowActions && (
                      <td
                        style={{
                          height: `${rowHeight}px`,
                          maxHeight: `${rowHeight}px`,
                        }}
                        className="px-4 py-1.5 text-right whitespace-nowrap overflow-hidden"
                      >
                        <div
                          style={{ maxHeight: `${rowHeight - 8}px` }}
                          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 inline-flex items-center gap-1.5 justify-end overflow-hidden"
                        >
                          {rowActions(row)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
