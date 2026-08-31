"use client"

import * as React from "react"
import { dispose, init } from "klinecharts"
import type { Chart, KLineData } from "klinecharts"

import type { BinanceTransaction } from "@/lib/api"
import { currentCoinBalances } from "@/lib/binance-history"
import { coinLabel, renamedCoinNote } from "@/lib/coins"
import { parseFlexibleDate } from "@/lib/date"
import { fetchPriceCandles } from "@/lib/price-candles"
import type { CandleHistory } from "@/lib/price-candles"
import { cn } from "@/lib/utils"

interface AssetPriceKlineChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
}

const STORAGE_KEY = "mm.history.klineCoin"
const DAY_MS = 86_400_000

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

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

/** Coin to show first: the one with the largest current holding, else the first. */
function pickDefault(coins: string[], data: BinanceTransaction[]): string {
  if (coins.length === 0) return ""
  const bal = currentCoinBalances(data)
  return [...coins].sort(
    (a, b) => Math.abs(bal[b] ?? 0) - Math.abs(bal[a] ?? 0),
  )[0]
}

/** Decimal places that keep a price readable across BTC-scale and sub-cent coins. */
function pricePrecision(candles: KLineData[]): number {
  const abs = Math.abs(candles.length ? candles[candles.length - 1].close : 0)
  if (abs === 0 || abs >= 100) return 2
  if (abs >= 1) return 4
  if (abs >= 0.01) return 6
  return 8
}

function klineStyles(dark: boolean) {
  const grid = dark ? "#26262b" : "#ededed"
  const text = dark ? "#8f8f96" : "#76808f"
  const axisLine = dark ? "#3a3a42" : "#dcdcdc"
  const up = "#16a34a"
  const down = "#dc2626"
  return {
    grid: {
      horizontal: { color: grid },
      vertical: { color: grid },
    },
    candle: {
      priceMark: {
        high: { color: text },
        low: { color: text },
      },
      tooltip: { text: { color: text } },
      bar: {
        upColor: up,
        downColor: down,
        noChangeColor: "#888888",
        upBorderColor: up,
        downBorderColor: down,
        noChangeBorderColor: "#888888",
        upWickColor: up,
        downWickColor: down,
        noChangeWickColor: "#888888",
      },
    },
    indicator: {
      bars: [
        {
          upColor: "rgba(22, 163, 74, 0.55)",
          downColor: "rgba(220, 38, 38, 0.55)",
          noChangeColor: "#888888",
        },
      ],
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

export function AssetPriceKlineChart({ data }: AssetPriceKlineChartProps) {
  const { coins, earliest } = React.useMemo(() => coinsFromRows(data), [data])
  const isDark = useIsDark()

  // User's explicit pick; the effective selection falls back to storage / default
  // and self-corrects when the table's Coin filter drops the picked coin.
  const [picked, setPicked] = React.useState<string | null>(null)
  const selected = React.useMemo(() => {
    if (coins.length === 0) return ""
    if (picked && coins.includes(picked)) return picked
    const stored = safeGet(STORAGE_KEY)
    return stored && coins.includes(stored) ? stored : pickDefault(coins, data)
  }, [coins, data, picked])

  const choose = React.useCallback((coin: string) => {
    setPicked(coin)
    try {
      localStorage.setItem(STORAGE_KEY, coin)
    } catch {
      /* ignore */
    }
  }, [])

  // Candle fetch — keyed by coin so a stale response can't overwrite a newer one.
  const [result, setResult] = React.useState<{ coin: string; history: CandleHistory } | null>(null)
  React.useEffect(() => {
    if (!selected) return
    let alive = true
    const since = earliest[selected] ?? Date.now() - 365 * DAY_MS
    fetchPriceCandles(selected, since).then((history) => {
      if (alive) setResult({ coin: selected, history })
    })
    return () => {
      alive = false
    }
  }, [selected, earliest])

  const history = result?.coin === selected ? result.history : null
  const loading = !!selected && !history

  // Chart instance lifecycle.
  const containerRef = React.useRef<HTMLDivElement>(null)
  const chartRef = React.useRef<Chart | null>(null)
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = init(el)
    chartRef.current = chart
    chart?.createIndicator("VOL", false, { id: "pane_vol" })
    const ro = new ResizeObserver(() => chartRef.current?.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      dispose(el)
      chartRef.current = null
    }
  }, [])

  // Re-theme in place.
  React.useEffect(() => {
    chartRef.current?.setStyles(klineStyles(isDark))
  }, [isDark])

  // Push candles.
  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const candles = (history?.candles ?? []) as KLineData[]
    chart.setPriceVolumePrecision(pricePrecision(candles), 4)
    chart.applyNewData(candles)
  }, [history])

  const hasCandles = (history?.candles.length ?? 0) > 0
  const covered =
    history?.coveredFrom
      ? new Date(history.coveredFrom).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null

  return (
    <div className="space-y-2">
      {coins.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {coins.map((coin) => (
            <button
              key={coin}
              type="button"
              onClick={() => choose(coin)}
              className={cn(
                "border px-2 py-0.5 font-mono text-[11px] transition-colors",
                coin === selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {coinLabel(coin)}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <div ref={containerRef} className="h-[360px] w-full" />
        {coins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-xs text-muted-foreground">
            Filter the Coin column to chart an asset's USD price.
          </div>
        )}
        {coins.length > 0 && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-xs text-muted-foreground">
            Loading {coinLabel(selected)} price history…
          </div>
        )}
        {coins.length > 0 && !loading && !hasCandles && (
          <div className="absolute inset-0 flex items-center justify-center bg-background px-4 text-center text-xs text-muted-foreground">
            No USD price history for {coinLabel(selected)}.
          </div>
        )}
      </div>

      {hasCandles && (
        <p className="text-[10px] text-muted-foreground">
          Daily USD candles for {coinLabel(selected)}
          {history?.source === "coinbase" && " · Coinbase Exchange"}
          {history?.source === "coingecko" &&
            " · CoinGecko close only (flat candles, last 365 days)"}
          {covered && ` · since ${covered}`}
          {history?.stale && " · offline, last known"}.
        </p>
      )}
      {renamedCoinNote(coins) && (
        <p className="text-[10px] text-muted-foreground">{renamedCoinNote(coins)}</p>
      )}
    </div>
  )
}
