"use client"

import * as React from "react"
import {
  dispose,
  DomPosition,
  init,
  LineType,
  registerIndicator,
  registerOverlay,
  registerYAxis,
  TooltipShowRule,
  YAxisType,
} from "klinecharts"
import type {
  AxisTick,
  Chart,
  DeepPartial,
  IndicatorFigureStyle,
  KLineData,
  Styles,
  TooltipLegend,
} from "klinecharts"

import { CalendarBlank, X } from "@phosphor-icons/react"
import { Palette } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { BinanceTransaction } from "@/lib/api"
import type { DateSnapshot } from "@/lib/allocation"
import { coinColor, coinLabel, renamedCoinNote, shuffleCoinColors } from "@/lib/coins"
import { useCoinColor, useCoinPalette } from "@/lib/use-coin-colors"
import { parseFlexibleDate } from "@/lib/date"
import { fetchPriceCandles } from "@/lib/price-candles"
import type { CandleHistory } from "@/lib/price-candles"
import { cn } from "@/lib/utils"

interface AssetPriceKlineChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
  /** bar the user picked (drives the allocation pie); null = none */
  selectedTimestamp?: number | null
  /** fired when a bar is clicked (or the same one again → null) */
  onDateSelect?: (snapshot: DateSnapshot | null) => void
}

const DAY_MS = 86_400_000
const CANDLE_PANE = "candle_pane"
const INDICATOR_NAME = "MM_PRICE_LINES"
const EMA_NAME = "MM_PRICE_EMA"
const HOLDINGS_PANE = "pane_holdings"
const HOLDINGS_NAME = "MM_HOLDINGS"
const LOG_YAXIS = "mm-log"
const USD_YAXIS = "mm-usd"
const PICKED_MARK = "mm-picked-day"
const AVG_MARK = "mm-avg-price"

/** Panes that carry a y-axis the user can grab (the x-axis pane has none). */
const Y_AXIS_PANES = [CANDLE_PANE, HOLDINGS_PANE]

/** Right-hand gap klinecharts leaves past the last bar by default, in px. */
const DEFAULT_RIGHT_GAP = 80
/**
 * The gap auto-scale keeps instead — wide enough for the half of the picked-day
 * tag that hangs right of a marker on the last bar (the longest of those reads
 * "September 2026"). Everything else goes to the bars.
 */
const FIT_RIGHT_GAP = 52

/**
 * Padding a pane leaves above and below its data, as a fraction of the plotted
 * range. klinecharts' own defaults (20% over, 10% under) spend nearly a third
 * of the pane on empty space — a fitted pane keeps only enough that the line
 * doesn't graze the edge.
 */
const ROOMY_GAP = { top: 0.2, bottom: 0.1 }
const FIT_GAP = 0.04

/** EMA period presets offered when a single asset is charted. */
const EMA_PERIODS = [9, 21, 50, 100, 200] as const
const EMA_PERIOD_KEY = "mm.history.klineEmaPeriod"
const EMA_ON_KEY = "mm.history.klineEmaOn"

const fmtUsdShort = (v: number): string =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: v >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: v >= 10_000 ? 1 : 0,
  })

/** Full USD, decimals scaled to the magnitude — reads as a price, not a total. */
const fmtUsdPrice = (v: number): string =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: v >= 1 ? 2 : 8,
  })

type Timeframe = "day" | "week" | "month"
const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
]

const TF_KEY = "mm.history.klineTimeframe"
const LOG_KEY = "mm.history.klineLog"
const AUTO_KEY = "mm.history.klineAutoScale"

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
 * Exponential moving average of the single charted coin's USD close, drawn as a
 * dashed line on the candle pane's shared axis. Only mounted when exactly one
 * asset is plotted, so each bar carries at most one price in `prices`.
 * `calcParams` is `[period, lineColor]` — the colour is themed by the caller and
 * threaded through so `regenerateFigures` can paint the line.
 */
registerIndicator<{ ema?: number }>({
  name: EMA_NAME,
  shortName: "EMA",
  precision: 2,
  calcParams: [EMA_PERIODS[1], "#888888"],
  figures: [{ key: "ema", title: "EMA: ", type: "line" }],
  regenerateFigures: (params) => {
    const period = Math.round(Number((params as unknown[])[0]) || EMA_PERIODS[1])
    const color = String((params as unknown[])[1] ?? "#888888")
    return [
      {
        key: "ema",
        title: `EMA ${period}: `,
        type: "line",
        // klinecharts mistypes IndicatorFigureStyle["style"] — cast past it.
        styles: () =>
          ({
            color,
            style: LineType.Dashed,
            dashedValue: [4, 3],
          }) as unknown as IndicatorFigureStyle,
      },
    ]
  },
  calc: (dataList, indicator) => {
    const period = Math.max(
      1,
      Math.round(Number((indicator.calcParams as unknown[])?.[0]) || EMA_PERIODS[1]),
    )
    const k = 2 / (period + 1)
    let ema: number | undefined
    return dataList.map((d) => {
      const prices = (d as { prices?: Record<string, number> }).prices ?? {}
      const price = Object.values(prices)[0]
      if (typeof price !== "number" || !(price > 0)) return { ema }
      ema = ema == null ? price : price * k + ema * (1 - k)
      return { ema }
    })
  },
})

