"use client"

import * as React from "react"
import type { Column, Table } from "@tanstack/react-table"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface MultiSelectFilterProps<TData> {
  column: Column<TData, unknown>
  table: Table<TData>
  /** Current filter value, sourced from the table's live `columnFilters` state by the parent. */
  filterValue: string[] | undefined
}

/**
 * Header filter that swaps the free-text input for a checkbox dropdown.
 * Filter value is a `string[]` of the selected cell values (empty = show all).
 */
export function MultiSelectFilter<TData>({
  column,
  table,
  filterValue,
}: MultiSelectFilterProps<TData>) {
  const coreRows = table.getCoreRowModel().rows

  const options = React.useMemo(() => {
    const values = new Set<string>()
    coreRows.forEach((row) => {
      const value = row.getValue(column.id)
      if (value != null && value !== "") values.add(String(value))
    })
    return Array.from(values).sort()
  }, [coreRows, column.id])

  const selected = filterValue ?? []

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    column.setFilterValue(next.length ? next : undefined)
  }

  const label =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-7 w-full justify-between gap-1.5 px-2 text-xs font-normal",
            selected.length === 0 && "text-muted-foreground"
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 gap-0 p-1">
        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No values
            </div>
          ) : (
            options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted"
              >
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={() => toggle(option)}
                />
                <span className="truncate">{option}</span>
              </label>
            ))
          )}
        </div>
        {selected.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => column.setFilterValue(undefined)}
              className="w-full rounded-sm px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
