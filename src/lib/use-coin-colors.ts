import { useSyncExternalStore } from "react"

import { coinColorVersion, subscribeCoinColors } from "@/lib/coins"

/**
 * Re-render on every palette shuffle/reset. Read the returned counter somewhere
 * the value actually feeds (a dep array, a JSX `key`) so `coinColor` calls in
 * that scope are recomputed when the palette changes.
 */
export function useCoinColorVersion(): number {
  return useSyncExternalStore(
    subscribeCoinColors,
    coinColorVersion,
    coinColorVersion,
  )
}