/**
 * Portfolio value per bar, in USD: one stacked segment per asset (its coin
 * balance on that day × the day's price). `calcParams` carries the bottom→top
 * asset order; each point's per-asset USD values are stashed as `holdings`.
 * A hidden `total` figure sizes the axis; a custom `draw` paints the stack.
 */
interface HoldingsResult {
  total: number
  [coin: string]: number
}

registerIndicator<HoldingsResult>({
  name: HOLDINGS_NAME,
  shortName: "Holdings",
  precision: 0,
  // Anchor the axis at $0 so the stack is read against nothing-held, not against
  // the smallest bar on screen. Paired with the pane's zero bottom gap below,
  // $0 lands exactly on the floor of the pane and the bars sit on it.
  minValue: 0,
  calcParams: [],
  figures: [{ key: "total", title: "Total: ", type: "bar" }],
  regenerateFigures: () => [{ key: "total", title: "Total: ", type: "bar" }],
  calc: (dataList, indicator) => {
    const order = (indicator.calcParams as string[]) ?? []
    return dataList.map((d) => {
      const h = (d as { holdings?: Record<string, number> }).holdings ?? {}
      const out: HoldingsResult = { total: 0 }
      for (const coin of order) {
        const v = h[coin] ?? 0
        out[coin] = v
        out.total += v
      }
      return out
    })
  },
  draw: ({ ctx, indicator, visibleRange, barSpace, xAxis, yAxis }) => {
    const order = (indicator.calcParams as string[]) ?? []
    const results = (indicator.result as HoldingsResult[]) ?? []
    const w = Math.max(1, barSpace.bar * 0.8)
    const from = Math.max(0, visibleRange.from)
    const to = Math.min(visibleRange.to, results.length - 1)
    for (let i = from; i <= to; i++) {
      const row = results[i]
      if (!row) continue
      const x = xAxis.convertToPixel(i)
      let cum = 0
      for (const coin of order) {
        const v = row[coin] ?? 0
        if (v <= 0) continue
        const yBottom = yAxis.convertToPixel(cum)
        cum += v
        const yTop = yAxis.convertToPixel(cum)
        ctx.fillStyle = coinColor(coin)
        ctx.fillRect(Math.round(x - w / 2), yTop, Math.max(1, w), Math.max(0, yBottom - yTop))
      }
    }
    return true
  },
  createTooltipDataSource: ({ crosshair, indicator, defaultStyles }) => {
    const order = (indicator.calcParams as string[]) ?? []
    const results = (indicator.result as HoldingsResult[]) ?? []
    const idx = crosshair.dataIndex ?? results.length - 1
    const row = results[idx]
    const color = defaultStyles.tooltip.text.color
    const values: TooltipLegend[] = []
    if (row) {
      values.push({
        title: { text: "Total", color },
        value: { text: fmtUsdShort(row.total), color },
      })
      for (const coin of order) {
        const v = row[coin] ?? 0
        if (v >= 1) {
          values.push({
            title: { text: coinLabel(coin), color: coinColor(coin) },
            value: { text: fmtUsdShort(v), color },
          })
        }
      }
    }
    return { name: "", calcParamsText: "", icons: [], values }
  },
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

/** Every axis on this chart reads dollars — say so on each tick. */
const stampUsd = (ticks: AxisTick[]): AxisTick[] =>
  ticks.map((tick) => ({ ...tick, text: `$${tick.text}` }))

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
    if (!(span > 0) || !(height > 0) || !(range.realFrom > 0)) return stampUsd(defaultTicks)
    const values = niceLogTicks(range.realFrom, range.realTo)
    if (values.length < 2) return stampUsd(defaultTicks)
    return values.map((v) => {
      const rate = (Math.log10(v) - from) / span
      return { value: v, text: `$${fmtAxisTick(v)}`, coord: Math.round((1 - rate) * height) }
    })
  },
})

/**
 * The linear axis, klinecharts' own ticks with a dollar sign on each. Worn by
 * both panes — the price lines and the holdings stack are both money — and the
 * axis gutter widens to suit, since klinecharts measures the ticks it is handed.
 */
registerYAxis({
  name: USD_YAXIS,
  createTicks: ({ defaultTicks }) => stampUsd(defaultTicks),
})

/**
 * Give the price lines and the holdings bars half the plot area each.
 *
 * klinecharts sizes panes from the bottom up — the candle pane keeps whatever
 * the indicator panes and the x-axis leave — so setting the holdings pane to
 * half of the two panes' *combined* height splits them evenly without having to
 * know what the x-axis and separator take.
 */
function splitPanesEvenly(chart: Chart) {
  const top = chart.getSize(CANDLE_PANE)?.height ?? 0
  const bottom = chart.getSize(HOLDINGS_PANE)?.height ?? 0
  if (top <= 0 || bottom <= 0) return
  const half = Math.round((top + bottom) / 2)
  if (Math.abs(bottom - half) <= 1) return
  chart.setPaneOptions({ id: HOLDINGS_PANE, height: half })
}

/**
 * Hand every pane's y-axis back to klinecharts' own fit-to-visible-data.
 *
 * Dragging a y-axis latches it to a fixed range, and v9 offers no public way
 * out: a double-click on the axis clears it, and `setStyles({ yAxis: { type } })`
 * clears the candle pane's alone. Auto-scale has to release the holdings pane
 * too, so reach the panes directly — guarded, so a klinecharts upgrade that
 * renames them costs the vertical refit and nothing else.
 */
