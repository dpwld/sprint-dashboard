import React from 'react';

export interface Column<Row = any> {
  /** Unique key; also the default cell accessor (row[key]). */
  key: string;
  header: React.ReactNode;
  /** CSS width, e.g. 120, '20%'. */
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Tabular monospace cell (IDs, part numbers, dimensions). */
  mono?: boolean;
  /** Tabular-nums without monospace. */
  num?: boolean;
  /** Bold + strong ink (primary identifier column). */
  strong?: boolean;
  /** Custom cell renderer. */
  render?: (row: Row, index: number) => React.ReactNode;
}

/**
 * Dense, scannable data grid driven by a column config. Supports sortable
 * headers (controlled via sortKey/sortDir+onSort, or internal), row selection,
 * three densities, zebra striping, sticky header, and row click.
 *
 * @startingPoint section="Data" subtitle="Sortable, selectable data grid" viewport="900x640"
 */
export interface DataTableProps<Row = any> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  columns: Column<Row>[];
  data: Row[];
  /** Stable row key. @default row.id ?? index */
  rowKey?: (row: Row, index: number) => string | number;
  density?: 'compact' | 'default' | 'relaxed';
  zebra?: boolean;
  hover?: boolean;
  stickyHeader?: boolean;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  selectable?: boolean;
  selectedKeys?: Array<string | number> | null;
  onSelectionChange?: (keys: Array<string | number>) => void;
  onRowClick?: (row: Row, index: number) => void;
  /** Drag-resizable column widths (opt-in). */
  resizable?: boolean;
  /** localStorage key so each user's column widths persist per table. */
  storageKey?: string;
}
export function DataTable<Row = any>(props: DataTableProps<Row>): JSX.Element;
