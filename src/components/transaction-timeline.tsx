import { useMemo, useState } from "react"
import type { Transaction } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import { CalendarRange, Loader2 } from "lucide-react"

const DAY_MS = 86_400_000
const GAP_THRESHOLDS = [7, 14, 30, 60]
const MAX_LISTED_GAPS = 8

interface Gap {
  owner: string
  /** First empty day (day number). */
  from: number
  /** Last empty day (day number). */
  to: number
  /** Number of days without transactions. */
  days: number
}

interface Lane {
  owner: string
  first: number
  last: number
  /** Active day number -> transaction count. */
  days: Map<number, number>
  gaps: Gap[]
}

/** `YYYY-MM-DD` -> whole days since the epoch, so the math is timezone-free. */
function toDayNumber(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""))
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
}

/** Day number -> local Date on that calendar day (for date-fns formatting). */
function toLocalDate(day: number): Date {
  const utc = new Date(day * DAY_MS)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

const formatDay = (day: number) => format(toLocalDate(day), "dd/MM/yyyy")

/** Axis ticks on month starts, thinned out so long ranges stay readable. */
function axisTicks(start: number, end: number): { day: number; label: string }[] {
  const spanMonths = (end - start) / 30.44
  const step = spanMonths > 48 ? 12 : spanMonths > 18 ? 3 : 1
  const first = toLocalDate(start)
  let year = first.getFullYear()
  // First month start on or after `start`, rounded up to the step (quarters, years).
  let month = first.getMonth() + (first.getDate() > 1 ? 1 : 0)
  month = Math.ceil(month / step) * step
  const ticks: { day: number; label: string }[] = []
  for (;;) {
    year += Math.floor(month / 12)
    month %= 12
    const day = Date.UTC(year, month, 1) / DAY_MS
    if (day > end) break
    ticks.push({ day, label: format(new Date(year, month, 1), step === 12 ? "yyyy" : "MMM yy") })
    month += step
  }
  return ticks
}

interface TransactionTimelineProps {
  transactions: Transaction[]
  loading?: boolean
}

export function TransactionTimeline({ transactions, loading = false }: TransactionTimelineProps) {
  const [threshold, setThreshold] = useState(GAP_THRESHOLDS[1])

  const lanes = useMemo(() => {
    const byOwner = new Map<string, Map<number, number>>()
    for (const t of transactions) {
      if (t.owner === "seed-transaction" || t.category === "chain-transaction") continue
      const day = toDayNumber(t.date)
      if (day === null) continue
      let days = byOwner.get(t.owner)
      if (!days) byOwner.set(t.owner, (days = new Map()))
      days.set(day, (days.get(day) ?? 0) + 1)
    }

    const result: Lane[] = []
    for (const [owner, days] of byOwner) {
      const sorted = [...days.keys()].sort((a, b) => a - b)
      const gaps: Gap[] = []
      for (let i = 1; i < sorted.length; i++) {
        const empty = sorted[i] - sorted[i - 1] - 1
        if (empty >= threshold) {
          gaps.push({ owner, from: sorted[i - 1] + 1, to: sorted[i] - 1, days: empty })
        }
      }
      result.push({ owner, first: sorted[0], last: sorted[sorted.length - 1], days, gaps })
    }
    return result.sort((a, b) => a.first - b.first || a.owner.localeCompare(b.owner))
  }, [transactions, threshold])

  const summary = useMemo(() => {
    if (lanes.length === 0) return null
    const start = Math.min(...lanes.map(l => l.first))
    const end = Math.max(...lanes.map(l => l.last))
    const activeDays = new Set(lanes.flatMap(l => [...l.days.keys()])).size
    const gaps = lanes.flatMap(l => l.gaps).sort((a, b) => b.days - a.days || a.from - b.from)
    return { start, end, activeDays, gaps, ticks: axisTicks(start, end) }
  }, [lanes])

  // Position as a percentage of the axis; +1 so the last day has width too.
  const span = summary ? summary.end - summary.start + 1 : 1
  const pct = (day: number) => ((day - (summary?.start ?? 0)) / span) * 100

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-6">
        <div className="space-y-1">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Timeline
          </CardTitle>
          <CardDescription>Days with transactions per owner, and the gaps between them</CardDescription>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Gap after</span>
            <Select value={String(threshold)} onValueChange={v => setThreshold(Number(v))}>
              <SelectTrigger className="h-9 text-xs w-[110px]" aria-label="Gap threshold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAP_THRESHOLDS.map(t => (
                  <SelectItem key={t} value={String(t)} className="text-xs">
                    {t} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {summary && (
            <div className="flex gap-2 border-l pl-3">
              <div className="text-right">
                <p className="text-[9px] font-bold text-muted-foreground uppercase leading-none">Active Days</p>
                <p className="text-sm font-mono font-bold">{summary.activeDays}</p>
              </div>
              <div className="text-right border-l pl-3">
                <p className="text-[9px] font-bold text-amber-600 uppercase leading-none">Gaps</p>
                <p className="text-sm font-mono font-bold text-amber-600">{summary.gaps.length}</p>
              </div>
              <div className="text-right border-l pl-3">
                <p className="text-[9px] font-bold text-amber-600 uppercase leading-none">Longest</p>
                <p className="text-sm font-mono font-bold text-amber-600">
                  {summary.gaps.length > 0 ? `${summary.gaps[0].days}d` : "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !summary ? (
          <div className="text-center py-8 text-xs text-muted-foreground border-2 border-dashed rounded-lg">
            No transactions imported yet.
          </div>
        ) : (
          <div className="space-y-6" data-testid="transaction-timeline">
            <div className="space-y-2">
              {lanes.map(lane => (
                <div key={lane.owner} className="grid grid-cols-[minmax(0,140px)_1fr] items-center gap-3">
                  <div
                    className="text-[10px] capitalize font-semibold text-indigo-600 truncate"
                    title={`${lane.owner} · ${formatDay(lane.first)} – ${formatDay(lane.last)}`}
                  >
                    {lane.owner}
                  </div>
                  <div className="relative h-6 rounded bg-muted/40">
                    {/* Coverage: first to last transaction of this owner */}
                    <div
                      className="absolute top-1/2 h-px -translate-y-1/2 bg-indigo-300 dark:bg-indigo-700"
                      style={{ left: `${pct(lane.first)}%`, width: `${pct(lane.last + 1) - pct(lane.first)}%` }}
                    />
                    {lane.gaps.map(gap => (
                      <div
                        key={gap.from}
                        data-testid="timeline-gap"
                        className="absolute inset-y-0 border-x border-amber-500/70 bg-amber-400/25 dark:bg-amber-500/20"
                        style={{ left: `${pct(gap.from)}%`, width: `${pct(gap.to + 1) - pct(gap.from)}%` }}
                        title={`No transactions for ${gap.days} days\n${formatDay(gap.from)} – ${formatDay(gap.to)}`}
                      />
                    ))}
                    {[...lane.days].map(([day, count]) => (
                      <div
                        key={day}
                        className="absolute inset-y-1 w-[2px] min-w-[2px] rounded-sm bg-indigo-600 dark:bg-indigo-400"
                        style={{ left: `${pct(day)}%`, opacity: Math.min(1, 0.45 + count * 0.15) }}
                        title={`${formatDay(day)} · ${count} transaction${count === 1 ? "" : "s"}`}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Shared date axis */}
              <div className="grid grid-cols-[minmax(0,140px)_1fr] gap-3">
                <div />
                <div className="relative h-5 border-t">
                  {summary.ticks.map(tick => (
                    <div
                      key={tick.day}
                      className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${pct(tick.day)}%` }}
                    >
                      <div className="h-1.5 w-px bg-border" />
                      <span className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">{tick.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {summary.gaps.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">
                  Largest gaps
                  {summary.gaps.length > MAX_LISTED_GAPS && ` (top ${MAX_LISTED_GAPS} of ${summary.gaps.length})`}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {summary.gaps.slice(0, MAX_LISTED_GAPS).map(gap => (
                    <div
                      key={`${gap.owner}-${gap.from}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/10 px-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] capitalize font-semibold text-indigo-600 truncate">{gap.owner}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {formatDay(gap.from)} – {formatDay(gap.to)}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-600 whitespace-nowrap">{gap.days} days</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No gaps of {threshold} days or more between transactions.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
