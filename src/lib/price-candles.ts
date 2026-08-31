/**
 * Historical daily USD OHLC candles for a single asset, for the History tab's
 * KLineChart.
 *
 * Primary source is the public Coinbase Exchange candles endpoint
 * (`api.exchange.coinbase.com`, no key, CORS-enabled): daily OHLC + volume back
 * to the pair's listing date, paged 300 candles at a time. When Coinbase does
 * not list the pair we fall back to CoinGecko's keyless `market_chart`, which
 * only exposes a close price (rendered as flat candles) and whose public tier
 * caps history at the last 365 days.
 *
 * Results are served from a 12-hour localStorage cache; on a network failure the
 * last good snapshot is returned flagged `stale`.
 */

import { COINGECKO_IDS, FIAT_SYMBOLS } from "./prices"

export interface Candle {
  /** epoch ms (start of the UTC day) */
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  /** base-asset volume for the day (0 when the source has none) */
  volume: number
}

export type CandleSource = "coinbase" | "coingecko" | "frankfurter" | null

export interface CandleHistory {
  candles: Candle[]
  source: CandleSource
  /** earliest day the series covers, epoch ms (0 when empty) */
  coveredFrom: number
  /** epoch ms of the fetch backing these candles (0 when never fetched) */
  fetchedAt: number
  /** true when the network call failed and this is a last-known-good snapshot */
  stale: boolean
}

const DAY_MS = 86_400_000
const TTL_MS = 12 * 60 * 60_000
/** don't page Coinbase back further than this from now */
const MAX_LOOKBACK_MS = 12 * 365 * DAY_MS
const cacheKey = (ticker: string) => `mm.pricecandles.v1.${ticker.toUpperCase()}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** canonical ticker → CoinGecko id, or undefined when we can't price it there */
function coinGeckoId(ticker: string): string | undefined {
  return COINGECKO_IDS[ticker.trim().toUpperCase()]
}

interface CacheShape {
  candles: Candle[]
  source: CandleSource
  coveredFrom: number
  fetchedAt: number
}

function readCache(ticker: string): CacheShape | null {
  try {
    const raw = localStorage.getItem(cacheKey(ticker))
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p && Array.isArray(p.candles) && typeof p.fetchedAt === "number") return p
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(ticker: string, v: CacheShape) {
  try {
    localStorage.setItem(cacheKey(ticker), JSON.stringify(v))
  } catch {
    /* ignore — cache is best-effort */
  }
}

/**
 * Daily OHLC candles from Coinbase, paged back to `fromMs`. Coinbase returns
 * rows as `[time, low, high, open, close, volume]`, newest-first, max 300 rows
 * per call. `null` = pair not listed (HTTP 404).
 */
async function fetchCoinbase(ticker: string, fromMs: number): Promise<Candle[] | null> {
  const product = `${ticker.trim().toUpperCase()}-USD`
  const floor = Math.max(fromMs, Date.now() - MAX_LOOKBACK_MS)
  const byDay = new Map<number, Candle>()
  let end = Date.now()
  let productExists = false

  for (let guard = 0; guard < 48 && end > floor; guard++) {
    const start = end - 300 * DAY_MS
    const url =
      `https://api.exchange.coinbase.com/products/${product}/candles` +
      `?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`

    let rows: unknown
    try {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (!res.ok) break
      rows = await res.json()
    } catch {
      break
    }
    if (!Array.isArray(rows) || rows.length === 0) break
    productExists = true

    let oldest = Infinity
    for (const r of rows as number[][]) {
      if (!Array.isArray(r) || r.length < 6) continue
      const t = Math.floor((r[0] * 1000) / DAY_MS) * DAY_MS
      byDay.set(t, {
        timestamp: t,
        low: r[1],
        high: r[2],
        open: r[3],
        close: r[4],
        volume: r[5],
      })
      oldest = Math.min(oldest, r[0] * 1000)
    }
    if (!Number.isFinite(oldest)) break
    end = oldest - DAY_MS
    await sleep(160)
  }

  if (!productExists || byDay.size === 0) return productExists ? [] : null
  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Last 365 daily closes from CoinGecko (keyless public tier ceiling), promoted
 * to flat candles (open = high = low = close, no volume).
 */
