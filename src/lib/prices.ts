/**
 * Live USD quotes from the public CoinGecko API (no key). Used to express a
 * mixed-coin balance in a single currency.
 */

/** canonical ticker → CoinGecko coin id */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  USDT: "tether",
  USDC: "usd-coin",
  BUSD: "binance-usd",
  SOL: "solana",
  ADA: "cardano",
  DOGE: "dogecoin",
  LINK: "chainlink",
  SUI: "sui",
  RUNE: "thorchain",
  ORDI: "ordinals",
  COTI: "coti",
  RENDER: "render-token",
  POL: "polygon-ecosystem-token",
  SKY: "sky",
  ETHW: "ethereum-pow-iou",
  WBETH: "wrapped-beacon-eth",
}

/** Fiat symbols we hold directly, priced via CoinGecko's `vs_currencies`. */
export const FIAT_SYMBOLS = ["BRL"] as const

const CACHE_KEY = "mm.coingecko.usd.v1"
const TTL_MS = 5 * 60_000
const ENDPOINT = "https://api.coingecko.com/api/v3/simple/price"

export interface UsdQuotes {
  /** ticker → USD value of one unit (fiat included) */
  price: Record<string, number>
  /** epoch ms of the successful fetch backing these numbers */
  fetchedAt: number
  /** true when the network call failed and this is a last-known-good snapshot */
  stale: boolean
}

function readCache(): { price: Record<string, number>; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.fetchedAt === "number" && parsed.price) return parsed
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(price: Record<string, number>, fetchedAt: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ price, fetchedAt }))
  } catch {
    /* ignore */
  }
}

/**
 * USD price for every mappable ticker plus the fiats. Served from a 5-minute
 * localStorage cache; on a network failure returns the last good snapshot
 * flagged `stale` (or an empty map if there is none).
 */
export async function fetchUsdQuotes(): Promise<UsdQuotes> {
  const cached = readCache()
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { price: cached.price, fetchedAt: cached.fetchedAt, stale: false }
  }

  const ids = Array.from(new Set([...Object.values(COINGECKO_IDS), "tether"]))
  const vs = ["usd", ...FIAT_SYMBOLS.map((f) => f.toLowerCase())].join(",")

  try {
    const res = await fetch(
      `${ENDPOINT}?ids=${ids.join(",")}&vs_currencies=${vs}`,
    )
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
    const json: Record<string, Record<string, number>> = await res.json()

    const price: Record<string, number> = {}
    for (const [ticker, id] of Object.entries(COINGECKO_IDS)) {
      const usd = json[id]?.usd
      if (typeof usd === "number") price[ticker] = usd
    }

    // Fiat: 1 BRL in USD = (USDT in USD) / (USDT in BRL).
    const anchor = json.tether
    for (const fiat of FIAT_SYMBOLS) {
      const inFiat = anchor?.[fiat.toLowerCase()]
      const inUsd = anchor?.usd
      if (inFiat && inUsd) price[fiat] = inUsd / inFiat
    }

    const fetchedAt = Date.now()
    writeCache(price, fetchedAt)
    return { price, fetchedAt, stale: false }
  } catch {
    if (cached) return { price: cached.price, fetchedAt: cached.fetchedAt, stale: true }
    return { price: {}, fetchedAt: 0, stale: true }
  }
}
