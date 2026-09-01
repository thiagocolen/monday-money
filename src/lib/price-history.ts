/**
 * Historical daily USD price for a single asset.
 *
 * Primary source is the public Coinbase Exchange candles endpoint
 * (`api.exchange.coinbase.com`, no key, CORS-enabled): daily closes back to the
 * pair's listing date, paged 300 candles at a time. When Coinbase doesn't list
 * the asset we fall back to CoinGecko's keyless `market_chart`, which the public
 * tier caps at the last 365 days.
 *
 * Past daily closes never change, so the localStorage cache is treated as
 * permanent history: a stale Coinbase series is refreshed incrementally — only
 * the still-forming trailing edge is re-fetched, plus older days when a caller
 * asks for a wider window — instead of re-paging the whole thing. On a network
 * failure the last good snapshot is returned flagged `stale`. Callers re-bucket
 * the daily points into whatever timeframe they render.
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
/** how often the still-forming trailing edge of the series is re-fetched */
const EDGE_TTL_MS = 12 * 60 * 60_000
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

/**
 * In-flight resolutions keyed by ticker + requested window, so concurrent
 * component mounts asking for the same series share one network round-trip.
 */
const inFlight = new Map<string, Promise<PriceHistory>>()

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

/**
 * Daily closes from Coinbase for the day-range `[fromMs, toMs]`, paged
 * newest-first 300 rows at a time. `null` = pair not listed (HTTP 404) or the
 * request failed before any data came back; `[]` = listed but nothing in range.
 */
async function fetchCoinbaseWindow(
  ticker: string,
  fromMs: number,
  toMs: number,
): Promise<PricePoint[] | null> {
  const product = `${ticker.trim().toUpperCase()}-USD`
  const floor = Math.max(fromMs, Date.now() - MAX_LOOKBACK_MS)
  const byDay = new Map<number, number>()
  let end = toMs
  let productExists = false

  for (let guard = 0; guard < 48 && end > floor; guard++) {
    const start = Math.max(end - 300 * DAY_MS, floor)
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

  if (!productExists) return null
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
 * Incrementally extend/refresh an existing Coinbase series: backfill older days
 * only when `wanted` reaches past what's cached, and re-fetch the trailing edge
 * only once it's older than `EDGE_TTL_MS`. Returns `null` when the cache is not a
 * usable Coinbase series (caller should do a full fetch instead).
 */
async function refreshCoinbaseCache(
  ticker: string,
  cached: CacheShape,
  wanted: number,
): Promise<PriceHistory | null> {
  if (!cached.points.length || cached.source !== "coinbase") return null

  const covers = cached.coveredFrom <= wanted + DAY_MS
  const edgeFresh = Date.now() - cached.fetchedAt < EDGE_TTL_MS
  if (covers && edgeFresh) return { ...cached, stale: false }

  const byDay = new Map(cached.points.map((p) => [p.t, p.usd]))
  let failed = false

  if (!covers) {
    const older = await fetchCoinbaseWindow(ticker, wanted, cached.coveredFrom)
    if (older === null) failed = true
    else for (const p of older) byDay.set(p.t, p.usd)
  }

  if (!edgeFresh) {
    const lastT = cached.points[cached.points.length - 1].t
    const recent = await fetchCoinbaseWindow(ticker, lastT - DAY_MS, Date.now())
    if (recent === null) failed = true
    else for (const p of recent) byDay.set(p.t, p.usd)
  }

  const points = [...byDay.entries()]
    .map(([t, usd]) => ({ t, usd }))
    .sort((a, b) => a.t - b.t)
  const result: CacheShape = {
    points,
    source: "coinbase",
    coveredFrom: points[0].t,
    // Keep the old timestamp on failure so the next call retries the edge.
    fetchedAt: failed ? cached.fetchedAt : Date.now(),
  }
  writeCache(ticker, result)
  return { ...result, stale: failed }
}

async function resolvePriceHistory(ticker: string, sinceMs: number): Promise<PriceHistory> {
  const cached = readCache(ticker)
  const wanted = Math.max(sinceMs, Date.now() - MAX_LOOKBACK_MS)

  if (cached) {
    const incremental = await refreshCoinbaseCache(ticker, cached, wanted)
    if (incremental) return incremental

    // Non-Coinbase cache that's still fresh and covers the window — reuse it.
    const fresh = Date.now() - cached.fetchedAt < EDGE_TTL_MS
    const covers = cached.coveredFrom <= wanted + DAY_MS
    if (cached.points.length && fresh && covers) return { ...cached, stale: false }
  }

  // No usable cache (or a stale CoinGecko one) — page the full window.
  let points = await fetchCoinbaseWindow(ticker, sinceMs, Date.now())
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

/**
 * Daily USD price history for `ticker`, reaching back to at least `sinceMs`
 * (clamped to 12 years). A Coinbase series is cached permanently and only
 * top-up-fetched; other sources use a 12h TTL. Returns `{ points: [] }` when the
 * asset can't be priced and there is no cache.
 */
export async function fetchPriceHistory(ticker: string, sinceMs: number): Promise<PriceHistory> {
  const wanted = Math.max(sinceMs, Date.now() - MAX_LOOKBACK_MS)
  const key = `${ticker.trim().toUpperCase()}|${Math.floor(wanted / DAY_MS)}`
  const existing = inFlight.get(key)
  if (existing) return existing
  const p = resolvePriceHistory(ticker, sinceMs).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}
