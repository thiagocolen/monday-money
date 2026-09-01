"use client"

import * as React from "react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { addDays, addMonths, format, startOfDay, startOfMonth, startOfWeek } from "date-fns"

import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { BinanceTransaction } from "@/lib/api"
import { parseFlexibleDate } from "@/lib/date"
import { coinLabel, formatCoinAmount } from "@/lib/coins"
import { fetchPriceHistory } from "@/lib/price-history"
import type { PricePoint, PriceSource } from "@/lib/price-history"
import { cn } from "@/lib/utils"

interface AssetPriceVolumeChartProps {
  /** rows currently visible in the History table (already column-filtered) */
  data: BinanceTransaction[]
}

type TimeFrame = "daily" | "weekly" | "monthly"

const TIMEFRAMES: { id: TimeFrame; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
]

const TF_KEY = "investments.history.priceVolume.timeframe"
const COIN_KEY = "investments.history.priceVolume.coin"

const BUY_COLOR = "hsl(142 69% 42%)"
const SELL_COLOR = "hsl(0 72% 55%)"
const PRICE_COLOR = "hsl(38 92% 50%)"

function loadTimeFrame(): TimeFrame {
  try {
    const v = localStorage.getItem(TF_KEY)
    if (v === "daily" || v === "weekly" || v === "monthly") return v
  } catch {
    /* ignore */
  }
  return "weekly"
}

function loadCoin(): string | null {
  try {
    return localStorage.getItem(COIN_KEY)
  } catch {
    return null
  }
}

function bucketStart(d: Date, tf: TimeFrame): number {
  if (tf === "daily") return startOfDay(d).getTime()
  if (tf === "weekly") return startOfWeek(d, { weekStartsOn: 1 }).getTime()
  return startOfMonth(d).getTime()
}

function nextBucket(ms: number, tf: TimeFrame): number {
  const d = new Date(ms)
  if (tf === "daily") return addDays(d, 1).getTime()
  if (tf === "weekly") return addDays(d, 7).getTime()
  return addMonths(d, 1).getTime()
}

function bucketLabel(ms: number, tf: TimeFrame): string {
  const d = new Date(ms)
  return tf === "monthly" ? format(d, "MMM ''yy") : format(d, "dd MMM ''yy")
}

interface Row {
  t: number
  /** token units received in this period (>= 0) */
  buys: number
  /** token units sent out in this period (<= 0) */
  sells: number
  /** USD price at the period close, carried forward across gaps */
  price: number | null
}

function PriceVolumeTooltip({
  active,
  payload,
  coin,
  tf,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Row }>
  coin: string
  tf: TimeFrame
}) {
  const r = active ? payload?.[0]?.payload : undefined
  if (!r) return null
  const net = r.buys + r.sells
  return (
    <div className="rounded-md border bg-background px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1 font-mono font-medium text-foreground">
        {bucketLabel(r.t, tf)}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums">
        <span className="text-muted-foreground">Price</span>
        <span className="text-right text-foreground">
          {r.price == null ? "—" : fmtUsdFull(r.price)}
        </span>
        <span className="text-muted-foreground">Buys</span>
        <span className="text-right" style={{ color: BUY_COLOR }}>
          {r.buys > 0 ? `+${formatCoinAmount(r.buys)}` : "0"} {coin}
        </span>
        <span className="text-muted-foreground">Sells</span>
        <span className="text-right" style={{ color: SELL_COLOR }}>
          {r.sells < 0 ? formatCoinAmount(r.sells) : "0"} {coin}
        </span>
        <span className="text-muted-foreground">Net</span>
        <span
          className={cn("text-right", net < 0 ? "text-destructive" : "text-foreground")}
        >
          {net > 0 ? `+${formatCoinAmount(net)}` : formatCoinAmount(net)} {coin}
        </span>
      </div>
    </div>
  )
}

