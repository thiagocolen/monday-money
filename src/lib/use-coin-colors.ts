import * as React from "react"
import { useSyncExternalStore } from "react"

import { coinColorIn, coinPalette, subscribeCoinColors } from "@/lib/coins"

/** The shuffled palette — a new object identity on every shuffle/reset. */
export function useCoinPalette(): Readonly<Record<string, string>> {
  return useSyncExternalStore(subscribeCoinColors, coinPalette, coinPalette)
}

/**
 * `coinColor` bound to the current palette. Its identity changes on every
 * shuffle, so passing it into a `useMemo` (or calling it in JSX) makes the
 * palette a *real* dependency — anything that derives colours recomputes.
 *
 * Reach for this instead of importing `coinColor` inside a component: the React
 * Compiler infers dependencies from what the code actually reads, so a module
 * global it can't see never invalidates a memo, and a hand-written `void
 * version` dependency is dead code it deletes.
 */
export function useCoinColor(): (coin: string) => string {
  const palette = useCoinPalette()
  return React.useCallback((coin: string) => coinColorIn(palette, coin), [palette])
}