function releaseYAxes(chart: Chart, paneId?: string) {
  const inner = chart as unknown as {
    _drawPanes?: Array<{
      getId?: () => string
      getAxisComponent?: () => { setAutoCalcTickFlag?: (on: boolean) => void }
    }>
    adjustPaneViewport?: (
      height: boolean,
      width: boolean,
      update: boolean,
      yAxis: boolean,
    ) => void
  }
  if (!Array.isArray(inner._drawPanes)) return
  let touched = false
  for (const pane of inner._drawPanes) {
    if (paneId != null && pane.getId?.() !== paneId) continue
    pane.getAxisComponent?.().setAutoCalcTickFlag?.(true)
    touched = true
  }
  // Re-measures and re-ticks the axes only — the time scale is never consulted,
  // so the horizontal pan and zoom survive untouched.
  if (touched) inner.adjustPaneViewport?.(false, true, true, true)
}

/**
 * Vertical padding for a pane. The holdings stack is anchored on its $0 floor,
 * so only its headroom ever moves.
 */
function paneGap(paneId: string, fit: boolean): { top: number; bottom: number } {
  const top = fit ? FIT_GAP : ROOMY_GAP.top
  if (paneId === HOLDINGS_PANE) return { top, bottom: 0 }
  return { top, bottom: fit ? FIT_GAP : ROOMY_GAP.bottom }
}

/**
 * Re-pad the panes without touching their ranges — a pane whose axis the user
 * has dragged stays exactly where they left it, and simply keeps the new
 * padding for whenever it next fits itself.
 */
function setPaneGaps(chart: Chart, fit: boolean) {
  for (const id of Y_AXIS_PANES) {
    if (chart.getSize(id) == null) continue
    chart.setPaneOptions({ id, gap: paneGap(id, fit) })
  }
}

/**
 * Fit a pane's plot to its height: hand the axis back to klinecharts' own
 * range-from-visible-data *and* tighten the padding, so the data actually fills
 * the pane. Purely vertical — no pane here consults the time scale, so the
 * horizontal pan and zoom come through untouched. `paneId` omitted fits both.
 */
function fitVertically(chart: Chart, paneId?: string) {
  for (const id of Y_AXIS_PANES) {
    if (paneId != null && id !== paneId) continue
    if (chart.getSize(id) == null) continue
    releaseYAxes(chart, id)
    chart.setPaneOptions({ id, gap: paneGap(id, true) })
  }
}

/**
 * The pane whose y-axis strip `target` sits in, or null for anywhere else on
 * the chart. Used to keep axis clicks out of the date picker and to route a
 * double-click to the right axis.
 */
function yAxisPaneAt(chart: Chart, target: EventTarget | null): string | null {
  if (!(target instanceof Node)) return null
  for (const id of Y_AXIS_PANES) {
    if (chart.getDom(id, DomPosition.YAxis)?.contains(target)) return id
  }
  return null
}

/**
 * Fit the whole series to the plot area: every bar across the pane's width, no
 * gap past the last one, both y-axes back on auto. klinecharts won't draw a bar
 * narrower than 1px, so a long daily series still opens scrolled to today —
 * that's as much as fits.
 */
function fitToArea(chart: Chart, fallbackWidth: number) {
  const n = chart.getDataList().length
  if (n < 2) return
  const width = chart.getSize(CANDLE_PANE, DomPosition.Main)?.width ?? fallbackWidth
  chart.setOffsetRightDistance(FIT_RIGHT_GAP)
  chart.setBarSpace(Math.max(1, (width - FIT_RIGHT_GAP) / n))
  chart.scrollToRealTime()
  fitVertically(chart)
}

/**
 * The marker on the picked bar: a vertical line down the candle pane with the
 * bar's date on a tag at its foot. The label rides in `extendData` so the
 * marker can be recreated with new text without a bespoke overlay per date.
 * Not user-drawable — the chart creates it locked, from a click or the date
 * picker in the toolbar.
 */
registerOverlay({
  name: PICKED_MARK,
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const x = coordinates[0]?.x
    if (typeof x !== "number") return []
    const label = String(overlay.extendData ?? "")
    return [
      {
        type: "line",
        attrs: {
          coordinates: [
            { x, y: 0 },
            { x, y: bounding.height },
          ],
        },
      },
      {
        type: "text",
        ignoreEvent: true,
        attrs: {
          x,
          y: bounding.height - 4,
          text: label,
          align: "center",
          baseline: "bottom",
        },
      },
    ]
  },
})

/**
 * The average-price marker: a dotted line straight across the candle pane at
 * one price, with its value on a tag. A price is a level, not a moment, so it
 * reads horizontally — the vertical marker on this chart is the picked *day*.
 * Colour and label ride in `extendData` so the same overlay re-themes without a
 * bespoke registration per palette.
 */
