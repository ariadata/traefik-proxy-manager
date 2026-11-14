import * as React from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  flexRender,
  useTable,
} from '@tanstack/react-table'
import { RefreshCcw } from 'lucide-react'

import { dataTableFeatures, type DataTableFeatures } from '@/lib/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table/pagination'
import { DataTableViewOptions } from '@/components/data-table/view-options'

type CrudDataTableProps<TData extends RowData> = {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  toolbarLeft?: React.ReactNode
  toolbarRight?: React.ReactNode
}

export function CrudDataTable<TData extends RowData>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search…',
  toolbarLeft,
  toolbarRight,
}: CrudDataTableProps<TData>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const isFiltered = columnFilters.length > 0
  const searchId = React.useId()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {searchKey && (
            <form
              role="search"
              className="w-full sm:w-auto"
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor={searchId} className="sr-only">
                {searchPlaceholder}
              </label>
              <Input
                id={searchId}
                name="q"
                type="search"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
                onChange={(event) => table.getColumn(searchKey)?.setFilterValue(event.target.value)}
                className="w-full sm:w-[220px] lg:w-[300px]"
              />
            </form>
          )}
          {toolbarLeft}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isFiltered}
            aria-label="Reset filters"
            onClick={() => table.resetColumnFilters()}
          >
            <RefreshCcw data-icon="inline-start" aria-hidden="true" />
            <span className="hidden lg:inline">Reset</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <DataTableViewOptions table={table} />
          {toolbarRight}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border bg-muted/50 hover:bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground h-28 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  )
}