async function fetchCoinGecko(ticker: string): Promise<Candle[] | null> {
  const id = coinGeckoId(ticker)
  if (!id) return null
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365`,
    )
    if (!res.ok) return null
    const json: { prices?: [number, number][] } = await res.json()
    const byDay = new Map<number, number>()
    for (const p of json.prices ?? []) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
      byDay.set(Math.floor(p[0] / DAY_MS) * DAY_MS, p[1])
    }
    const candles = [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, usd]) => ({ timestamp: t, open: usd, high: usd, low: usd, close: usd, volume: 0 }))
    return candles.length ? candles : null
  } catch {
    return null
  }
}

/** A fiat we hold directly (BRL, …) — priced against USD via an FX feed. */
function isFiat(ticker: string): boolean {
  return (FIAT_SYMBOLS as readonly string[]).includes(ticker.trim().toUpperCase())
}

/**
 * Daily USD value of one unit of a fiat, from Frankfurter (`api.frankfurter.dev`,
 * keyless, CORS `*`, ECB reference rates). One call covers the whole window —
 * `from` returns USD→fiat, so the USD value is its reciprocal. Business days
 * only; the merge step carries the last rate forward across weekends/holidays.
 * Promoted to flat candles (open = high = low = close, no volume).
 */
async function fetchFrankfurter(ticker: string, fromMs: number): Promise<Candle[] | null> {
  const sym = ticker.trim().toUpperCase()
  const start = new Date(Math.max(fromMs, Date.now() - MAX_LOOKBACK_MS))
    .toISOString()
    .slice(0, 10)
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${start}..?base=USD&symbols=${sym}`,
    )
    if (!res.ok) return null
    const json: { rates?: Record<string, Record<string, number>> } = await res.json()
    const candles: Candle[] = []
    for (const [day, obj] of Object.entries(json.rates ?? {})) {
      const perUsd = obj?.[sym]
      if (!Number.isFinite(perUsd) || !(perUsd > 0)) continue
      const t = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS) * DAY_MS
      const usd = 1 / perUsd
      candles.push({ timestamp: t, open: usd, high: usd, low: usd, close: usd, volume: 0 })
    }
    candles.sort((a, b) => a.timestamp - b.timestamp)
    return candles.length ? candles : null
  } catch {
    return null
  }
}

/**
 * Daily USD candle history for `ticker`, reaching back to at least `sinceMs`
 * (clamped to 12 years). Cached for 12h; a cache that already covers the
 * requested window is reused. Returns `{ candles: [] }` when the asset can't be
 * priced and there is no cache.
 */
export async function fetchPriceCandles(ticker: string, sinceMs: number): Promise<CandleHistory> {
  const cached = readCache(ticker)
  const wanted = Math.max(sinceMs, Date.now() - MAX_LOOKBACK_MS)
  const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS
  const covers = cached && cached.coveredFrom <= wanted + DAY_MS

  if (cached && fresh && covers) {
    return { ...cached, stale: false }
  }

  let candles: Candle[] | null = null
  let source: CandleSource = null

  // Fiat (BRL, …) isn't a crypto pair — price it against USD via Frankfurter.
  if (isFiat(ticker)) {
    candles = await fetchFrankfurter(ticker, sinceMs)
    source = candles && candles.length ? "frankfurter" : null
  }

  if (!candles || candles.length === 0) {
    candles = await fetchCoinbase(ticker, sinceMs)
    source = candles && candles.length ? "coinbase" : null
  }

  if (!candles || candles.length === 0) {
    const cg = await fetchCoinGecko(ticker)
    if (cg && cg.length) {
      candles = cg
      source = "coingecko"
    }
  }

  if (!candles || candles.length === 0) {
    if (cached) return { ...cached, stale: true }
    return { candles: [], source: null, coveredFrom: 0, fetchedAt: 0, stale: true }
  }

  const result: CacheShape = {
    candles,
    source,
    coveredFrom: candles[0].timestamp,
    fetchedAt: Date.now(),
  }
  writeCache(ticker, result)
  return { ...result, stale: false }
}
