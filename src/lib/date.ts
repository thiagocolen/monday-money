/**
 * Parse the loosely-formatted timestamps found in Binance CSV exports.
 * Handles both `YYYY-MM-DD HH:MM:SS` and the shorter `YY-MM-DD HH:MM:SS`
 * (two-digit year) variants, with or without the time portion.
 */
export function parseFlexibleDate(value: unknown): Date | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null

  const match = raw.match(
    /^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  )
  if (!match) {
    const fallback = new Date(raw)
    return isNaN(fallback.getTime()) ? null : fallback
  }

  const [, yy, mm, dd, hh = '0', min = '0', ss = '0'] = match
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy)

  const date = new Date(
    year,
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  )
  return isNaN(date.getTime()) ? null : date
}

const timeCache = new Map<string, number | null>()
const TIME_CACHE_MAX = 50_000

/**
 * `parseFlexibleDate(value)?.getTime() ?? null`, memoised per input string.
 * Tables, filters and charts re-parse the same few thousand timestamps on every
 * pass; this turns each repeat into a map lookup.
 */
export function parseFlexibleTime(value: unknown): number | null {
  if (value == null) return null
  const key = String(value)
  const hit = timeCache.get(key)
  if (hit !== undefined) return hit
  const t = parseFlexibleDate(key)?.getTime() ?? null
  if (timeCache.size >= TIME_CACHE_MAX) timeCache.clear()
  timeCache.set(key, t)
  return t
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const formatCache = new Map<string, string>()

/**
 * Render any of the loose Binance timestamp variants in one canonical
 * `YYYY-MM-DD HH:MM:SS` form. Falls back to the trimmed input if unparseable.
 */
export function formatTimestamp(value: unknown): string {
  // Memoised per input — table cells re-render the same timestamps a lot.
  const key = String(value ?? '')
  const hit = formatCache.get(key)
  if (hit !== undefined) return hit
  const d = parseFlexibleDate(value)
  const out = d
    ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    : key.trim()
  if (formatCache.size >= TIME_CACHE_MAX) formatCache.clear()
  formatCache.set(key, out)
  return out
}
