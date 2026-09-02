/**
 * User-defined target allocation (percent per coin), persisted in localStorage
 * exactly like the other client-only preferences in this app (chart timeframe,
 * table column filters, CoinGecko quote cache).
 */

const KEY = "mm.allocation.target.v1"

/** canonical UPPER-CASE ticker → target weight in percent (0..100) */
export type AllocationTarget = Record<string, number>

function clean(input: unknown): AllocationTarget {
  const out: AllocationTarget = {}
  if (!input || typeof input !== "object") return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const n = Number(v)
    const key = k.trim().toUpperCase()
    if (key && Number.isFinite(n) && n > 0) {
      out[key] = Math.min(100, Math.round(n * 100) / 100)
    }
  }
  return out
}

export function loadAllocationTarget(): AllocationTarget {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? clean(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function saveAllocationTarget(target: AllocationTarget): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(clean(target)))
  } catch {
    /* ignore */
  }
}

/** Sum of all target weights (percent). */
export function targetTotal(target: AllocationTarget): number {
  return Object.values(target).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}
