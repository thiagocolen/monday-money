"use client"

import * as React from "react"
import type { Column } from "@tanstack/react-table"
import type { DateRange } from "react-day-picker"
import { format } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** Stored as the column's filter value. Epoch ms, inclusive on both ends. */
export interface DateRangeFilterValue {
  from?: number
  to?: number
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

interface Preset {
  label: string
  getRange: () => DateRange
}

const PRESETS: Preset[] = [
  {
    label: "This year",
    getRange: () => {
      const now = new Date()
      return { from: new Date(now.getFullYear(), 0, 1), to: now }
    },
  },
  {
    label: "This semester",
    getRange: () => {
      const now = new Date()
      const semesterStartMonth = now.getMonth() < 6 ? 0 : 6
      return {
        from: new Date(now.getFullYear(), semesterStartMonth, 1),
        to: now,
      }
    },
  },
]

function labelFor(value: DateRangeFilterValue | undefined): string {
  if (!value || (value.from == null && value.to == null)) return "Any date"
  const fmt = (ms: number) => format(new Date(ms), "d MMM ''yy")
  if (value.from != null && value.to != null)
    return `${fmt(value.from)} – ${fmt(value.to)}`
  if (value.from != null) return `From ${fmt(value.from)}`
  return `Until ${fmt(value.to as number)}`
}

interface DateRangeFilterProps<TData> {
  column: Column<TData, unknown>
  /** Current filter value, sourced from the table's live `columnFilters` state by the parent. */
  filterValue: DateRangeFilterValue | undefined
}

export function DateRangeFilter<TData>({ column, filterValue }: DateRangeFilterProps<TData>) {
  const [open, setOpen] = React.useState(false)
  const value = filterValue

  const selected: DateRange | undefined = React.useMemo(() => {
    if (!value) return undefined
    return {
      from: value.from != null ? new Date(value.from) : undefined,
      to: value.to != null ? new Date(value.to) : undefined,
    }
  }, [value])

  const apply = (range: DateRange | undefined) => {
    if (!range || (!range.from && !range.to)) {
      column.setFilterValue(undefined)
      return
    }
    column.setFilterValue({
      from: range.from ? startOfDay(range.from).getTime() : undefined,
      to: range.to ? endOfDay(range.to).getTime() : undefined,
    })
  }

  const hasValue = value && (value.from != null || value.to != null)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-7 w-full justify-start gap-1.5 px-2 text-xs font-normal",
            !hasValue && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{labelFor(value)}</span>
          {hasValue && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date filter"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                apply(undefined)
              }}
              className="ml-auto inline-flex text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto flex-row gap-0 p-0">
        <div className="flex w-36 flex-col gap-0.5 border-r p-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              className="h-7 justify-start px-2 text-xs font-normal"
              onClick={() => apply(preset.getRange())}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="h-7 justify-start px-2 text-xs font-normal"
            onClick={() => apply(undefined)}
          >
            All time
          </Button>
          <Button
            variant="ghost"
            className="h-7 justify-start px-2 text-xs font-normal text-muted-foreground"
            onClick={() => apply(undefined)}
          >
            Clear
          </Button>
        </div>
        <Calendar
          mode="range"
          autoFocus
          defaultMonth={selected?.from}
          selected={selected}
          onSelect={apply}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  )
}
