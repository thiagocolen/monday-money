"use client"

import * as React from "react"
import { dispose, init, registerIndicator, TooltipShowRule } from "klinecharts"
import type { Chart, DeepPartial, KLineData, Styles } from "klinecharts"

import type { BinanceTransaction } from "@/lib/api"
import { coinColor, coinLabel, renamedCoinNote } from "@/lib/coins"
import { parseFlexibleDate } from "@/lib/date"
import { fetchPriceCandles } from "@/lib/price-candles"
import type { CandleHistory } from "@/lib/price-candles"

interface AssetPriceKlineChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
}

const DAY_MS = 86_400_000
const CANDLE_PANE = "candle_pane"
const INDICATOR_NAME = "MM_PRICE_LINES"

/** USD-pegged coins — a flat $1 line adds nothing, so they're left off the chart. */
const STABLES = new Set([
  "USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD", "USDP", "GUSD", "USD",
])

/** Resolve `fn` over `items` at most `limit` at a time (be polite to Coinbase). */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * One line per selected coin, plotted on the candle pane's shared USD axis.
 * The candle series itself is fed (invisible) OHLC that spans every coin's price
 * that day, so the axis always frames all lines; `calc` just forwards the
 * per-coin USD close stashed on each point.
 */
registerIndicator({
  name: INDICATOR_NAME,
  shortName: "USD",
  precision: 2,
  calcParams: [],
  figures: [],
  regenerateFigures: (coins) =>
    (coins as string[]).map((coin) => ({
      key: coin,
      title: `${coinLabel(coin)}: `,
      type: "line",
      styles: () => ({ color: coinColor(coin) }),
    })),
  calc: (dataList) =>
    dataList.map((d) => ({
      ...((d as { prices?: Record<string, number> }).prices ?? {}),
    })),
})

/** Distinct coins in the filtered rows and the earliest instant each appears. */
function coinsFromRows(data: BinanceTransaction[]): {
  coins: string[]
  earliest: Record<string, number>
} {
  const earliest: Record<string, number> = {}
  for (const row of data) {
    const coin = String(row.Coin ?? "").trim()
    if (!coin) continue
    const d = parseFlexibleDate(row.Time)
    if (!d) continue
    earliest[coin] = Math.min(earliest[coin] ?? Infinity, d.getTime())
  }
  return { coins: Object.keys(earliest).sort(), earliest }
}

interface Merged {
  klineData: KLineData[]
  /** coins that returned price history, in display order */
  priced: string[]
  /** selected coins with no USD price anywhere */
  unpriced: string[]
  sources: Set<"coinbase" | "coingecko">
  /** earliest day any line covers, epoch ms */
  coveredFrom: number
  /** crosshair tooltip decimals, driven by the smallest-priced coin */
  precision: number
  /** y-axis tick decimals, driven by the largest-priced coin */
  axisPrecision: number
  stale: boolean
}

