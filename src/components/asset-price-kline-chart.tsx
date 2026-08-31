"use client"

import * as React from "react"
import {
  dispose,
  init,
  registerIndicator,
  registerYAxis,
  TooltipShowRule,
  YAxisType,
} from "klinecharts"
import type { Chart, DeepPartial, KLineData, Styles } from "klinecharts"

import type { BinanceTransaction } from "@/lib/api"
import { coinColor, coinLabel, renamedCoinNote } from "@/lib/coins"
import { parseFlexibleDate } from "@/lib/date"
import { fetchPriceCandles } from "@/lib/price-candles"
import type { CandleHistory } from "@/lib/price-candles"
import { cn } from "@/lib/utils"

interface AssetPriceKlineChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
}

const DAY_MS = 86_400_000
const CANDLE_PANE = "candle_pane"
const INDICATOR_NAME = "MM_PRICE_LINES"
const FLOW_PANE = "pane_flow"
const FLOW_NAME = "MM_FLOW"
const LOG_YAXIS = "mm-log"

const UP_COLOR = "#16a34a"
const DOWN_COLOR = "#dc2626"

type Timeframe = "day" | "week" | "month"
const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
]

const TF_KEY = "mm.history.klineTimeframe"
const LOG_KEY = "mm.history.klineLog"

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

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

/**
 * Net transaction flow per bar, in USD: buys draw up from zero (green), sells
 * down (red). The signed USD value is stashed on each point as `flow`.
 */
registerIndicator({
  name: FLOW_NAME,
  shortName: "Net flow",
  precision: 0,
  figures: [
    {
      key: "flow",
      title: "Net: ",
      type: "bar",
      baseValue: 0,
      styles: (figureData) => ({
        color:
          ((figureData.current?.indicatorData as { flow?: number })?.flow ?? 0) >= 0
            ? UP_COLOR
            : DOWN_COLOR,
      }),
    },
  ],
  calc: (dataList) =>
    dataList.map((d) => ({ flow: (d as { flow?: number }).flow ?? 0 })),
})

const fmtAxisTick = (v: number): string => {
  if (v >= 1000)
    return v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 2 })
  return v.toLocaleString("en-US", { maximumSignificantDigits: 2 })
}

/** 1 / 2 / 5 · 10ⁿ values inside [lo, hi], thinning the mantissa as the span grows. */
function niceLogTicks(lo: number, hi: number): number[] {
  if (!(lo > 0) || !(hi > lo)) return []
  const p0 = Math.floor(Math.log10(lo))
  const p1 = Math.ceil(Math.log10(hi))
  const decades = p1 - p0
  const mantissas = decades <= 2 ? [1, 2, 3, 5, 7] : decades <= 5 ? [1, 2, 5] : [1]
  const out: number[] = []
  for (let p = p0; p <= p1; p++) {
    for (const m of mantissas) {
      const v = m * Math.pow(10, p)
      if (v >= lo && v <= hi) out.push(v)
    }
  }
  return out
}

/**
 * klinecharts v9's built-in log axis positions lines correctly but generates
 * linearly-spaced tick *values* (0, 20k, 40k…) that pile up at the top. This
 * replacement emits proper decade ticks and maps them through the same
 * log-space→pixel transform the chart uses for everything else.
 */
