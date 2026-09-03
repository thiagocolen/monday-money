/**
 * Shared allocation maths + display helpers used by the portfolio pie chart
 * (allocation snapshot) and the allocation-target planner.
 */
import type { BinanceTransaction } from "./api"
import { currentCoinBalances } from "./binance-history"
import { coinColor } from "./coins"

export interface AllocSlice {
  coin: string
  /** USD value of the holding */
  usd: number
  /** underlying token quantity (NaN in snapshot mode) */
  qty: number
  /** fraction of the priced portfolio, 0..1 */
  share: number
  color: string
}

export const fmtUsd = (v: number, compact = false) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : Math.abs(v) < 100 ? 2 : 0,
  })

export const fmtPct = (s: number) =>
  `${(s * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`

export const fmtQty = (v: number) => {
  const abs = Math.abs(v)
  const digits = abs !== 0 && abs < 1 ? 6 : abs < 1000 ? 3 : 2
  return v.toLocaleString("en-US", { maximumFractionDigits: digits })
}

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

export function toSlices(
  priced: { coin: string; usd: number; qty: number }[],
): { slices: AllocSlice[]; totalUsd: number } {
  priced.sort((a, b) => b.usd - a.usd)
  const totalUsd = priced.reduce((sum, h) => sum + h.usd, 0)
  if (totalUsd <= 0) return { slices: [], totalUsd: 0 }
  const slices: AllocSlice[] = priced.map((h) => ({
    coin: h.coin,
    usd: h.usd,
    qty: h.qty,
    share: h.usd / totalUsd,
    color: coinColor(h.coin),
  }))
  return { slices, totalUsd }
}

/** Live allocation: current balances valued at CoinGecko spot. */
export function buildLiveAllocation(
  data: BinanceTransaction[],
  price: Record<string, number>,
): { slices: AllocSlice[]; totalUsd: number; unpriced: string[] } {
  const balances = currentCoinBalances(data)
  const priced: { coin: string; usd: number; qty: number }[] = []
  const unpriced: string[] = []
  for (const [coin, qty] of Object.entries(balances)) {
    if (qty <= 0) continue
    const p = price[coin.toUpperCase()]
    if (typeof p === "number" && p > 0) priced.push({ coin, usd: qty * p, qty })
    else unpriced.push(coin)
  }
  return { ...toSlices(priced), unpriced: unpriced.sort() }
}

/** Historical allocation: pre-valued USD holdings from the price chart. */
export function buildSnapshotAllocation(holdings: Record<string, number>): {
  slices: AllocSlice[]
  totalUsd: number
  unpriced: string[]
} {
  const priced = Object.entries(holdings)
    .filter(([, usd]) => usd > 0)
    .map(([coin, usd]) => ({ coin, usd, qty: NaN }))
  return { ...toSlices(priced), unpriced: [] }
}