registerOverlay({
  name: AVG_MARK,
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const y = coordinates[0]?.y
    if (typeof y !== "number" || !Number.isFinite(y)) return []
    const { label = "", color = "#888888" } = (overlay.extendData ?? {}) as {
      label?: string
      color?: string
    }
    return [
      {
        type: "line",
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y },
          ],
        },
        // Dotted and 1px against the EMA's 1px dash and the picked day's 2px
        // solid — three strokes in the same ink, each its own texture.
        styles: {
          style: LineType.Dashed,
          dashedValue: [1, 3],
          size: 1,
          color,
        },
      },
      {
        type: "text",
        ignoreEvent: true,
        attrs: { x: 4, y: y - 3, text: label, align: "left", baseline: "bottom" },
        styles: { color, backgroundColor: "rgba(0, 0, 0, 0)", size: 10 },
      },
    ]
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
  sources: Set<"coinbase" | "coingecko" | "frankfurter">
  /** earliest day any line covers, epoch ms */
  coveredFrom: number
  /** crosshair tooltip decimals, driven by the smallest-priced coin */
  precision: number
  /** y-axis tick decimals, driven by the largest-priced coin */
  axisPrecision: number
  /** at least one priced coin holds a positive, priceable balance */
  hasHoldings: boolean
  /** holdings-bar stack order, bottom → top (largest current value first) */
  stackOrder: string[]
  /**
   * Quantity-weighted average USD price across every transaction in the plotted
   * asset. Only set when exactly one asset is priced — an average over two
   * assets' prices is not a number that means anything.
   */
  avgTxnPrice: number | null
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

  // Running coin balance × that day's price = USD held, per coin per day. A
  // balance held before the coin's price history is valued at its earliest close.
  const txnsByDay = [...parsedTxns].sort((a, b) => a.day - b.day)
  const balance = new Map<string, number>()
  const holdingsByDay = new Map<number, Record<string, number>>()
  // The quantities behind those USD values, same keys — the allocation snapshot
  // shows them next to each asset's total.
  const balancesByDay = new Map<number, Record<string, number>>()
  let hasHoldings = false
  let ti = 0
  for (const day of sorted) {
    while (ti < txnsByDay.length && txnsByDay[ti].day <= day) {
      const t = txnsByDay[ti]
      balance.set(t.coin, (balance.get(t.coin) ?? 0) + t.change)
      ti++
    }
    const rec: Record<string, number> = {}
    const qty: Record<string, number> = {}
    for (const coin of priced) {
      const bal = balance.get(coin) ?? 0
      if (bal <= 0) continue
      const m = byCoinDay.get(coin)
      const price = m?.get(day) ?? m?.values().next().value
      if (typeof price === "number" && price > 0) {
        rec[coin] = bal * price
        qty[coin] = bal
        hasHoldings = true
      }
    }
    holdingsByDay.set(day, rec)
    balancesByDay.set(day, qty)
  }

  // Stack the biggest current holding at the bottom.
  const lastRec = holdingsByDay.get(sorted[sorted.length - 1]) ?? {}
  const stackOrder = [...priced].sort(
    (a, b) => (lastRec[b] ?? 0) - (lastRec[a] ?? 0),
  )

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
      holdings: holdingsByDay.get(day) ?? {},
      balances: balancesByDay.get(day) ?? {},
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

  // Quantity-weighted average price paid/received across the asset's whole
  // transaction history: each row's size (|Change|) against the asset's close on
  // the day it landed. Rows from before the asset had a quote are skipped —
  // there is no price to weigh them at.
  let avgTxnPrice: number | null = null
  if (priced.length === 1) {
    const coin = priced[0]
    const closes = byCoinDay.get(coin)!
    let qty = 0
    let usd = 0
    for (const t of parsedTxns) {
      if (t.coin !== coin) continue
      const price = closes.get(t.day)
      if (price == null || !(price > 0)) continue
      const size = Math.abs(t.change)
      qty += size
      usd += size * price
    }
    if (qty > 0) avgTxnPrice = usd / qty
  }

  const sources = new Set<"coinbase" | "coingecko" | "frankfurter">()
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
    hasHoldings,
    stackOrder,
    avgTxnPrice,
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

/** Exclusive end (UTC) of the day/week/month period a period-start falls in. */
function periodEnd(ms: number, tf: Timeframe): number {
  if (tf === "day") return ms + DAY_MS
  if (tf === "week") return ms + 7 * DAY_MS
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

/**
 * Down-sample daily points to one per week/month — the period's last row (points
 * arrive ascending), so prices and holdings are the period-end snapshot.
 */
function bucketKline(kline: KLineData[], tf: Timeframe): KLineData[] {
  if (tf === "day") return kline
  const byPeriod = new Map<number, KLineData>()
  for (const pt of kline) {
    const t = periodStart(pt.timestamp, tf)
    byPeriod.set(t, { ...pt, timestamp: t })
  }
  return [...byPeriod.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Ink for chart annotations drawn over the price — the EMA line and the
 * picked-day marker. Near-black on light, near-white on dark, so it reads as
 * the foreground against either background.
 */
const inkColor = (dark: boolean) => (dark ? "#e5e7eb" : "#1f2937")
/** Legible against `inkColor` — text sitting on an ink-filled tag. */
const onInkColor = (dark: boolean) => (dark ? "#1f2937" : "#ffffff")

function klineStyles(dark: boolean, family: string, log: boolean): DeepPartial<Styles> {
  const grid = dark ? "#26262b" : "#ededed"
  const ink = inkColor(dark)
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
        text: { family, size: 10, marginTop: 4, marginBottom: 4 },
      },
    },
    xAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: text, family, size: 10 },
    },
    yAxis: {
      type: log ? YAxisType.Log : YAxisType.Normal,
      axisLine: { color: axisLine },
      tickLine: { color: axisLine },
      tickText: { color: text, family, size: 10 },
    },
    crosshair: {
      horizontal: { text: { backgroundColor: crosshairBg, family, size: 10 } },
      vertical: { text: { backgroundColor: crosshairBg, family, size: 10 } },
    },
    // The picked-day marker is the only overlay on this chart. Styling it here
    // rather than per-figure keeps it on the chart's own font and re-themes it
    // through the same restyle effect as everything else — klinecharts' default
    // is a 1px blue line with a blue Helvetica tag.
    overlay: {
      line: { color: ink, size: 2 },
      text: {
        family,
        size: 10,
        color: onInkColor(dark),
        backgroundColor: ink,
        borderColor: ink,
        paddingTop: 3,
        paddingBottom: 3,
      },
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

/**
 * Label for a picked bar. Bar timestamps are UTC period starts, so read them in
 * UTC — a local-time read shifts the day for anyone west of Greenwich.
 */
const fmtBarLabel = (ms: number, tf: Timeframe): string =>
  new Date(ms).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    ...(tf === "month" ? { month: "long" } : { month: "short", day: "numeric" }),
  })

