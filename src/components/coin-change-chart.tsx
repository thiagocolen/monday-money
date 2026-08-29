"use client"

import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format } from "date-fns"

import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { BinanceTransaction } from "@/lib/api"
import { parseFlexibleDate } from "@/lib/date"

/** Stable hue per coin symbol — a coin keeps its colour regardless of how many
 * other coins are on screen (filtering never repaints the survivors). */
function coinColor(coin: string): string {
  let h = 0
  for (let i = 0; i < coin.length; i++) h = (h * 31 + coin.charCodeAt(i)) >>> 0
  return `hsl(${Math.round((h * 137.508) % 360)} 70% 45%)`
}

interface CoinChangePoint {
  t: number
  /** raw cumulative CHANGE per coin at this instant */
  raw: Record<string, number>
}

interface CoinChangeChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
}

function buildSeries(data: BinanceTransaction[]): {
  points: CoinChangePoint[]
  coins: string[]
} {
  const parsed = data
    .map((d) => ({
      date: parseFlexibleDate(d.Time),
      coin: String(d.Coin ?? "").trim(),
      change: Number(d.Change),
    }))
    .filter(
      (r): r is { date: Date; coin: string; change: number } =>
        r.date != null && !!r.coin && Number.isFinite(r.change),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const coins = Array.from(new Set(parsed.map((r) => r.coin))).sort()
  if (parsed.length === 0) return { points: [], coins }

  // One snapshot per distinct timestamp: apply every change at that instant,
  // then record the running cumulative for every coin (carried forward).
  const running: Record<string, number> = Object.fromEntries(
    coins.map((c) => [c, 0]),
  )
  const points: CoinChangePoint[] = []
  let i = 0
  while (i < parsed.length) {
    const t = parsed[i].date.getTime()
    while (i < parsed.length && parsed[i].date.getTime() === t) {
      running[parsed[i].coin] += parsed[i].change
      i++
    }
    points.push({ t, raw: { ...running } })
  }

  return { points, coins }
}

const compactNumber = (v: number) => {
  const abs = Math.abs(v)
  if (abs === 0) return "0"
  if (abs < 1) return v.toPrecision(2)
  return v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
}

const fmtAmount = (v: number) => {
  const abs = Math.abs(v)
  const digits = abs !== 0 && abs < 1 ? 8 : abs < 1000 ? 4 : 2
  return `${v > 0 ? "+" : ""}${v.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  })}`
}

function CoinTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: CoinChangePoint }>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const rows = Object.entries(point.raw)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

  return (
    <div className="rounded-md border bg-background px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1 font-mono font-medium text-foreground">
        {format(new Date(point.t), "dd MMM yyyy HH:mm")}
      </div>
      {rows.length === 0 ? (
        <div className="text-muted-foreground">No holdings yet</div>
      ) : (
        <div className="grid max-h-64 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 overflow-y-auto">
          {rows.map(([coin, v]) => (
            <React.Fragment key={coin}>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: coinColor(coin) }}
                />
                {coin}
              </span>
              <span
                className={`text-right font-mono tabular-nums ${
                  v < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {fmtAmount(v)}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

export function CoinChangeChart({ data }: CoinChangeChartProps) {
  const { points, coins } = React.useMemo(() => buildSeries(data), [data])

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        coins.map((c) => [c, { label: c, color: coinColor(c) }]),
      ),
    [coins],
  )

  if (points.length < 2) {
    return (
      <div className="flex h-[360px] items-center justify-center text-xs text-muted-foreground">
        Not enough data in range to plot.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ChartContainer config={config} className="aspect-auto h-[360px] w-full">
        <LineChart data={points} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={40}
            tickFormatter={(value) => format(new Date(value), "dd MMM ''yy")}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={64}
            tickFormatter={(value) => compactNumber(Number(value))}
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
          <Tooltip
            cursor={{ strokeDasharray: "4 4" }}
            content={<CoinTooltip />}
          />
          {coins.map((coin) => (
            <Line
              key={coin}
              dataKey={(p: CoinChangePoint) => p.raw[coin]}
              name={coin}
              type="monotone"
              stroke={coinColor(coin)}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {coins.map((coin) => (
          <span key={coin} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: coinColor(coin) }}
            />
            {coin}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Running total of CHANGE per coin, in each coin's own units, on one shared scale.
        Filter the Coin column to compare coins of similar magnitude.
      </p>
    </div>
  )
}
