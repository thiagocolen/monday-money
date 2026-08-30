"use client"

import * as React from "react"
import { Cell, Pie, PieChart, Tooltip } from "recharts"

import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { BinanceTransaction } from "@/lib/api"
import { currentCoinBalances } from "@/lib/binance-history"
import { coinColor, coinLabel } from "@/lib/coins"

interface PortfolioPieChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
}

interface Slice {
  coin: string
  value: number
  share: number
  /** real coins only; "Other" has none */
  color: string
}

const OTHER_COLOR = "hsl(215 12% 65%)"
/** coins below this share of the portfolio are folded into "Other" */
const MIN_SHARE = 0.02

const fmtQty = (v: number) => {
  const abs = Math.abs(v)
  const digits = abs !== 0 && abs < 1 ? 6 : abs < 1000 ? 3 : 2
  return v.toLocaleString("en-US", { maximumFractionDigits: digits })
}
const fmtPct = (s: number) =>
  `${(s * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`

function buildSlices(data: BinanceTransaction[]): Slice[] {
  const balances = currentCoinBalances(data)
  const held = Object.entries(balances)
    .map(([coin, value]) => ({ coin, value }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = held.reduce((sum, b) => sum + b.value, 0)
  if (total <= 0) return []

  const big = held.filter((b) => b.value / total >= MIN_SHARE)
  const small = held.filter((b) => b.value / total < MIN_SHARE)

  const slices: Slice[] = big.map((b) => ({
    coin: b.coin,
    value: b.value,
    share: b.value / total,
    color: coinColor(b.coin),
  }))

  if (small.length) {
    const value = small.reduce((sum, b) => sum + b.value, 0)
    slices.push({
      coin: `Other (${small.length})`,
      value,
      share: value / total,
      color: OTHER_COLOR,
    })
  }
  return slices
}

function SliceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: Slice }>
}) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  return (
    <div className="rounded-md border bg-background px-2.5 py-2 text-xs shadow-md">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
          style={{ backgroundColor: s.color }}
        />
        {s.coin.startsWith("Other") ? s.coin : coinLabel(s.coin)}
      </div>
      <div className="mt-0.5 font-mono tabular-nums text-muted-foreground">
        {fmtQty(s.value)} · {fmtPct(s.share)}
      </div>
    </div>
  )
}

export function PortfolioPieChart({ data }: PortfolioPieChartProps) {
  const slices = React.useMemo(() => buildSlices(data), [data])

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        slices.map((s) => [s.coin, { label: s.coin, color: s.color }]),
      ),
    [slices],
  )

  if (slices.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center text-center text-xs text-muted-foreground">
        No positive balances to allocate.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ChartContainer config={config} className="mx-auto aspect-square h-[260px]">
        <PieChart>
          <Tooltip content={<SliceTooltip />} />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="coin"
            innerRadius="55%"
            outerRadius="90%"
            paddingAngle={1}
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.coin} fill={s.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex flex-col gap-1">
        {slices.map((s) => (
          <div
            key={s.coin}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate">
                {s.coin.startsWith("Other") ? s.coin : coinLabel(s.coin)}
              </span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">
              {fmtPct(s.share)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        By token quantity held today (running total of CHANGE), not market value.
      </p>
    </div>
  )
}