/** Merge every coin's daily closes onto one shared, carried-forward timeline. */
function buildMerged(
  histories: Map<string, CandleHistory>,
  coins: string[],
): Merged {
  const priced = coins.filter((c) => (histories.get(c)?.candles.length ?? 0) > 0)
  const unpriced = coins.filter((c) => !priced.includes(c))

  const days = new Set<number>()
  for (const c of priced) {
    for (const candle of histories.get(c)!.candles) days.add(candle.timestamp)
  }
  const sorted = [...days].sort((a, b) => a - b)

  // Per coin: carry the last known close forward, but stay blank before listing.
  // Closes more than 50× off the coin's own median are dropped — the CoinGecko
  // fallback occasionally prints absurd spikes for thin/delisted tokens.
  const byCoinDay = new Map<string, Map<number, number>>()
  for (const coin of priced) {
    const candles = histories.get(coin)!.candles
    const closes = candles.map((c) => c.close).filter((v) => v > 0).sort((a, b) => a - b)
    const median = closes.length ? closes[closes.length >> 1] : 0
    const ok = (v: number) =>
      v > 0 && (median === 0 || (v >= median / 50 && v <= median * 50))
    const m = new Map<number, number>()
    let i = 0
    let last: number | null = null
    for (const day of sorted) {
      while (i < candles.length && candles[i].timestamp <= day) {
        if (ok(candles[i].close)) last = candles[i].close
        i++
      }
      if (day >= candles[0].timestamp && last != null) m.set(day, last)
    }
    byCoinDay.set(coin, m)
  }

  // Overall price span across every line — used to anchor the (invisible) candle
  // series at a single mid value so it never widens or distorts the axis.
  let gMin = Infinity
  let gMax = -Infinity
  for (const m of byCoinDay.values()) {
    for (const v of m.values()) {
      if (v > 0) {
        gMin = Math.min(gMin, v)
        gMax = Math.max(gMax, v)
      }
    }
  }
  const lo = Number.isFinite(gMin) ? gMin : 0
  const hi = Number.isFinite(gMax) ? gMax : 0

  // The candle series is invisible; its only job is to hand the axis a stable
  // [min, max] that frames every line each day.
  const klineData: KLineData[] = sorted.map((day) => {
    const prices: Record<string, number> = {}
    for (const coin of priced) {
      const v = byCoinDay.get(coin)?.get(day)
      if (v != null && Number.isFinite(v)) prices[coin] = v
    }
    return { timestamp: day, open: lo, high: hi, low: lo, close: hi, prices }
  })

  const lastPrices = priced
    .map((c) => {
      const values = [...(byCoinDay.get(c)?.values() ?? [])]
      return values.length ? values[values.length - 1] : 0
    })
    .filter((v) => v > 0)
  const minLast = lastPrices.length ? Math.min(...lastPrices) : 1
  const precision =
    minLast >= 1 ? 2 : minLast >= 0.01 ? 4 : minLast >= 0.0001 ? 6 : 8
  const axisPrecision = hi >= 100 ? 2 : hi >= 0.1 ? 4 : hi >= 0.001 ? 6 : 8

  const sources = new Set<"coinbase" | "coingecko">()
  let stale = false
  let coveredFrom = Infinity
  for (const c of priced) {
    const h = histories.get(c)!
    if (h.source) sources.add(h.source)
    if (h.stale) stale = true
    if (h.coveredFrom) coveredFrom = Math.min(coveredFrom, h.coveredFrom)
  }

  return {
    klineData,
    priced,
    unpriced,
    sources,
    coveredFrom: Number.isFinite(coveredFrom) ? coveredFrom : 0,
    precision,
    axisPrecision,
    stale,
  }
}

function klineStyles(dark: boolean): DeepPartial<Styles> {
  const grid = dark ? "#26262b" : "#ededed"
  const text = dark ? "#8f8f96" : "#76808f"
  const axisLine = dark ? "#3a3a42" : "#dcdcdc"
  const transparent = "rgba(0, 0, 0, 0)"
  return {
    grid: {
      horizontal: { color: grid },
      vertical: { color: grid },
    },
    // The candle series only exists to anchor the USD axis — render it invisible.
    candle: {
      bar: {
        upColor: transparent,
        downColor: transparent,
        noChangeColor: transparent,
        upBorderColor: transparent,
        downBorderColor: transparent,
        noChangeBorderColor: transparent,
        upWickColor: transparent,
        downWickColor: transparent,
        noChangeWickColor: transparent,
      },
      priceMark: { show: false },
      tooltip: { showRule: TooltipShowRule.None },
    },
    indicator: {
      // Static colour key lives below the chart; the built-in legend only needs
      // to surface exact values on crosshair hover.
      tooltip: { showRule: TooltipShowRule.FollowCross, showName: false, showParams: false },
    },
    xAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: text },
    },
    yAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: text },
    },
    crosshair: {
      horizontal: { text: { backgroundColor: dark ? "#3a3a42" : "#686d76" } },
      vertical: { text: { backgroundColor: dark ? "#3a3a42" : "#686d76" } },
    },
    separator: { color: grid },
  }
}

