import { useState } from "react"

/**
 * Returns the first `value` seen for the current `signature`, so a freshly
 * built array/object with the same contents keeps its old identity and doesn't
 * re-trigger memos and effects downstream.
 *
 * Uses React's "adjust state during render" pattern rather than a ref or a
 * fake `useMemo` dep — the React Compiler re-derives memo deps, so a
 * signature-only dep list would be silently dropped.
 */
export function useStableValue<T>(value: T, signature: string): T {
  const [held, setHeld] = useState({ signature, value })
  if (held.signature !== signature) {
    setHeld({ signature, value })
    return value
  }
  return held.value
}
