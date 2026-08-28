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
