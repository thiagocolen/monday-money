/**
 * Historical daily USD price for a single asset.
 *
 * Primary source is the public Coinbase Exchange candles endpoint
 * (`api.exchange.coinbase.com`, no key, CORS-enabled): daily closes back to the
 * pair's listing date, paged 300 candles at a time. When Coinbase doesn't list
 * the asset we fall back to CoinGecko's keyless `market_chart`, which the public
 * tier caps at the last 365 days.
 *
 * Results are served from a 12-hour localStorage cache; on a network failure the
 * last good snapshot is returned flagged `stale`. Callers re-bucket the daily
 * points into whatever timeframe they render.
 */

import { COINGECKO_IDS } from "./prices"

export interface PricePoint {
  /** epoch ms (start of the UTC day) */
  t: number
  /** USD close price for that day */
  usd: number
}

export type PriceSource = "coinbase" | "coingecko" | null

export interface PriceHistory {
  points: PricePoint[]
  source: PriceSource
  /** earliest day the series covers, epoch ms (0 when empty) */
  coveredFrom: number
  /** epoch ms of the fetch backing these points (0 when never fetched) */
  fetchedAt: number
  /** true when the network call failed and this is a last-known-good snapshot */
  stale: boolean
}

const DAY_MS = 86_400_000
const TTL_MS = 12 * 60 * 60_000
/** don't page Coinbase back further than this from now */
const MAX_LOOKBACK_MS = 12 * 365 * DAY_MS
const cacheKey = (ticker: string) => `mm.pricehist.v2.${ticker.toUpperCase()}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** canonical ticker → CoinGecko id, or undefined when we can't price it there */
function coinGeckoId(ticker: string): string | undefined {
  return COINGECKO_IDS[ticker.trim().toUpperCase()]
}

interface CacheShape {
  points: PricePoint[]
  source: PriceSource
  coveredFrom: number
  fetchedAt: number
}

function readCache(ticker: string): CacheShape | null {
  try {
    const raw = localStorage.getItem(cacheKey(ticker))
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p && Array.isArray(p.points) && typeof p.fetchedAt === "number") return p
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

/** Daily closes from Coinbase, paged back to `fromMs`. `null` = pair not listed. */
async function fetchCoinbase(ticker: string, fromMs: number): Promise<PricePoint[] | null> {
  const product = `${ticker.trim().toUpperCase()}-USD`
  const floor = Math.max(fromMs, Date.now() - MAX_LOOKBACK_MS)
  const byDay = new Map<number, number>()
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
      if (!Array.isArray(r) || r.length < 5) continue
      const t = Math.floor((r[0] * 1000) / DAY_MS) * DAY_MS
      byDay.set(t, r[4]) // close
      oldest = Math.min(oldest, r[0] * 1000)
    }
    if (!Number.isFinite(oldest)) break
    end = oldest - DAY_MS
    await sleep(160)
  }

  if (!productExists || byDay.size === 0) return productExists ? [] : null
  return [...byDay.entries()]
    .map(([t, usd]) => ({ t, usd }))
    .sort((a, b) => a.t - b.t)
}

/** Last 365 daily closes from CoinGecko (keyless public tier ceiling). */
async function fetchCoinGecko(ticker: string): Promise<PricePoint[] | null> {
  const id = coinGeckoId(ticker)
  if (!id) return null
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365`,
    )
    if (!res.ok) return null
    const json: { prices?: [number, number][] } = await res.json()
    const points = (json.prices ?? [])
      .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([t, usd]) => ({ t: Math.floor(t / DAY_MS) * DAY_MS, usd }))
    return points.length ? points : null
  } catch {
    return null
  }
}

/**
 * Daily USD price history for `ticker`, reaching back to at least `sinceMs`
 * (clamped to 12 years). Cached for 12h; a cache that already covers the
 * requested window is reused. Returns `{ points: [] }` when the asset can't be
 * priced and there is no cache.
 */
export async function fetchPriceHistory(ticker: string, sinceMs: number): Promise<PriceHistory> {
  const cached = readCache(ticker)
  const wanted = Math.max(sinceMs, Date.now() - MAX_LOOKBACK_MS)
  const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS
  const covers = cached && cached.coveredFrom <= wanted + DAY_MS

  if (cached && fresh && covers) {
    return { ...cached, stale: false }
  }

  let points = await fetchCoinbase(ticker, sinceMs)
  let source: PriceSource = points && points.length ? "coinbase" : null

  if (!points || points.length === 0) {
    const cg = await fetchCoinGecko(ticker)
    if (cg && cg.length) {
      points = cg
      source = "coingecko"
    }
  }

  if (!points || points.length === 0) {
    if (cached) return { ...cached, stale: true }
    return { points: [], source: null, coveredFrom: 0, fetchedAt: 0, stale: true }
  }

  const result: CacheShape = {
    points,
    source,
    coveredFrom: points[0].t,
    fetchedAt: Date.now(),
  }
  writeCache(ticker, result)
  return { ...result, stale: false }
}