/** Tracks the `dark` class Tailwind toggles on <html>. */
function useIsDark(): boolean {
  const [dark, setDark] = React.useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  )
  React.useEffect(() => {
    const root = document.documentElement
    const obs = new MutationObserver(() => setDark(root.classList.contains("dark")))
    obs.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return dark
}

const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

export function AssetPriceKlineChart({ data }: AssetPriceKlineChartProps) {
  const { coins, earliest } = React.useMemo(() => coinsFromRows(data), [data])
  const isDark = useIsDark()

  // Stablecoins are dropped from the plot; everything else is a line.
  const plotCoins = React.useMemo(
    () => coins.filter((c) => !STABLES.has(c.toUpperCase())),
    [coins],
  )
  const stableCoins = React.useMemo(
    () => coins.filter((c) => STABLES.has(c.toUpperCase())),
    [coins],
  )
  const plotKey = plotCoins.join(",")

  // Fetch every plotted coin's history and merge; keyed so a stale response
  // for an old filter can't land on the current one.
  const [result, setResult] = React.useState<{ key: string; merged: Merged } | null>(null)
  React.useEffect(() => {
    if (plotCoins.length === 0) return
    let alive = true
    mapLimit(plotCoins, 4, async (coin) => {
      const since = earliest[coin] ?? Date.now() - 365 * DAY_MS
      return [coin, await fetchPriceCandles(coin, since)] as const
    }).then((entries) => {
      if (!alive) return
      setResult({ key: plotKey, merged: buildMerged(new Map(entries), plotCoins) })
    })
    return () => {
      alive = false
    }
  }, [plotKey, plotCoins, earliest])

  const merged = result?.key === plotKey ? result.merged : null
  const loading = plotCoins.length > 0 && !merged
  const hasLines = (merged?.priced.length ?? 0) > 0

  // Chart instance lifecycle.
  const containerRef = React.useRef<HTMLDivElement>(null)
  const chartRef = React.useRef<Chart | null>(null)
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    chartRef.current = init(el)
    const ro = new ResizeObserver(() => chartRef.current?.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      dispose(el)
      chartRef.current = null
    }
  }, [])

  // Push data, theme and the per-coin line set.
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const lines = merged?.priced ?? []
    chart.setStyles(klineStyles(isDark))
    // Axis ticks stay at 2 decimals for dollar-plus assets: klinecharts' tick
    // generator mis-scales a wide range at higher precision.
    chart.setPriceVolumePrecision(merged?.axisPrecision ?? 2, 2)
    chart.applyNewData(merged?.klineData ?? [])
    chart.removeIndicator(CANDLE_PANE, INDICATOR_NAME)
    if (lines.length > 0 && merged) {
      chart.createIndicator(
        { name: INDICATOR_NAME, calcParams: lines, precision: merged.precision },
        true,
        { id: CANDLE_PANE },
      )
      // Open on the whole history rather than the most recent bars. Runs after
      // layout so clientWidth is real.
      const n = merged.klineData.length
      requestAnimationFrame(() => {
        const c = chartRef.current
        if (!c || n < 2) return
        const width = containerRef.current?.clientWidth ?? 720
        c.setBarSpace(Math.min(12, Math.max(1, width / n)))
        c.scrollToRealTime()
      })
    }
  }, [merged, isDark])

  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={containerRef} className="h-[360px] w-full" />
        {plotCoins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background px-4 text-center text-xs text-muted-foreground">
            {stableCoins.length > 0
              ? "Only stablecoins in range — filter the Coin column to a non-pegged asset."
              : "Filter the Coin column to chart assets' USD price."}
          </div>
        )}
        {plotCoins.length > 0 && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-xs text-muted-foreground">
            Loading price history…
          </div>
        )}
        {plotCoins.length > 0 && !loading && !hasLines && (
          <div className="absolute inset-0 flex items-center justify-center bg-background px-4 text-center text-xs text-muted-foreground">
            No USD price history for {plotCoins.map(coinLabel).join(", ")}.
          </div>
        )}
      </div>

      {hasLines && merged && (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {merged.priced.map((coin) => (
              <span
                key={coin}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: coinColor(coin) }}
                />
                {coinLabel(coin)}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Daily USD price ·{" "}
            {[...merged.sources]
              .map((s) => (s === "coinbase" ? "Coinbase Exchange" : "CoinGecko"))
              .join(" + ")}
            {merged.coveredFrom ? ` · since ${fmtDay(merged.coveredFrom)}` : ""}
            {merged.stale ? " · offline, last known" : ""}. Every line shares one
            linear USD axis — filter the Coin column to compare assets of similar
            price.
            {merged.unpriced.length > 0 &&
              ` No quote for: ${merged.unpriced.map(coinLabel).join(", ")}.`}
            {stableCoins.length > 0 &&
              ` Stablecoins omitted: ${stableCoins.map(coinLabel).join(", ")}.`}
          </p>
        </>
      )}
      {renamedCoinNote(coins) && (
        <p className="text-[10px] text-muted-foreground">{renamedCoinNote(coins)}</p>
      )}
    </div>
  )
}