registerYAxis({
  name: LOG_YAXIS,
  createTicks: ({ range, bounding, defaultTicks }) => {
    const from = range.from
    const span = range.range
    const height = bounding.height
    if (!(span > 0) || !(height > 0) || !(range.realFrom > 0)) return defaultTicks
    const values = niceLogTicks(range.realFrom, range.realTo)
    if (values.length < 2) return defaultTicks
    return values.map((v) => {
      const rate = (Math.log10(v) - from) / span
      return { value: v, text: fmtAxisTick(v), coord: Math.round((1 - rate) * height) }
    })
  },
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
  /** at least one priced coin has a transaction that values > $0 */
  hasFlow: boolean
  stale: boolean
}

/** Merge every coin's daily closes onto one shared, carried-forward timeline. */
function buildMerged(
  histories: Map<string, CandleHistory>,
  coins: string[],
  txns: BinanceTransaction[],
): Merged {
  const priced = coins.filter((c) => (histories.get(c)?.candles.length ?? 0) > 0)
  const unpriced = coins.filter((c) => !priced.includes(c))

  // Transactions for priced coins, snapped to a UTC day.
  const parsedTxns = txns
    .map((t) => {
      const d = parseFlexibleDate(t.Time)
      const coin = String(t.Coin ?? "").trim()
      const change = Number(t.Change)
      return d && priced.includes(coin) && Number.isFinite(change) && change !== 0
        ? { day: Math.floor(d.getTime() / DAY_MS) * DAY_MS, coin, change }
        : null
    })
    .filter((x): x is { day: number; coin: string; change: number } => x != null)

  const days = new Set<number>()
  for (const c of priced) {
    for (const candle of histories.get(c)!.candles) days.add(candle.timestamp)
  }
  for (const t of parsedTxns) days.add(t.day)
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
  // series so it always frames all lines.
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

  // Net USD flow per day: sum of (Δcoin × that coin's price on the day). A txn
  // before the coin's price history is valued at its earliest known close.
  const flowByDay = new Map<number, number>()
  let hasFlow = false
  for (const t of parsedTxns) {
    const m = byCoinDay.get(t.coin)
    if (!m) continue
    const price = m.get(t.day) ?? m.values().next().value
    if (typeof price !== "number" || !(price > 0)) continue
    flowByDay.set(t.day, (flowByDay.get(t.day) ?? 0) + t.change * price)
    hasFlow = true
  }

  const klineData: KLineData[] = sorted.map((day) => {
    const prices: Record<string, number> = {}
    for (const coin of priced) {
      const v = byCoinDay.get(coin)?.get(day)
      if (v != null && Number.isFinite(v)) prices[coin] = v
    }
    return {
      timestamp: day,
      open: lo,
      high: hi,
      low: lo,
      close: hi,
      prices,
      flow: flowByDay.get(day) ?? 0,
    }
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
    hasFlow,
    stale,
  }
}

/** Start-of-period (UTC) for the week/month a timestamp falls in. */
function periodStart(ms: number, tf: Timeframe): number {
  if (tf === "day") return ms
  const d = new Date(ms)
  if (tf === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  const isoDow = (d.getUTCDay() + 6) % 7 // Mon = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - isoDow)
}

/**
 * Down-sample daily points to one per week/month: prices are the period's last
 * close (points arrive ascending), transaction flow is summed over the period.
 */
function bucketKline(kline: KLineData[], tf: Timeframe): KLineData[] {
  if (tf === "day") return kline
  const byPeriod = new Map<number, KLineData>()
  for (const pt of kline) {
    const t = periodStart(pt.timestamp, tf)
    const prevFlow = (byPeriod.get(t) as { flow?: number } | undefined)?.flow ?? 0
    byPeriod.set(t, {
      ...pt,
      timestamp: t,
      flow: prevFlow + ((pt as { flow?: number }).flow ?? 0),
    })
  }
  return [...byPeriod.values()].sort((a, b) => a.timestamp - b.timestamp)
}

function klineStyles(dark: boolean, family: string, log: boolean): DeepPartial<Styles> {
  const grid = dark ? "#26262b" : "#ededed"
  const text = dark ? "#8f8f96" : "#76808f"
  const axisLine = dark ? "#3a3a42" : "#dcdcdc"
  const crosshairBg = dark ? "#3a3a42" : "#686d76"
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
      tooltip: { showRule: TooltipShowRule.None, text: { family } },
    },
    indicator: {
      // Static colour key lives below the chart; the built-in legend only needs
      // to surface exact values on crosshair hover.
      tooltip: {
        showRule: TooltipShowRule.FollowCross,
        showName: false,
        showParams: false,
        text: { family },
      },
    },
    xAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: text, family },
    },
    yAxis: {
      type: log ? YAxisType.Log : YAxisType.Normal,
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: text, family },
    },
    crosshair: {
      horizontal: { text: { backgroundColor: crosshairBg, family } },
      vertical: { text: { backgroundColor: crosshairBg, family } },
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

  const [timeframe, setTimeframe] = React.useState<Timeframe>(
    () => (["day", "week", "month"] as const).find((t) => t === safeGet(TF_KEY)) ?? "day",
  )
  const [logScale, setLogScale] = React.useState(() => safeGet(LOG_KEY) === "1")
  const chooseTimeframe = React.useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    safeSet(TF_KEY, tf)
  }, [])
  const toggleLog = React.useCallback(() => {
    setLogScale((v) => {
      safeSet(LOG_KEY, v ? "0" : "1")
      return !v
    })
  }, [])

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

  // Transactions for the plotted coins — drives the net-flow bars.
  const txns = React.useMemo(
    () => data.filter((r) => plotCoins.includes(String(r.Coin ?? "").trim())),
    [data, plotCoins],
  )

  // Fetch every plotted coin's price history; keyed so a stale response for an
  // old filter can't land on the current one.
  const [histories, setHistories] = React.useState<{
    key: string
    map: Map<string, CandleHistory>
  } | null>(null)
  React.useEffect(() => {
    if (plotCoins.length === 0) return
    let alive = true
    mapLimit(plotCoins, 4, async (coin) => {
      const since = earliest[coin] ?? Date.now() - 365 * DAY_MS
      return [coin, await fetchPriceCandles(coin, since)] as const
    }).then((entries) => {
      if (alive) setHistories({ key: plotKey, map: new Map(entries) })
    })
    return () => {
      alive = false
    }
  }, [plotKey, plotCoins, earliest])

  const merged = React.useMemo(
    () =>
      histories?.key === plotKey
        ? buildMerged(histories.map, plotCoins, txns)
        : null,
    [histories, plotKey, plotCoins, txns],
  )
  const loading = plotCoins.length > 0 && !merged
  const hasLines = (merged?.priced.length ?? 0) > 0

  const viewData = React.useMemo(
    () => (merged ? bucketKline(merged.klineData, timeframe) : []),
    [merged, timeframe],
  )

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

  // Push data, theme, scale and the per-coin line set.
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const lines = merged?.priced ?? []
    const family = containerRef.current
      ? getComputedStyle(containerRef.current).fontFamily
      : "monospace"

    chart.setStyles(klineStyles(isDark, family, logScale))
    chart.setPaneOptions({
      id: CANDLE_PANE,
      axisOptions: { name: logScale ? LOG_YAXIS : "default" },
    })
    // Linear ticks stay at 2 decimals for dollar-plus assets: klinecharts'
    // built-in generator mis-scales a wide range at higher precision.
    chart.setPriceVolumePrecision(merged?.axisPrecision ?? 2, 2)
    chart.applyNewData(viewData)
    chart.removeIndicator(CANDLE_PANE, INDICATOR_NAME)
    chart.removeIndicator(FLOW_PANE, FLOW_NAME)
    if (lines.length > 0 && merged) {
      chart.createIndicator(
        { name: INDICATOR_NAME, calcParams: lines, precision: merged.precision },
        true,
        { id: CANDLE_PANE },
      )
      if (merged.hasFlow) {
        chart.createIndicator({ name: FLOW_NAME }, false, {
          id: FLOW_PANE,
          height: 104,
        })
      }
      // Open on the whole history rather than the most recent bars. Runs after
      // layout so clientWidth is real.
      const n = viewData.length
      requestAnimationFrame(() => {
        const c = chartRef.current
        if (!c || n < 2) return
        const width = containerRef.current?.clientWidth ?? 720
        c.setBarSpace(Math.min(16, Math.max(1, width / n)))
        c.scrollToRealTime()
      })
    }
  }, [merged, viewData, isDark, logScale])

  return (
    <div className="space-y-2">
      {plotCoins.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => chooseTimeframe(tf.id)}
                className={cn(
                  "px-2 py-0.5 text-[11px] transition-colors",
                  tf.id === timeframe
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleLog}
            aria-pressed={logScale}
            className={cn(
              "border px-2 py-0.5 text-[11px] transition-colors",
              logScale
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Log scale
          </button>
        </div>
      )}

      <div className="relative">
        <div
          ref={containerRef}
          className={cn("w-full", merged?.hasFlow ? "h-[440px]" : "h-[360px]")}
        />
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
            {merged.hasFlow && (
              <>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: UP_COLOR }}
                  />
                  bought
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: DOWN_COLOR }}
                  />
                  sold
                </span>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {timeframe === "day" ? "Daily" : timeframe === "week" ? "Weekly" : "Monthly"}{" "}
            USD price ·{" "}
            {[...merged.sources]
              .map((s) => (s === "coinbase" ? "Coinbase Exchange" : "CoinGecko"))
              .join(" + ")}
            {merged.coveredFrom ? ` · since ${fmtDay(merged.coveredFrom)}` : ""}
            {merged.stale ? " · offline, last known" : ""}.{" "}
            {logScale
              ? "Log axis."
              : "Lines share one linear USD axis — turn on Log scale or filter the Coin column to compare assets of different price."}
            {merged.hasFlow &&
              " Lower pane: net USD bought (green) / sold (red) per period."}
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
