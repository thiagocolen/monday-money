"use client"

import * as React from "react"
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  onRowClick?: (row: TData) => void
  onSelectionChange?: (selectedRows: TData[]) => void
  rowSelection?: Record<string, boolean>
  onRowSelectionChange?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  getRowId?: (row: TData) => string
  filterable?: boolean
  paginated?: boolean
  pageSize?: number
  stickyHeader?: boolean
  headerOffset?: number
  meta?: any
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  onSelectionChange,
  rowSelection: controlledRowSelection,
  onRowSelectionChange: controlledOnRowSelectionChange,
  getRowId,
  filterable = false,
  paginated = false,
  pageSize = 50,
  stickyHeader = false,
  headerOffset = 0,
  meta,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [internalRowSelection, setInternalRowSelection] = React.useState({})

  const rowSelection = controlledRowSelection !== undefined ? controlledRowSelection : internalRowSelection
  const setRowSelection = controlledOnRowSelectionChange !== undefined ? controlledOnRowSelectionChange : setInternalRowSelection

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection as any,
    getRowId: getRowId as any,
    meta,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      ...(paginated ? {} : { pagination: { pageIndex: 0, pageSize: data.length || 1000000 } })
    },
    initialState: {
      pagination: {
        pageSize: pageSize,
      },
    },
  })

  React.useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map(row => row.original)
      onSelectionChange(selectedRows)
    }
  }, [rowSelection, table, onSelectionChange])

  const hasFilters = columnFilters.length > 0

  return (
    <div className="space-y-4">
      {filterable && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground font-mono">
            Showing {table.getFilteredRowModel().rows.length} of {data.length} records
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => table.resetColumnFilters()}
              className="h-8 px-2 lg:px-3 text-xs"
            >
              Clear Filters
              <X className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      <div className={cn("rounded-md border relative", !stickyHeader && "overflow-hidden")}>
        <Table containerClassName={stickyHeader ? "overflow-visible" : ""}>
          <TableHeader className={stickyHeader ? "z-20" : ""}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50 hover:bg-muted/50 border-b-0">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead 
                      key={header.id} 
                      className={cn("px-2 py-2", stickyHeader && "sticky z-20 bg-background shadow-sm", (header.column.columnDef.meta as any)?.className)}
                      style={stickyHeader ? { top: headerOffset } : {}}
                    >
                      <div className="flex flex-col space-y-2">
                        <div
                          className={`flex items-center gap-1 text-xs font-bold uppercase tracking-wider ${
                            header.column.getCanSort() ? "cursor-pointer select-none" : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                          {{
                            asc: <ChevronUp className="h-3 w-3" />,
                            desc: <ChevronDown className="h-3 w-3" />,
                          }[header.column.getIsSorted() as string] ?? 
                            (header.column.getCanSort() ? <ChevronsUpDown className="h-3 w-3 opacity-50" /> : null)}
                        </div>
                        {filterable && header.column.getCanFilter() ? (
                          <Input
                            placeholder="Filter..."
                            value={(header.column.getFilterValue() as string) ?? ""}
                            onChange={(event) =>
                              header.column.setFilterValue(event.target.value)
                            }
                            className="h-7 text-xs px-2 font-normal"
                          />
                        ) : null}
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => onRowClick?.(row.original)}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/30 transition-colors" : "hover:bg-muted/30 transition-colors"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell 
                      key={cell.id} 
                      className={cn("px-2 py-2 text-xs", (cell.column.columnDef.meta as any)?.className)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {paginated && (
        <div className="flex items-center justify-end space-x-2">
          <div className="flex-1 text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="text-xs h-8"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="text-xs h-8"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