/** Bar timestamp (UTC period start) → the same calendar day as a local Date. */
const toLocalDay = (ms: number): Date => {
  const d = new Date(ms)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** A calendar's local Date → the UTC day the chart keys its bars by. */
const fromLocalDay = (d: Date): number =>
  Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())

export function AssetPriceKlineChart({
  data,
  selectedTimestamp,
  onDateSelect,
}: AssetPriceKlineChartProps) {
  const { coins } = React.useMemo(() => coinsFromRows(data), [data])
  const isDark = useIsDark()
  const palette = useCoinPalette()
  const colorOf = useCoinColor()

  const onDateSelectRef = React.useRef(onDateSelect)
  React.useEffect(() => {
    onDateSelectRef.current = onDateSelect
  })

  // Current timeframe, readable from the mount-only click handler.
  const timeframeRef = React.useRef<Timeframe>("day")

  const [timeframe, setTimeframe] = React.useState<Timeframe>(
    () => (["day", "week", "month"] as const).find((t) => t === safeGet(TF_KEY)) ?? "day",
  )
  const [logScale, setLogScale] = React.useState(() => safeGet(LOG_KEY) === "1")
  // Fit-to-area is the default view; any hand-scaling drops out of it (below).
  const [autoScale, setAutoScale] = React.useState(() => safeGet(AUTO_KEY) !== "0")
  const autoScaleRef = React.useRef(autoScale)
  React.useEffect(() => {
    autoScaleRef.current = autoScale
  })
  const [emaOn, setEmaOn] = React.useState(() => safeGet(EMA_ON_KEY) === "1")
  const [emaPeriod, setEmaPeriod] = React.useState<number>(() => {
    const v = Number(safeGet(EMA_PERIOD_KEY))
    return (EMA_PERIODS as readonly number[]).includes(v) ? v : EMA_PERIODS[1]
  })
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
  const toggleAutoScale = React.useCallback(() => {
    setAutoScale((v) => {
      safeSet(AUTO_KEY, v ? "0" : "1")
      autoScaleRef.current = !v
      return !v
    })
  }, [])
  const toggleEma = React.useCallback(() => {
    setEmaOn((v) => {
      safeSet(EMA_ON_KEY, v ? "0" : "1")
      return !v
    })
  }, [])
  const chooseEmaPeriod = React.useCallback((p: number) => {
    setEmaPeriod(p)
    safeSet(EMA_PERIOD_KEY, String(p))
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

  // Transactions for the plotted coins — drives the holdings bars.
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
    // Pull each asset's full listed history (capped at ~12y inside the fetch),
    // not just back to the first transaction — the price context before you
    // held the asset is worth showing.
    mapLimit(plotCoins, 4, async (coin) => {
      return [coin, await fetchPriceCandles(coin, 0)] as const
    }).then((entries) => {
      if (alive) setHistories({ key: plotKey, map: new Map(entries) })
    })
    return () => {
      alive = false
    }
  }, [plotKey, plotCoins])

  const merged = React.useMemo(
    () =>
      histories?.key === plotKey
        ? buildMerged(histories.map, plotCoins, txns)
        : null,
    [histories, plotKey, plotCoins, txns],
  )
  const loading = plotCoins.length > 0 && !merged
  const hasLines = (merged?.priced.length ?? 0) > 0
  /** the EMA overlay only makes sense against a single asset's price line */
  const singleAsset = plotCoins.length === 1
  const showEma = singleAsset && emaOn && (merged?.priced.length ?? 0) === 1
  const emaColor = inkColor(isDark)

  const viewData = React.useMemo(
    () => (merged ? bucketKline(merged.klineData, timeframe) : []),
    [merged, timeframe],
  )

  // Chart instance lifecycle.
  const containerRef = React.useRef<HTMLDivElement>(null)
  const chartRef = React.useRef<Chart | null>(null)
  const pickedRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = init(el)
    chartRef.current = chart

    // Pick the bar under the pointer. The candle series is invisible and only a
    // few px wide, so `OnCandleBarClick` almost never lands — instead map the
    // click x onto the nearest bar and toggle it (same bar again → clear).
    let downX = 0
    let downY = 0
    let dragging = false

    /** Hand-scaling wins: any drag or wheel over the chart leaves auto-scale. */
    const dropAutoScale = () => {
      if (!autoScaleRef.current) return
      autoScaleRef.current = false
      safeSet(AUTO_KEY, "0")
      setAutoScale(false)
    }

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
      dragging = true
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      // A pointerup outside the chart never reaches us — no buttons held means
      // the drag is long over.
      if (e.buttons === 0) {
        dragging = false
        return
      }
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) {
        dropAutoScale()
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      dragging = false
      // Ignore the click that ends a pan/zoom drag.
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return
      const c = chartRef.current
      if (!c) return
      // The y-axis strip is for scaling, not for picking a day — without this a
      // double-click there fires two picks on its way to re-fitting the axis.
      if (yAxisPaneAt(c, e.target) != null) return
      const list = c.getDataList()
      if (list.length === 0) return
      const rect = el.getBoundingClientRect()
      const p = c.convertFromPixel(
        [{ x: e.clientX - rect.left, y: 0 }],
        { paneId: CANDLE_PANE },
      )
      const point = Array.isArray(p) ? p[0] : p
      const raw = typeof point?.dataIndex === "number" ? point.dataIndex : -1
      const kd = list[Math.max(0, Math.min(list.length - 1, raw))]
      if (!kd || typeof kd.timestamp !== "number") return
      const ts = kd.timestamp
      if (pickedRef.current === ts) {
        pickedRef.current = null
        onDateSelectRef.current?.(null)
      } else {
        pickedRef.current = ts
        onDateSelectRef.current?.({
          timestamp: ts,
          end: periodEnd(ts, timeframeRef.current),
          latest: kd === list[list.length - 1],
          holdings: {
            ...((kd as { holdings?: Record<string, number> }).holdings ?? {}),
          },
          balances: {
            ...((kd as { balances?: Record<string, number> }).balances ?? {}),
          },
        })
      }
    }
    /**
     * Double-click a y-axis strip to fit that pane to its height. klinecharts'
     * own handler only un-latches an axis the user has dragged, and even then
     * leaves a third of the pane empty; this fits for real, every time, and
     * touches nothing horizontal.
     */
    const onDoubleClick = (e: MouseEvent) => {
      const c = chartRef.current
      if (!c) return
      const paneId = yAxisPaneAt(c, e.target)
      if (paneId != null) fitVertically(c, paneId)
    }

    el.addEventListener("pointerdown", onPointerDown)
    el.addEventListener("pointermove", onPointerMove)
    el.addEventListener("pointerup", onPointerUp)
    el.addEventListener("dblclick", onDoubleClick)
    el.addEventListener("wheel", dropAutoScale, { passive: true })

    // A resize invalidates both the even split and the fit — redo them once the
    // chart has taken its new size.
    const ro = new ResizeObserver(() => {
      const c = chartRef.current
      if (!c) return
      c.resize()
      splitPanesEvenly(c)
      if (autoScaleRef.current) fitToArea(c, el.clientWidth)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      el.removeEventListener("pointerdown", onPointerDown)
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", onPointerUp)
      el.removeEventListener("dblclick", onDoubleClick)
      el.removeEventListener("wheel", dropAutoScale)
      dispose(el)
      chartRef.current = null
    }
  }, [])

  // A locked vertical line marking the picked bar — see the effect below the
  // data push, so the overlay lands after `applyNewData`.
  const markerRef = React.useRef<string | null>(null)

  // Changing the timeframe / filter invalidates any picked bar.
  React.useEffect(() => {
    timeframeRef.current = timeframe
    if (pickedRef.current != null) {
      pickedRef.current = null
      onDateSelectRef.current?.(null)
    }
  }, [timeframe, plotKey])

  // (1) Data + the per-coin lines and holdings bars. Rebuilt only when the
  // underlying series changes — a timeframe switch, a different coin filter, or
  // a fresh fetch. Style and overlay toggles are handled by the effects below
  // so they never call `applyNewData` and yank the pan/zoom back to "now".
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const lines = merged?.priced ?? []

    // Linear ticks stay at 2 decimals for dollar-plus assets: klinecharts'
    // built-in generator mis-scales a wide range at higher precision.
    chart.setPriceVolumePrecision(merged?.axisPrecision ?? 2, 2)
    chart.applyNewData(viewData)
    chart.removeIndicator(CANDLE_PANE, INDICATOR_NAME)
    chart.removeIndicator(HOLDINGS_PANE, HOLDINGS_NAME)
    if (lines.length > 0 && merged) {
      chart.createIndicator(
        { name: INDICATOR_NAME, calcParams: lines, precision: merged.precision },
        true,
        { id: CANDLE_PANE },
      )
      if (merged.hasHoldings) {
        chart.createIndicator(
          { name: HOLDINGS_NAME, calcParams: merged.stackOrder },
          false,
          {
            id: HOLDINGS_PANE,
            // Roughly half the box, so the pane never flashes at some other
            // size; `splitPanesEvenly` below makes it exact.
            height: Math.max(60, Math.round((containerRef.current?.clientHeight ?? 560) / 2) - 20),
            // No padding under the axis minimum — klinecharts' default 10%
            // would float the $0 line above the pane floor. Headroom on top
            // follows whichever fit is in force.
            gap: paneGap(HOLDINGS_PANE, autoScaleRef.current),
            axisOptions: { name: USD_YAXIS },
          },
        )
      }
      // Split the panes evenly, then frame the history. Auto-scale fits the
      // whole series; otherwise a daily series is usually longer than the pane
      // can show at the 1px-per-bar floor, so it opens scrolled to today while
      // weekly/monthly fit the whole range. Runs after layout so the measured
      // widths and pane heights are real.
      const n = viewData.length
      requestAnimationFrame(() => {
        const c = chartRef.current
        if (!c || n < 2) return
        const width = containerRef.current?.clientWidth ?? 720
        splitPanesEvenly(c)
        if (autoScaleRef.current) {
          fitToArea(c, width)
        } else {
          c.setBarSpace(Math.min(16, Math.max(1, width / n)))
          c.scrollToRealTime()
        }
      })
    }
  }, [merged, viewData])

  // (2) Theme + linear/log scale — restyle in place, no data touch. Also re-runs
  // on a palette shuffle: `setStyles` forces a full redraw, and the per-coin
  // line and bar colours are resolved from `coinColor` at draw time, so the new
  // palette lands without an `applyNewData` (which would reset pan/zoom).
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const family = containerRef.current
      ? getComputedStyle(containerRef.current).fontFamily
      : "monospace"
    chart.setStyles(klineStyles(isDark, family, logScale))
    chart.setPaneOptions({
      id: CANDLE_PANE,
      axisOptions: { name: logScale ? LOG_YAXIS : USD_YAXIS },
    })
  }, [isDark, logScale, palette])

  // (2b) Auto-scale. On, it refits the series to the pane and releases both
  // y-axes; off, it hands klinecharts' right-hand gap back so panning past the
  // last bar works the way it does everywhere else. Data and resize refits live
  // with the effects that cause them.
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (autoScale) {
      fitToArea(chart, containerRef.current?.clientWidth ?? 720)
    } else {
      chart.setOffsetRightDistance(DEFAULT_RIGHT_GAP)
      // Padding only — a y-axis the user just dragged keeps its range.
      setPaneGaps(chart, false)
    }
  }, [autoScale])

  // (3) EMA overlay — attach/detach the dashed line only, no data touch, so
  // toggling it or switching its period keeps the current pan/zoom. `merged` is
  // a dep for its precision and to re-sync the line when the coin set changes.
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeIndicator(CANDLE_PANE, EMA_NAME)
    if (showEma && merged) {
      chart.createIndicator(
        {
          name: EMA_NAME,
          calcParams: [emaPeriod, emaColor],
          precision: merged.precision,
        },
        true,
        { id: CANDLE_PANE },
      )
    }
  }, [showEma, emaPeriod, emaColor, merged])

  // (3b) The average-price line. Rides with the EMA — one asset, EMA on — since
  // it answers the same question the EMA does: where does today's price sit
  // against what this position actually cost. Recreated rather than mutated:
  // the figures are built from `extendData`, and the ink flips with the theme.
  const avgRef = React.useRef<string | null>(null)
  const avgPrice = showEma ? (merged?.avgTxnPrice ?? null) : null
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (avgRef.current) {
      chart.removeOverlay(avgRef.current)
      avgRef.current = null
    }
    if (avgPrice != null && avgPrice > 0) {
      const id = chart.createOverlay(
        {
          name: AVG_MARK,
          points: [{ value: avgPrice }],
          extendData: { label: `Avg ${fmtUsdPrice(avgPrice)}`, color: emaColor },
          lock: true,
        },
        CANDLE_PANE,
      )
      avgRef.current = typeof id === "string" ? id : null
    }
  }, [avgPrice, emaColor, viewData])

  // Vertical line on the picked bar, falling back to the latest bar ("today")
  // when nothing is picked. Runs after the data push so the overlay's timestamp
  // resolves against bars the chart already holds.
  const lastBarTs = viewData.length
    ? viewData[viewData.length - 1].timestamp
    : null
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const markTs = selectedTimestamp ?? lastBarTs
    if (markerRef.current) {
      chart.removeOverlay(markerRef.current)
      markerRef.current = null
    }
    if (markTs != null) {
      const id = chart.createOverlay({
        name: PICKED_MARK,
        points: [{ timestamp: markTs }],
        extendData: fmtBarLabel(markTs, timeframe),
        lock: true,
      })
      markerRef.current = typeof id === "string" ? id : null
    }
    pickedRef.current = selectedTimestamp ?? null
  }, [selectedTimestamp, lastBarTs, viewData, timeframe])

  // Picking a day from the toolbar calendar — the same selection a click on the
  // chart makes, so it goes through the same bar lookup and snapshot shape.
  const [dateOpen, setDateOpen] = React.useState(false)
  const firstBarTs = viewData.length ? viewData[0].timestamp : null
  /** last day the calendar may offer — the end of the final bar's period */
  const lastPickableTs =
    lastBarTs != null ? periodEnd(lastBarTs, timeframe) - DAY_MS : null

  const pickDay = React.useCallback(
    (dayMs: number) => {
      if (viewData.length === 0) return
      const target = periodStart(dayMs, timeframe)
      // The exact bar if the series has one, else the last bar before it — the
      // calendar can land on a gap (a day with no candle anywhere).
      let bar = viewData[0]
      for (const b of viewData) {
        if (b.timestamp > target) break
        bar = b
      }
      const kd = bar as KLineData & {
        holdings?: Record<string, number>
        balances?: Record<string, number>
      }
      pickedRef.current = kd.timestamp
      onDateSelect?.({
        timestamp: kd.timestamp,
        end: periodEnd(kd.timestamp, timeframe),
        latest: bar === viewData[viewData.length - 1],
        holdings: { ...(kd.holdings ?? {}) },
        balances: { ...(kd.balances ?? {}) },
      })
    },
    [viewData, timeframe, onDateSelect],
  )

  const clearPick = React.useCallback(() => {
    pickedRef.current = null
    onDateSelect?.(null)
  }, [onDateSelect])

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
          <button
            type="button"
            onClick={toggleAutoScale}
            aria-pressed={autoScale}
            title="Fit the whole series to the chart area — dragging the chart turns it off"
            className={cn(
              "border px-2 py-0.5 text-[11px] transition-colors",
              autoScale
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Auto-scale
          </button>
          <div className="flex">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={viewData.length === 0}
                  aria-label="Pick a date on the chart"
                  className={cn(
                    "flex items-center gap-1.5 border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50",
                    selectedTimestamp != null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <CalendarBlank className="h-3 w-3 shrink-0" />
                  {selectedTimestamp != null
                    ? fmtBarLabel(selectedTimestamp, timeframe)
                    : "Pick date"}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  autoFocus
                  defaultMonth={
                    // never null while the trigger is enabled
                    (selectedTimestamp ?? lastBarTs) != null
                      ? toLocalDay((selectedTimestamp ?? lastBarTs) as number)
                      : undefined
                  }
                  selected={
                    selectedTimestamp != null ? toLocalDay(selectedTimestamp) : undefined
                  }
                  onSelect={(d) => {
                    if (d) pickDay(fromLocalDay(d))
                    setDateOpen(false)
                  }}
                  startMonth={firstBarTs != null ? toLocalDay(firstBarTs) : undefined}
                  endMonth={
                    lastPickableTs != null ? toLocalDay(lastPickableTs) : undefined
                  }
                  disabled={
                    firstBarTs != null && lastPickableTs != null
                      ? {
                          before: toLocalDay(firstBarTs),
                          after: toLocalDay(lastPickableTs),
                        }
                      : undefined
                  }
                />
              </PopoverContent>
            </Popover>
            {selectedTimestamp != null && (
              <button
                type="button"
                onClick={clearPick}
                title="Clear the picked date"
                aria-label="Clear the picked date"
                className="border border-l-0 border-border px-1.5 py-[3px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => shuffleCoinColors(coins)}
            title="Shuffle asset colours — reroll the palette for a clearer combination"
            aria-label="Shuffle asset colours"
            className="border border-border px-2 py-[3px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>

          {singleAsset && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleEma}
                aria-pressed={emaOn}
                className={cn(
                  "border px-2 py-0.5 text-[11px] transition-colors",
                  emaOn
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                EMA
              </button>
              {emaOn &&
                EMA_PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => chooseEmaPeriod(p)}
                    aria-pressed={p === emaPeriod}
                    className={cn(
                      "border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors",
                      p === emaPeriod
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {p}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <div
          ref={containerRef}
          className={cn("w-full", merged?.hasHoldings ? "h-[560px]" : "h-[460px]")}
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
                  style={{ backgroundColor: colorOf(coin) }}
                />
                {coinLabel(coin)}
              </span>
            ))}
            {showEma && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="inline-block h-0 w-3 shrink-0 border-t-2 border-dashed"
                  style={{ borderColor: emaColor }}
                />
                EMA {emaPeriod}
              </span>
            )}
            {avgPrice != null && avgPrice > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="inline-block h-0 w-3 shrink-0 border-t border-dotted"
                  style={{ borderColor: emaColor }}
                />
                Avg {fmtUsdPrice(avgPrice)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {timeframe === "day" ? "Daily" : timeframe === "week" ? "Weekly" : "Monthly"}{" "}
            USD price ·{" "}
            {[...merged.sources]
              .map((s) =>
                s === "coinbase"
                  ? "Coinbase Exchange"
                  : s === "frankfurter"
                    ? "Frankfurter (ECB)"
                    : "CoinGecko",
              )
              .join(" + ")}
            {merged.coveredFrom ? ` · since ${fmtDay(merged.coveredFrom)}` : ""}
            {merged.stale ? " · offline, last known" : ""}.{" "}
            {logScale
              ? "Log axis."
              : "Lines share one linear USD axis — turn on Log scale or filter the Coin column to compare assets of different price."}
            {showEma &&
              ` Dashed line: ${emaPeriod}-period exponential moving average of the ${
                timeframe === "day" ? "daily" : timeframe === "week" ? "weekly" : "monthly"
              } close.`}
            {avgPrice != null &&
              avgPrice > 0 &&
              ` Dotted line: average price across every ${coinLabel(
                merged.priced[0],
              )} transaction, each weighed by its size at that day's close.`}
            {merged.hasHoldings &&
              " Lower pane: USD value of holdings, stacked by asset."}
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
