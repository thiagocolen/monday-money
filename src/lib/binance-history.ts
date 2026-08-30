import type { BinanceTransaction } from "./api"

/**
 * Current balance per coin = the all-time running total of CHANGE.
 * Order is irrelevant for a sum, so this is just a group-by-and-add.
 */
export function currentCoinBalances(
  data: BinanceTransaction[],
): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const row of data) {
    const coin = String(row.Coin ?? "").trim()
    const change = Number(row.Change)
    if (!coin || !Number.isFinite(change)) continue
    balances[coin] = (balances[coin] ?? 0) + change
  }
  return balances
}