function buildRows(
  txns: { t: number; change: number }[],
  tf: TimeFrame,
  price: PricePoint[],
): Row[] {
  if (txns.length === 0) return []

  const vol = new Map<number, { buys: number; sells: number }>()
  let minT = Infinity
  let maxT = -Infinity
  for (const { t, change } of txns) {
    const b = bucketStart(new Date(t), tf)
    minT = Math.min(minT, b)
    maxT = Math.max(maxT, b)
    const cell = vol.get(b) ?? { buys: 0, sells: 0 }
    if (change >= 0) cell.buys += change
    else cell.sells += change
    vol.set(b, cell)
  }

  // carry the axis to the current period so the price line reaches today
  maxT = Math.max(maxT, bucketStart(new Date(), tf))

  const sorted = [...price].sort((a, b) => a.t - b.t)
  let pi = 0
  let last: number | null = null

  const rows: Row[] = []
  for (let b = minT; b <= maxT; b = nextBucket(b, tf)) {
    const end = nextBucket(b, tf)
    while (pi < sorted.length && sorted[pi].t < end) {
      last = sorted[pi].usd
      pi++
    }
    const cell = vol.get(b)
    rows.push({ t: b, buys: cell?.buys ?? 0, sells: cell?.sells ?? 0, price: last })
  }
  return rows
}

const fmtUsdCompact = (v: number) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  })

const fmtVolTick = (v: number) => {
  if (!v) return "0"
  return Math.abs(v) >= 1000
    ? v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
    : v.toLocaleString("en-US", { maximumSignificantDigits: 3 })
}

/** round up to a 1 / 2 / 2.5 / 5 × 10ⁿ "nice" number for tidy axis ticks */
function niceCeil(v: number): number {
  if (!(v > 0)) return 1
  const base = 10 ** Math.floor(Math.log10(v))
  const f = v / base
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * base
}

const fmtUsdFull = (v: number) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: v < 1 ? 6 : v < 100 ? 4 : 2,
  })

