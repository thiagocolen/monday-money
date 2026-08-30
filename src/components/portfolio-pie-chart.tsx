"use client"

import * as React from "react"
import { Cell, Label, Pie, PieChart, Tooltip } from "recharts"

import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { BinanceTransaction } from "@/lib/api"
import { currentCoinBalances } from "@/lib/binance-history"
import { coinColor, coinLabel } from "@/lib/coins"
import { fetchUsdQuotes } from "@/lib/prices"
import type { UsdQuotes } from "@/lib/prices"

interface PortfolioPieChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
}

interface Slice {
  coin: string
  /** USD value of the holding */
  usd: number
  /** underlying token quantity */
  qty: number
  share: number
  color: string
}

const OTHER_COLOR = "hsl(215 12% 65%)"
/** holdings below this share of the portfolio are folded into "Other" */
const MIN_SHARE = 0.015

const fmtUsd = (v: number, compact = false) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : v < 100 ? 2 : 0,
  })
const fmtPct = (s: number) =>
  `${(s * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`
const fmtQty = (v: number) => {
  const abs = Math.abs(v)
  const digits = abs !== 0 && abs < 1 ? 6 : abs < 1000 ? 3 : 2
  return v.toLocaleString("en-US", { maximumFractionDigits: digits })
}

function buildSlices(
  data: BinanceTransaction[],
  price: Record<string, number>,
): { slices: Slice[]; totalUsd: number; unpriced: string[] } {
  const balances = currentCoinBalances(data)

  const priced: { coin: string; usd: number; qty: number }[] = []
  const unpriced: string[] = []
  for (const [coin, qty] of Object.entries(balances)) {
    if (qty <= 0) continue
    const p = price[coin.toUpperCase()]
    if (typeof p === "number" && p > 0) priced.push({ coin, usd: qty * p, qty })
    else unpriced.push(coin)
  }
  priced.sort((a, b) => b.usd - a.usd)

  const totalUsd = priced.reduce((sum, h) => sum + h.usd, 0)
  if (totalUsd <= 0) return { slices: [], totalUsd: 0, unpriced: unpriced.sort() }

  const big = priced.filter((h) => h.usd / totalUsd >= MIN_SHARE)
  const small = priced.filter((h) => h.usd / totalUsd < MIN_SHARE)

  const slices: Slice[] = big.map((h) => ({
    coin: h.coin,
    usd: h.usd,
    qty: h.qty,
    share: h.usd / totalUsd,
    color: coinColor(h.coin),
  }))
  if (small.length) {
    const usd = small.reduce((sum, h) => sum + h.usd, 0)
    slices.push({
      coin: `Other (${small.length})`,
      usd,
      qty: NaN,
      share: usd / totalUsd,
      color: OTHER_COLOR,
    })
  }
  return { slices, totalUsd, unpriced: unpriced.sort() }
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
  const isOther = s.coin.startsWith("Other")
  return (
    <div className="rounded-md border bg-background px-2.5 py-2 text-xs shadow-md">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
          style={{ backgroundColor: s.color }}
        />
        {isOther ? s.coin : coinLabel(s.coin)}
      </div>
      <div className="mt-0.5 font-mono tabular-nums text-muted-foreground">
        {fmtUsd(s.usd)} · {fmtPct(s.share)}
        {!isOther && !Number.isNaN(s.qty) ? ` · ${fmtQty(s.qty)} ${s.coin}` : ""}
      </div>
    </div>
  )
}

export function PortfolioPieChart({ data }: PortfolioPieChartProps) {
  const [quotes, setQuotes] = React.useState<UsdQuotes | null>(null)

  React.useEffect(() => {
    let alive = true
    fetchUsdQuotes().then((q) => {
      if (alive) setQuotes(q)
    })
    return () => {
      alive = false
    }
  }, [])

  const { slices, totalUsd, unpriced } = React.useMemo(
    () => buildSlices(data, quotes?.price ?? {}),
    [data, quotes],
  )

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        slices.map((s) => [s.coin, { label: s.coin, color: s.color }]),
      ),
    [slices],
  )

  if (!quotes) {
    return (
      <div className="flex h-[360px] items-center justify-center text-xs text-muted-foreground">
        Fetching live USD quotes…
      </div>
    )
  }

  if (slices.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {quotes.stale && Object.keys(quotes.price).length === 0
          ? "Could not reach CoinGecko for USD quotes."
          : "No priced positive balances to allocate."}
      </div>
    )
  }

  const updated = new Date(quotes.fetchedAt)

  return (
    <div className="space-y-2">
      <ChartContainer config={config} className="mx-auto aspect-square h-[260px]">
        <PieChart>
          <Tooltip content={<SliceTooltip />} />
          <Pie
            data={slices}
            dataKey="usd"
            nameKey="coin"
            innerRadius="58%"
            outerRadius="90%"
            paddingAngle={1}
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.coin} fill={s.color} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox)) return null
                const { cx, cy } = viewBox as { cx: number; cy: number }
                return (
                  <text x={cx} y={cy} textAnchor="middle">
                    <tspan
                      x={cx}
                      y={cy - 4}
                      fill="var(--foreground)"
                      style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}
                    >
                      {fmtUsd(totalUsd, true)}
                    </tspan>
                    <tspan
                      x={cx}
                      y={cy + 14}
                      fill="var(--muted-foreground)"
                      style={{ fontSize: 10, letterSpacing: "0.15em" }}
                    >
                      USD
                    </tspan>
                  </text>
                )
              }}
            />
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
            <span className="flex shrink-0 gap-2 font-mono tabular-nums">
              <span className="text-muted-foreground">{fmtUsd(s.usd)}</span>
              <span className="w-10 text-right text-foreground">{fmtPct(s.share)}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Live USD value via CoinGecko
        {quotes.stale ? " (offline — last known)" : ` · updated ${updated.toLocaleTimeString()}`}
        .
        {unpriced.length > 0 && ` No quote for: ${unpriced.map(coinLabel).join(", ")}.`}
      </p>
    </div>
  )
}
