"use client"

import * as React from "react"
import { Cell, Label, Pie, PieChart, Tooltip } from "recharts"

import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { BinanceTransaction } from "@/lib/api"
import {
  buildLiveAllocation,
  buildSnapshotAllocation,
  fmtDate,
  fmtPct,
  fmtQty,
  fmtUsd,
} from "@/lib/allocation"
import type { AllocSlice, DateSnapshot } from "@/lib/allocation"
import { coinLabel } from "@/lib/coins"
import { useCoinColor } from "@/lib/use-coin-colors"
import { fetchUsdQuotes } from "@/lib/prices"
import type { UsdQuotes } from "@/lib/prices"

interface PortfolioPieChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
  /** when set, show allocation as of this picked date instead of today */
  snapshot?: DateSnapshot | null
  /** reset back to today */
  onClearSnapshot?: () => void
  /**
   * Live USD quotes. When provided the component uses these and skips its own
   * fetch (lets a parent share one fetch across sibling charts). Pass `null`
   * while the parent's fetch is still in flight. Omit entirely to self-fetch.
   */
  quotes?: UsdQuotes | null
}

function SliceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: AllocSlice }>
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
        {coinLabel(s.coin)}
      </div>
      <div className="mt-0.5 font-mono tabular-nums text-muted-foreground">
        {fmtUsd(s.usd)} · {fmtPct(s.share)}
        {Number.isNaN(s.qty) ? "" : ` · ${fmtQty(s.qty)} ${s.coin}`}
      </div>
    </div>
  )
}

export function PortfolioPieChart({
  data,
  snapshot,
  onClearSnapshot,
  quotes: quotesProp,
}: PortfolioPieChartProps) {
  const [fetched, setFetched] = React.useState<UsdQuotes | null>(null)
  const quotes = quotesProp !== undefined ? quotesProp : fetched
  const colorOf = useCoinColor()

  React.useEffect(() => {
    if (snapshot || quotesProp !== undefined) return // snapshot carries USD; prop wins
    let alive = true
    fetchUsdQuotes().then((q) => {
      if (alive) setFetched(q)
    })
    return () => {
      alive = false
    }
  }, [snapshot, quotesProp])

  // `colorOf` carries the palette: a shuffle gives it a new identity, which
  // re-slices with the new colours (they're baked into each slice).
  const { slices, totalUsd, unpriced } = React.useMemo(() => {
    return snapshot
      ? buildSnapshotAllocation(snapshot.holdings, snapshot.balances, colorOf)
      : buildLiveAllocation(data, quotes?.price ?? {}, colorOf)
  }, [snapshot, data, quotes, colorOf])

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        slices.map((s) => [s.coin, { label: s.coin, color: s.color }]),
      ),
    [slices],
  )

  const header = snapshot ? (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="font-medium text-foreground">{fmtDate(snapshot.timestamp)}</span>
      <button
        type="button"
        onClick={onClearSnapshot}
        className="text-primary hover:underline"
      >
        Back to today
      </button>
    </div>
  ) : null

  if (!snapshot && !quotes) {
    return (
      <div className="flex h-[300px] items-center justify-center text-xs text-muted-foreground">
        Fetching live USD quotes…
      </div>
    )
  }

  if (slices.length === 0) {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex h-[260px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {snapshot
            ? `No priced holdings on ${fmtDate(snapshot.timestamp)}.`
            : quotes?.stale && Object.keys(quotes.price).length === 0
              ? "Could not reach CoinGecko for USD quotes."
              : "No priced positive balances to allocate."}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {header}
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

      {/* One grid rather than a row of flexboxes so the amount column lines up. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_2.5rem] items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="col-span-2 border-b pb-1 font-medium text-foreground">
          Total ({slices.length} asset{slices.length === 1 ? "" : "s"})
        </span>
        <span className="border-b pb-1 text-right font-mono font-medium tabular-nums text-foreground">
          {fmtUsd(totalUsd)}
        </span>
        <span className="border-b pb-1 text-right font-medium text-muted-foreground">
          %
        </span>
        {slices.map((s) => (
          <React.Fragment key={s.coin}>
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate">{coinLabel(s.coin)}</span>
            </span>
            <span
              className="text-right font-mono tabular-nums text-muted-foreground"
              title={Number.isNaN(s.qty) ? undefined : `${fmtQty(s.qty)} ${s.coin}`}
            >
              {Number.isNaN(s.qty) ? "—" : fmtQty(s.qty)}
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">
              {fmtUsd(s.usd)}
            </span>
            <span className="text-right font-mono tabular-nums text-foreground">
              {fmtPct(s.share)}
            </span>
          </React.Fragment>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        {snapshot ? (
          `Value on ${fmtDate(snapshot.timestamp)} · Coinbase / CoinGecko history. Click the price chart to pick another day.`
        ) : (
          <>
            Live USD value via CoinGecko
            {quotes?.stale
              ? " (offline — last known)"
              : quotes?.fetchedAt
                ? ` · updated ${new Date(quotes.fetchedAt).toLocaleTimeString()}`
                : ""}
            . Click the price chart to see a past day.
            {unpriced.length > 0 && ` No quote for: ${unpriced.map(coinLabel).join(", ")}.`}
          </>
        )}
      </p>
    </div>
  )
}