export function AssetPriceVolumeChart({ data }: AssetPriceVolumeChartProps) {
  const [tf, setTf] = React.useState<TimeFrame>(loadTimeFrame)
  const [pickedCoin, setPickedCoin] = React.useState<string | null>(loadCoin)

  React.useEffect(() => {
    try {
      localStorage.setItem(TF_KEY, tf)
    } catch {
      /* ignore */
    }
  }, [tf])

  // coins present in the filtered rows, most-active first
  const coins = React.useMemo(() => {
    const count = new Map<string, number>()
    for (const d of data) {
      const c = String(d.Coin ?? "").trim()
      if (c) count.set(c, (count.get(c) ?? 0) + 1)
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [data])

  const coin =
    pickedCoin && coins.includes(pickedCoin) ? pickedCoin : (coins[0] ?? null)

  const selectCoin = (c: string) => {
    setPickedCoin(c)
    try {
      localStorage.setItem(COIN_KEY, c)
    } catch {
      /* ignore */
    }
  }

  const txns = React.useMemo(() => {
    if (!coin) return []
    return data
      .filter((d) => String(d.Coin ?? "").trim() === coin)
      .map((d) => ({
        t: parseFlexibleDate(d.Time)?.getTime() ?? NaN,
        change: Number(d.Change),
      }))
      .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.change))
  }, [data, coin])

  const earliestTx = React.useMemo(
    () => txns.reduce((m, r) => Math.min(m, r.t), Number.POSITIVE_INFINITY),
    [txns],
  )

  const [price, setPrice] = React.useState<{
    coin: string
    points: PricePoint[]
    source: PriceSource
    stale: boolean
  } | null>(null)

  React.useEffect(() => {
    if (!coin) return
    let alive = true
    fetchPriceHistory(coin, earliestTx).then((r) => {
      if (alive) {
        setPrice({ coin, points: r.points, source: r.source, stale: r.stale })
      }
    })
    return () => {
      alive = false
    }
  }, [coin, earliestTx])

  // only trust the fetched series while it still matches the selected coin
  const activePrice = price && price.coin === coin ? price : null
  const hasPrice = !!activePrice && activePrice.points.length > 0
  const loadingPrice = !activePrice

  const rows = React.useMemo(
    () => buildRows(txns, tf, activePrice?.points ?? []),
    [txns, tf, activePrice],
  )

  // does the price series fall short of the earliest trade?
  const priceStartsAfterFirstTx = React.useMemo(() => {
    if (!activePrice?.points.length || txns.length === 0) return false
    const firstPrice = activePrice.points.reduce((m, p) => Math.min(m, p.t), Infinity)
    return firstPrice > earliestTx + 7 * 86_400_000
  }, [activePrice, txns, earliestTx])

  const volMax = React.useMemo(() => {
    let m = 0
    for (const r of rows) m = Math.max(m, r.buys, -r.sells)
    return niceCeil(m * 1.05)
  }, [rows])

  const config = React.useMemo<ChartConfig>(
    () => ({
      buys: { label: "Buys / in", color: BUY_COLOR },
      sells: { label: "Sells / out", color: SELL_COLOR },
      price: { label: "USD price", color: PRICE_COLOR },
    }),
    [],
  )

  if (!coin) {
    return (
      <div className="flex h-[360px] items-center justify-center text-xs text-muted-foreground">
        No transactions in the current filter.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {coins.length > 1 ? (
          <select
            value={coin}
            onChange={(e) => selectCoin(e.target.value)}
            className="h-7 rounded-md border bg-background px-2 text-xs font-medium"
          >
            {coins.map((c) => (
              <option key={c} value={c}>
                {coinLabel(c)}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-medium">{coinLabel(coin)}</span>
        )}

        <div className="flex rounded-md border p-0.5">
          {TIMEFRAMES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTf(f.id)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                tf === f.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[360px] w-full">
        <ComposedChart
          data={rows}
          stackOffset="sign"
          margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="t"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={48}
            interval="preserveStartEnd"
            tickFormatter={(v) => bucketLabel(Number(v), tf)}
          />
          <YAxis
            yAxisId="volume"
            orientation="left"
            domain={[-volMax, volMax]}
            tickLine={false}
            axisLine={false}
            tickCount={5}
            tickMargin={6}
            width={64}
            tickFormatter={(v) => fmtVolTick(Number(v))}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            domain={["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            width={62}
            tickFormatter={(v) => fmtUsdCompact(Number(v))}
          />
          <ReferenceLine yAxisId="volume" y={0} stroke="var(--border)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={<PriceVolumeTooltip coin={coin} tf={tf} />}
          />
          <Bar
            yAxisId="volume"
            dataKey="buys"
            stackId="v"
            fill={BUY_COLOR}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="volume"
            dataKey="sells"
            stackId="v"
            fill={SELL_COLOR}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            dataKey="price"
            type="monotone"
            stroke={PRICE_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ChartContainer>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-[2px]" style={{ backgroundColor: PRICE_COLOR }} />
          USD price (right axis)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: BUY_COLOR }} />
          Buys / in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: SELL_COLOR }} />
          Sells / out
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Bars: net {coin} moved per period from your transaction history (in above
        the axis, out below), on the left scale.
        {activePrice?.source === "coinbase" &&
          " Line: daily USD close from Coinbase, on the right scale."}
        {activePrice?.source === "coingecko" &&
          " Line: daily USD price from CoinGecko, on the right scale."}
        {!loadingPrice && !hasPrice && ` No USD price feed for ${coin} — showing volume only.`}
        {priceStartsAfterFirstTx &&
          activePrice?.source === "coingecko" &&
          " Price only reaches back 365 days (CoinGecko public-tier limit)."}
        {priceStartsAfterFirstTx &&
          activePrice?.source === "coinbase" &&
          ` ${coin}-USD listed on Coinbase after your first trade, so the line starts later.`}
        {activePrice?.stale && activePrice.points.length > 0 && " (price offline — last known)"}
        {loadingPrice && " Loading price…"}
      </p>
    </div>
  )
}
